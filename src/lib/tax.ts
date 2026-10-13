import type { Rates } from './pricing';

type OrderTax = { total: number; taxAmount?: number | null; taxMode?: string | null };

/** Neto (sin IVA) de un pedido. Los pedidos del cálculo v2 guardan su modo; los anteriores siguen la configuración de tarifas. */
export function orderNet(o: OrderTax, rates: Pick<Rates, 'taxMode' | 'taxPct'>): number {
  if (o.taxMode === 'sumado') return o.total - (o.taxAmount ?? 0);
  if (o.taxMode === 'exento') return o.total;
  const mode = o.taxMode ?? rates.taxMode;
  return mode === 'incluido' ? o.total / (1 + rates.taxPct / 100) : o.total;
}
/** Neto de una venta rápida (el precio de lista se trata según la configuración, como antes). */
export function saleNet(gross: number, rates: Pick<Rates, 'taxMode' | 'taxPct'>): number {
  return rates.taxMode === 'incluido' ? gross / (1 + rates.taxPct / 100) : gross;
}
