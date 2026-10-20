import crypto from 'node:crypto';

/** Caché en memoria por hash(función, versión de prompt, modelo, entrada). Evita pagar dos veces la misma consulta. */
const g = globalThis as unknown as { __aiCache?: Map<string, { exp: number; value: unknown }> };
const store = () => (g.__aiCache ??= new Map());
export const hashInput = (...parts: unknown[]) => crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');
export function cacheGet<T>(key: string): T | undefined {
  const e = store().get(key); if (!e) return undefined;
  if (e.exp < Date.now()) { store().delete(key); return undefined; }
  return e.value as T;
}
export function cacheSet(key: string, value: unknown, ttlMs = 10 * 60_000) {
  const m = store(); if (m.size > 500) m.delete(m.keys().next().value as string);
  m.set(key, { exp: Date.now() + ttlMs, value });
}
export const cacheClear = () => store().clear();
