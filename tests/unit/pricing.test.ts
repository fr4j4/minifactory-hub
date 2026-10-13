import { describe, expect, it } from 'vitest';
import { calcLine, calcQuote, estimateFromMesh, machineHourly, roundPrice, volumePct, type Rates } from '@/lib/pricing';
import { DEFAULT_SETTINGS } from '@/lib/settings';

// motor v1 (cuentas que aún no migran): recargo 70 %, merma 8 %, IVA incluido
const rt: Rates = { ...DEFAULT_SETTINGS.rates, engine: 'legacy', marginPct: 70, wastePct: 8, taxMode: 'incluido', rounding: { mode: 'none', step: 1 } };
const machine = { purchaseValue: 480000, residualValue: 100000, lifeHours: 5000, watts: 130, maintCostHour: 150 };

describe('motor de precios (legacy v1)', () => {
  it('suma los seis costos y aplica margen', () => {
    const b = calcLine({ qty: 1, gramsTotal: 100, hoursTotal: 5, costPerKg: 17000, machine, prepMinutes: 10 }, rt);
    // material: 100 g × 1,08 = 108 g → 1836; máquina: 5 h × (76 + 150) = 1130; energía: 5 × 0,13 × 180 = 117; prep: 10/60 × 6000 = 1000
    expect(b.material).toBe(1836); expect(b.machine).toBe(1130); expect(b.energy).toBe(117); expect(b.prep).toBe(1000);
    expect(b.failure).toBe(Math.round(0.05 * (1836 + 1130 + 117)));
    expect(b.cost).toBe(b.material + b.machine + b.energy + b.prep + b.post + b.failure);
    expect(b.priceBeforeRound).toBe(Math.round(b.cost * 1.7));
  });
  it('respeta el precio mínimo y el redondeo', () => {
    const b = calcLine({ qty: 1, gramsTotal: 1, hoursTotal: 0.01, costPerKg: 15000, machine: null, prepMinutes: 0 }, { ...rt, rounding: { mode: 'step', step: 100 } });
    expect(b.suggestedUnit).toBe(3000);
    expect(roundPrice(4321, { mode: 'step', step: 100 })).toBe(4300);
    expect(roundPrice(4321, { mode: 'ending990', step: 0 })).toBe(3990);
    expect(roundPrice(4600, { mode: 'ending990', step: 0 })).toBe(4990);
  });
  it('urgencia y descuento por volumen', () => {
    expect(volumePct(9, rt.volumeTiers)).toBe(0); expect(volumePct(10, rt.volumeTiers)).toBe(-10); expect(volumePct(60, rt.volumeTiers)).toBe(-20);
    const base = calcLine({ qty: 1, gramsTotal: 100, hoursTotal: 5, costPerKg: 17000, machine, urgency: 'normal' }, rt);
    const urg = calcLine({ qty: 1, gramsTotal: 100, hoursTotal: 5, costPerKg: 17000, machine, urgency: '24h' }, rt);
    expect(Math.abs(urg.priceBeforeRound - base.cost * 1.7 * 1.5)).toBeLessThanOrEqual(1);
  });
  it('cotiza por placa: 4 copias no cuestan 4 veces el tiempo (los totales vienen del laminador)', () => {
    const one = calcLine({ qty: 1, gramsTotal: 11.26, hoursTotal: 0.83, costPerKg: 17000, machine }, rt);
    const four = calcLine({ qty: 4, gramsTotal: 44.82, hoursTotal: 2.35, costPerKg: 17000, machine }, rt);
    expect(four.suggestedUnit).toBeLessThan(one.suggestedUnit);
  });
  it('costo por hora de la máquina', () => { const h = machineHourly(machine, 180); expect(Math.round(h.dep)).toBe(76); expect(h.maint).toBe(150); expect(h.energy).toBeCloseTo(23.4, 1); });
  it('estimación desde la malla', () => { const e = estimateFromMesh({ volumeCm3: 15.2, areaCm2: 47.5, infillPct: 15, density: 1.24, feedGph: 28 }); expect(e.grams).toBeGreaterThan(3); expect(e.grams).toBeLessThan(15.2 * 1.24); expect(e.hours).toBeGreaterThan(0); });
});

describe('precio final decidido por el usuario (legacy v1)', () => {
  const lines = [
    { id: 'a', qty: 2, suggestedUnit: 5000, finalUnit: null, cost: 4000 },
    { id: 'b', qty: 1, suggestedUnit: 10000, finalUnit: 8000, cost: 4000 },
  ];
  it('usa el sugerido cuando no hay final y el final cuando existe', () => {
    const t = calcQuote(lines, rt);
    expect(t.suggestedTotal).toBe(20000); expect(t.subtotal).toBe(18000); expect(t.diffPct).toBeCloseTo(-10);
    expect(t.lines[1].diffPct).toBeCloseTo(-20);
  });
  it('si fija el total, lo reparte en proporción al sugerido', () => {
    const t = calcQuote(lines, rt, { finalTotalOverride: 15000 });
    expect(t.lines.reduce((a, l) => a + l.finalTotal, 0)).toBe(15000);
    expect(t.lines[0].finalTotal).toBe(7500); expect(t.lines[1].finalTotal).toBe(7500);
  });
  it('avisa cuando queda bajo el costo o bajo el margen mínimo', () => {
    const t = calcQuote([{ id: 'a', qty: 1, suggestedUnit: 10000, finalUnit: 3000, cost: 5000 }], { ...rt, taxMode: 'exento' });
    expect(t.belowCost).toBe(true); expect(t.lines[0].belowCost).toBe(true);
    const ok = calcQuote([{ id: 'a', qty: 1, suggestedUnit: 10000, finalUnit: 6000, cost: 5000 }], { ...rt, taxMode: 'exento' });
    expect(ok.belowCost).toBe(false); expect(ok.belowMin).toBe(true);
  });
  it('IVA incluido, sumado y exento; descuento; líneas opcionales no suman', () => {
    const l = [{ id: 'a', qty: 1, suggestedUnit: 11900, finalUnit: null, cost: 1000 }, { id: 'o', qty: 1, optional: true, suggestedUnit: 5000, finalUnit: null, cost: 0 }];
    const inc = calcQuote(l, { ...rt, taxMode: 'incluido', taxPct: 19 }); expect(inc.total).toBe(11900); expect(inc.tax).toBe(1900);
    const sum = calcQuote(l, { ...rt, taxMode: 'sumado', taxPct: 19 }); expect(sum.total).toBe(14161);
    const ex = calcQuote(l, { ...rt, taxMode: 'exento' }, { discount: 900 }); expect(ex.total).toBe(11000);
  });
});
