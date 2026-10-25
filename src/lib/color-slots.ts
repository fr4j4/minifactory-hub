/**
 * Colores adicionales de una línea (presupuesto, pedido, calculadora).
 *
 * El campo de gramos de la línea sigue siendo uno solo. Cada color extra puede ser:
 *  - solo referencia (sin % ni gramos): se muestra en el presupuesto y el pedido, no cambia el precio;
 *  - un porcentaje del peso total; o
 *  - gramos exactos (Experto, o tomados del archivo laminado). Si trae ambos, mandan los gramos.
 * El material principal se queda con el resto. El motor de precios recibe un «slot» por color.
 */
export interface ExtraColor { materialId: string; /** nombre del color pedido (si el material es genérico) */ color?: string; pct?: number | null; g?: number | null }
/** `materialId` nulo = el material principal de la línea */
export interface Slot { g: number; materialId: string | null }

const pos = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);
/** Gramos de un color extra sobre un total de `total` g; 0 si es solo referencia. */
export const extraGrams = (total: number, c: ExtraColor): number => (pos(c.g) ? pos(c.g) : (pos(total) * Math.min(100, pos(c.pct))) / 100);
export const affectsPrice = (c: ExtraColor): boolean => pos(c.g) > 0 || pos(c.pct) > 0;

/** Slots para el motor de precios, o null si ningún color extra afecta el precio (entonces se usa solo el principal). */
export function effectiveSlots(total: number, extras: ExtraColor[] | undefined | null): Slot[] | null {
  const act = (extras ?? []).filter(affectsPrice); if (!act.length) return null;
  const parts = act.map((c) => ({ g: extraGrams(total, c), materialId: c.materialId as string | null }));
  const rest = Math.max(0, pos(total) - parts.reduce((a, p) => a + p.g, 0));
  return [{ g: rest, materialId: null }, ...parts];
}

/** Los colores con peso suman más que el total de la línea (el principal queda en 0 y el costo sube): se avisa. */
export function overflows(total: number, extras: ExtraColor[] | undefined | null): boolean {
  return (extras ?? []).reduce((a, c) => a + extraGrams(total, c), 0) > pos(total) + 0.05;
}

/** Porcentaje que se lleva el principal, para mostrarlo; null si ningún extra afecta el precio. */
export function mainShare(total: number, extras: ExtraColor[] | undefined | null): number | null {
  const s = effectiveSlots(total, extras); if (!s || !(total > 0)) return null;
  return Math.round((s[0].g / total) * 100);
}

/**
 * Líneas guardadas antes de esta versión: el multicolor del nivel Experto guardaba todos los slots con gramos y su suma era el total.
 * Se convierten a colores extra con gramos exactos; si un slot usa el material principal, ese slot es el principal (se queda con el resto).
 */
export function fromLegacyFilaments(filaments: Array<{ g: number; materialId: string }> | undefined | null, mainId: string | null): ExtraColor[] {
  const list = [...(filaments ?? [])]; if (!list.length) return [];
  const i = mainId ? list.findIndex((f) => f.materialId === mainId) : -1; if (i >= 0) list.splice(i, 1);
  return list.map((f) => ({ materialId: f.materialId, g: pos(f.g) || null }));
}

/** Ids de material que usa la línea además del principal (para precargar sus costos en el servidor). */
export const extraMaterialIds = (extras: ExtraColor[] | undefined | null): string[] => [...new Set((extras ?? []).filter(affectsPrice).map((c) => c.materialId))];

/** Resumen de los colores extra para mostrarlo («Blanco 20 %, Rojo»); null si no hay. `name` da el nombre de un material por su id. */
export function colorsLabel(extras: ExtraColor[] | undefined | null, name: (id: string) => string | undefined): string | null {
  const l = (extras ?? []).map((c) => `${c.color || name(c.materialId) || '—'}${c.g ? ` ${c.g} g` : c.pct ? ` ${c.pct} %` : ''}`);
  return l.length ? l.join(', ') : null;
}
