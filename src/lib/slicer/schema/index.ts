import { PAGES, PARAMS, PARAM_BY_KEY, type ParamDef, type ParamMode, type ParamType } from './params';
export { PAGES, PARAMS, PARAM_BY_KEY, type ParamDef, type ParamMode, type ParamType } from './params';

type Lang = 'es' | 'en';
const MODE_RANK: Record<ParamMode, number> = { simple: 0, advanced: 1, expert: 2 };
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const labelOf = (d: ParamDef, lang: Lang) => d[lang].label;
export const tipOf = (d: ParamDef, lang: Lang) => d[lang].tip;
/** Parámetros visibles para un nivel (Simple ⊂ Avanzado ⊂ Experto). */
export const visibleAt = (type: ParamType, mode: ParamMode) => PARAMS.filter((p) => p.type === type && MODE_RANK[p.mode] <= MODE_RANK[mode]);

/** Búsqueda difusa en español e inglés (etiqueta, ayuda y clave de Orca): todas las palabras deben aparecer; las coincidencias en la etiqueta pesan más. */
export function searchParams(q: string, type: ParamType, mode: ParamMode = 'expert'): ParamDef[] {
  const words = norm(q).split(/\s+/).filter(Boolean); if (!words.length) return visibleAt(type, mode);
  const scored: Array<[number, ParamDef]> = [];
  for (const p of visibleAt(type, mode)) {
    const lab = norm(`${p.es.label} ${p.en.label}`), tip = norm(`${p.es.tip} ${p.en.tip}`), key = norm(p.key.replace(/_/g, ' '));
    let score = 0; let ok = true;
    for (const w of words) { const s = lab.includes(w) ? 3 : key.includes(w) ? 2 : tip.includes(w) ? 1 : 0; if (!s) { ok = false; break; } score += s + (lab.startsWith(w) || lab.includes(` ${w}`) && lab.split(' ')[0] === w ? 2 : 0); }
    score -= Math.min(lab.length, 80) / 1000; // a igual puntaje, la etiqueta más corta (más genérica) primero
    if (ok) scored.push([score, p]);
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1].key.localeCompare(b[1].key)).map((x) => x[1]);
}

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const eq = (a: unknown, b: unknown) => String(first(a) ?? '').replace(',', '.').replace(/%$/, '').trim() === String(first(b) ?? '').replace(',', '.').replace(/%$/, '').trim();
/** Claves que difieren de la base (efectiva sin ajustes de sesión): lo que se resalta como «modificado». */
export function modifiedKeys(base: Record<string, unknown>, overrides: Record<string, unknown>): string[] {
  return Object.keys(overrides).filter((k) => overrides[k] !== '' && overrides[k] != null && !(k in base && eq(base[k], overrides[k])));
}
export interface ParamIssue { key: string; kind: 'range' | 'option' | 'number'; min?: number; max?: number }
/** Validación en línea de un cambio manual: tipo numérico, rango y opciones permitidas. */
export function validateValue(type: ParamType, key: string, value: unknown): ParamIssue | null {
  const d = PARAM_BY_KEY.get(`${type}:${key}`); if (!d) return null; const v = String(first(value) ?? '').trim(); if (v === '') return null;
  if (d.kind === 'select') return d.options && !d.options.includes(v) ? { key, kind: 'option' } : null;
  if (d.kind === 'bool') return v === '0' || v === '1' ? null : { key, kind: 'option' };
  const n = Number(v.replace(',', '.').replace(/%$/, '')); if (!Number.isFinite(n)) return { key, kind: 'number' };
  if (d.kind === 'int' && !Number.isInteger(n)) return { key, kind: 'number' };
  if ((d.min != null && n < d.min) || (d.max != null && n > d.max)) return { key, kind: 'range', min: d.min, max: d.max };
  return null;
}
/** Normaliza lo que escribe la persona al formato de Orca («0,2» → «0.2», el relleno con %). */
export function normalizeValue(type: ParamType, key: string, value: string): string {
  const d = PARAM_BY_KEY.get(`${type}:${key}`); const v = value.trim(); if (!d) return v;
  if (d.kind === 'percent') { const n = v.replace(',', '.').replace(/%$/, ''); return key === 'sparse_infill_density' ? `${n}%` : n; }
  if (d.kind === 'number' || d.kind === 'int') return v.replace(',', '.');
  return v;
}
export { PAGES as PARAM_PAGES };

/** Versión del esquema: sube cada vez que se amplía (para que los paneles recalculen su lista). */
export let schemaVersion = 0;
/** Suma al esquema curado las claves generadas desde OrcaSlicer (página «Otros»). Es idempotente. */
export function extendSchema(extra: readonly ParamDef[]): number {
  let added = 0;
  for (const d of extra) {
    const id = `${d.type}:${d.key}`; if (PARAM_BY_KEY.has(id)) continue;
    (PARAMS as ParamDef[]).push(d); (PARAM_BY_KEY as Map<string, ParamDef>).set(id, d); added++;
  }
  if (added) {
    for (const ty of ['process', 'filament', 'machine'] as const) if (!PAGES[ty].some((p) => p.id === 'extra') && PARAMS.some((p) => p.type === ty && p.page === 'extra')) PAGES[ty].push({ id: 'extra', es: 'Otros (OrcaSlicer)', en: 'Other (OrcaSlicer)' });
    schemaVersion++;
  }
  return added;
}
