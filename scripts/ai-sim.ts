/**
 * Proveedor de IA simulado para desarrollo y pruebas e2e (sin red ni costo).
 *   npx tsx scripts/ai-sim.ts            → http://127.0.0.1:18090
 * En Configuración → Inteligencia artificial elige «Compatible con OpenAI», URL http://127.0.0.1:18090/v1
 * (o «Anthropic» con URL http://127.0.0.1:18090). Cualquier clave sirve; la clave «mala» devuelve 401.
 * Responde {"ok":true} a las pruebas de conexión; con el encabezado x-sim-fail=429|500 simula errores.
 */
import http from 'node:http';

/** Respuestas guionadas según la función que llama (se reconoce por el texto del sistema). */
function scripted(system: string, user: string): string {
  if (/asesor de perfiles/i.test(system)) {
    const symptom = /problema/i.test(system) && !/lograr el objetivo/i.test(system);
    return JSON.stringify({
      confidence: 'media', testPlan: 'Imprime primero una pieza pequeña con el candidato elegido.',
      diagnosis: symptom ? [{ cause: 'Adherencia de la primera capa', likelihood: 0.7, why: 'Las esquinas se levantan por contracción.' }] : undefined,
      candidates: [
        { name: 'conservador', summary: 'Más relleno y una pared extra para ganar resistencia.', expected: { time: '+', material: '+', strength: '+', quality: '=' }, risks: ['Gasta más material'],
          changes: [{ scope: 'process', key: 'sparse_infill_density', to: '30%', reason: 'Más resistencia', evidence: 'relleno actual 15 %' }, { scope: 'process', key: 'wall_loops', to: 3, reason: 'Las paredes aportan más que el relleno', evidence: 'wall_loops=2' }] },
        { name: 'equilibrado', summary: 'Capa más gruesa para ahorrar tiempo.', expected: { time: '-', material: '=', strength: '-', quality: '-' }, risks: ['Se notan más las capas'],
          changes: [{ scope: 'process', key: 'layer_height', to: 0.28, reason: 'Menos capas = menos tiempo', evidence: 'layer_height=0.2' }, { scope: 'process', key: 'machine_start_gcode', to: 'M104 S999', reason: 'x', evidence: 'x' }] },
      ],
    });
  }
  if (/laminado/i.test(system) && /explica por qu/i.test(system)) return JSON.stringify({ summary: 'El perfil no es compatible con la máquina elegida.', steps: ['Elige un perfil hecho para esa impresora', 'Vuelve a laminar'] });
  void user;
  return '{"ok":true}';
}

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
      if (req.url?.endsWith('/v1/messages')) {
        const user = JSON.stringify(body.messages?.[0]?.content ?? '');
        return send(200, { model: body.model, content: [{ type: 'tool_use', name: 'responder', input: JSON.parse(scripted(String(body.system ?? ''), user)) }], usage: { input_tokens: 12, output_tokens: 5 } });
      }
      if (req.url?.endsWith('/chat/completions')) {
        const [sys, usr] = body.messages ?? [];
        return send(200, { model: body.model, choices: [{ message: { role: 'assistant', content: scripted(String(sys?.content ?? ''), JSON.stringify(usr?.content ?? '')) } }], usage: { prompt_tokens: 12, completion_tokens: 5 } });
      }
      send(404, { error: { message: 'no encontrado' } });
    });
  });
  return new Promise<{ server: http.Server; port: number; log: typeof log; close: () => Promise<void> }>((resolve) =>
    server.listen(port, '127.0.0.1', () => resolve({ server, port: (server.address() as any).port, log, close: () => new Promise((r) => server.close(() => r())) })));
}

if (process.argv[1]?.endsWith('ai-sim.ts')) startAiSim().then((s) => console.log(`IA simulada en http://127.0.0.1:${s.port}  (OpenAI: /v1/chat/completions · Anthropic: /v1/messages)`));
