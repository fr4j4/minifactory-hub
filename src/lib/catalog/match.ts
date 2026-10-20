/** Empareja un material del taller con una línea y un color del catálogo de filamentos (solo propone; nunca aplica). */
import { listFilaments, listVariants, norm, lookupGtin, type CatalogFilament, type CatalogRoots, type CatalogVariant } from './ofd';
import { DENSITY } from './filaments';
import { suggestHex } from './colors';
import { tempRange } from './map';

export interface MatMini { id: string; manufacturer: string | null; line: string | null; type: string; colorName: string; hex: string; density: number; diameter: number | null; tempNozzle: string | null; tempBed: string | null; gtin: string | null; traits: string[] | null; variantId: string | null }
export interface CatalogMatch {
  materialId: string; filamentKey: string; filamentName: string; brandName: string; variantId: string | null; variantName: string | null; confidence: 'alta' | 'media';
  fill: Partial<{ tempNozzle: string; tempBed: string; gtin: string; traits: string[]; variantId: string; diameter: number; density: number; hex: string }>;
}

const tokens = (s: string) => norm(s).split(/[^a-z0-9+]+/).filter(Boolean);
const jaccard = (a: string[], b: string[]) => { const A = new Set(a), B = new Set(b); const i = [...A].filter((x) => B.has(x)).length; return A.size + B.size - i === 0 ? 1 : i / (A.size + B.size - i); }; // dos conjuntos vacíos (línea «ABS» de tipo ABS vs. filamento «ABS») son iguales
const rgb = (h: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(h.trim()); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const dist = (a: string, b: string) => { const x = rgb(a), y = rgb(b); return x && y ? Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) : Infinity; };

/** Línea del catálogo más parecida a «marca + línea + tipo» del material. */
export async function pickLine(m: Pick<MatMini, 'manufacturer' | 'line' | 'type'>, roots?: CatalogRoots): Promise<{ f: CatalogFilament; exact: boolean } | null> {
  if (!m.manufacturer?.trim()) return null;
  const page = await listFilaments({ q: m.manufacturer, material: m.type.trim(), pageSize: 200 }, roots);
  const brandOk = page.items.filter((f) => norm(f.brandName) === norm(m.manufacturer!) || tokens(m.manufacturer!).every((w) => tokens(f.brandName).includes(w)));
  if (!brandOk.length) return null;
  const strip = (s: string) => tokens(s).filter((w) => w !== norm(m.type));
  const want = strip(m.line ?? '');
  if (!m.line?.trim()) return brandOk.length === 1 ? { f: brandOk[0], exact: false } : null;
  let best: { f: CatalogFilament; score: number } | null = null;
  for (const f of brandOk) { const sc = jaccard(want, strip(f.name)); if (!best || sc > best.score) best = { f, score: sc }; }
  return best && best.score >= 0.5 ? { f: best.f, exact: best.score === 1 } : null;
}

/** Color más probable dentro de la línea: nombre igual (alta) o el hex más cercano / el sugerido por nombre (media). */
export function pickVariant(m: Pick<MatMini, 'colorName' | 'hex'>, variants: CatalogVariant[]): { v: CatalogVariant; exact: boolean } | null {
  const exact = variants.find((v) => norm(v.name) === norm(m.colorName)); if (exact) return { v: exact, exact: true };
  const named = suggestHex(m.colorName); const refs = [m.hex, named].filter((x): x is string => !!x && x !== '#888888');
  let best: { v: CatalogVariant; d: number } | null = null;
  for (const v of variants) for (const r of refs) { const d = dist(r, v.hex); if (!best || d < best.d) best = { v, d }; }
  return best && best.d <= 30 ? { v: best.v, exact: false } : null;
}

const GENERIC_DENSITY = (type: string) => DENSITY[type.toUpperCase().trim()] ?? 1.24;

export async function matchMaterial(m: MatMini, roots?: CatalogRoots, cache = new Map<string, CatalogVariant[]>()): Promise<CatalogMatch | null> {
  let key: string | null = null; let variantId: string | null = null; let exact = false; let f: CatalogFilament | null = null;
  if (m.gtin) { const g = await lookupGtin(m.gtin, roots); if (g) { key = g.filament; variantId = g.variant; exact = true; } }
  if (!key) { const l = await pickLine(m, roots); if (!l) return null; f = l.f; key = f.key; exact = l.exact; }
  if (!f) { f = (await listFilaments({ q: key.split('/')[2], brand: key.split('/')[0], material: key.split('/')[1], pageSize: 50 }, roots)).items.find((x) => x.key === key) ?? null; if (!f) return null; }
  let vs = cache.get(key); if (!vs) { vs = (await listVariants(key, { pageSize: 200 }, roots))?.items ?? []; cache.set(key, vs); }
  let variant = variantId ? vs.find((v) => v.id === variantId) ?? null : null;
  if (!variant) { const pv = pickVariant(m, vs); if (pv) { variant = pv.v; exact = exact && pv.exact; } }
  const fill: CatalogMatch['fill'] = {};
  const nozzle = tempRange(f.tempMin, f.tempMax), bed = tempRange(f.bedMin, f.bedMax);
  if (!m.tempNozzle?.trim() && nozzle) fill.tempNozzle = nozzle;
  if (!m.tempBed?.trim() && bed) fill.tempBed = bed;
  if (m.diameter == null) fill.diameter = variant?.sizes[0]?.diameter ?? 1.75;
  if (Math.abs(m.density - GENERIC_DENSITY(m.type)) < 0.005 && Math.abs(f.density - m.density) > 0.005) fill.density = f.density;
  if (variant) {
    fill.variantId = `${key}/${variant.id}`;
    if (!m.gtin && variant.sizes.find((s) => s.gtin)?.gtin) fill.gtin = variant.sizes.find((s) => s.gtin)!.gtin!;
    if (!m.traits?.length && variant.traits.length) fill.traits = variant.traits;
  }
  if (!Object.keys(fill).length && (m.variantId || !variant)) return null;
  return { materialId: m.id, filamentKey: key, filamentName: f.name, brandName: f.brandName, variantId: variant?.id ?? null, variantName: variant?.name ?? null, confidence: exact && variant ? 'alta' : 'media', fill };
}
