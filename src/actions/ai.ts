'use server';
import { z } from 'zod';
import { requirePerm } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { seal } from '@/lib/secret';
import { getSettingsRaw, saveSettings } from '@/lib/settings';
import { aiKeyFor, assertAiUrl, getAiConfig, sameAiTarget, type AiConfig } from '@/lib/ai/config';
import { pingAi } from '@/lib/ai';
import { clearPromptLogs } from '@/lib/ai/run';
import { FEATURE_KEYS, type AiSettings } from '@/lib/ai/types';
import { isPresetId } from '@/lib/ai/presets';
import { discoverLocalAi, listModels, suggestModels } from '@/lib/ai/discovery';
import { getT } from '@/i18n/server';
import { LocalizedError } from '@/i18n/errors';
import { safe } from './common';

const Roles = z.array(z.enum(['admin', 'operador', 'ventas']));
const Input = z.object({
  enabled: z.boolean(),
  provider: z.enum(['none', 'anthropic', 'openai-compat']),
  preset: z.string().max(40).refine((v) => v === '' || isPresetId(v)),
  baseUrl: z.string().trim().max(300),
  /** Vacío = conservar la clave guardada. */
  apiKey: z.string().trim().max(500).optional(),
  clearKey: z.boolean().optional(),
  models: z.object({ fast: z.string().trim().max(120), smart: z.string().trim().max(120), vision: z.string().trim().max(120) }),
  localOnly: z.boolean(),
  features: z.record(z.string(), z.boolean()),
  roles: z.record(z.string(), Roles),
  privacy: z.object({ redactPII: z.boolean(), sendImages: z.boolean() }),
  budget: z.object({ monthlyUsd: z.number().min(0).max(100000).nullable(), perUserDailyCalls: z.number().int().min(0).max(100000), hardStop: z.boolean() }),
  retention: z.object({ logPromptsDays: z.number().int().min(0).max(90) }),
});
export type AiSettingsInput = z.infer<typeof Input>;

function parse(raw: unknown): AiSettingsInput {
  const r = Input.safeParse(raw);
  if (!r.success) throw new LocalizedError('ai.err.invalidSettings', { detail: `${r.error.issues[0]?.path.join('.')} ${r.error.issues[0]?.message}` });
  const i = r.data;
  i.features = Object.fromEntries(Object.entries(i.features).filter(([k]) => (FEATURE_KEYS as string[]).includes(k)));
  i.roles = Object.fromEntries(Object.entries(i.roles).filter(([k]) => (FEATURE_KEYS as string[]).includes(k)));
  if (i.provider === 'openai-compat' && !i.baseUrl) throw new LocalizedError('ai.err.needBaseUrl');
  if (i.baseUrl) assertAiUrl(i.baseUrl, i.localOnly);
  if (i.provider === 'anthropic' && i.localOnly && !i.baseUrl) throw new LocalizedError('ai.err.localOnlyAnthropic');
  return i;
}

export async function saveAiSettingsAction(raw: AiSettingsInput) {
  return safe(async () => {
    const u = await requirePerm('config', 'E');
    const i = parse(raw); const cur = (await getSettingsRaw()).ai;
    let apiKeySealed = cur.apiKeySealed; let keyTarget = cur.keyTarget;
    if (i.clearKey) apiKeySealed = '';
    if (i.apiKey) { apiKeySealed = seal(i.apiKey); if (i.provider !== 'none') keyTarget = { provider: i.provider, baseUrl: i.baseUrl }; }
    // otro destino sin clave nueva: no se le entrega la guardada ('none' no cambia el destino de la clave)
    else if (i.provider !== 'none' && !sameAiTarget(cur.keyTarget ?? cur, i.provider, i.baseUrl)) apiKeySealed = '';
    const { apiKey: _k, clearKey: _c, ...rest } = i;
    const ai: AiSettings = { ...cur, ...rest, apiKeySealed, keyTarget, features: { ...rest.features }, roles: { ...rest.roles } };
    // Se reemplaza el bloque completo (no mezcla) para que desactivar una función tenga efecto.
    await saveSettings({ ai });
    await audit('settings', null, 'ia', { enabled: ai.enabled, provider: ai.provider, localOnly: ai.localOnly, features: ai.features, keyChanged: !!(i.apiKey || i.clearKey), budget: ai.budget, privacy: ai.privacy }, u.id);
    return true;
  }, ['/configuracion']);
}

/** Prueba la conexión con los datos del formulario (sin guardarlos). La clave en blanco usa la ya guardada. */
export async function testAiConnectionAction(raw: AiSettingsInput) {
  return safe(async () => {
    await requirePerm('config', 'E');
    const i = parse(raw); const saved = await getAiConfig(); const st = (await getSettingsRaw()).ai;
    const cfg: AiConfig = {
      ...saved, ...i,
      provider: i.provider === 'none' ? saved.provider : i.provider,
      configured: false, enabled: true,
    } as AiConfig;
    cfg.apiKey = i.apiKey || aiKeyFor(st, cfg.provider, i.baseUrl);
    cfg.configured = cfg.provider === 'mock' || (cfg.provider === 'anthropic' && !!cfg.apiKey) || (cfg.provider === 'openai-compat' && !!cfg.baseUrl);
    return pingAi(cfg, await getT());
  });
}

export async function clearAiPromptLogsAction() {
  return safe(async () => { const u = await requirePerm('ia', 'X'); await clearPromptLogs(); await audit('settings', null, 'ia_borrar_prompts', {}, u.id); return true; }, ['/configuracion']);
}

/** Busca servidores de IA en este equipo y en nombres de servicio habituales; `extra` = otro equipo de la red (IP o host:puerto). */
export async function discoverAiAction(extra?: string) {
  return safe(async () => { await requirePerm('config', 'E'); return discoverLocalAi({ extra: extra?.slice(0, 120) }); });
}

/** Lista los modelos del proveedor con los datos del formulario (la clave en blanco usa la guardada). */
export async function listAiModelsAction(raw: Pick<AiSettingsInput, 'provider' | 'baseUrl' | 'localOnly'> & { apiKey?: string }) {
  return safe(async () => {
    await requirePerm('config', 'E');
    if (raw.provider === 'none') throw new LocalizedError('ai.err.notConfigured');
    const saved = await getAiConfig(); const st = (await getSettingsRaw()).ai;
    const models = await listModels({ provider: raw.provider, baseUrl: raw.baseUrl.trim(), apiKey: raw.apiKey?.trim() || aiKeyFor(st, raw.provider, raw.baseUrl), localOnly: raw.localOnly || saved.localOnly });
    return { models, suggested: suggestModels(models) };
  });
}
