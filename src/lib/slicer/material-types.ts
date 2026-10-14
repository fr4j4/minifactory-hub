/** Tipos de material habituales (se suman a los que ya existen en el inventario). */
export const KNOWN_MATERIAL_TYPES = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'PA', 'PC', 'PCTG', 'PVA', 'HIPS', 'PP', 'PLA-CF', 'PETG-CF', 'PA-CF'];

const key = (v: string) => v.trim().toUpperCase().replace(/[\s_]+/g, '-');

/** Nombre canónico de un tipo: «pla», « Petg » → «PLA», «PETG»; si ya existe en `known` se usa su grafía. Vacío → null. */
export function canonicalMaterialType(v: unknown, known: string[] = KNOWN_MATERIAL_TYPES): string | null {
  const t = String(v ?? '').trim(); if (!t) return null;
  const hit = known.find((k) => key(k) === key(t)); return hit ?? key(t);
}
/** Lista sin repetidos (sin distinguir mayúsculas), con la grafía canónica y en el orden de `known`. */
export function canonicalMaterialTypes(list: unknown, known: string[] = KNOWN_MATERIAL_TYPES): string[] {
  const out: string[] = []; for (const v of Array.isArray(list) ? list : []) { const c = canonicalMaterialType(v, known); if (c && !out.includes(c)) out.push(c); }
  const idx = (x: string) => { const i = known.indexOf(x); return i < 0 ? 999 : i; };
  return out.sort((a, b) => idx(a) - idx(b) || a.localeCompare(b));
}
