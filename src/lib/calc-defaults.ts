import { V2_DEFAULTS, type Rates } from './pricing';

/** Tarifas por defecto de una cuenta nueva (cálculo v2). Puro: lo usan servidor y navegador (valores de «Restablecer»). */
export const DEFAULT_RATES: Rates = {
  kwh: 180, laborHour: 6000, wastePct: 5, failRatePct: 5, marginPct: 40, marginByCategory: {},
  minPrice: 3000, minMarginPct: 25, rounding: { mode: 'step', step: 100 }, taxPct: 19, taxMode: 'sumado',
  urgency: [{ key: 'normal', label: 'Normal', pct: 0 }, { key: '48h', label: 'Urgente 48 h', pct: 25 }, { key: '24h', label: 'Urgente 24 h', pct: 50 }],
  volumeTiers: [{ minQty: 10, pct: -10 }, { minQty: 50, pct: -20 }], prepMinutes: 10,
  ...V2_DEFAULTS,
};

/** Ajustes que se aplican al pasar una cuenta de la fórmula antigua al cálculo v2 (el resto de sus tarifas se conserva). */
export const MIGRATE_TO_V2: Partial<Rates> = { engine: 'v2', marginMode: 'margen', marginPct: DEFAULT_RATES.marginPct, wastePct: DEFAULT_RATES.wastePct, taxDefault: false, taxMode: 'sumado' };
export const toV2Rates = (r: Rates): Rates => (r.engine === 'legacy' ? { ...r, ...MIGRATE_TO_V2 } : r);
