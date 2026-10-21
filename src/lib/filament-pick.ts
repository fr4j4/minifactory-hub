/** Lógica pura del selector de filamento: familias de color, búsqueda, filtros y agrupación por línea. */
import type { CalcMaterial } from './context';

export type PickMaterial = Pick<CalcMaterial, 'id' | 'label' | 'type' | 'colorName' | 'hex' | 'costPerKg' | 'generic' | 'stockG' | 'availableG' | 'manufacturer' | 'line' | 'variantId' | 'tech' | 'filamentProfileId'>;

export const COLOR_FAMILIES = ['negro', 'blanco', 'gris', 'rojo', 'naranja', 'amarillo', 'verde', 'azul', 'morado', 'rosa', 'marron', 'transparente'] as const;
export type ColorFamily = (typeof COLOR_FAMILIES)[number];
/** Tono representativo de cada familia para dibujar la paleta. */
export const FAMILY_HEX: Record<ColorFamily, string> = { negro: '#1c1c1c', blanco: '#f1f1ee', gris: '#8a8a8a', rojo: '#d62f2f', naranja: '#f28a1d', amarillo: '#f2d21d', verde: '#2f9d4b', azul: '#2d6cdf', morado: '#7a4fc2', rosa: '#f08cb4', marron: '#6b4326', transparente: '#cfe6ee' };

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const rgb = (hex: string): [number, number, number] | null => { const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim()); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

/** Familia de color de un tono (por HSL); el nombre «transparente / natural / clear» manda sobre el tono. */
export function colorFamily(hex: string, name?: string): ColorFamily | null {
  if (name && /transp|natural|clear|transluc/.test(norm(name))) return 'transparente';
  const c = rgb(hex); if (!c) return null;
  const [r, g, b] = c.map((x) => x / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0; if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; }
  if (l < 0.14) return 'negro';
  if (s < 0.14) return l > 0.88 ? 'blanco' : l < 0.2 ? 'negro' : 'gris';
  if (l > 0.93) return 'blanco';
  if (h < 15 || h >= 345) return l > 0.7 ? 'rosa' : 'rojo';
  if (h < 45) return l < 0.42 ? 'marron' : 'naranja';
  if (h < 70) return l < 0.35 ? 'marron' : 'amarillo';
  if (h < 165) return 'verde';
  if (h < 255) return 'azul';
  if (h < 290) return 'morado';
  return 'rosa';
}

/** Distancia entre dos colores (0 = iguales); sirve para ordenar por cercanía a un color pedido o al de una bandeja. */
export function hexDistance(a: string, b: string): number { const x = rgb(a), y = rgb(b); return x && y ? Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) : Infinity; }

/** «PLA Basic» para la línea; si la línea no menciona el tipo («Silk») se le antepone. Sin línea, el tipo. */
export function lineTitle(m: Pick<PickMaterial, 'type' | 'line' | 'manufacturer' | 'generic'>): string {
  if (m.generic) return m.type;
  const base = !m.line ? m.type : norm(m.line).includes(norm(m.type)) ? m.line : `${m.type} ${m.line}`;
  return m.manufacturer ? `${m.manufacturer} · ${base}` : base;
}
/** Nombre corto para el botón del selector: «Bambu Lab PLA Basic · Negro». */
export function pickerName(m: Pick<PickMaterial, 'type' | 'line' | 'manufacturer' | 'generic' | 'colorName'>): string {
  return m.generic ? `${m.type} ${m.colorName}`.replace(/\s+/g, ' ').trim() : `${lineTitle(m).replace(' · ', ' ')} · ${m.colorName}`;
}

export interface PickFilter { q?: string; type?: string | null; family?: ColorFamily | null; onlyStock?: boolean; tech?: string | null; hintHex?: string | null; hintType?: string | null }
const words = (q: string) => norm(q).split(/\s+/).filter(Boolean);

/** Filtra y ordena: lo que coincide con el tipo/tono de referencia primero, genéricos al final. */
export function filterMaterials<M extends PickMaterial>(list: M[], f: PickFilter): M[] {
  const ws = words(f.q ?? '');
  const out = list.filter((m) => {
    if (f.tech && m.tech !== f.tech) return false;
    if (f.type && norm(m.type) !== norm(f.type)) return false;
    if (f.onlyStock && !(m.availableG > 0)) return false;
    if (f.family && !m.generic && colorFamily(m.hex, m.colorName) !== f.family) return false;
    if (f.family && m.generic) return false;
    if (ws.length) { const hay = norm(`${m.manufacturer ?? ''} ${m.line ?? ''} ${m.type} ${m.colorName}`); if (!ws.every((w) => hay.includes(w))) return false; }
    return true;
  });
  const ht = f.hintType ? norm(f.hintType) : null;
  const rank = (m: M) => (m.generic ? 2 : 0) + (ht && norm(m.type) !== ht ? 1 : 0);
  return [...out].sort((a, b) => rank(a) - rank(b) || (f.hintHex ? hexDistance(a.hex, f.hintHex) - hexDistance(b.hex, f.hintHex) : 0));
}

export interface PickGroup<M> { key: string; title: string; items: M[] }
/** Agrupa por marca y línea conservando el orden de aparición; los genéricos van en un grupo aparte al final. */
export function groupMaterials<M extends PickMaterial>(list: M[], genericTitle: string): Array<PickGroup<M>> {
  const groups = new Map<string, PickGroup<M>>();
  for (const m of list) { const key = m.generic ? '__generic' : `${norm(m.manufacturer)}|${norm(m.line) || norm(m.type)}`; const g = groups.get(key) ?? { key, title: m.generic ? genericTitle : lineTitle(m), items: [] }; g.items.push(m); groups.set(key, g); }
  const all = [...groups.values()]; return [...all.filter((g) => g.key !== '__generic'), ...all.filter((g) => g.key === '__generic')];
}

/** Tipos presentes en la lista, en el orden en que aparecen (los genéricos ya traen todos los habituales). */
export function typesOf(list: Array<Pick<PickMaterial, 'type'>>): string[] { return [...new Set(list.map((m) => m.type))]; }

/** Nombre para mostrar de cada familia de color (también es el color pedido que se guarda al elegir de la paleta). */
export const FAMILY_LABEL: Record<ColorFamily, string> = { negro: 'Negro', blanco: 'Blanco', gris: 'Gris', rojo: 'Rojo', naranja: 'Naranja', amarillo: 'Amarillo', verde: 'Verde', azul: 'Azul', morado: 'Morado', rosa: 'Rosa', marron: 'Marrón', transparente: 'Transparente' };

export interface ColorChoices<M> { /** colores del mismo tipo que hay en stock, con más gramos primero y sin repetir nombre */ stock: M[]; /** genérico del mismo tipo: sirve para pedir un color que no se tiene */ generic: M | null }
/** Opciones de color para un material elegido: lo que hay en stock de su tipo y el genérico al que pasar si se pide otro color. */
export function colorChoices<M extends PickMaterial>(list: M[], currentId: string | null, max = 10): ColorChoices<M> {
  const cur = list.find((m) => m.id === currentId); if (!cur) return { stock: [], generic: null };
  const same = list.filter((m) => m.tech === cur.tech && norm(m.type) === norm(cur.type));
  const seen = new Set<string>(); const stock: M[] = [];
  for (const m of [...same].filter((x) => !x.generic && x.availableG > 0).sort((a, b) => b.availableG - a.availableG)) { const k = norm(m.colorName); if (!seen.has(k)) { seen.add(k); stock.push(m); } }
  return { stock: stock.slice(0, max), generic: same.find((m) => m.generic) ?? null };
}
