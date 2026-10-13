import { z } from 'zod';
import { desc, eq, gte, sql } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import type { PermUser } from '../perm';
import { getAiConfig, type AiConfig } from './config';
import { assertFeatureAccess, providerFor, runTask } from './run';
import { spendThisMonth } from './budget';
import { tDefault, errorText } from '@/i18n/errors';
import type { TFn } from '@/i18n/translate';
import { AIError, FEATURES, type FeatureKey } from './types';

export { runTask, assertFeatureAccess } from './run';
export { getAiConfig } from './config';
export { AIError, FEATURES, FEATURE_KEYS, DEFAULT_AI } from './types';
export type { FeatureKey, AiSettings } from './types';

/** ¿Debe mostrarse el control de esta función a este usuario? (la UI lo usa para ocultar todo cuando la IA está apagada). */
export async function aiAvailableFor(user: (PermUser & { id: string }) | null | undefined, feature: FeatureKey): Promise<boolean> {
  try { assertFeatureAccess(await getAiConfig(), feature, user); return FEATURES[feature].available; } catch { return false; }
}

/** Prueba de conexión: una llamada mínima con la configuración (guardada o sin guardar). */
export async function pingAi(cfg?: AiConfig, t: TFn = tDefault) {
  const c = cfg ?? (await getAiConfig());
  const t0 = Date.now();
  try {
    if (!c.configured) throw new AIError('ai.err.notConfigured', 'config');
    const p = providerFor(c);
    const r = await runTask({ feature: 'system.ping', tier: 'fast', system: 'Responde solo con JSON.', user: 'Devuelve {"ok":true}', schema: z.object({ ok: z.boolean() }), maxOutputTokens: 30, temperature: 0, timeoutMs: 20_000 },
      { config: { ...c, enabled: true }, skipFeatureCheck: true, noCache: true });
    return { ok: true as const, model: r.model, latencyMs: Date.now() - t0, vision: p.capabilities.vision };
  } catch (e) { return { ok: false as const, error: errorText(e, t), latencyMs: Date.now() - t0 }; }
}

/** Resumen de uso para la pantalla de configuración. */
export async function aiUsage() {
  const db = await getDb(); const month = await spendThisMonth();
  const since = new Date(Date.now() - 30 * 86_400_000);
  const byFeature = await db.select({ feature: s.aiCalls.feature, n: sql<number>`count(*)::int`, cost: sql<number>`coalesce(sum(${s.aiCalls.costUsd}),0)`, tin: sql<number>`coalesce(sum(${s.aiCalls.inTokens}),0)`, tout: sql<number>`coalesce(sum(${s.aiCalls.outTokens}),0)` })
    .from(s.aiCalls).where(gte(s.aiCalls.createdAt, since)).groupBy(s.aiCalls.feature);
  const recent = await db.select().from(s.aiCalls).where(eq(s.aiCalls.workspaceId, WORKSPACE_ID)).orderBy(desc(s.aiCalls.createdAt)).limit(25);
  return { month, byFeature: byFeature.map((r) => ({ ...r, cost: Number(r.cost), tin: Number(r.tin), tout: Number(r.tout) })), recent };
}
