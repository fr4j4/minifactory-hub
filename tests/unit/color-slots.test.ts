import { describe, expect, it } from 'vitest';
import { affectsPrice, effectiveSlots, extraMaterialIds, fromLegacyFilaments, mainShare, overflows } from '@/lib/color-slots';
import { colorsFromSlots, type PickMaterial } from '@/lib/filament-pick';
import { fromCalcOpts, priceLine, toCalcOpts, type ItemPriceEnv } from '@/lib/item-price';
import { type Rates } from '@/lib/pricing';

const rates: Rates = {
  kwh: 180, laborHour: 6000, wastePct: 8, failRatePct: 5, marginPct: 40, marginByCategory: {}, minPrice: 3000, minMarginPct: 25,
  rounding: { mode: 'step', step: 100 }, taxPct: 19, taxMode: 'exento', taxDefault: false,
  urgency: [{ key: 'normal', label: 'Normal', pct: 0 }], volumeTiers: [], prepMinutes: 10,
};
const env = (costs: Record<string, number>): ItemPriceEnv => ({ rates, profiles: [], material: { costPerKg: costs.main }, machine: null, materialById: (id) => (costs[id] != null ? { costPerKg: costs[id] } : undefined) });
const base = { qty: 1, gramsTotal: 100, hoursTotal: 2, mode: 'manual' as const };
const full = { plates: 1, designMinutes: 0, colorChanges: 0, tags: [], overrides: {} };

describe('colores de la pieza: reparto', () => {
  it('sin % ni gramos es solo referencia y no genera slots', () => {
    expect(effectiveSlots(100, [{ materialId: 'a' }, { materialId: 'b', pct: 0 }])).toBeNull(); expect(affectsPrice({ materialId: 'a' })).toBe(false);
    expect(mainShare(100, [{ materialId: 'a' }])).toBeNull();
  });
  it('un % se lleva su parte y el principal el resto; los gramos mandan sobre el %', () => {
    expect(effectiveSlots(200, [{ materialId: 'a', pct: 25 }, { materialId: 'b', g: 30, pct: 90 }])).toEqual([{ g: 120, materialId: null }, { g: 50, materialId: 'a' }, { g: 30, materialId: 'b' }]);
    expect(mainShare(200, [{ materialId: 'a', pct: 25 }])).toBe(75);
  });
  it('avisa cuando los colores suman más que el total y deja el principal en 0', () => {
    expect(overflows(100, [{ materialId: 'a', g: 80 }, { materialId: 'b', g: 40 }])).toBe(true); expect(overflows(100, [{ materialId: 'a', pct: 50 }])).toBe(false);
    expect(effectiveSlots(100, [{ materialId: 'a', g: 80 }, { materialId: 'b', g: 40 }])![0].g).toBe(0);
  });
  it('los ids de material extra salen sin repetir y solo de los que afectan el precio', () => {
    expect(extraMaterialIds([{ materialId: 'a', pct: 10 }, { materialId: 'a', g: 5 }, { materialId: 'b' }])).toEqual(['a']);
  });
});

describe('colores de la pieza: precio', () => {
  it('un color de referencia no cambia el precio', () => {
    const a = priceLine({ ...base }, env({ main: 20000, b: 60000 }));
    const b = priceLine({ ...base, opts: toCalcOpts({ ...full, colors: [{ materialId: 'b' }] }) }, env({ main: 20000, b: 60000 }));
    expect(b.suggestedUnit).toBe(a.suggestedUnit); expect(b.cost).toBe(a.cost);
  });
  it('un % usa el costo del otro material en esa parte (y es mas caro si el otro cuesta mas)', () => {
    const e = env({ main: 20000, b: 60000 });
    const one = priceLine({ ...base }, e); const mix = priceLine({ ...base, opts: toCalcOpts({ ...full, colors: [{ materialId: 'b', pct: 30 }] }) }, e);
    const matOf = (g: number, c: number) => (g * (1 + rates.wastePct / 100) / 1000) * c;
    expect(mix.bd.material).toBeCloseTo(matOf(70, 20000) + matOf(30, 60000), 0); expect(mix.bd.material).toBeGreaterThan(one.bd.material);
  });
  it('el % sigue valiendo si cambian los gramos totales', () => {
    const e = env({ main: 20000, b: 60000 }); const opts = toCalcOpts({ ...full, colors: [{ materialId: 'b', pct: 50 }] });
    const x = priceLine({ ...base, gramsTotal: 200, opts }, e).bd.material; const y = priceLine({ ...base, gramsTotal: 100, opts }, e).bd.material;
    expect(x).toBeCloseTo(y * 2, 0);
  });
  it('lo guardado con el formato anterior (multicolor Experto) da el mismo precio al leerlo y volver a guardarlo', () => {
    const e = env({ main: 20000, a: 30000, b: 50000 });
    const legacy = { filaments: [{ g: 60, materialId: 'main' }, { g: 25, materialId: 'a' }, { g: 15, materialId: 'b' }] };
    const before = priceLine({ ...base, opts: legacy }, { ...e, materialById: (id) => ({ costPerKg: { main: 20000, a: 30000, b: 50000 }[id as 'a'] }) });
    const loaded = fromCalcOpts(legacy, null, 'main');
    expect(loaded.colors).toEqual([{ materialId: 'a', g: 25 }, { materialId: 'b', g: 15 }]);
    const after = priceLine({ ...base, opts: toCalcOpts({ ...full, colors: loaded.colors }) }, e);
    expect(after.suggestedUnit).toBe(before.suggestedUnit); expect(after.bd.material).toBeCloseTo(before.bd.material, 6);
  });
  it('convierte formato anterior sin slot del principal: todos pasan a gramos y el principal queda en 0', () => {
    expect(fromLegacyFilaments([{ g: 10, materialId: 'x' }, { g: 20, materialId: 'y' }], 'main')).toEqual([{ materialId: 'x', g: 10 }, { materialId: 'y', g: 20 }]);
    expect(fromLegacyFilaments(undefined, 'main')).toEqual([]);
  });
  it('toCalcOpts guarda solo lo necesario', () => {
    expect(toCalcOpts({ ...full, colors: [{ materialId: 'a', color: '', pct: 0, g: 0 }, { materialId: '' }] })).toEqual({ colors: [{ materialId: 'a' }] });
  });
});

describe('colores desde un archivo multicolor', () => {
  const m = (o: Partial<PickMaterial> & { id: string }): PickMaterial => ({ label: o.id, type: 'PLA', colorName: 'X', hex: '#000000', costPerKg: 1, generic: false, stockG: 0, availableG: 0, manufacturer: null, line: null, variantId: null, tech: 'fdm', filamentProfileId: null, ...o });
  const list = [m({ id: 'neg', colorName: 'Negro', hex: '#1c1c1c', availableG: 500 }), m({ id: 'roj', colorName: 'Rojo', hex: '#d62f2f', availableG: 300 }), m({ id: 'blaPetg', type: 'PETG', colorName: 'Blanco', hex: '#f1f1ee', availableG: 900 }), m({ id: 'g', generic: true, colorName: 'Genérico', hex: '#9ca3af' })];
  it('el slot más pesado es el principal; los demás toman el filamento parecido y quedan en %', () => {
    const c = colorsFromSlots([{ g: 70, color: '#1c1c1c', type: 'PLA' }, { g: 20, color: 'd02020', type: 'PLA' }, { g: 10, color: '#fafafa', type: 'PLA' }], list, 'neg');
    expect(c[0]).toEqual({ materialId: 'roj', pct: 20 }); expect(c[1].pct).toBe(10); expect(c[1].materialId).not.toBe('blaPetg'); // mismo tipo primero
  });
  it('sin color ni tipo en el slot queda el principal y con un solo slot no hay colores', () => {
    expect(colorsFromSlots([{ g: 60 }, { g: 40 }], list, 'neg')).toEqual([{ materialId: 'neg', pct: 40 }]);
    expect(colorsFromSlots([{ g: 60, color: '#ff0000' }], list, 'neg')).toEqual([]);
  });
});
