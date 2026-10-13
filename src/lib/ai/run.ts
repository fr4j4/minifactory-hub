import crypto from 'node:crypto';
import { and, isNotNull, lt, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { can, type PermUser } from '../perm';
import { assertAiUrl, getAiConfig, type AiConfig } from './config';
import { assertBudget, costOf, estimateTokens } from './budget';
import { cacheGet, cacheSet, hashInput } from './cache';
import { anthropic } from './providers/anthropic';
import { mock } from './providers/mock';
import { openaiCompat } from './providers/openai-compat';
import { createRedactor, type Redactor } from './redact';
import { AIError, FEATURES, type AIContent, type AIProvider, type AIRequest, type Usage } from './types';

export interface RunContext {
  user?: (PermUser & { id: string }) | null;
  redactor?: Redactor;
  /** Para usar la caché y versionar prompts. */
  promptVersion?: string;
  /** Saltar caché (p. ej. «regenerar»). */
  noCache?: boolean;
  /** Config explícita (probar conexión antes de guardar). */
  config?: AiConfig;
  /** Omite el control de función/rol (solo para `system.ping`). */
  skipFeatureCheck?: boolean;
}
export interface RunResult<T> { data: T; usage: Usage; model: string; costUsd: number; cacheHit: boolean; restore: (s: string) => string }

export function providerFor(cfg: Pick<AiConfig, 'provider'>): AIProvider {
  if (cfg.provider === 'anthropic') return anthropic;
  if (cfg.provider === 'openai-compat') return openaiCompat;
  if (cfg.provider === 'mock') return mock;
  throw new AIError('No hay un proveedor de IA configurado', 'disabled');
}

/* Cortacircuitos: tras 3 fallos seguidos de una función, se pausa 5 min. */
const g = globalThis as unknown as { __aiBreaker?: Map<string, { fails: number; openUntil: number }> };
const breaker = () => (g.__aiBreaker ??= new Map());
export const resetBreakers = () => breaker().clear();
const BREAK_FAILS = 3, BREAK_MS = 5 * 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const retryBase = () => Number(process.env.AI_RETRY_BASE_MS ?? 500);
const retryable = (e: unknown) => e instanceof AIError && (e.code === 'timeout' || (e.code === 'provider' && (e.status === undefined || e.status === 429 || e.status >= 500)));

function jsonSchemaOf(schema: z.ZodType): unknown {
  try { const { $schema, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>; return rest; } catch { return undefined; }
}
/** Extrae el primer objeto JSON de un texto (tolera ```json … ``` y texto alrededor). */
export function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(t); } catch { /* buscar llaves */ }
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i >= 0 && j > i) return JSON.parse(t.slice(i, j + 1));
  throw new Error('No hay JSON en la respuesta');
}

function mapContent(c: AIContent, r: Redactor): AIContent {
  return typeof c === 'string' ? r.redact(c) : c.map((p) => (p.type === 'text' ? { ...p, text: r.redact(p.text) } : p));
}
const textOf = (c: AIContent) => (typeof c === 'string' ? c : c.map((p) => (p.type === 'text' ? p.text : '[imagen]')).join('\n'));

/** Comprueba, en el servidor, que el usuario puede usar la función (interruptor maestro, función activa y rol permitido). */
export function assertFeatureAccess(cfg: AiConfig, feature: string, user?: (PermUser & { id: string }) | null) {
  if (!cfg.enabled) throw new AIError('La IA no está activada en este taller', 'disabled');
  const f = FEATURES[feature as keyof typeof FEATURES];
  if (!f) throw new AIError('Función de IA desconocida', 'config');
  if (cfg.features[feature as keyof typeof FEATURES] !== true) throw new AIError('Esta función de IA está desactivada', 'disabled');
  if (!user) throw new AIError('Falta el usuario', 'forbidden');
  if (!can(user, 'ia', 'C')) throw new AIError('No tienes permiso para usar la IA', 'forbidden');
  const roles = cfg.roles[feature as keyof typeof FEATURES] ?? ['admin'];
  if (!roles.includes(user.role)) throw new AIError('Tu rol no tiene acceso a esta función de IA', 'forbidden');
}

async function logCall(row: Omit<typeof s.aiCalls.$inferInsert, 'workspaceId' | 'id' | 'createdAt'>, retentionDays: number) {
  try {
    const db = await getDb();
    await db.insert(s.aiCalls).values({ workspaceId: WORKSPACE_ID, ...row });
    if (retentionDays > 0) await db.update(s.aiCalls).set({ promptLog: null }).where(and(isNotNull(s.aiCalls.promptLog), lt(s.aiCalls.createdAt, new Date(Date.now() - retentionDays * 86_400_000))));
  } catch { /* la telemetría nunca debe romper el flujo */ }
}

/**
 * Orquesta una tarea de IA: permisos → presupuesto → caché → llamada (con reintentos) → validación zod
 * (un reintento con el error de validación) → telemetría. Devuelve datos validados; nunca ejecuta nada del modelo.
 */
export async function runTask<T>(req: AIRequest<T>, ctx: RunContext = {}): Promise<RunResult<T>> {
  const cfg = ctx.config ?? (await getAiConfig());
  if (req.feature !== 'system.ping' || !ctx.skipFeatureCheck) assertFeatureAccess(cfg, req.feature, ctx.user);
  else if (!cfg.configured) throw new AIError('Falta configurar el proveedor', 'config');
  const provider = providerFor(cfg);
  if (cfg.provider !== 'mock' && cfg.baseUrl) assertAiUrl(cfg.baseUrl, cfg.localOnly);
  else if (cfg.provider === 'openai-compat') throw new AIError('Falta la URL base del proveedor', 'config');
  else if (cfg.localOnly && cfg.provider === 'anthropic' && !cfg.baseUrl) throw new AIError('Modo «solo local» activo: Anthropic en la nube no está permitido', 'config');

  const hasImage = Array.isArray(req.user) && req.user.some((p) => p.type === 'image');
  if (hasImage) {
    if (!cfg.privacy.sendImages) throw new AIError('El envío de imágenes está desactivado en la configuración de privacidad', 'forbidden');
    if (!provider.capabilities.vision) throw new AIError('El proveedor no admite imágenes', 'config');
  }
  const model = hasImage && cfg.models.vision ? cfg.models.vision : cfg.models[req.tier];
  if (!model) throw new AIError('Falta el modelo para esta función', 'config');

  const key = hashInput(req.feature, ctx.promptVersion ?? '', model, req.system, Array.isArray(req.user) ? req.user.map((p) => (p.type === 'text' ? p.text : crypto.createHash('sha256').update(p.data).digest('hex'))) : req.user);
  const redactor = ctx.redactor ?? createRedactor(cfg.privacy.redactPII);
  const restore = (t: string) => redactor.restore(t);
  const base = { userId: ctx.user?.id ?? null, feature: req.feature, provider: cfg.provider, tier: req.tier };

  if (!ctx.noCache) {
    const hit = cacheGet<{ data: T; usage: Usage; model: string }>(key);
    if (hit) { await logCall({ ...base, model: hit.model, inTokens: 0, outTokens: 0, costUsd: 0, latencyMs: 0, ok: true, error: null, cacheHit: true }, cfg.retention.logPromptsDays); return { ...hit, costUsd: 0, cacheHit: true, restore }; }
  }

  const br = breaker().get(req.feature);
  if (br && br.openUntil > Date.now()) throw new AIError('Esta función de IA está en pausa por errores repetidos del proveedor; reintenta en unos minutos', 'circuit');
  await assertBudget(cfg.budget, ctx.user?.id);

  const user = mapContent(req.user, redactor);
  const jsonSchema = jsonSchemaOf(req.schema);
  const maxOutputTokens = req.maxOutputTokens ?? 1500, temperature = req.temperature ?? 0.2, timeoutMs = req.timeoutMs ?? 60_000;
  const total: Usage = { inTokens: 0, outTokens: 0 };
  let lastText = '', feedback = '';

  for (let attempt = 0; attempt < 2; attempt++) {
    const t0 = Date.now();
    let res;
    try {
      res = await withRetries(() => provider.complete({ system: req.system, user: feedback ? appendText(user, feedback) : user, jsonSchema, maxOutputTokens, temperature, timeoutMs }, { model, apiKey: cfg.apiKey, baseUrl: cfg.baseUrl }));
    } catch (e) {
      const err = e as AIError;
      await logCall({ ...base, model, inTokens: 0, outTokens: 0, costUsd: 0, latencyMs: Date.now() - t0, ok: false, error: String(err.message).slice(0, 300), cacheHit: false }, cfg.retention.logPromptsDays);
      if (err instanceof AIError && (err.code === 'provider' || err.code === 'timeout')) trip(req.feature);
      throw err;
    }
    const inTok = res.usage.inTokens || estimateTokens(req.system + textOf(user)), outTok = res.usage.outTokens || estimateTokens(res.text);
    total.inTokens += inTok; total.outTokens += outTok; lastText = res.text;
    const costUsd = costOf(res.model, cfg.provider, inTok, outTok);
    let parsed: z.ZodSafeParseResult<T>;
    try { parsed = req.schema.safeParse(extractJson(res.text)); } catch (e) { parsed = { success: false, error: new z.ZodError([{ code: 'custom', message: (e as Error).message, path: [] }]) } as z.ZodSafeParseResult<T>; }
    const keepLog = cfg.retention.logPromptsDays > 0 ? { system: req.system, user: textOf(user), response: res.text } : null;
    await logCall({ ...base, model: res.model, inTokens: inTok, outTokens: outTok, costUsd, latencyMs: Date.now() - t0, ok: parsed.success, error: parsed.success ? null : 'Salida inválida', cacheHit: false, promptLog: keepLog }, cfg.retention.logPromptsDays);
    if (parsed.success) {
      breaker().delete(req.feature);
      const out = { data: parsed.data, usage: total, model: res.model };
      cacheSet(key, out);
      return { ...out, costUsd: costOf(res.model, cfg.provider, total.inTokens, total.outTokens), cacheHit: false, restore };
    }
    feedback = `\n\nTu respuesta anterior no cumplió el formato. Errores:\n${parsed.error.issues.slice(0, 6).map((i) => `- ${i.path.join('.') || '(raíz)'}: ${i.message}`).join('\n')}\nCorrige y responde de nuevo solo con el JSON.`;
  }
  trip(req.feature);
  throw new AIError(`El proveedor no devolvió una respuesta con el formato esperado${lastText ? '' : ' (vacía)'}`, 'invalid');
}

function appendText(c: AIContent, extra: string): AIContent {
  return typeof c === 'string' ? c + extra : [...c, { type: 'text', text: extra }];
}
function trip(feature: string) {
  const b = breaker(); const cur = b.get(feature) ?? { fails: 0, openUntil: 0 };
  cur.fails += 1; if (cur.fails >= BREAK_FAILS) { cur.openUntil = Date.now() + BREAK_MS; cur.fails = 0; }
  b.set(feature, cur);
}
async function withRetries<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    try { return await fn(); } catch (e) { last = e; if (!retryable(e) || i === 2) break; await sleep(retryBase() * 2 ** i); }
  }
  throw last;
}

/** Borra los textos de prompts guardados (los contadores de uso se conservan). */
export async function clearPromptLogs() {
  const db = await getDb();
  await db.update(s.aiCalls).set({ promptLog: null }).where(and(eq(s.aiCalls.workspaceId, WORKSPACE_ID), isNotNull(s.aiCalls.promptLog)));
}
