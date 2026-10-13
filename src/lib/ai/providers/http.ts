import { AIError } from '../types';

/** fetch con tiempo límite; los errores HTTP se convierten en AIError sin exponer claves ni cuerpos largos. */
export async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number, signal?: AbortSignal): Promise<any> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  signal?.addEventListener('abort', () => ctl.abort(), { once: true });
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal });
    const text = await res.text();
    if (!res.ok) {
      let msg = text.slice(0, 300);
      try { const j = JSON.parse(text); msg = j?.error?.message ?? j?.message ?? msg; } catch { /* texto plano */ }
      throw new AIError(`El proveedor respondió ${res.status}: ${String(msg).slice(0, 200)}`, 'provider', res.status);
    }
    try { return JSON.parse(text); } catch { throw new AIError('Respuesta del proveedor no es JSON', 'provider', res.status); }
  } catch (e) {
    if (e instanceof AIError) throw e;
    if ((e as Error).name === 'AbortError') throw new AIError(`El proveedor no respondió en ${Math.round(timeoutMs / 1000)} s`, 'timeout');
    throw new AIError(`No se pudo conectar con el proveedor: ${(e as Error).message}`, 'provider');
  } finally { clearTimeout(timer); }
}
