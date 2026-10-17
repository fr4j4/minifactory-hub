import { describe, expect, it } from 'vitest';
import { calcQuote, type Rates } from '@/lib/pricing';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import { buildQuoteDoc } from '@/lib/services/quote-doc';
import { createT } from '@/i18n/translate';

const rt: Rates = { ...DEFAULT_SETTINGS.rates, rounding: { mode: 'none', step: 1 } };
const t = createT('es');
const item = (id: string, qty: number, unit: number, o: { shipping?: number; optional?: boolean } = {}) =>
  ({ id, qty, finalUnit: unit, suggestedUnit: unit, shipping: o.shipping ?? 0, optional: !!o.optional, description: id, groupName: null, variantId: null, hoursTotal: 0 });

function doc(over: { finalTotal?: number; discount?: number; applyTax?: boolean; docTemplate?: unknown; taxPct?: number }) {
  const items = [item('a', 3, 3000), item('b', 1, 4000, { shipping: 2500 }), item('c', 1, 9000, { optional: true })];
  const tt = calcQuote(items.map((i) => ({ ...i, cost: 0 })), rt, { discount: over.discount, finalTotalOverride: over.finalTotal, applyTax: over.applyTax });
  const quote = { number: 'P-1', version: 1, createdAt: new Date(), validUntil: null, customerName: 'Ana', customerPhone: null, title: null, notes: null,
    discount: over.discount ?? 0, total: tt.total, taxAmount: tt.tax, applyTax: !!over.applyTax, calc: { lines: tt.lines }, docTemplate: over.docTemplate ?? null };
  const st = { ...DEFAULT_SETTINGS, rates: { ...DEFAULT_SETTINGS.rates, taxPct: over.taxPct ?? DEFAULT_SETTINGS.rates.taxPct } };
  return buildQuoteDoc({ quote, items, models: [], links: [], customer: null } as any, st, t);
}

describe('documento de cliente del presupuesto', () => {
  it('cuadra: líneas + despacho − descuento = neto, y neto + IVA = total', () => {
    for (const o of [{}, { discount: 1000 }, { discount: 1000, applyTax: true }, { finalTotal: 13001, applyTax: true }]) {
      const d = doc(o); const lines = d.items.filter((i) => !i.optional).reduce((a, i) => a + i.total, 0);
      expect(d.quote.shipping).toBe(2500);
      expect(lines + d.quote.shipping - d.quote.discount).toBe(d.quote.total - d.quote.taxAmount);
      // nunca se imprime cant. × precio unitario distinto del total de la línea
      for (const i of d.items) if (i.unitPrice != null) expect(i.unitPrice * i.qty).toBe(i.total);
    }
  });
  it('precio unitario vacío si no divide exacto; % de IVA del presupuesto aunque cambie Configuración', () => {
    const d = doc({ finalTotal: 13001, applyTax: true, taxPct: 10 });
    expect(d.items.find((i) => i.id === 'a')!.unitPrice).toBeNull();
    expect(d.tax.label).toContain(`${DEFAULT_SETTINGS.rates.taxPct}%`);
  });
  it('enviado: usa los datos del taller y condiciones congelados', () => {
    const snapshot = { shop: { ...DEFAULT_SETTINGS.shop, name: 'Taller Antiguo' }, terms: 'Condiciones de antes' };
    const d = doc({ docTemplate: { snapshot } });
    expect(d.shop.name).toBe('Taller Antiguo'); expect(d.terms).toBe('Condiciones de antes');
  });
});
