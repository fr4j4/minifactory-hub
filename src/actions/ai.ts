'use server';
import { z } from 'zod';
import { requirePerm } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { seal } from '@/lib/secret';
import { getSettingsRaw, saveSettings } from '@/lib/settings';
import { assertAiUrl, getAiConfig, type AiConfig } from '@/lib/ai/config';
import { pingAi } from '@/lib/ai';
import { clearPromptLogs } from '@/lib/ai/run';
import { FEATURE_KEYS, type AiSettings } from '@/lib/ai/types';
import { safe } from './common';

const Roles = z.array(z.enum(['admin', 'operador', 'ventas']));
const Input = z.object({
  enabled: z.boolean(),
  provider: z.enum(['none', 'anthropic', 'openai-compat']),
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
  if (!r.success) throw new Error('Configuración de IA inválida: ' + r.error.issues[0]?.path.join('.') + ' ' + r.error.issues[0]?.message);
  const i = r.data;
  i.features = Object.fromEntries(Object.entries(i.features).filter(([k]) => (FEATURE_KEYS as string[]).includes(k)));
  i.roles = Object.fromEntries(Object.entries(i.roles).filter(([k]) => (FEATURE_KEYS as string[]).includes(k)));
  if (i.provider === 'openai-compat' && !i.baseUrl) throw new Error('Indica la URL base del proveedor (por ejemplo http://ollama:11434/v1)');
  if (i.baseUrl) assertAiUrl(i.baseUrl, i.localOnly);
  if (i.provider === 'anthropic' && i.localOnly && !i.baseUrl) throw new Error('«Solo local» no es compatible con Anthropic en la nube; usa un proveedor local');
  return i;
}

export async function saveAiSettingsAction(raw: AiSettingsInput) {
  return safe(async () => {
    const u = await requirePerm('config', 'E');
    const i = parse(raw); const cur = (await getSettingsRaw()).ai;
    let apiKeySealed = cur.apiKeySealed;
    if (i.clearKey) apiKeySealed = '';
    if (i.apiKey) apiKeySealed = seal(i.apiKey);
    const { apiKey: _k, clearKey: _c, ...rest } = i;
    const ai: AiSettings = { ...cur, ...rest, apiKeySealed, features: { ...rest.features }, roles: { ...rest.roles } };
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
    const i = parse(raw); const saved = await getAiConfig();
    const cfg: AiConfig = {
      ...saved, ...i, apiKey: i.apiKey || saved.apiKey,
      provider: i.provider === 'none' ? saved.provider : i.provider,
      configured: false, enabled: true,
    } as AiConfig;
    cfg.configured = cfg.provider === 'mock' || (cfg.provider === 'anthropic' && !!cfg.apiKey) || (cfg.provider === 'openai-compat' && !!cfg.baseUrl);
    return pingAi(cfg);
  });
}

export async function clearAiPromptLogsAction() {
  return safe(async () => { const u = await requirePerm('ia', 'X'); await clearPromptLogs(); await audit('settings', null, 'ia_borrar_prompts', {}, u.id); return true; }, ['/configuracion']);
}
