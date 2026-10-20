/**
 * Perfiles de cálculo de partida y presets de taller. Los números son EJEMPLOS editables, no cifras de mercado:
 * se guardan en settings y el usuario los ajusta (spec §4.3 y §5.2).
 */
import type { CalcProfile, DeepPartial, Rates } from './pricing';
import type { TFn } from '@/i18n/translate';

/** Los textos (nombre y descripción) se traducen en la interfaz con `calc.profile.<id>.name|desc`. */
export const DEFAULT_CALC_PROFILES: CalcProfile[] = [
  { id: 'std', name: 'Estándar', description: 'Trabajo normal a medida.', params: {}, builtin: true, isDefault: true },
  { id: 'proto', name: 'Prototipo rápido', description: 'Iteración rápida, sin acabado.', params: { marginPct: 30, postMinutes: 0, supervisionMinPerHour: 1 }, builtin: true },
  { id: 'func', name: 'Funcional / ingeniería', description: 'Piezas que cargan o ajustan: más postproceso y margen.', params: { marginPct: 45, postMinutes: 8, failRatePct: 8 }, builtin: true },
  { id: 'serie', name: 'Producción en serie', description: 'Repetición: menos supervisión y descuento por volumen con piso de margen.', params: { marginPct: 35, supervisionMinPerHour: 1, volumeTiers: [{ minQty: 10, pct: -8 }, { minQty: 50, pct: -15 }] }, builtin: true },
  { id: 'mayor', name: 'Mayorista / revendedor', description: 'Margen menor con piso de margen firme.', params: { marginPct: 28, volumeMinMarginPct: 18 }, builtin: true },
  { id: 'market', name: 'Marketplace', description: 'Venta por un canal con comisión (elige el canal para sumarla).', params: { marginPct: 40, postMinutes: 2 }, builtin: true },
  { id: 'urgent', name: 'Urgente', description: 'Plazo corto: sin descuento por volumen y más margen.', params: { marginPct: 48, volumeTiers: [] }, builtin: true },
  { id: 'custom', name: 'Personalizado / regalo', description: 'Más diseño y atención al cliente, margen mayor.', params: { marginPct: 50, postMinutes: 10 }, builtin: true },
  { id: 'resin', name: 'Resina / otra tecnología', description: 'Lavado y curado, falla propia.', params: { postMinutes: 15, failRatePct: 8, powerFactor: 0.5 }, builtin: true, tech: 'resina' },
];

export type ShopPreset = 'hobby' | 'taller' | 'produccion';
export const SHOP_PRESETS: Record<ShopPreset, DeepPartial<Rates>> = {
  hobby: { prepMinutes: 10, supervisionMinPerHour: 1, postMinutes: 3, wastePct: 6, failRatePct: 6, setupHoursPerPlate: 0.1, productive: { hoursPerDay: 6, daysPerMonth: 20, utilizationPct: 40 } },
  taller: { prepMinutes: 10, supervisionMinPerHour: 2, postMinutes: 5, wastePct: 5, failRatePct: 5, setupHoursPerPlate: 0.1, productive: { hoursPerDay: 8, daysPerMonth: 22, utilizationPct: 50 } },
  produccion: { prepMinutes: 8, supervisionMinPerHour: 1.5, postMinutes: 5, wastePct: 4, failRatePct: 4, setupHoursPerPlate: 0.15, productive: { hoursPerDay: 16, daysPerMonth: 26, utilizationPct: 65 } },
};

/** Etiquetas de complejidad sugeridas (factor sobre la falla); editables en Avanzado. */
export const DEFAULT_COMPLEXITY_TAGS = [
  { key: 'supports', label: 'Soportes pesados', factor: 1.3 },
  { key: 'tall', label: 'Pieza alta o delgada', factor: 1.5 },
  { key: 'bridges', label: 'Puentes largos', factor: 1.2 },
  { key: 'flexible', label: 'Flexible', factor: 1.5 },
  { key: 'precision', label: 'Ajuste de precisión', factor: 1.3 },
];

/** Máquinas conocidas: precargan potencia, volumen y vida típica (todo editable). */
export const KNOWN_MACHINES: Array<{ key: string; brand: string; model: string; watts: number; volX: number; volY: number; volZ: number; lifeHours: number; feedGph: number }> = [
  { key: 'a1', brand: 'Bambu Lab', model: 'A1', watts: 130, volX: 256, volY: 256, volZ: 256, lifeHours: 5000, feedGph: 28 },
  { key: 'a1mini', brand: 'Bambu Lab', model: 'A1 mini', watts: 100, volX: 180, volY: 180, volZ: 180, lifeHours: 5000, feedGph: 24 },
  { key: 'p1s', brand: 'Bambu Lab', model: 'P1S', watts: 130, volX: 256, volY: 256, volZ: 256, lifeHours: 6000, feedGph: 30 },
  { key: 'x1c', brand: 'Bambu Lab', model: 'X1 Carbon', watts: 150, volX: 256, volY: 256, volZ: 256, lifeHours: 6000, feedGph: 32 },
  { key: 'ender3v3se', brand: 'Creality', model: 'Ender-3 V3 SE', watts: 120, volX: 220, volY: 220, volZ: 250, lifeHours: 4000, feedGph: 18 },
  { key: 'k1', brand: 'Creality', model: 'K1', watts: 350, volX: 220, volY: 220, volZ: 250, lifeHours: 4500, feedGph: 30 },
  { key: 'mk4s', brand: 'Prusa', model: 'MK4S', watts: 140, volX: 250, volY: 210, volZ: 220, lifeHours: 8000, feedGph: 30 },
  { key: 'saturn', brand: 'Elegoo', model: 'Saturn (resina)', watts: 60, volX: 192, volY: 120, volZ: 200, lifeHours: 3000, feedGph: 20 },
];

/** Los perfiles de fábrica se muestran traducidos mientras no se les cambie el nombre o la descripción. */
export function profileName(t: TFn, p: Pick<CalcProfile, 'id' | 'name'>): string {
  const d = DEFAULT_CALC_PROFILES.find((x) => x.id === p.id);
  return d && d.name === p.name ? t(`calc.profile.${p.id}.name` as never) : p.name;
}
export function profileDesc(t: TFn, p: Pick<CalcProfile, 'id' | 'description'>): string {
  const d = DEFAULT_CALC_PROFILES.find((x) => x.id === p.id);
  return d && d.description === p.description ? t(`calc.profile.${p.id}.desc` as never) : p.description ?? '';
}
export function tagName(t: TFn, tg: { key: string; label: string }): string {
  const d = DEFAULT_COMPLEXITY_TAGS.find((x) => x.key === tg.key);
  return d && d.label === tg.label ? t(`calc.tag.${tg.key}` as never) : tg.label;
}
