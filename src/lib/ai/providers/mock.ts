import type { AIProvider, ProviderResult } from '../types';

/** Proveedor determinista para pruebas y desarrollo: sin red. Se programa con `setMockHandler`. */
type Handler = (req: Parameters<AIProvider['complete']>[0], o: Parameters<AIProvider['complete']>[1]) => string | ProviderResult | Promise<string | ProviderResult>;
const g = globalThis as unknown as { __aiMock?: { handler: Handler; calls: Array<Parameters<Handler>[0]> } };
const st = () => (g.__aiMock ??= { handler: () => '{"ok":true}', calls: [] });
export const setMockHandler = (h: Handler) => { st().handler = h; };
export const resetMock = () => { g.__aiMock = undefined; };
export const mockCalls = () => st().calls;

export const mock: AIProvider = {
  id: 'mock',
  capabilities: { vision: true, jsonSchema: true, embeddings: false },
  async complete(req, o) {
    st().calls.push(req);
    const r = await st().handler(req, o);
    if (typeof r === 'string') return { text: r, usage: { inTokens: Math.ceil(JSON.stringify(req.user).length / 4), outTokens: Math.ceil(r.length / 4) }, model: o.model };
    return r;
  },
};
