import fs from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { getDb, s } from '@/db';
import { seedDemo } from '@/lib/seed';
import { getSettings, getSettingsRaw, saveSettings } from '@/lib/settings';
import { seal } from '@/lib/secret';
import { AIError, DEFAULT_AI, type AiSettings } from '@/lib/ai/types';
import { getAiConfig, publicAiSettings } from '@/lib/ai/config';
import { aiAvailableFor, aiUsage, pingAi } from '@/lib/ai';
import { assertFeatureAccess, clearPromptLogs, resetBreakers, runTask } from '@/lib/ai/run';
import { cacheClear } from '@/lib/ai/cache';
import { mockCalls, resetMock, setMockHandler } from '@/lib/ai/providers/mock';
import { startAiSim } from '../../scripts/ai-sim';

process.env.AI_RETRY_BASE_MS = '1';
const admin = { id: '00000000-0000-4000-8000-0000000000a1', role: 'admin' as const };
const operador = { id: '00000000-0000-4000-8000-0000000000a2', role: 'operador' as const };
const sinIa = { id: '00000000-0000-4000-8000-0000000000a3', role: 'operador' as const, permOverrides: { ia: 'V' } };
const Out = z.object({ nombre: z.string(), n: z.number().int() });
const call = (user: any = admin, extra: Record<string, unknown> = {}) =>
  runTask({ feature: 'messages.draft', tier: 'fast', system: 'sys', user: 'hola', schema: Out, ...extra }, { user, noCache: true });

async function setAi(patch: Partial<AiSettings>) {
  const cur = (await getSettingsRaw()).ai;
  await saveSettings({ ai: { ...cur, ...patch, features: { ...cur.features, ...patch.features }, roles: { ...cur.roles, ...patch.roles } } as AiSettings });
}
const on = (extra: Partial<AiSettings> = {}) => setAi({ enabled: true, provider: 'openai-compat', baseUrl: 'http://127.0.0.1:1/v1', features: { 'messages.draft': true }, ...extra });

beforeAll(async () => { fs.rmSync('data/test-storage', { recursive: true, force: true }); await seedDemo(); });
beforeEach(async () => {
  resetMock(); resetBreakers(); cacheClear(); delete process.env.AI_FORCE_DISABLED; delete process.env.AI_PROVIDER;
  const db = await getDb(); await db.delete(s.aiCalls);
  await saveSettings({ ai: { ...DEFAULT_AI } });
});

describe('IA apagada por defecto', () => {
  it('sin configurar, todo se rechaza y nada se registra', async () => {
    expect((await getAiConfig()).enabled).toBe(false);
    await expect(call()).rejects.toMatchObject({ code: 'disabled' });
    expect(await aiAvailableFor(admin, 'messages.draft')).toBe(false);
    expect((await aiUsage()).recent).toHaveLength(0);
  });
  it('activar sin proveedor utilizable sigue apagada', async () => {
    await setAi({ enabled: true, provider: 'anthropic' }); // sin clave
    expect((await getAiConfig()).enabled).toBe(false);
  });
  it('AI_FORCE_DISABLED apaga todo aunque esté activada', async () => {
    process.env.AI_PROVIDER = 'mock'; await setAi({ enabled: true, features: { 'messages.draft': true } });
    expect((await getAiConfig()).enabled).toBe(true);
    process.env.AI_FORCE_DISABLED = '1';
    await expect(call()).rejects.toMatchObject({ code: 'disabled' });
  });
});

describe('secretos', () => {
  it('la clave se guarda cifrada y getSettings() nunca la expone', async () => {
    await setAi({ provider: 'anthropic', apiKeySealed: seal('sk-ant-secreta-1234') });
    expect((await getSettings()).ai.apiKeySealed).toBe('');
    const raw = await getSettingsRaw();
    expect(raw.ai.apiKeySealed).not.toContain('secreta');
    expect((await getAiConfig()).apiKey).toBe('sk-ant-secreta-1234');
    const pub = publicAiSettings(raw.ai);
    expect(JSON.stringify(pub)).not.toContain('secreta');
    expect(pub).toMatchObject({ hasKey: true, keyLast4: '1234' });
  });
  it('guardar otros ajustes del taller no borra la clave de IA', async () => {
    await setAi({ provider: 'anthropic', apiKeySealed: seal('sk-x-9999') });
    await saveSettings({ shop: { ...(await getSettings()).shop, name: 'Otro nombre' } });
    expect((await getAiConfig()).apiKey).toBe('sk-x-9999');
  });
});

describe('control de acceso a funciones', () => {
  it('exige función activa, permiso del módulo y rol permitido', async () => {
    process.env.AI_PROVIDER = 'mock';
    await setAi({ enabled: true, features: { 'messages.draft': false } });
    setMockHandler(() => '{"nombre":"a","n":1}');
    await expect(call()).rejects.toMatchObject({ code: 'disabled' });
    await setAi({ features: { 'messages.draft': true } });
    await expect(call(admin)).resolves.toBeTruthy();
    await expect(call(operador)).rejects.toMatchObject({ code: 'forbidden' }); // por defecto solo admin
    await setAi({ roles: { 'messages.draft': ['admin', 'operador'] } });
    await expect(call(operador)).resolves.toBeTruthy();
    await expect(call(sinIa)).rejects.toMatchObject({ code: 'forbidden' }); // permiso del módulo ia retirado
    await expect(call(null)).rejects.toMatchObject({ code: 'forbidden' });
    assertFeatureAccess(await getAiConfig(), 'messages.draft', admin);
  });
  it('las funciones aún no implementadas nunca se muestran', async () => {
    process.env.AI_PROVIDER = 'mock'; await setAi({ enabled: true, features: { 'messages.draft': true } });
    expect(await aiAvailableFor(admin, 'messages.draft')).toBe(false); // available:false en la Fase 0
  });
});

describe('ejecución con proveedor simulado (mock)', () => {
  beforeEach(async () => { process.env.AI_PROVIDER = 'mock'; await setAi({ enabled: true, features: { 'messages.draft': true } }); });

  it('devuelve datos validados y registra el uso', async () => {
    setMockHandler(() => '{"nombre":"Ana","n":3}');
    const r = await call();
    expect(r.data).toEqual({ nombre: 'Ana', n: 3 });
    const u = await aiUsage();
    expect(u.recent).toHaveLength(1);
    expect(u.recent[0]).toMatchObject({ feature: 'messages.draft', ok: true, cacheHit: false, promptLog: null });
  });
  it('tolera JSON dentro de cercas de código', async () => {
    setMockHandler(() => 'Claro:\n```json\n{"nombre":"Ana","n":3}\n```');
    expect((await call()).data.n).toBe(3);
  });
  it('si el formato es inválido reintenta una vez con el error y luego acepta', async () => {
    let n = 0;
    setMockHandler(() => (++n === 1 ? '{"nombre":"Ana","n":"tres"}' : '{"nombre":"Ana","n":3}'));
    const r = await call();
    expect(r.data.n).toBe(3);
    expect(mockCalls()).toHaveLength(2);
    expect(JSON.stringify(mockCalls()[1].user)).toMatch(/n: /);
  });
  it('si sigue inválido lanza AIError(invalid) y no ejecuta nada', async () => {
    setMockHandler(() => '{"nombre":1}');
    await expect(call()).rejects.toMatchObject({ code: 'invalid' });
    expect(mockCalls()).toHaveLength(2);
  });
  it('envía el esquema JSON al proveedor', async () => {
    setMockHandler(() => '{"nombre":"a","n":1}'); await call();
    expect((mockCalls()[0].jsonSchema as any).properties).toHaveProperty('nombre');
  });
  it('cachea consultas idénticas y no cobra la segunda vez', async () => {
    setMockHandler(() => '{"nombre":"a","n":1}');
    const req = { feature: 'messages.draft' as const, tier: 'fast' as const, system: 's', user: 'u', schema: Out };
    await runTask(req, { user: admin }); const r2 = await runTask(req, { user: admin });
    expect(r2.cacheHit).toBe(true); expect(mockCalls()).toHaveLength(1);
    expect((await aiUsage()).recent.filter((x) => x.cacheHit)).toHaveLength(1);
  });
  it('oculta datos personales al proveedor y los restituye en la respuesta', async () => {
    setMockHandler((req) => JSON.stringify({ nombre: (req.user as string).match(/Cliente [A-Z]/)?.[0] ?? '?', n: 1 }));
    const red = (await import('@/lib/ai/redact')).createRedactor(true); red.addNames(['Juan Soto']);
    const r = await runTask({ feature: 'messages.draft', tier: 'fast', system: 's', user: 'Juan Soto, juan@x.cl, pide 5 piezas', schema: Out }, { user: admin, redactor: red, noCache: true });
    const sent = String(mockCalls()[0].user);
    expect(sent).not.toMatch(/Juan|juan@/);
    expect(r.restore(r.data.nombre)).toBe('Juan Soto');
  });
  it('desactivar la ocultación envía el texto tal cual', async () => {
    await setAi({ privacy: { redactPII: false, sendImages: false } });
    setMockHandler(() => '{"nombre":"a","n":1}');
    await runTask({ feature: 'messages.draft', tier: 'fast', system: 's', user: 'a@b.cl', schema: Out }, { user: admin, noCache: true });
    expect(String(mockCalls()[0].user)).toBe('a@b.cl');
  });
  it('bloquea imágenes salvo que privacidad lo permita', async () => {
    setMockHandler(() => '{"nombre":"a","n":1}');
    const req = { feature: 'messages.draft' as const, tier: 'fast' as const, system: 's', user: [{ type: 'text' as const, text: 'x' }, { type: 'image' as const, data: Buffer.from('png'), mime: 'image/png' }], schema: Out };
    await expect(runTask(req, { user: admin, noCache: true })).rejects.toMatchObject({ code: 'forbidden' });
    await setAi({ privacy: { redactPII: true, sendImages: true } });
    await expect(runTask(req, { user: admin, noCache: true })).resolves.toBeTruthy();
  });
  it('respeta el tope mensual con detención y el límite diario por persona', async () => {
    setMockHandler(() => '{"nombre":"a","n":1}');
    const db = await getDb();
    await db.insert(s.aiCalls).values({ workspaceId: (await db.select().from(s.workspaces))[0].id, feature: 'messages.draft', provider: 'x', model: 'x', costUsd: 11 });
    await setAi({ budget: { monthlyUsd: 10, perUserDailyCalls: 100, hardStop: false } });
    await expect(call()).resolves.toBeTruthy(); // sin hardStop solo avisa
    await setAi({ budget: { monthlyUsd: 10, perUserDailyCalls: 100, hardStop: true } });
    await expect(call()).rejects.toMatchObject({ code: 'budget' });
    await setAi({ budget: { monthlyUsd: null, perUserDailyCalls: 1, hardStop: false } });
    await db.delete(s.aiCalls);
    await call(); await expect(call()).rejects.toMatchObject({ code: 'budget' });
  });
  it('no guarda el texto de las consultas salvo que la retención lo pida, y se puede borrar', async () => {
    setMockHandler(() => '{"nombre":"a","n":1}');
    await call(); expect((await aiUsage()).recent[0].promptLog).toBeNull();
    await setAi({ retention: { logPromptsDays: 7 } }); await call();
    expect((await aiUsage()).recent[0].promptLog).toMatchObject({ response: expect.stringContaining('nombre') });
    await clearPromptLogs(); expect((await aiUsage()).recent.every((r) => r.promptLog === null)).toBe(true);
  });
  it('el cortacircuitos pausa la función tras 3 fallos seguidos', async () => {
    setMockHandler(() => { throw new AIError('ai.err.connect', 'provider', { status: 500 }); });
    for (let i = 0; i < 3; i++) await expect(call()).rejects.toMatchObject({ code: 'provider' });
    await expect(call()).rejects.toMatchObject({ code: 'circuit' });
    expect(mockCalls().length).toBe(9); // 3 intentos (reintentos de 5xx) × 3 solicitudes
  });
});

describe('proveedores HTTP contra el simulador', () => {
  let sim: Awaited<ReturnType<typeof startAiSim>>;
  beforeAll(async () => { sim = await startAiSim(0); });
  afterAll(async () => { await sim.close(); });
  beforeEach(() => { sim.log.length = 0; });

  it('compatible con OpenAI: ping correcto y esquema en el prompt', async () => {
    await setAi({ enabled: true, provider: 'openai-compat', baseUrl: `http://127.0.0.1:${sim.port}/v1`, apiKeySealed: seal('k-local') });
    const r = await pingAi();
    expect(r).toMatchObject({ ok: true });
    const q = sim.log[0];
    expect(q.path).toBe('/v1/chat/completions');
    expect(q.headers.authorization).toBe('Bearer k-local');
    expect(q.body.messages[0].content).toMatch(/esquema JSON/);
  });
  it('Anthropic: usa herramienta forzada con esquema y cabeceras correctas', async () => {
    await setAi({ enabled: true, provider: 'anthropic', baseUrl: `http://127.0.0.1:${sim.port}`, apiKeySealed: seal('sk-ant-x') });
    const r = await pingAi();
    expect(r).toMatchObject({ ok: true });
    const q = sim.log[0];
    expect(q.path).toBe('/v1/messages');
    expect(q.headers['x-api-key']).toBe('sk-ant-x');
    expect(q.headers['anthropic-version']).toBeTruthy();
    expect(q.body.tool_choice).toEqual({ type: 'tool', name: 'responder' });
    expect(q.body.tools[0].input_schema.properties).toHaveProperty('ok');
  });
  it('clave inválida: error claro sin exponer la clave', async () => {
    await setAi({ enabled: true, provider: 'openai-compat', baseUrl: `http://127.0.0.1:${sim.port}/v1`, apiKeySealed: seal('clave-mala') });
    const r = await pingAi() as any;
    expect(r.ok).toBe(false); expect(r.error).toMatch(/401/); expect(r.error).not.toContain('clave-mala');
  });
  it('proveedor inalcanzable: error de conexión, no cuelga', async () => {
    await setAi({ enabled: true, provider: 'openai-compat', baseUrl: 'http://127.0.0.1:1/v1' });
    const r = await pingAi() as any; expect(r.ok).toBe(false); expect(r.error).toMatch(/conectar/);
  });
  it('modo solo local rechaza proveedores de internet antes de enviar nada', async () => {
    await setAi({ enabled: true, provider: 'openai-compat', baseUrl: 'https://api.openai.com/v1', localOnly: true });
    const r = await pingAi() as any; expect(r.ok).toBe(false); expect(r.error).toMatch(/solo local/i);
    expect(sim.log).toHaveLength(0);
  });
  it('los ping quedan en el registro de uso con costo 0 en local', async () => {
    await setAi({ enabled: true, provider: 'openai-compat', baseUrl: `http://127.0.0.1:${sim.port}/v1` });
    await pingAi();
    const u = await aiUsage(); expect(u.recent[0]).toMatchObject({ feature: 'system.ping', ok: true, costUsd: 0 });
    expect(u.month.costUsd).toBe(0);
  });
});
