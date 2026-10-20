import { LocalizedError } from '@/i18n/errors';
import { assertAiUrl, isLocalHost } from './config';
import { AIError } from './types';
import { PRESETS, type PresetId } from './presets';

/* ── Sugerencia de modelos a partir de los nombres que publica el servidor ─────────────────── */
export interface ModelPick { fast: string; smart: string; vision: string }
const NOT_CHAT = /embed|nomic|bge-|minilm|rerank|whisper|tts|clip|stable-diffusion|moderation/i;
const VISION = /llava|vision|(^|[-:_/])vl([-:_]|$)|minicpm-v|gemma3|gemma-3|pixtral|qwen2\.5vl|qwen3-vl|moondream|bakllava/i;
const sizeB = (n: string): number | null => { const m = n.match(/(\d+(?:\.\d+)?)\s*b(?![a-z])/i); return m ? parseFloat(m[1]) : null; };

/** Elige modelo «rápido» (el más chico) y «avanzado» (el más grande razonable para hardware local) y uno con visión. */
export function suggestModels(names: string[]): ModelPick {
  const chat = names.filter((n) => !NOT_CHAT.test(n));
  const pool = chat.length ? chat : names;
  const sized = pool.map((n) => ({ n, b: sizeB(n) })).filter((x): x is { n: string; b: number } => x.b != null).sort((a, b) => a.b - b.b);
  const fast = sized.find((x) => x.b >= 1)?.n ?? pool[0] ?? '';
  const fits = sized.filter((x) => x.b <= 40); // más allá de ~40B rara vez cabe en un equipo del taller
  const smart = (fits.length ? fits[fits.length - 1].n : sized[0]?.n) ?? pool[0] ?? '';
  const vision = pool.find((n) => VISION.test(n)) ?? '';
  return { fast, smart, vision };
}

/* ── Lectura de la lista de modelos (OpenAI /models y Anthropic /v1/models) ─────────────────── */
const MAX_BYTES = 512 * 1024;
async function getJson(url: string, headers: Record<string, string>, timeoutMs: number): Promise<{ status: number; json: any | null }> {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'GET', headers: { accept: 'application/json', ...headers }, signal: ctl.signal, redirect: 'error' });
    if (!res.ok) return { status: res.status, json: null };
    // lectura con tope de tamaño: un servicio hostil no puede llenar la memoria
    const reader = res.body?.getReader(); let size = 0; const chunks: Uint8Array[] = [];
    while (reader) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > MAX_BYTES) { ctl.abort(); return { status: res.status, json: null }; } chunks.push(value); }
    try { return { status: res.status, json: JSON.parse(Buffer.concat(chunks).toString('utf8')) }; } catch { return { status: res.status, json: null }; }
  } finally { clearTimeout(timer); }
}
const namesOf = (j: any): string[] => {
  const arr: any[] = Array.isArray(j?.data) ? j.data : Array.isArray(j?.models) ? j.models : [];
  return [...new Set(arr.map((m) => (typeof m === 'string' ? m : m?.id ?? m?.name)).filter((x): x is string => typeof x === 'string' && !!x && x.length < 200))].sort((a, b) => a.localeCompare(b));
};

/** Lista los modelos que ofrece un proveedor ya configurado (usa la clave si hace falta). */
export async function listModels(c: { provider: 'anthropic' | 'openai-compat'; baseUrl: string; apiKey: string; localOnly: boolean }): Promise<string[]> {
  const base = (c.baseUrl || (c.provider === 'anthropic' ? 'https://api.anthropic.com' : '')).replace(/\/+$/, '');
  if (!base) throw new AIError('ai.err.missingBaseUrl', 'config');
  assertAiUrl(base, c.localOnly);
  const url = c.provider === 'anthropic' ? `${base}/v1/models?limit=100` : `${base}/models`;
  const headers: Record<string, string> = c.provider === 'anthropic' ? { 'x-api-key': c.apiKey, 'anthropic-version': '2023-06-01' } : c.apiKey ? { authorization: `Bearer ${c.apiKey}` } : {};
  let r;
  try { r = await getJson(url, headers, 10_000); } catch (e) {
    throw new AIError((e as Error).name === 'AbortError' ? 'ai.err.timeout' : 'ai.err.connect', 'provider', { params: { s: 10, msg: (e as Error).message } });
  }
  if (r.status >= 400) throw new AIError('ai.err.providerStatus', 'provider', { status: r.status, params: { status: r.status, msg: 'models' } });
  const names = namesOf(r.json);
  if (!names.length) throw new AIError('ai.err.noModels', 'provider');
  return names;
}

/* ── Descubridor de IA local ─────────────────────────────────────────────────────────────────
 * Busca servidores de modelos en este equipo y en nombres de servicio habituales (Docker). Solo GET a /v1/models, sin credenciales,
 * solo direcciones locales, puertos conocidos y tiempos muy cortos. NO recorre la red: para otro equipo el administrador indica su dirección. */
export interface Found { presetId: PresetId; baseUrl: string; host: string; port: number; models: string[]; authRequired: boolean; suggested: ModelPick }
export interface Probe { presetId: PresetId; port: number }
export const DEFAULT_HOSTS = ['localhost', '127.0.0.1', 'host.docker.internal', 'ollama', 'lmstudio'];
export const DEFAULT_PROBES: Probe[] = PRESETS.filter((p) => p.group === 'local' && p.port).map((p) => ({ presetId: p.id, port: p.port! }));

/** `192.168.1.20`, `pc-taller.local`, `192.168.1.20:11434`. Lanza si no es una dirección local válida. */
export function parseTarget(raw: string): { host: string; port?: number } {
  const s = raw.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  const m = s.match(/^(\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::(\d{1,5}))?$/i);
  if (!m) throw new LocalizedError('ai.err.discoveryBadTarget');
  const host = m[1].replace(/^\[|\]$/g, ''); const port = m[2] ? parseInt(m[2], 10) : undefined;
  if ((port != null && (port < 1 || port > 65535)) || !isLocalHost(host) || /^169\.254\./.test(host)) throw new LocalizedError('ai.err.discoveryNotLocal');
  return { host, port };
}

async function probe(host: string, p: Probe, timeoutMs: number): Promise<Found | null> {
  const h = host.includes(':') ? `[${host}]` : host;
  const base = `http://${h}:${p.port}/v1`;
  try {
    const r = await getJson(`${base}/models`, {}, timeoutMs);
    if (r.status === 401 || r.status === 403) return { presetId: p.presetId, baseUrl: base, host, port: p.port, models: [], authRequired: true, suggested: { fast: '', smart: '', vision: '' } };
    const models = namesOf(r.json);
    if (r.status !== 200 || !models.length) return null;
    return { presetId: p.presetId, baseUrl: base, host, port: p.port, models, authRequired: false, suggested: suggestModels(models) };
  } catch { return null; }
}

export async function discoverLocalAi(o: { extra?: string; hosts?: string[]; probes?: Probe[]; timeoutMs?: number } = {}): Promise<Found[]> {
  const timeoutMs = o.timeoutMs ?? 1500;
  const targets: Array<{ host: string; probes: Probe[] }> = [];
  const probes = o.probes ?? DEFAULT_PROBES;
  if (o.extra?.trim()) {
    const t = parseTarget(o.extra);
    targets.push({ host: t.host, probes: t.port ? [{ presetId: probes.find((p) => p.port === t.port)?.presetId ?? 'genericOpenai', port: t.port }] : probes });
  }
  for (const host of o.hosts ?? DEFAULT_HOSTS) targets.push({ host, probes });
  const results = (await Promise.all(targets.flatMap((t) => t.probes.map((p) => probe(t.host, p, timeoutMs))))).filter((x): x is Found => !!x);
  // localhost y 127.0.0.1 son el mismo servidor: se deja uno por puerto + conjunto de modelos
  const seen = new Set<string>(); const out: Found[] = [];
  for (const f of results) {
    const loop = f.host === 'localhost' || f.host === '127.0.0.1' || f.host === '::1';
    const key = `${loop ? 'loop' : f.host}:${f.port}:${f.models.join('|')}`;
    if (seen.has(key)) continue; seen.add(key); out.push(f);
  }
  const order = new Map(DEFAULT_PROBES.map((p, i) => [p.presetId, i]));
  return out.sort((a, b) => (order.get(a.presetId) ?? 99) - (order.get(b.presetId) ?? 99) || a.host.localeCompare(b.host));
}
