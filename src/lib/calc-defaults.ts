import type { Rates } from './pricing';

/**
 * Tarifas por defecto de una cuenta nueva. Puro: lo usan el servidor y el navegador (valores de «Restablecer»).
 * Solo trae las tarifas que ya existían; lo de la calculadora v2 (costos fijos, pisos, comisiones…) parte sin configurar
 * y lo completa el asistente de configuración, así el precio no cambia hasta que el taller lo decide.
 */
export const DEFAULT_RATES: Rates = {
  kwh: 180, laborHour: 6000, wastePct: 8, failRatePct: 5, marginPct: 40, marginByCategory: {},
  minPrice: 3000, minMarginPct: 25, rounding: { mode: 'step', step: 100 }, taxPct: 19, taxMode: 'exento', taxDefault: false,
  urgency: [{ key: 'normal', label: 'Normal', pct: 0 }, { key: '48h', label: 'Urgente 48 h', pct: 25 }, { key: '24h', label: 'Urgente 24 h', pct: 50 }],
  volumeTiers: [{ minQty: 10, pct: -10 }, { minQty: 50, pct: -20 }], prepMinutes: 10,
};
