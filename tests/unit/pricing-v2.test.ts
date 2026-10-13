import { describe, expect, it } from 'vitest';
import {
  breakEvenRate, calcLine, calcQuote, coherenceChecks, completeness, estimateFromDims, fixedPerHour, inversePrice, pickProfileId, quantityTable,
  resolveRates, roundPrice, sensitivity, type LineInput, type MachineCost, type Rates,
} from '@/lib/pricing';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import { priceLine } from '@/lib/item-price';
import { DEFAULT_CALC_PROFILES } from '@/lib/calc-presets';

const base: Rates = { ...DEFAULT_SETTINGS.rates, rounding: { mode: 'none', step: 1 }, minPrice: 0, volumeTiers: [{ minQty: 10, pct: -10 }, { minQty: 50, pct: -20 }] };
const machine: MachineCost = { purchaseValue: 480000, residualValue: 100000, lifeHours: 5000, watts: 130, maintCostHour: 150, timeFactor: 1, jobsDone: 40, jobsFailed: 2 };
const line = (o: Partial<LineInput> = {}): LineInput => ({ qty: 1, gramsTotal: 100, hoursTotal: 5, costPerKg: 17000, machine, origin: 'slicer', ...o });
const marginOnNet = (b: ReturnType<typeof calcLine>) => ((b.suggestedTotal - (b.feesAmount ?? 0) - b.cost) / b.suggestedTotal) * 100;

describe('motor v2: precio neto y margen', () => {
  it('el margen real sobre neto coincide con el objetivo (sin depender del IVA)', () => {
    for (const m of [30, 40, 55]) {
      const b = calcLine(line(), { ...base, marginPct: m, fixedCosts: [], floors: { perHour: 0, perHourAuto: false, perGram: 0, perOrder: 0 } });
      expect(marginOnNet(b)).toBeCloseTo(m, 0);
      expect(b.rule).toBe('margin');
    }
  });
  it('modo recargo: precio = costo × (1 + r)', () => {
    const b = calcLine(line(), { ...base, marginMode: 'recargo', marginPct: 70 });
    expect(b.suggestedTotal / b.cost).toBeCloseTo(1.7, 1);
  });
  it('el caso 200 g / 16 h sube de $963/h de la fórmula antigua a un precio por hora mayor', () => {
    const b = calcLine(line({ gramsTotal: 200, hoursTotal: 16 }), base);
    expect(b.pricePerHour!).toBeGreaterThan(963);
  });
  it('suma todos los costos y reporta la composición', () => {
    const b = calcLine(line({ postMinutesPerUnit: 10, designMinutes: 30 }), { ...base, fixedCosts: [{ label: 'Arriendo', amount: 300000 }] });
    const sum = b.material + b.machine + b.energy + (b.overhead ?? 0) + b.prep + (b.supervision ?? 0) + b.post + (b.design ?? 0) + (b.packaging ?? 0) + b.failure;
    expect(Math.abs(b.cost - sum)).toBeLessThanOrEqual(5); // cada concepto se redondea por separado
    expect(b.overhead).toBeGreaterThan(0); expect(b.design).toBeGreaterThan(0); expect(b.post).toBeGreaterThan(0);
  });
});

describe('motor v2: mano de obra, tiempo y costos fijos', () => {
  it('la preparación es por placa, no por línea', () => {
    const one = calcLine(line({ plates: 1 }), base), three = calcLine(line({ plates: 3 }), base);
    expect(three.prep).toBe(one.prep * 3);
  });
  it('la supervisión escala con las horas', () => {
    const a = calcLine(line({ hoursTotal: 2 }), base), b = calcLine(line({ hoursTotal: 20 }), base);
    expect(b.supervision!).toBeGreaterThan(a.supervision! * 5);
  });
  it('timeFactor se aplica también en modo manual', () => {
    const slow = calcLine(line({ machine: { ...machine, timeFactor: 1.3 }, applyTimeFactor: false }), base);
    const norm = calcLine(line(), base);
    expect(slow.hoursEffective).toBeGreaterThan(norm.hoursEffective);
  });
  it('los costos fijos se reparten entre las horas productivas de todas las máquinas', () => {
    const rt: Rates = { ...base, fixedCosts: [{ label: 'x', amount: 440000 }], productive: { hoursPerDay: 10, daysPerMonth: 20, utilizationPct: 50 }, machineCount: 2 };
    expect(fixedPerHour(rt)).toBeCloseTo(440000 / (100 * 2), 5);
    expect(fixedPerHour({ ...rt, machineCount: 1 })).toBeCloseTo(4400, 5);
  });
  it('tarifa de equilibrio = (fijos + ingreso objetivo) / horas productivas', () => {
    const rt: Rates = { ...base, fixedCosts: [{ label: 'x', amount: 300000 }], targetIncomeMonth: 700000, productive: { hoursPerDay: 8, daysPerMonth: 20, utilizationPct: 50 }, machineCount: 1 };
    expect(breakEvenRate(rt)).toBeCloseTo(1_000_000 / 80, 5);
  });
});

describe('motor v2: pisos', () => {
  const rt: Rates = { ...base, fixedCosts: [{ label: 'x', amount: 400000 }], targetIncomeMonth: 800000, productive: { hoursPerDay: 8, daysPerMonth: 20, utilizationPct: 50 }, machineCount: 1, floors: { perHour: 0, perHourAuto: true, perGram: 0, perOrder: 0 } };
  it('el piso por hora manda cuando la pieza tarda mucho y pesa poco', () => {
    const b = calcLine(line({ gramsTotal: 20, hoursTotal: 30 }), rt);
    expect(b.rule).toBe('floorHour');
    expect(b.suggestedTotal / b.hoursEffective).toBeGreaterThanOrEqual(breakEvenRate(rt) - 1);
  });
  it('el piso por gramo y el mínimo por línea mandan sobre el costo + margen', () => {
    const g = calcLine(line({ gramsTotal: 100, hoursTotal: 0.2 }), { ...base, floors: { perHour: 0, perHourAuto: false, perGram: 500, perOrder: 0 } });
    expect(g.rule).toBe('floorGram'); expect(g.suggestedTotal).toBeGreaterThanOrEqual(50000);
    const l = calcLine(line({ gramsTotal: 1, hoursTotal: 0.01 }), { ...base, minPrice: 4000 });
    expect(l.rule).toBe('floorLine'); expect(l.suggestedTotal).toBe(4000);
  });
  it('el descuento por volumen nunca baja del margen mínimo de volumen', () => {
    const rt2: Rates = { ...base, marginPct: 30, volumeMinMarginPct: 25, volumeTiers: [{ minQty: 10, pct: -40 }] };
    const b = calcLine(line({ qty: 10, gramsTotal: 200, hoursTotal: 10 }), rt2);
    expect(marginOnNet(b)).toBeGreaterThanOrEqual(25 - 0.5);
    expect(b.rule).toBe('volumeLimited');
  });
});

describe('motor v2: falla y riesgo', () => {
  it('10 éxitos sin fallas ya no llevan la falla a 0', () => {
    const b = calcLine(line({ machine: { ...machine, jobsDone: 10, jobsFailed: 0 } }), base);
    expect(b.failure).toBeGreaterThan(0);
  });
  it('con muchas muestras converge a la tasa observada; sin muestras usa el valor por defecto', () => {
    const many = calcLine(line({ machine: { ...machine, jobsDone: 2000, jobsFailed: 0 } }), base);
    const none = calcLine(line({ machine: { ...machine, jobsDone: 0, jobsFailed: 0 } }), base);
    const def = calcLine(line({ machine: { ...machine, jobsDone: undefined, jobsFailed: undefined, failRatePct: null } }), base);
    expect(many.failure).toBeLessThan(def.failure / 5);
    expect(none.failure).toBe(def.failure);
  });
  it('el riesgo del material y las etiquetas de complejidad suben la falla', () => {
    const rt: Rates = { ...base, complexityTags: [{ key: 'tall', label: 'alta', factor: 2 }] };
    const a = calcLine(line(), rt), b = calcLine(line({ tags: ['tall'] }), rt), c = calcLine(line({ riskFactor: 2 }), rt);
    expect(b.failure).toBeGreaterThan(a.failure); expect(c.failure).toBeGreaterThan(a.failure);
  });
});

describe('motor v2: material', () => {
  it('multicolor: cuesta la suma por slot, no un solo color', () => {
    const multi = calcLine(line({ gramsTotal: 0, filaments: [{ g: 60, costPerKg: 10000 }, { g: 40, costPerKg: 40000 }] }), { ...base, wastePct: 0 });
    expect(multi.material).toBe(Math.round(0.06 * 10000 + 0.04 * 40000));
  });
  it('base de costo: reposición y máximo', () => {
    const l = line({ costPerKg: 15000, costPerKgReplace: 20000, wastePct: 0 });
    expect(calcLine(l, { ...base, costBasis: 'promedio' }).material).toBe(1500);
    expect(calcLine(l, { ...base, costBasis: 'reposicion' }).material).toBe(2000);
    expect(calcLine(l, { ...base, costBasis: 'max' }).material).toBe(2000);
  });
});

describe('motor v2: comisiones, banda, confianza y avisos', () => {
  it('las comisiones se cobran sobre el valor final (gross-up)', () => {
    const a = calcLine(line(), base), b = calcLine(line(), { ...base, payFeePct: 3, channelFeePct: 7 });
    expect(b.suggestedTotal).toBeGreaterThan(a.suggestedTotal * 1.1);
    expect(b.feesAmount).toBeCloseTo(b.suggestedTotal * 0.1, -1);
    expect(marginOnNet(b)).toBeCloseTo(40 * 0.9, 0);
  });
  it('banda Piso ≤ Recomendado ≤ Alto', () => {
    const b = calcLine(line(), base);
    expect(b.band!.floor).toBeLessThanOrEqual(b.band!.recommended); expect(b.band!.recommended).toBeLessThanOrEqual(b.band!.high);
    expect(b.band!.recommended).toBe(b.suggestedUnit);
  });
  it('la referencia de mercado propia sube el precio alto y avisa si estás muy por debajo', () => {
    const rt: Rates = { ...base, benchmarks: [{ id: 'b', name: 'competidor', perGram: 900 }] };
    const b = calcLine(line({ gramsTotal: 100 }), rt);
    expect(b.band!.high).toBeGreaterThanOrEqual(90000); expect(b.benchmark).toEqual({ min: 90000, max: 90000 }); expect(b.warnings).toContain('belowBenchmark');
  });
  it('confianza: alta con laminador, baja con estimación (con rango) y degradada con datos incompletos', () => {
    expect(calcLine(line(), base).confidence).toBe('alta');
    const est = calcLine(line({ origin: 'estimate' }), base);
    expect(est.confidence).toBe('baja'); expect(est.range!.min).toBeLessThan(est.suggestedUnit); expect(est.range!.max).toBeGreaterThan(est.suggestedUnit);
    const bad = calcLine(line({ machine: { ...machine, purchaseValue: 0 } }), base);
    expect(bad.reliable).toBe(false); expect(bad.confidence).toBe('baja'); expect(bad.warnings).toContain('machineNoPurchase');
    expect(calcLine(line({ costPerKg: 0 }), base).warnings).toContain('materialNoCost');
  });
  it('la urgencia sube el precio', () => {
    const a = calcLine(line(), base), u = calcLine(line({ urgency: '24h' }), base);
    expect(u.suggestedTotal).toBeGreaterThan(a.suggestedTotal * 1.4);
  });
});

describe('IVA opcional en el presupuesto (v2)', () => {
  const lines = [{ id: 'a', qty: 2, suggestedUnit: 5000, finalUnit: null, cost: 4000 }, { id: 'b', qty: 1, suggestedUnit: 10000, finalUnit: 8000, cost: 4000 }];
  it('sin casilla el total es el neto; con casilla suma el IVA después del descuento', () => {
    const sin = calcQuote(lines, base, { discount: 1000 });
    expect(sin.tax).toBe(0); expect(sin.total).toBe(17000); expect(sin.net).toBe(17000);
    const con = calcQuote(lines, base, { discount: 1000, applyTax: true });
    expect(con.net).toBe(17000); expect(con.tax).toBe(3230); expect(con.total).toBe(20230);
  });
  it('los márgenes se calculan siempre sobre el neto', () => {
    const t = calcQuote([{ id: 'a', qty: 1, suggestedUnit: 10000, finalUnit: null, cost: 6000 }], base, { applyTax: true });
    expect(t.marginPct).toBeCloseTo(40, 5);
  });
  it('si fija el total, es el neto y se reparte proporcional', () => {
    const t = calcQuote(lines, base, { finalTotalOverride: 15000, applyTax: true });
    expect(t.lines.reduce((a, l) => a + l.finalTotal, 0)).toBe(15000); expect(t.total).toBe(17850);
  });
  it('avisa cuando el total queda bajo el mínimo por pedido', () => {
    const t = calcQuote(lines, { ...base, floors: { perHour: 0, perHourAuto: false, perGram: 0, perOrder: 30000 } });
    expect(t.belowOrderMin).toBe(true);
  });
});

describe('perfiles de cálculo', () => {
  const profiles = DEFAULT_CALC_PROFILES;
  it('resolveRates respeta el orden y no pisa lo no definido', () => {
    const r = resolveRates(base, { marginPct: 50, volumeTiers: [] }, { marginPct: 20 });
    expect(r.marginPct).toBe(20); expect(r.volumeTiers).toEqual([]); expect(r.laborHour).toBe(base.laborHour);
    expect(resolveRates(base, undefined, null)).toBe(base);
  });
  it('un perfil parcial no modifica los demás campos y no cambia el original', () => {
    const r = resolveRates(base, { floors: { perGram: 99 } });
    expect(r.floors!.perGram).toBe(99); expect(r.floors!.perOrder).toBe(base.floors!.perOrder); expect(base.floors!.perGram).toBe(0);
  });
  it('cascada de elección: línea > presupuesto > cliente > canal > por defecto', () => {
    expect(pickProfileId(['func', 'serie'], profiles)).toBe('func');
    expect(pickProfileId([null, undefined, 'mayor', 'serie'], profiles)).toBe('mayor');
    expect(pickProfileId(['no-existe'], profiles)).toBe('std');
  });
  it('priceLine: el perfil Mayorista baja el precio y el Funcional lo sube', () => {
    const env = { rates: base, profiles, material: { costPerKg: 17000 }, machine };
    const it = { qty: 1, gramsTotal: 100, hoursTotal: 5, originKind: 'slicer' };
    const std = priceLine(it, env).suggestedUnit, may = priceLine({ ...it, profileId: 'mayor' }, env).suggestedUnit, fun = priceLine({ ...it, profileId: 'func' }, env).suggestedUnit;
    expect(may).toBeLessThan(std); expect(fun).toBeGreaterThan(std);
  });
  it('el perfil Heredado reproduce la fórmula v1 (recargo sobre costo)', () => {
    const env = { rates: base, profiles, material: { costPerKg: 17000 }, machine: { ...machine, jobsDone: undefined, jobsFailed: undefined } };
    const r = priceLine({ qty: 1, gramsTotal: 100, hoursTotal: 5, profileId: 'legacy' }, env);
    expect(r.bd.engine).toBe(1); expect(Math.abs(r.bd.priceBeforeRound - r.bd.cost * 1.7)).toBeLessThanOrEqual(1);
  });
  it('en una cuenta legacy los perfiles no se aplican', () => {
    const env = { rates: { ...base, engine: 'legacy' as const }, profiles, material: { costPerKg: 17000 }, machine };
    const a = priceLine({ qty: 1, gramsTotal: 100, hoursTotal: 5 }, env), b = priceLine({ qty: 1, gramsTotal: 100, hoursTotal: 5, profileId: 'mayor' }, env);
    expect(a.suggestedUnit).toBe(b.suggestedUnit); expect(a.profileId).toBeNull();
  });
  it('la comisión del canal y los ajustes de la línea se aplican al final', () => {
    const env = { rates: base, profiles, material: { costPerKg: 17000 }, machine, channelFeePct: 10 };
    const it = { qty: 1, gramsTotal: 100, hoursTotal: 5, originKind: 'slicer' };
    const a = priceLine(it, { ...env, channelFeePct: null }), b = priceLine(it, env), c = priceLine({ ...it, opts: { overrides: { marginPct: 20 } } }, { ...env, channelFeePct: null });
    expect(b.suggestedUnit).toBeGreaterThan(a.suggestedUnit); expect(c.suggestedUnit).toBeLessThan(a.suggestedUnit);
  });
  it('cliente y servidor comparten la misma función de redondeo (ajuste de lista)', () => {
    const env = { rates: { ...base, rounding: { mode: 'step' as const, step: 100 } }, profiles, material: { costPerKg: 17000 }, machine, priceAdjPct: 7 };
    const r = priceLine({ qty: 1, gramsTotal: 100, hoursTotal: 5 }, env);
    expect(r.suggestedUnit % 100).toBe(0);
  });
});

describe('herramientas de análisis', () => {
  it('tabla por cantidades: el precio unitario baja con el volumen y el margen se respeta', () => {
    const rows = quantityTable(line({ qty: 1, gramsTotal: 20, hoursTotal: 1.5 }), base, [1, 10, 50]);
    expect(rows[1].unit).toBeLessThan(rows[0].unit); expect(rows[2].unit).toBeLessThan(rows[1].unit);
    for (const r of rows) expect(r.marginReal!).toBeGreaterThan(15);
  });
  it('sensibilidad: más material o más tiempo sube el precio', () => {
    const s = Object.fromEntries(sensitivity(line(), base).map((x) => [x.key, x.delta]));
    expect(s['material+10']).toBeGreaterThan(0); expect(s['material-10']).toBeLessThan(0); expect(s['time+20']).toBeGreaterThan(0); expect(s['fail+5']).toBeGreaterThan(0);
  });
  it('precio inverso: margen, $/hora y veredicto', () => {
    const b = calcLine(line(), base);
    expect(inversePrice(line(), base, b.suggestedUnit).verdict).toBe('ok');
    expect(inversePrice(line(), base, Math.round(b.cost * 0.8)).verdict).toBe('bajoCosto');
    expect(inversePrice(line(), base, Math.round(b.cost * 1.1)).verdict).toBe('bajoMinimo');
  });
  it('estimación por medidas: más relleno, más gramos', () => {
    const d = { lengthMm: 100, widthMm: 50, heightMm: 40, density: 1.24, feedGph: 28 };
    expect(estimateFromDims({ ...d, fill: 'maciza' }).grams).toBeGreaterThan(estimateFromDims({ ...d, fill: 'hueca' }).grams);
    expect(estimateFromDims({ ...d, fill: 'normal' }).hours).toBeGreaterThan(0);
  });
  it('completitud y coherencia', () => {
    const ok = completeness(base, { machines: [{ purchaseValue: 1, watts: 1 }], materials: [{ costPerKg: 1 }] });
    expect(ok.status).toBe('casi');
    const bad = completeness(base, { machines: [{ purchaseValue: 0, watts: 1 }], materials: [{ costPerKg: 1 }] });
    expect(bad.status).toBe('incompleta');
    const full = completeness({ ...base, fixedCosts: [{ label: 'x', amount: 1 }], targetIncomeMonth: 1 }, { machines: [{ purchaseValue: 1, watts: 1 }], materials: [{ costPerKg: 1 }] });
    expect(full.status).toBe('lista');
    const keys = coherenceChecks({ ...base, marginPct: 20, minMarginPct: 25, laborHour: 0 }).map((c) => c.key);
    expect(keys).toContain('marginBelowMin'); expect(keys).toContain('laborZero');
    expect(coherenceChecks({ ...base, fixedCosts: [{ label: 'x', amount: 100000 }], targetIncomeMonth: 100000 }, { pricePerHour: 10 }).map((c) => c.key)).toContain('rateBelowBreakEven');
  });
  it('redondeo', () => { expect(roundPrice(4321, { mode: 'step', step: 100 })).toBe(4300); });
});
