import { describe, expect, it } from 'vitest';
import {
  RECOMMENDED_V2, breakEvenRate, calcLine, calcQuote, coherenceChecks, completeness, estimateFromDims, fixedPerHour, hourFloor, inversePrice, machineHourly, machineRate, normRates,
  pickProfileId, quantityTable, resolveRates, roundPrice, sensitivity, volumePct, type LineInput, type MachineCost, type Rates,
} from '@/lib/pricing';

const rates: Rates = {
  kwh: 180, laborHour: 6000, wastePct: 8, failRatePct: 5, marginPct: 40, marginByCategory: { decoracion: 55 }, minPrice: 3000, minMarginPct: 25,
  rounding: { mode: 'step', step: 100 }, taxPct: 19, taxMode: 'exento', taxDefault: false,
  urgency: [{ key: 'normal', label: 'Normal', pct: 0 }, { key: '48h', label: 'Urgente 48 h', pct: 25 }], volumeTiers: [{ minQty: 10, pct: -10 }, { minQty: 50, pct: -20 }], prepMinutes: 10,
};
const a1: MachineCost = { purchaseValue: 480000, residualValue: 100000, lifeHours: 5000, watts: 130, maintCostHour: 150 };

/** El cálculo anterior a la v2, copiado tal cual: es la referencia que el motor nuevo debe reproducir mientras no se configure nada. */
function baseline(i: LineInput, rt: Rates) {
  const qty = Math.max(1, Math.floor(i.qty || 1));
  const gramsEff = Math.max(0, i.gramsTotal) * (1 + rt.wastePct / 100);
  const hoursEff = Math.max(0, i.hoursTotal) * (i.machine?.timeFactor ? i.machine.timeFactor : 1);
  const hr = machineHourly(i.machine, rt.kwh);
  const material = (gramsEff / 1000) * i.costPerKg, machine = hoursEff * (hr.dep + hr.maint), energy = hoursEff * hr.energy;
  const prep = ((i.prepMinutes ?? rt.prepMinutes) / 60) * rt.laborHour;
  const post = (((i.postMinutesPerUnit ?? 0) * qty) / 60) * rt.laborHour + (i.postSuppliesPerUnit ?? 0) * qty;
  const failRate = Math.min(0.9, (i.machine?.failRatePct ?? rt.failRatePct) / 100);
  const base = material + machine + energy; const failure = (base * failRate) / (1 - failRate); const cost = base + prep + post + failure;
  const marginPct: number = (i.category ? rt.marginByCategory?.[i.category] : undefined) ?? rt.marginPct;
  const urg = rt.urgency.find((u) => u.key === (i.urgency ?? 'normal'))?.pct ?? 0;
  let price = (cost / (1 - Math.min(0.9, Math.max(0, marginPct / 100)))) * (1 + urg / 100) * (1 + volumePct(qty, rt.volumeTiers) / 100);
  price = Math.max(price, rt.minPrice);
  const suggestedUnit = roundPrice(price / qty, rt.rounding);
  return { cost: Math.round(cost), suggestedUnit, suggestedTotal: suggestedUnit * qty, hoursEffective: hoursEff, gramsEffective: gramsEff, failure: Math.round(failure), prep: Math.round(prep), post: Math.round(post) };
}

/** Generador pseudoaleatorio fijo: los casos son siempre los mismos. */
const rnd = (() => { let s = 123456789; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; })();
const between = (a: number, b: number) => a + rnd() * (b - a);

describe('sin configurar nada, el resultado es el del cálculo anterior', () => {
  it('coincide con el cálculo anterior en 400 casos variados', () => {
    for (let n = 0; n < 400; n++) {
      const i: LineInput = {
        qty: Math.ceil(between(1, 80)), gramsTotal: between(2, 2500), hoursTotal: between(0.2, 90), costPerKg: Math.round(between(0, 30000)),
        machine: rnd() < 0.15 ? null : { ...a1, failRatePct: rnd() < 0.5 ? between(0, 40) : null, timeFactor: rnd() < 0.4 ? between(0.8, 1.4) : undefined },
        prepMinutes: rnd() < 0.5 ? between(0, 60) : undefined, postMinutesPerUnit: rnd() < 0.5 ? between(0, 30) : undefined, postSuppliesPerUnit: rnd() < 0.3 ? between(0, 500) : undefined,
        shipping: rnd() < 0.3 ? 2500 : undefined, urgency: rnd() < 0.3 ? '48h' : undefined, category: rnd() < 0.3 ? 'decoracion' : undefined,
      };
      const a = calcLine(i, rates), b = baseline(i, rates);
      expect({ cost: a.cost, unit: a.suggestedUnit, total: a.suggestedTotal, failure: a.failure, prep: a.prep, post: a.post, h: a.hoursEffective, g: a.gramsEffective })
        .toEqual({ cost: b.cost, unit: b.suggestedUnit, total: b.suggestedTotal, failure: b.failure, prep: b.prep, post: b.post, h: b.hoursEffective, g: b.gramsEffective });
    }
  });
  it('los costos nuevos valen cero y no aparecen como aviso', () => {
    const b = calcLine({ qty: 1, gramsTotal: 100, hoursTotal: 4, costPerKg: 17000, machine: a1 }, rates);
    expect([b.overhead, b.supervision, b.design, b.packaging, b.feesAmount]).toEqual([0, 0, 0, 0, 0]);
    expect(b.warnings).toEqual([]); expect(b.rule).toBe('margin'); expect(b.suggestedUnit).toBe(6600);
  });
  it('los valores recomendados de la spec sí cambian el precio (los aplica el asistente, no se usan solos)', () => {
    const i: LineInput = { qty: 1, gramsTotal: 100, hoursTotal: 4, costPerKg: 17000, machine: a1 };
    expect(calcLine(i, { ...rates, ...RECOMMENDED_V2 }).suggestedUnit).toBeGreaterThan(calcLine(i, rates).suggestedUnit);
  });
});

describe('costos fijos, pisos y tarifa de equilibrio', () => {
  const fixed: Rates = { ...rates, fixedCosts: [{ label: 'Arriendo', amount: 200000 }, { label: 'Internet', amount: 20000 }], targetIncomeMonth: 400000, productive: { hoursPerDay: 8, daysPerMonth: 20, utilizationPct: 50 } };
  it('reparte los costos fijos entre las horas que se venden y calcula la tarifa de equilibrio', () => {
    expect(fixedPerHour(fixed)).toBeCloseTo(220000 / 80, 6); // 80 h/mes por máquina
    expect(breakEvenRate(fixed)).toBeCloseTo(620000 / 80, 6);
    expect(fixedPerHour({ ...fixed, machineCount: 2 })).toBeCloseTo(220000 / 160, 6);
    expect(hourFloor(fixed)).toBeCloseTo(7750, 6); expect(hourFloor({ ...fixed, floors: { perHour: 5000, perHourAuto: false, perGram: 0, perOrder: 0 } })).toBe(5000);
  });
  it('suma el costo fijo por hora a la línea y sube la tarifa de la máquina', () => {
    const i: LineInput = { qty: 1, gramsTotal: 100, hoursTotal: 4, costPerKg: 17000, machine: a1 };
    const b = calcLine(i, fixed); expect(b.overhead).toBe(Math.round(4 * (220000 / 80)));
    expect(b.cost).toBeGreaterThan(calcLine(i, rates).cost); expect(machineRate(a1, fixed).total).toBeCloseTo(machineRate(a1, rates).total + 2750, 6);
  });
  it('el piso por hora gana cuando el margen deja un precio por debajo de lo que cuesta mantener el taller', () => {
    const rich: Rates = { ...fixed, marginPct: 5, floors: { perHour: 0, perHourAuto: true, perGram: 0, perOrder: 0 } };
    const b = calcLine({ qty: 1, gramsTotal: 5, hoursTotal: 6, costPerKg: 17000, machine: a1 }, rich);
    expect(b.rule).toBe('floorHour'); expect(b.ruleValue).toBeCloseTo(7750, 6); expect(b.suggestedTotal).toBeGreaterThanOrEqual(6 * 7750 - 100);
  });
  it('el piso por gramo y el mínimo de línea también fijan el precio', () => {
    const g = calcLine({ qty: 1, gramsTotal: 300, hoursTotal: 0.1, costPerKg: 1000, machine: a1 }, { ...rates, floors: { perHour: 0, perHourAuto: false, perGram: 90, perOrder: 0 } });
    expect(g.rule).toBe('floorGram'); expect(g.suggestedTotal).toBe(27000);
    expect(calcLine({ qty: 1, gramsTotal: 1, hoursTotal: 0.05, costPerKg: 1000, machine: a1 }, rates).rule).toBe('floorLine');
  });
  it('el mínimo por pedido avisa en el total del presupuesto sin imponerlo', () => {
    const t = calcQuote([{ id: 'a', qty: 1, suggestedUnit: 4000, finalUnit: null, cost: 2000 }], { ...rates, floors: { perHour: 0, perHourAuto: true, perGram: 0, perOrder: 10000 } });
    expect(t).toMatchObject({ orderMin: 10000, belowOrderMin: true, total: 4000 });
    expect(calcQuote([{ id: 'a', qty: 1, suggestedUnit: 4000, finalUnit: null, cost: 2000 }], rates).belowOrderMin).toBe(false);
  });
});

describe('manejo del descuento por volumen, comisiones y riesgo', () => {
  const i: LineInput = { qty: 60, gramsTotal: 3000, hoursTotal: 120, costPerKg: 17000, machine: a1 };
  it('el descuento por volumen no baja del margen mínimo configurado', () => {
    const tight: Rates = { ...rates, marginPct: 30, volumeTiers: [{ minQty: 50, pct: -40 }], volumeMinMarginPct: 20 };
    expect(calcLine(i, tight).rule).toBe('volumeLimited');
    expect(calcLine(i, { ...tight, volumeMinMarginPct: 0 }).rule).toBe('margin'); // sin tope: como antes
  });
  it('las comisiones se cobran sobre el precio y el margen real las descuenta', () => {
    const base = calcLine({ ...i, qty: 1, gramsTotal: 200, hoursTotal: 8 }, rates), withFees = calcLine({ ...i, qty: 1, gramsTotal: 200, hoursTotal: 8 }, { ...rates, payFeePct: 3, channelFeePct: 7 });
    expect(withFees.suggestedTotal).toBeGreaterThan(base.suggestedTotal); expect(withFees.feesAmount).toBeGreaterThan(0);
    expect(withFees.marginReal!).toBeCloseTo(base.marginReal! * 0.9, 0); // la comisión (10 %) se traslada al precio y se lleva su parte del margen sobre lo cobrado
  });
  it('el riesgo del material y de la pieza sube la falla esperada', () => {
    const r: Rates = { ...rates, riskByMaterial: { TPU: 2 }, complexityTags: [{ key: 'soportes', label: 'Muchos soportes', factor: 1.5 }] };
    const plain = calcLine({ ...i, qty: 1 }, r).failure, tpu = calcLine({ ...i, qty: 1, materialType: 'TPU' }, r).failure, both = calcLine({ ...i, qty: 1, materialType: 'TPU', tags: ['soportes'] }, r).failure;
    expect(tpu).toBeGreaterThan(plain * 1.9); expect(both).toBeGreaterThan(tpu * 1.4);
  });
  it('la falla medida con pocos trabajos se acerca al valor por defecto y con muchos al medido', () => {
    const few = calcLine({ ...i, qty: 1, machine: { ...a1, jobsDone: 2, jobsFailed: 2 } }, rates).failure, many = calcLine({ ...i, qty: 1, machine: { ...a1, jobsDone: 200, jobsFailed: 100 } }, rates).failure;
    expect(many).toBeGreaterThan(few); expect(calcLine({ ...i, qty: 1, machine: { ...a1, jobsDone: 2, jobsFailed: 2 } }, rates).hints).toContain('timeUncalibrated');
  });
  it('varias placas multiplican la preparación y suman el tiempo de montaje', () => {
    const one = calcLine({ ...i, qty: 1, plates: 1 }, { ...rates, setupHoursPerPlate: 0.2 }), three = calcLine({ ...i, qty: 1, plates: 3 }, { ...rates, setupHoursPerPlate: 0.2 });
    expect(three.prep).toBe(one.prep * 3); expect(three.hoursEffective).toBeCloseTo(one.hoursEffective + 0.4, 6);
  });
  it('multicolor usa el costo de cada filamento y la base de costo elige promedio o reposición', () => {
    const f: LineInput = { ...i, qty: 1, filaments: [{ g: 100, costPerKg: 10000, costPerKgReplace: 20000 }, { g: 100, costPerKg: 30000, costPerKgReplace: 40000 }] };
    expect(calcLine(f, rates).material).toBe(Math.round((100 * 1.08 * 10 + 100 * 1.08 * 30) / 1000 * 1000));
    expect(calcLine(f, { ...rates, costBasis: 'reposicion' }).material).toBeGreaterThan(calcLine(f, rates).material);
  });
});

describe('banda, confianza y avisos', () => {
  const i: LineInput = { qty: 1, gramsTotal: 100, hoursTotal: 4, costPerKg: 17000, machine: a1, origin: 'slicer' };
  it('la banda va de piso a alto con el recomendado en medio', () => {
    const b = calcLine(i, rates).band!; expect(b.floor).toBeLessThanOrEqual(b.recommended); expect(b.high).toBeGreaterThan(b.recommended); expect(b.recommended).toBe(calcLine(i, rates).suggestedUnit);
  });
  it('una estimación da rango y confianza baja; un laminado, alta', () => {
    const e = calcLine({ ...i, origin: 'estimate' }, rates);
    expect(e.confidence).toBe('baja'); expect(e.range!.min).toBeLessThan(e.range!.max); expect(calcLine(i, rates).confidence).toBe('alta');
  });
  it('sin máquina o sin costo de material el precio no es confiable y mantiene los avisos de siempre', () => {
    const w = calcLine({ ...i, machine: null, costPerKg: 0 }, rates); expect(w.warnings).toEqual(expect.arrayContaining(['noMachine', 'materialCostZero'])); expect(w.reliable).toBe(false); expect(w.confidence).toBe('baja');
    expect(calcLine({ ...i, machine: { ...a1, watts: 0 } }, rates).warnings).toContain('machineIncomplete');
  });
  it('las referencias de mercado dan un rango y avisan si el precio queda muy por debajo', () => {
    const r: Rates = { ...rates, benchmarks: [{ id: 'x', name: 'Taller vecino', perGram: 200 }] };
    const b = calcLine(i, r); expect(b.benchmark).toEqual({ min: 20000, max: 20000 }); expect(b.warnings).toContain('belowBenchmark'); expect(b.band!.high).toBeGreaterThanOrEqual(Math.round(20000 / 100) * 100);
  });
});

describe('perfiles y herramientas del nivel Experto', () => {
  it('la cascada de perfiles elige el primero válido y cae al por defecto', () => {
    const ps = [{ id: 'a', name: 'A', params: {} }, { id: 'b', name: 'B', params: {}, archived: true }, { id: 'd', name: 'D', params: {}, isDefault: true }];
    expect(pickProfileId([null, 'b', 'a'], ps)).toBe('a'); expect(pickProfileId(['b', undefined], ps)).toBe('d'); expect(pickProfileId([], [])).toBeNull();
  });
  it('resolver tarifas aplica perfil y overrides sin tocar el original y reemplaza los arreglos completos', () => {
    const r = resolveRates(rates, { marginPct: 60, floors: { perGram: 10 } }, { marginPct: 70, volumeTiers: [] });
    expect(r.marginPct).toBe(70); expect(r.volumeTiers).toEqual([]); expect(r.floors).toEqual({ perGram: 10 }); expect(rates.marginPct).toBe(40); expect(normRates(r).floors.perHourAuto).toBe(true);
  });
  const i: LineInput = { qty: 1, gramsTotal: 100, hoursTotal: 4, costPerKg: 17000, machine: a1 };
  it('la tabla por cantidades escala gramos y horas y aplica el descuento por volumen', () => {
    const t = quantityTable(i, rates, [1, 10, 50]); expect(t.map((x) => x.qty)).toEqual([1, 10, 50]); expect(t[1].unit).toBeLessThan(t[0].unit); expect(t[2].unit).toBeLessThan(t[1].unit);
  });
  it('la sensibilidad muestra el efecto de material, tiempo y falla', () => {
    const s = Object.fromEntries(sensitivity(i, rates).map((x) => [x.key, x.delta])); expect(s['material+10']).toBeGreaterThan(0); expect(s['material-10']).toBeLessThan(0); expect(s['time+20']).toBeGreaterThan(0); expect(s['fail+5']).toBeGreaterThan(0);
  });
  it('el precio inverso da margen, $/hora y veredicto', () => {
    expect(inversePrice(i, rates, 100000).verdict).toBe('ok'); expect(inversePrice(i, rates, 1000).verdict).toBe('bajoCosto');
    const r: Rates = { ...rates, minMarginPct: 5, fixedCosts: [{ label: 'x', amount: 400000 }], targetIncomeMonth: 800000, productive: { hoursPerDay: 8, daysPerMonth: 20, utilizationPct: 50 } };
    expect(inversePrice(i, r, calcLine(i, r).cost * 1.2).verdict).toBe('bajoPisoHora'); // rinde más que el costo pero menos de lo que necesita cada hora de máquina
  });
  it('estima gramos y horas por medidas aproximadas según el llenado', () => {
    const base = { lengthMm: 100, widthMm: 50, heightMm: 40, density: 1.24, feedGph: 20 };
    expect(estimateFromDims({ ...base, fill: 'maciza' }).grams).toBeGreaterThan(estimateFromDims({ ...base, fill: 'normal' }).grams);
    expect(estimateFromDims({ ...base, fill: 'normal' }).grams).toBeGreaterThan(estimateFromDims({ ...base, fill: 'hueca' }).grams);
  });
  it('la completitud y la coherencia avisan lo que falta sin bloquear', () => {
    expect(completeness(rates, { machines: [{ purchaseValue: 1, watts: 100 }], materials: [{ costPerKg: 1 }] }).status).toBe('casi');
    expect(completeness({ ...rates, laborHour: 0 }, { machines: [], materials: [] }).status).toBe('incompleta');
    expect(coherenceChecks({ ...rates, marginPct: 20 }).map((c) => c.key)).toContain('marginBelowMin');
    expect(coherenceChecks({ ...rates, targetIncomeMonth: 100000 }).map((c) => c.key)).toContain('fixedZeroWithIncome');
    expect(coherenceChecks(rates)).toEqual([]);
  });
});
