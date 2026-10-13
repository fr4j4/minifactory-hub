import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { discoverLocalAi, listModels } from '@/lib/ai/discovery';
import { startAiSim } from '../../scripts/ai-sim';

type Srv = { port: number; close: () => Promise<void> };
function serve(handler: http.RequestListener): Promise<Srv> {
  return new Promise((resolve) => {
    const s = http.createServer(handler);
    s.listen(0, '127.0.0.1', () => resolve({ port: (s.address() as any).port, close: () => new Promise((r) => { s.closeAllConnections?.(); s.close(() => r()); }) }));
  });
}
let sim: Awaited<ReturnType<typeof startAiSim>>; const extra: Srv[] = [];
beforeAll(async () => { sim = await startAiSim(0); });
afterAll(async () => { await sim.close(); await Promise.all(extra.map((s) => s.close())); });
const own = async (h: http.RequestListener) => { const s = await serve(h); extra.push(s); return s; };

describe('descubridor de IA local', () => {
  it('encuentra un servidor, lista sus modelos y sugiere cuáles usar', async () => {
    sim.log.length = 0;
    const r = await discoverLocalAi({ hosts: ['127.0.0.1'], probes: [{ presetId: 'ollama', port: sim.port }, { presetId: 'lmstudio', port: 1 }], timeoutMs: 800 });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ presetId: 'ollama', baseUrl: `http://127.0.0.1:${sim.port}/v1`, authRequired: false, suggested: { fast: 'qwen2.5vl:7b', smart: 'gpt-oss:20b', vision: 'qwen2.5vl:7b' } });
    expect(r[0].models).toContain('llama3.1:8b');
    // solo un GET a /models y sin credenciales
    expect(sim.log.map((l) => l.path)).toEqual(['/v1/models']); expect(sim.log[0].headers.authorization).toBeUndefined(); expect(sim.log[0].headers['x-api-key']).toBeUndefined();
  });
  it('localhost y 127.0.0.1 son el mismo servidor: aparece una sola vez', async () => {
    const r = await discoverLocalAi({ hosts: ['localhost', '127.0.0.1'], probes: [{ presetId: 'vllm', port: sim.port }], timeoutMs: 800 });
    expect(r).toHaveLength(1);
  });
  it('detecta servidores que piden clave sin intentar adivinarla', async () => {
    const s = await own((_, res) => { res.writeHead(401); res.end('{"error":"unauthorized"}'); });
    const r = await discoverLocalAi({ hosts: ['127.0.0.1'], probes: [{ presetId: 'vllm', port: s.port }], timeoutMs: 800 });
    expect(r).toEqual([expect.objectContaining({ presetId: 'vllm', authRequired: true, models: [] })]);
  });
  it('ignora lo que no es un servidor de modelos: HTML, JSON ajeno, errores, redirecciones, respuestas enormes y cuelgues', async () => {
    const html = await own((_, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html>hola</html>'); });
    const other = await own((_, res) => { res.writeHead(200); res.end('{"hola":1}'); });
    const empty = await own((_, res) => { res.writeHead(200); res.end('{"data":[]}'); });
    const err = await own((_, res) => { res.writeHead(500); res.end('boom'); });
    const redir = await own((_, res) => { res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data' }); res.end(); });
    const huge = await own((_, res) => { res.writeHead(200); res.write('{"data":[{"id":"'); const chunk = 'x'.repeat(64 * 1024); let n = 0; const t = setInterval(() => { res.write(chunk); if (++n > 20) { clearInterval(t); res.end('"}]}'); } }, 1); res.on('close', () => clearInterval(t)); });
    const hang = await own(() => { /* nunca responde */ });
    const t0 = Date.now();
    const r = await discoverLocalAi({ hosts: ['127.0.0.1'], probes: [html, other, empty, err, redir, huge, hang, { port: 1 }].map((s, i) => ({ presetId: (i % 2 ? 'jan' : 'llamacpp') as any, port: s.port })), timeoutMs: 400 });
    expect(r).toEqual([]);
    expect(Date.now() - t0).toBeLessThan(3000); // los puertos cerrados y los que cuelgan no frenan la búsqueda
  });
  it('un equipo indicado a mano se busca en su puerto y debe ser local', async () => {
    const r = await discoverLocalAi({ extra: `127.0.0.1:${sim.port}`, hosts: [], timeoutMs: 800 });
    expect(r).toEqual([expect.objectContaining({ presetId: 'genericOpenai', port: sim.port })]);
    await expect(discoverLocalAi({ extra: '8.8.8.8', hosts: [] })).rejects.toMatchObject({ key: 'ai.err.discoveryNotLocal' });
    await expect(discoverLocalAi({ extra: 'api.openai.com:443', hosts: [] })).rejects.toMatchObject({ key: 'ai.err.discoveryNotLocal' });
    await expect(discoverLocalAi({ extra: 'no es una dirección', hosts: [] })).rejects.toMatchObject({ key: 'ai.err.discoveryBadTarget' });
  });
  it('sin ningún servidor devuelve lista vacía (los puertos por defecto cerrados no son error)', async () => {
    expect(await discoverLocalAi({ hosts: ['127.0.0.1'], probes: [{ presetId: 'ollama', port: 1 }, { presetId: 'jan', port: 2 }], timeoutMs: 300 })).toEqual([]);
  });
});

describe('listar modelos de un proveedor', () => {
  it('compatible con OpenAI: envía la clave como Bearer y devuelve los nombres ordenados', async () => {
    sim.log.length = 0;
    const m = await listModels({ provider: 'openai-compat', baseUrl: `http://127.0.0.1:${sim.port}/v1`, apiKey: 'k-123', localOnly: true });
    expect(m).toEqual(['gpt-oss:20b', 'llama3.1:8b', 'nomic-embed-text', 'qwen2.5vl:7b']);
    expect(sim.log[0].path).toBe('/v1/models'); expect(sim.log[0].headers.authorization).toBe('Bearer k-123');
  });
  it('Anthropic: usa x-api-key y la versión de la API', async () => {
    sim.log.length = 0;
    await listModels({ provider: 'anthropic', baseUrl: `http://127.0.0.1:${sim.port}`, apiKey: 'sk-ant-x', localOnly: false });
    expect(sim.log[0].path).toBe('/v1/models?limit=100'); expect(sim.log[0].headers['x-api-key']).toBe('sk-ant-x'); expect(sim.log[0].headers['anthropic-version']).toBeTruthy();
  });
  it('clave inválida, URL de internet en modo solo local, proveedor sin modelos y sin URL', async () => {
    await expect(listModels({ provider: 'openai-compat', baseUrl: `http://127.0.0.1:${sim.port}/v1`, apiKey: 'clave-mala', localOnly: false })).rejects.toMatchObject({ code: 'provider', status: 401 });
    await expect(listModels({ provider: 'openai-compat', baseUrl: 'https://api.openai.com/v1', apiKey: 'x', localOnly: true })).rejects.toMatchObject({ code: 'config' });
    const none = await own((_, res) => { res.writeHead(200); res.end('{"data":[]}'); });
    await expect(listModels({ provider: 'openai-compat', baseUrl: `http://127.0.0.1:${none.port}/v1`, apiKey: '', localOnly: false })).rejects.toMatchObject({ key: 'ai.err.noModels' });
    await expect(listModels({ provider: 'openai-compat', baseUrl: '', apiKey: '', localOnly: false })).rejects.toMatchObject({ key: 'ai.err.missingBaseUrl' });
  });
});
