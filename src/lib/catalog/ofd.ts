/**
 * Catálogo de filamentos de Open Filament Database (MIT), leído tal cual desde `vendor/open-filament-database/`
 * (ver scripts/catalog-sync.ts) y completado con una capa local opcional (`vendor/catalog-local/`, misma estructura,
 * que gana en caso de conflicto). Se indexa una vez en memoria y se invalida si cambia `SYNC.json`.
 * Estructura: data/<marca>/brand.json · <MATERIAL>/material.json · <filamento>/filament.json · <color>/{variant,sizes}.json
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

export interface CatalogRoots { ofd: string; local: string | null }
export const defaultRoots = (): CatalogRoots => ({ ofd: process.env.CATALOG_DIR || join(process.cwd(), 'vendor', 'open-filament-database'), local: process.env.CATALOG_LOCAL_DIR || join(process.cwd(), 'vendor', 'catalog-local') });

export interface CatalogSize { weight: number; diameter: number | null; gtin: string | null; articleNumber: string | null; emptySpoolWeight: number | null; refill: boolean; discontinued: boolean; links: Array<{ store: string; url: string }> }
export interface CatalogVariant { id: string; name: string; hex: string; hexes: string[]; traits: string[]; discontinued: boolean; standards: Record<string, string>; sizes: CatalogSize[] }
export interface CatalogBrand { id: string; name: string; website: string | null; origin: string | null; local: boolean; filaments: number; colors: number }
export interface CatalogFilament {
  key: string; brandId: string; brandName: string; material: string; id: string; name: string; density: number; diameterTolerance: number | null;
  tempMin: number | null; tempMax: number | null; bedMin: number | null; bedMax: number | null; dryMax: number | null; chamber: number | null;
  shoreA: number | null; shoreD: number | null; datasheetUrl: string | null; safetyUrl: string | null; discontinued: boolean;
  slicers: Record<string, string>; traits: string[]; colorCount: number; local: boolean;
}
export interface CatalogMeta { source: string; license: string; commit: string; commitDate: string; brands: number; filaments: number; variants: number; localBrands: number; cover: Record<string, number> }

interface Index { brands: CatalogBrand[]; brandById: Map<string, CatalogBrand>; filaments: CatalogFilament[]; byKey: Map<string, CatalogFilament>; meta: CatalogMeta; stamp: string; roots: CatalogRoots }

export const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

async function readJson<T = any>(p: string): Promise<T | null> { try { return JSON.parse(await readFile(p, 'utf8')) as T; } catch { return null; } }
async function dirs(p: string): Promise<string[]> { try { return (await readdir(p, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort(); } catch { return []; } }
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const trueKeys = (o: unknown) => Object.entries((o ?? {}) as Record<string, unknown>).filter(([, v]) => v === true).map(([k]) => k);

/** Rellena `limit` tareas a la vez: evita abrir miles de archivos de golpe. */
async function pool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

export function parseSizes(raw: unknown): CatalogSize[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => num(x?.filament_weight) !== null).map((x) => ({
    weight: x.filament_weight, diameter: num(x.diameter), gtin: str(x.gtin) ?? str(x.ean), articleNumber: str(x.article_number), emptySpoolWeight: num(x.empty_spool_weight),
    refill: x.spool_refill === true, discontinued: x.discontinued === true,
    links: Array.isArray(x.purchase_links) ? x.purchase_links.filter((l: any) => str(l?.url)).map((l: any) => ({ store: String(l.store_id ?? ''), url: String(l.url) })) : [],
  }));
}

export function parseVariant(id: string, v: any, sizes: unknown): CatalogVariant {
  const hexes = Array.isArray(v?.color_hex) ? v.color_hex.map(String) : v?.color_hex ? [String(v.color_hex)] : [];
  return { id, name: str(v?.name) ?? id, hex: hexes[0] ?? '#888888', hexes, traits: trueKeys(v?.traits), discontinued: v?.discontinued === true, standards: Object.fromEntries(Object.entries(v?.color_standards ?? {}).filter(([, x]) => typeof x === 'string') as Array<[string, string]>), sizes: parseSizes(sizes) };
}

export function slicerNames(f: any, m: any): Record<string, string> {
  const out: Record<string, string> = {};
  for (const src of [m?.default_slicer_settings, f?.slicer_settings]) for (const [k, v] of Object.entries((src ?? {}) as Record<string, any>)) if (str(v?.profile_name)) out[k] = v.profile_name;
  return out;
}

async function loadRoot(root: string, local: boolean, brands: Map<string, CatalogBrand>, fils: Map<string, CatalogFilament>) {
  for (const b of await dirs(join(root, 'data'))) {
    const bd = join(root, 'data', b); const bj = await readJson(join(bd, 'brand.json'));
    const brand: CatalogBrand = { id: b, name: str(bj?.name) ?? b, website: str(bj?.website), origin: str(bj?.origin), local, filaments: 0, colors: 0 };
    const mats = await dirs(bd);
    const rows = await pool(mats, 8, async (mat) => {
      const md = join(bd, mat); const mj = await readJson(join(md, 'material.json'));
      const out: CatalogFilament[] = [];
      for (const fd of await dirs(md)) {
        const dir = join(md, fd); const fj = await readJson(join(dir, 'filament.json')); if (!fj || num(fj.density) === null) continue;
        const vdirs = await dirs(dir); const traits = new Set<string>();
        await pool(vdirs, 16, async (vd) => { const vj = await readJson(join(dir, vd, 'variant.json')); for (const t of trueKeys(vj?.traits)) traits.add(t); });
        out.push({
          key: `${b}/${mat}/${fd}`, brandId: b, brandName: brand.name, material: mat, id: fd, name: str(fj.name) ?? fd, density: fj.density, diameterTolerance: num(fj.diameter_tolerance),
          tempMin: num(fj.min_print_temperature), tempMax: num(fj.max_print_temperature), bedMin: num(fj.min_bed_temperature), bedMax: num(fj.max_bed_temperature), dryMax: num(fj.max_dry_temperature), chamber: num(fj.chamber_temperature) ?? num(fj.max_chamber_temperature),
          shoreA: num(fj.shore_hardness_a), shoreD: num(fj.shore_hardness_d), datasheetUrl: str(fj.data_sheet_url), safetyUrl: str(fj.safety_sheet_url), discontinued: fj.discontinued === true,
          slicers: slicerNames(fj, mj), traits: [...traits].sort(), colorCount: vdirs.length, local,
        });
      }
      return out;
    });
    const list = rows.flat(); if (!list.length && !bj) continue;
    const prev = brands.get(b);
    brands.set(b, prev ? { ...prev, ...(bj ? brand : {}), local: false } : brand); // la capa local completa una marca de OFD, no la reemplaza entera
    for (const f of list) fils.set(f.key, f);
  }
}

async function build(roots: CatalogRoots, stamp: string): Promise<Index> {
  const brands = new Map<string, CatalogBrand>(); const fils = new Map<string, CatalogFilament>();
  await loadRoot(roots.ofd, false, brands, fils);
  if (roots.local) await loadRoot(roots.local, true, brands, fils);
  const filaments = [...fils.values()].sort((a, b) => a.brandName.localeCompare(b.brandName) || a.material.localeCompare(b.material) || a.name.localeCompare(b.name));
  for (const b of brands.values()) { b.filaments = 0; b.colors = 0; }
  for (const f of filaments) { const b = brands.get(f.brandId); if (b) { b.filaments++; b.colors += f.colorCount; } }
  const list = [...brands.values()].filter((b) => b.filaments > 0).sort((a, b) => a.name.localeCompare(b.name));
  const sync = (await readJson(join(roots.ofd, 'SYNC.json'))) ?? {};
  const cov = (p: (f: CatalogFilament) => boolean) => filaments.filter(p).length;
  const meta: CatalogMeta = {
    source: sync.source ?? '', license: sync.license ?? 'MIT', commit: sync.commit ?? '', commitDate: sync.commitDate ?? '',
    brands: list.length, filaments: filaments.length, variants: filaments.reduce((n, f) => n + f.colorCount, 0), localBrands: list.filter((b) => b.local).length,
    cover: { printTemps: cov((f) => f.tempMax !== null), bedTemps: cov((f) => f.bedMax !== null), dryTemp: cov((f) => f.dryMax !== null), datasheet: cov((f) => !!f.datasheetUrl), slicerProfile: cov((f) => Object.keys(f.slicers).length > 0) },
  };
  return { brands: list, brandById: new Map(list.map((b) => [b.id, b])), filaments, byKey: new Map(filaments.map((f) => [f.key, f])), meta, stamp, roots };
}

let cache: Promise<Index> | null = null; let cacheKey = '';
async function stampOf(roots: CatalogRoots) {
  const m = async (p: string) => { try { return String((await stat(p)).mtimeMs); } catch { return '0'; } };
  return `${roots.ofd}|${roots.local}|${await m(join(roots.ofd, 'SYNC.json'))}|${roots.local ? await m(join(roots.local, 'SYNC.json')) : ''}`;
}
export async function getIndex(roots: CatalogRoots = defaultRoots()): Promise<Index> {
  const key = await stampOf(roots);
  if (!cache || key !== cacheKey) { cacheKey = key; cache = build(roots, key).catch((e) => { cache = null; throw e; }); }
  return cache;
}
export function resetCatalogCache() { cache = null; cacheKey = ''; }

export interface Page<T> { items: T[]; page: number; pageSize: number; total: number; nextPage: number | null }
export function paginate<T>(all: T[], page?: number, pageSize?: number, max = 200): Page<T> {
  const size = Math.min(Math.max(Math.floor(pageSize || 50), 1), max); const total = all.length; const pages = Math.max(Math.ceil(total / size), 1);
  const p = Math.min(Math.max(Math.floor(page || 1), 1), pages);
  return { items: all.slice((p - 1) * size, p * size), page: p, pageSize: size, total, nextPage: p < pages ? p + 1 : null };
}

export async function listBrands(o: { q?: string; origin?: string; page?: number; pageSize?: number } = {}, roots?: CatalogRoots) {
  const ix = await getIndex(roots); const q = norm(o.q ?? '');
  return paginate(ix.brands.filter((b) => (!q || norm(b.name).includes(q) || b.id.includes(q)) && (!o.origin || b.origin === o.origin)), o.page, o.pageSize);
}

export interface FilamentQuery { q?: string; brand?: string; material?: string; trait?: string; hasTemps?: boolean; sort?: 'brand' | 'name' | 'colors' | 'density'; page?: number; pageSize?: number }
export async function listFilaments(o: FilamentQuery = {}, roots?: CatalogRoots) {
  const ix = await getIndex(roots); const q = norm(o.q ?? ''); const mat = o.material?.toUpperCase();
  const words = q.split(/\s+/).filter(Boolean);
  let list = ix.filaments.filter((f) => {
    if (o.brand && f.brandId !== o.brand) return false; if (mat && f.material.toUpperCase() !== mat) return false;
    if (o.trait && !f.traits.includes(o.trait)) return false; if (o.hasTemps && f.tempMax === null) return false;
    if (!words.length) return true; const hay = norm(`${f.brandName} ${f.material} ${f.name}`); return words.every((w) => hay.includes(w));
  });
  if (o.sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name)); else if (o.sort === 'colors') list = [...list].sort((a, b) => b.colorCount - a.colorCount); else if (o.sort === 'density') list = [...list].sort((a, b) => a.density - b.density);
  return paginate(list, o.page, o.pageSize);
}
export async function getFilament(key: string, roots?: CatalogRoots) { return (await getIndex(roots)).byKey.get(key) ?? null; }
export async function listMaterials(roots?: CatalogRoots) { const c = new Map<string, number>(); for (const f of (await getIndex(roots)).filaments) c.set(f.material, (c.get(f.material) ?? 0) + 1); return [...c].map(([material, filaments]) => ({ material, filaments })).sort((a, b) => b.filaments - a.filaments); }

export interface VariantQuery { q?: string; page?: number; pageSize?: number }
/** Los colores se leen del disco al pedirlos (no viven en memoria): una línea tiene como mucho unas decenas. */
export async function listVariants(key: string, o: VariantQuery = {}, roots?: CatalogRoots): Promise<Page<CatalogVariant> | null> {
  const ix = await getIndex(roots); const f = ix.byKey.get(key); if (!f) return null;
  const q = norm(o.q ?? '');
  const base = (r: string) => join(r, 'data', f.brandId, f.material, f.id);
  const dir = f.local ? base(ix.roots.local!) : base(ix.roots.ofd);
  const vs = await pool(await dirs(dir), 16, async (vd) => { const vj = await readJson(join(dir, vd, 'variant.json')); return vj ? parseVariant(vd, vj, await readJson(join(dir, vd, 'sizes.json'))) : null; });
  const all = vs.filter((v): v is CatalogVariant => !!v && (!q || norm(v.name).includes(q))).sort((a, b) => a.name.localeCompare(b.name));
  return paginate(all, o.page, o.pageSize);
}

/** Un solo color de una línea (lee su carpeta, no todo el filamento). */
export async function getVariant(key: string, variantId: string, roots?: CatalogRoots): Promise<CatalogVariant | null> {
  if (!/^[\w.+-]+$/.test(variantId)) return null;
  const ix = await getIndex(roots); const f = ix.byKey.get(key); if (!f) return null;
  const dir = join(f.local ? ix.roots.local! : ix.roots.ofd, 'data', f.brandId, f.material, f.id, variantId);
  const vj = await readJson(join(dir, 'variant.json')); return vj ? parseVariant(variantId, vj, await readJson(join(dir, 'sizes.json'))) : null;
}
