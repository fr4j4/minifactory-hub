import net from 'node:net';
import { getSettingsRaw } from '../settings';
import { unseal } from '../secret';
import { AIError, DEFAULT_AI, type AiSettings, type ProviderId } from './types';

export interface AiConfig extends Omit<AiSettings, 'provider'> {
  provider: ProviderId | 'none';
  apiKey: string;
  /** Hay proveedor utilizable (sin contar el interruptor maestro). */
  configured: boolean;
}

/** Hosts de red local: IPs privadas/loopback, `.local` y nombres de una sola etiqueta (servicios de Docker como `ollama`). */
export function isLocalHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (net.isIPv4(h)) {
    const [a, b] = h.split('.').map(Number);
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (net.isIPv6(h)) return /^(::1$|fe80:|fc|fd)/.test(h);
  return h === 'localhost' || h.endsWith('.local') || /^[a-z0-9-]+$/.test(h);
}

/** Valida la URL base de un proveedor. Nunca permite metadatos de nube (169.254.x) ni http hacia internet. */
export function assertAiUrl(raw: string, localOnly: boolean): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new AIError('ai.err.urlInvalid', 'config'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new AIError('ai.err.urlScheme', 'config');
  if (u.username || u.password) throw new AIError('ai.err.urlCredentials', 'config');
  if (/^169\.254\./.test(u.hostname)) throw new AIError('ai.err.urlForbidden', 'config');
  const local = isLocalHost(u.hostname);
  if (localOnly && !local) throw new AIError('ai.err.urlLocalOnly', 'config');
  if (u.protocol === 'http:' && !local) throw new AIError('ai.err.urlHttps', 'config');
  return u;
}

const env = (k: string) => (process.env[k] || '').trim();

/**
 * Configuración efectiva: ajustes del taller con respaldo en variables de entorno (AI_PROVIDER, AI_API_KEY, AI_BASE_URL, AI_MODEL_*).
 * El interruptor maestro (`enabled`) solo viene de los ajustes del taller; `AI_FORCE_DISABLED=1` lo apaga siempre.
 */
export async function getAiConfig(): Promise<AiConfig> {
  const st = (await getSettingsRaw()).ai ?? DEFAULT_AI;
  let provider = st.provider as AiConfig['provider'];
  const envProv = env('AI_PROVIDER');
  if (provider === 'none' && (envProv === 'anthropic' || envProv === 'openai-compat' || envProv === 'mock')) provider = envProv;
  const apiKey = aiKeyFor(st, provider, st.baseUrl);
  const baseUrl = st.baseUrl || env('AI_BASE_URL');
  const models = {
    fast: st.models.fast || env('AI_MODEL_FAST') || DEFAULT_AI.models.fast,
    smart: st.models.smart || env('AI_MODEL_SMART') || DEFAULT_AI.models.smart,
    vision: st.models.vision || env('AI_MODEL_VISION') || '',
  };
  const localOnly = st.localOnly || env('AI_LOCAL_ONLY') === '1';
  const forced = env('AI_FORCE_DISABLED') === '1';
  const configured = provider === 'mock' || (provider === 'anthropic' && !!apiKey) || (provider === 'openai-compat' && !!baseUrl);
  return { ...st, provider, apiKey, baseUrl, models, localOnly, enabled: !forced && st.enabled && configured, configured };
}

/** Vista de los ajustes segura para el navegador: nunca incluye la clave. */
export function publicAiSettings(st: AiSettings) {
  const { apiKeySealed, ...rest } = st;
  let last4 = ''; if (apiKeySealed) { try { last4 = unseal(apiKeySealed).slice(-4); } catch { /* clave ilegible */ } }
  return { ...rest, hasKey: !!apiKeySealed, keyLast4: last4, envKey: !!env('AI_API_KEY'), forcedOff: env('AI_FORCE_DISABLED') === '1' };
}
export type PublicAiSettings = ReturnType<typeof publicAiSettings>;

/**
 * Clave que puede viajar a (provider, baseUrl): la guardada solo al destino con que se guardó;
 * la de entorno (AI_API_KEY) solo al destino de entorno (AI_PROVIDER si existe, y AI_BASE_URL o la URL por defecto).
 */
export function aiKeyFor(st: AiSettings, provider: string, baseUrl: string): string {
  if (st.apiKeySealed && sameAiTarget(st.keyTarget ?? st, provider, baseUrl)) { try { return unseal(st.apiKeySealed); } catch { /* clave ilegible */ } }
  const envProv = env('AI_PROVIDER');
  if (envProv && envProv !== provider) return '';
  return sameAiTarget({ provider, baseUrl: env('AI_BASE_URL') }, provider, baseUrl || env('AI_BASE_URL')) ? env('AI_API_KEY') : '';
}

/** La clave guardada solo viaja al proveedor y la URL con que se guardó: si el formulario apunta a otro destino, quien la quiera debe escribirla. */
export function sameAiTarget(saved: { provider: string; baseUrl?: string | null }, provider: string, baseUrl?: string | null) {
  const norm = (u?: string | null) => (u ?? '').trim().replace(/\/+$/, '').toLowerCase();
  return provider === saved.provider && norm(baseUrl) === norm(saved.baseUrl);
}
