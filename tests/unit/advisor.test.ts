import { describe, expect, it } from 'vitest';
import { effectiveFailCode, normalizeFailCause } from '@/lib/production/fail-causes';
import { validateChanges, applyAccepted, MAX_CHANGES, type ValidateCtx } from '@/lib/ai/features/profile-advisor/validate';
import { goalGain, scoreProfile } from '@/lib/ai/features/profile-advisor/score';
import { rulesForCause, relevantRules } from '@/lib/ai/features/profile-advisor/kb';
import { PARAM_REGISTRY } from '@/lib/ai/features/profile-advisor/params';
import { bestFit, explainSliceError } from '@/lib/slicer/explain';
import { isDegraded, summarize } from '@/lib/slicer/performance';

const ctx = (over: Partial<ValidateCtx> = {}): ValidateCtx => ({
  nozzle: 0.4, knownKeys: null,
  process: { layer_height: '0.2', wall_loops: '2', sparse_infill_density: '15%', sparse_infill_pattern: 'grid', enable_support: '0', support_type: 'normal(auto)', outer_wall_speed: '120', default_acceleration: '5000' },
  filament: { nozzle_temperature: ['220'], nozzle_temperature_range_low: ['190'], nozzle_temperature_range_high: ['240'], hot_plate_temp: ['55'], filament_flow_ratio: ['0.98'] },
  ...over,
});
const P = (key: string, to: string | number, scope = 'process') => ({ scope, key, to, reason: 'r', evidence: 'e' });

describe('catálogo de causas de falla', () => {
  it('clasifica texto libre en español e inglés', () => {
    expect(normalizeFailCause('se despegó de la cama')).toBe('despegue');
    expect(normalizeFailCause('Hizo mucho stringing')).toBe('hilos');
    expect(normalizeFailCause('esquinas levantadas')).toBe('warping');
    expect(normalizeFailCause('espagueti total')).toBe('espagueti');
    expect(normalizeFailCause('se acabó el filamento')).toBe('sin_material');
    expect(normalizeFailCause('corte de luz')).toBe('corte_energia');
    expect(normalizeFailCause('boquilla tapada')).toBe('atasco');
    expect(normalizeFailCause('')).toBeNull();
    expect(normalizeFailCause('algo raro')).toBeNull();
  });
  it('el código guardado manda; si no, se deduce del texto; texto desconocido = otro', () => {
    expect(effectiveFailCode({ failCode: 'hilos', failCause: 'se despegó' })).toBe('hilos');
    expect(effectiveFailCode({ failCode: null, failCause: 'se despegó' })).toBe('despegue');
    expect(effectiveFailCode({ failCode: null, failCause: 'misterio' })).toBe('otro');
    expect(effectiveFailCode({ failCode: null, failCause: null })).toBeNull();
    expect(effectiveFailCode({ failCode: 'inventado', failCause: 'hilos' })).toBe('hilos');
  });
});

describe('validador de cambios de la IA', () => {
  it('rechaza parámetros fuera de la lista (G-code, máquina, scripts)', () => {
    const r = validateChanges([P('machine_start_gcode', 'M104 S300'), P('post_process', 'rm -rf /'), P('machine_max_speed_x', 900), P('layer_height_x', 1)], ctx());
    expect(r.accepted).toEqual([]); expect(r.rejected.map((x) => x.code)).toEqual(['not_allowed', 'not_allowed', 'not_allowed', 'not_allowed']);
  });
  it('acepta cambios válidos con el valor actual real como «from» y formato de Orca', () => {
    const r = validateChanges([P('sparse_infill_density', 25), P('wall_loops', '3.4'), P('sparse_infill_pattern', 'gyroid')], ctx());
    expect(r.accepted.map((a) => [a.key, a.from, a.to])).toEqual([['sparse_infill_density', '15%', '25%'], ['wall_loops', '2', 3], ['sparse_infill_pattern', 'grid', 'gyroid']]);
  });
  it('recorta al rango y lo avisa (temperatura al rango del material, altura de capa a la boquilla)', () => {
    const r = validateChanges([P('nozzle_temperature', 300, 'filament'), P('layer_height', 0.7), P('layer_height_', 0.7)], ctx());
    const t = r.accepted.find((a) => a.key === 'nozzle_temperature')!; expect(t.to).toBe(240); expect(t.clamped).toBe(true);
    const l = r.accepted.find((a) => a.key === 'layer_height')!; expect(l.to).toBe(0.32); expect(l.clamped).toBe(true); // 0,8 × boquilla
    expect(validateChanges([P('layer_height', 0.02)], ctx()).accepted[0].to).toBe(0.1); // 0,25 × boquilla
  });
  it('sin rango del material limita a ±30 °C de lo actual', () => {
    const c = ctx({ filament: { nozzle_temperature: ['200'] } });
    expect(validateChanges([P('nozzle_temperature', 280, 'filament')], c).accepted[0].to).toBe(230);
  });
  it('respeta los límites de velocidad y aceleración de la máquina', () => {
    const c = ctx({ machineMaxSpeed: 300, machineMaxAccel: 10000 });
    expect(validateChanges([P('outer_wall_speed', 450)], c).accepted[0].to).toBe(300);
    expect(validateChanges([P('default_acceleration', 20000)], c).accepted[0].to).toBe(10000);
  });
  it('valores inválidos, repetidos y sin cambio', () => {
    const r = validateChanges([P('sparse_infill_pattern', 'rm -rf'), P('wall_loops', 'muchas'), P('wall_loops', 3), P('wall_loops', 4), P('sparse_infill_density', '15%'), P('enable_support', 'quizá')], ctx());
    expect(r.rejected.map((x) => [x.key, x.code])).toEqual([['sparse_infill_pattern', 'bad_value'], ['wall_loops', 'bad_value'], ['wall_loops', 'duplicate'], ['sparse_infill_density', 'no_change'], ['enable_support', 'bad_value']]);
    expect(r.accepted.map((a) => [a.key, a.to])).toEqual([['wall_loops', 3]]); // un valor inválido no «gasta» la clave
  });
  it('dependencias: el tipo de soporte exige soportes activos (actuales o propuestos)', () => {
    expect(validateChanges([P('support_type', 'tree(auto)')], ctx()).rejected[0].code).toBe('dependency');
    expect(validateChanges([P('enable_support', 1), P('support_type', 'tree(auto)')], ctx()).accepted.map((a) => a.key)).toEqual(['enable_support', 'support_type']);
    expect(validateChanges([P('support_type', 'tree(auto)')], ctx({ process: { ...ctx().process, enable_support: '1' } })).accepted).toHaveLength(1);
  });
  it('claves que no existen en el perfil de fábrica se rechazan cuando se pueden comprobar', () => {
    const c = ctx({ knownKeys: { process: new Set(['wall_loops']), filament: new Set() } });
    const r = validateChanges([P('wall_loops', 3), P('sparse_infill_density', 20)], c);
    expect(r.accepted.map((a) => a.key)).toEqual(['wall_loops']); expect(r.rejected[0]).toMatchObject({ key: 'sparse_infill_density', code: 'unknown_key' });
  });
  it(`nunca acepta más de ${MAX_CHANGES} cambios`, () => {
    const many = PARAM_REGISTRY.filter((p) => p.type === 'int' && p.scope === 'process').map((p) => P(p.key, 3));
    const keys = ['wall_loops', 'top_shell_layers', 'bottom_shell_layers']; void many;
    const r = validateChanges(Array.from({ length: 20 }, (_, i) => P(PARAM_REGISTRY[i % PARAM_REGISTRY.length].key, 1 + (i % 2))), ctx({ process: {}, filament: {} }));
    expect(r.accepted.length).toBeLessThanOrEqual(MAX_CHANGES); void keys;
  });
  it('entrada hostil (valores gigantes, objetos, nulos) no lanza', () => {
    const hostile: any[] = [P('wall_loops', 1e308), P('layer_height', NaN as any), P('hot_plate_temp', -50, 'filament'), { scope: 'process', key: 'wall_loops', to: { a: 1 } }, { scope: 'x', key: '__proto__', to: 1 }, { scope: 'process', key: 'constructor', to: 1 }];
    expect(() => validateChanges(hostile, ctx())).not.toThrow();
    const r = validateChanges(hostile, ctx()); for (const a of r.accepted) expect(Number.isFinite(Number(String(a.to).replace('%', '')))).toBe(true);
  });
  it('applyAccepted devuelve los valores efectivos manteniendo el formato de lista de las claves de filamento', () => {
    const acc = validateChanges([P('nozzle_temperature', 230, 'filament')], ctx()).accepted;
    expect(applyAccepted(ctx().filament, acc, 'filament').nozzle_temperature).toEqual(['230']);
    expect(applyAccepted(ctx().process, acc, 'process').layer_height).toBe('0.2');
  });
});

describe('puntajes y objetivos', () => {
  const base = scoreProfile({ process: { wall_loops: '2', sparse_infill_density: '15%', top_shell_layers: '4', bottom_shell_layers: '3', layer_height: '0.2', outer_wall_speed: '120', default_acceleration: '5000' }, filament: {} });
  it('más paredes y relleno suben la resistencia; capa fina y pared lenta suben la calidad', () => {
    const strong = scoreProfile({ process: { wall_loops: '5', sparse_infill_density: '40%', sparse_infill_pattern: 'gyroid', top_shell_layers: '6', bottom_shell_layers: '5', layer_height: '0.2', outer_wall_speed: '120', default_acceleration: '5000' }, filament: {} });
    expect(strong.strength).toBeGreaterThan(base.strength + 20);
    const fine = scoreProfile({ process: { wall_loops: '2', sparse_infill_density: '15%', layer_height: '0.12', outer_wall_speed: '60', default_acceleration: '2000' }, filament: {} });
    expect(fine.quality).toBeGreaterThan(base.quality + 15);
  });
  it('el riesgo sube con voladizos sin soportes, caudal sobre el límite e historial malo; los soportes lo bajan', () => {
    const f = { filament_max_volumetric_speed: ['12'] };
    const calm = scoreProfile({ process: { layer_height: '0.2', outer_wall_speed: '60', enable_support: '0' }, filament: f, overhangPct: 2 });
    const hot = scoreProfile({ process: { layer_height: '0.28', outer_wall_speed: '200', inner_wall_speed: '250', enable_support: '0' }, filament: f, overhangPct: 20, historySuccessPct: 60 });
    expect(hot.risk).toBeGreaterThan(calm.risk + 40);
    expect(scoreProfile({ process: { enable_support: '1', layer_height: '0.2', outer_wall_speed: '60' }, filament: f, overhangPct: 20 }).risk).toBeLessThan(scoreProfile({ process: { enable_support: '0', layer_height: '0.2', outer_wall_speed: '60' }, filament: f, overhangPct: 20 }).risk);
  });
  it('todos los puntajes quedan entre 0 y 100 aun con datos absurdos', () => {
    const s = scoreProfile({ process: { wall_loops: '999', sparse_infill_density: '900%', layer_height: '-5', outer_wall_speed: '1e9' }, filament: { filament_max_volumetric_speed: ['0.001'] }, overhangPct: 9999, historySuccessPct: -50 });
    for (const v of Object.values(s)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); }
  });
  it('la ganancia respeta el objetivo', () => {
    const b = { m: { timeS: 10000, grams: 50 }, s: { strength: 50, quality: 50, risk: 20 } };
    const faster = { m: { timeS: 7000, grams: 50 }, s: { strength: 40, quality: 40, risk: 20 } };
    const stronger = { m: { timeS: 12000, grams: 60 }, s: { strength: 80, quality: 50, risk: 20 } };
    expect(goalGain('rapido', b, faster)).toBeGreaterThan(goalGain('rapido', b, stronger));
    expect(goalGain('resistente', b, stronger)).toBeGreaterThan(goalGain('resistente', b, faster));
    expect(goalGain('ahorro', b, { ...faster, m: { timeS: 10000, grams: 30 } })).toBeGreaterThan(0);
    expect(goalGain('rapido', b, { ...faster, s: { ...faster.s, risk: 80 } })).toBeLessThan(goalGain('rapido', b, faster));
  });
});

describe('base de conocimiento', () => {
  it('cada regla usa solo parámetros permitidos', () => {
    const allowed = new Set(PARAM_REGISTRY.map((p) => p.key));
    for (const r of [...rulesForCause('despegue'), ...rulesForCause('hilos'), ...relevantRules({ goal: 'rapido' }), ...relevantRules({ goal: 'resistente' }), ...relevantRules({ goal: 'estetico' }), ...relevantRules({ goal: 'ahorro' })])
      for (const m of r.moves) expect(allowed.has(m.key), `${r.id}:${m.key}`).toBe(true);
  });
  it('selecciona reglas por causa y por objetivo', () => {
    expect(relevantRules({ causes: ['despegue'] }).map((r) => r.id)).toEqual(['despegue']);
    expect(relevantRules({ goal: 'equilibrado' })).toEqual([]);
    expect(relevantRules({ goal: 'ahorro', causes: ['hilos'] }).map((r) => r.id)).toEqual(['meta-ahorro', 'hilos']);
  });
});

describe('explicar errores de laminado', () => {
  it('calcula si la pieza cabe girándola, y si no, a qué escala', () => {
    expect(bestFit([300, 100, 40], [256, 256, 256]).fits).toBe(false);
    const f = bestFit([100, 40, 300], [320, 320, 100]); expect(f.fits).toBe(true); expect(f.rotated).toEqual([100, 300, 40]);
    expect(Math.round(bestFit([512, 100, 40], [256, 256, 256]).scale * 100)).toBe(50);
  });
  it('sugiere acciones concretas por tipo de error', () => {
    const keys = (o: Parameters<typeof explainSliceError>[0]) => explainSliceError(o).map((h) => h.key);
    expect(keys({ code: 'no_fit', dims: [100, 40, 300], volume: [320, 320, 100] })).toContain('advisor.explain.rotate');
    expect(keys({ code: 'no_fit', dims: [600, 100, 40], volume: [256, 256, 256] })).toEqual(expect.arrayContaining(['advisor.explain.scale', 'advisor.explain.biggerMachine']));
    expect(keys({ code: 'no_fit', dims: [1000, 100, 40], volume: [256, 256, 256] })).toContain('advisor.explain.split');
    expect(keys({ code: 'no_fit', dims: [50, 50, 50], volume: [256, 256, 256], copies: 40 })).toContain('advisor.explain.fewerCopies');
    expect(keys({ code: 'no_fit' })).toEqual(['advisor.explain.noFitGeneric']);
    expect(keys({ code: 'incompatible' })).toContain('advisor.explain.pickProcessForMachine');
    expect(keys({ code: 'timeout' })).toContain('advisor.explain.timeoutCopies');
    expect(keys({ code: 'not_installed' })).toEqual(['advisor.explain.notInstalled']);
    expect(keys({ code: 'other' })).toEqual([]);
  });
});

describe('desempeño de un perfil', () => {
  const job = (o: Partial<Parameters<typeof summarize>[1][number]>) => ({ status: 'terminado', result: 'exito', estH: 2, realH: 2.2, estG: 40, realG: 38, failCode: null, failCause: null, ...o });
  it('calcula éxito, causas y desvíos solo con trabajos terminados', () => {
    const v = summarize(2, [job({}), job({ realH: 2.4, realG: 42 }), job({ result: 'falla_total', status: 'fallido', failCause: 'se despegó' }), job({ result: 'falla_parcial', failCode: 'hilos' }), job({ status: 'imprimiendo', result: null })]);
    expect(v).toMatchObject({ version: 2, jobs: 4, ok: 2, failed: 2, successPct: 50, causes: { despegue: 1, hilos: 1 } });
    expect(Math.round(v.timeDevPct!)).toBe(15); expect(Math.round(v.gramsDevPct!)).toBe(0);
  });
  it('sin trabajos no hay porcentajes', () => { expect(summarize(1, [])).toMatchObject({ jobs: 0, successPct: null, timeDevPct: null }); });
  it('solo se considera degradado con suficientes trabajos y bajo el umbral', () => {
    expect(isDegraded({ jobs: 7, successPct: 10 })).toBe(false);
    expect(isDegraded({ jobs: 8, successPct: 84 })).toBe(true);
    expect(isDegraded({ jobs: 8, successPct: 85 })).toBe(false);
    expect(isDegraded({ jobs: 0, successPct: null })).toBe(false);
  });
});
