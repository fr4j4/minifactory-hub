/**
 * Proveedor de IA simulado para desarrollo y pruebas e2e (sin red ni costo).
 *   npx tsx scripts/ai-sim.ts            → http://127.0.0.1:18090
 * En Configuración → Inteligencia artificial elige «Compatible con OpenAI», URL http://127.0.0.1:18090/v1
 * (o «Anthropic» con URL http://127.0.0.1:18090). Cualquier clave sirve; la clave «mala» devuelve 401.
 * Responde {"ok":true} a las pruebas de conexión; con el encabezado x-sim-fail=429|500 simula errores.
 */
import http from 'node:http';

export function startAiSim(port = Number(process.env.AI_SIM_PORT || 18090)) {
  const log: Array<{ path: string; body: any; headers: http.IncomingHttpHeaders }> = [];
  const server = http.createServer((req, res) => {
    let raw = ''; req.on('data', (d) => (raw += d));
    req.on('end', () => {
      let body: any = {}; try { body = JSON.parse(raw || '{}'); } catch { /* vacío */ }
      log.push({ path: req.url ?? '', body, headers: req.headers });
      const send = (code: number, o: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      const fail = Number(req.headers['x-sim-fail'] || 0); if (fail) return send(fail, { error: { message: `fallo simulado ${fail}` } });
      const key = String(req.headers['x-api-key'] || req.headers.authorization || '');
      if (/mala/.test(key)) return send(401, { error: { message: 'clave inválida' } });
      if (req.url?.endsWith('/v1/messages')) return send(200, { model: body.model, content: [{ type: 'tool_use', name: 'responder', input: { ok: true } }], usage: { input_tokens: 12, output_tokens: 5 } });
      if (req.url?.endsWith('/chat/completions')) return send(200, { model: body.model, choices: [{ message: { role: 'assistant', content: '{"ok":true}' } }], usage: { prompt_tokens: 12, completion_tokens: 5 } });
      send(404, { error: { message: 'no encontrado' } });
    });
  });
  return new Promise<{ server: http.Server; port: number; log: typeof log; close: () => Promise<void> }>((resolve) =>
    server.listen(port, '127.0.0.1', () => resolve({ server, port: (server.address() as any).port, log, close: () => new Promise((r) => server.close(() => r())) })));
}

if (process.argv[1]?.endsWith('ai-sim.ts')) startAiSim().then((s) => console.log(`IA simulada en http://127.0.0.1:${s.port}  (OpenAI: /v1/chat/completions · Anthropic: /v1/messages)`));
