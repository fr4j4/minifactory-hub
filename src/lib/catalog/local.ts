/**
 * Edición del catálogo de filamentos por el taller. Escribe en la capa local (misma estructura que Open Filament Database,
 * ver ofd.ts), que gana sobre OFD: un filamento propio es una carpeta nueva y editar uno de OFD es copiarlo y modificar la copia.
 * Los de OFD que no se quieren ver se ocultan con `hidden.json`. Nada toca `vendor/open-filament-database`.
 */
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { z } from 'zod';
import { defaultRoots, getFilament, getIndex, getVariant, resetCatalogCache, type CatalogRoots } from './ofd';

const SEG = /^[A-Za-z0-9][\w.+-]{0,79}$/;
const optNum = (min: number, max: number) => z.number().min(min).max(max).nullish();
const optUrl = z.union([z.literal(''), z.string().trim().url().max(400)]).nullish();

export const FilamentInput = z.object({
  brandId: z.string().regex(SEG).nullish(),
  brandName: z.string().trim().min(1).max(80),
  brandWebsite: optUrl, brandOrigin: z.string().trim().max(8).nullish(),
  material: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9][A-Za-z0-9+-]*$/),
  name: z.string().trim().min(1).max(100),
  density: z.number().min(0.5).max(5),
  diameterTolerance: optNum(0, 1), tempMin: optNum(0, 600), tempMax: optNum(0, 600), bedMin: optNum(0, 250), bedMax: optNum(0, 250),
  dryMax: optNum(0, 250), chamber: optNum(0, 250), shoreA: optNum(0, 100), shoreD: optNum(0, 100),
  datasheetUrl: optUrl, safetyUrl: optUrl, discontinued: z.boolean().default(false),
  slicers: z.record(z.string().regex(/^[a-z0-9_]{1,30}$/), z.string().trim().max(120)).default({}),
});
export type FilamentInput = z.input<typeof FilamentInput>;

export const VariantInput = z.object({
  name: z.string().trim().min(1).max(80),
  hexes: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1).max(4),
  traits: z.array(z.string().regex(/^[a-z0-9_]{1,30}$/)).max(12).default([]),
  discontinued: z.boolean().default(false),
  sizes: z.array(z.object({
    weight: z.number().min(1).max(50000), diameter: optNum(1, 3.5), gtin: z.string().regex(/^\d{8,14}$/).nullish().or(z.literal('')),
    articleNumber: z.string().trim().max(40).nullish(), emptySpoolWeight: optNum(0, 3000), refill: z.boolean().default(false), discontinued: z.boolean().default(false),
    links: z.array(z.object({ store: z.string().trim().max(40), url: z.string().trim().url().max(400) })).max(5).default([]),
  })).max(8).default([]),
});
export type VariantInput = z.input<typeof VariantInput>;

export const slug = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'item';

function localRoot(roots: CatalogRoots) { if (!roots.local) throw new Error('El catálogo propio no está disponible en esta instalación.'); return roots.local; }
const exists = async (p: string) => { try { await stat(p); return true; } catch { return false; } };
async function readJson<T = any>(p: string): Promise<T | null> { try { return JSON.parse(await readFile(p, 'utf8')) as T; } catch { return null; } }
/** Escribe sin dejar archivos a medias si el proceso se corta. */
async function writeJson(p: string, data: unknown) { await mkdir(dirname(p), { recursive: true }); const tmp = `${p}.${process.pid}.tmp`; await writeFile(tmp, JSON.stringify(data, null, 2)); await rename(tmp, p); }
/** Carpeta dentro de la capa local; rechaza cualquier tramo raro (nada de `..` ni rutas absolutas). */
function dirOf(root: string, ...parts: string[]) {
  for (const p of parts) if (!SEG.test(p)) throw new Error('Identificador no válido.');
  const out = resolve(root, 'data', ...parts); if (!out.startsWith(resolve(root, 'data') + sep)) throw new Error('Identificador no válido.'); return out;
}
/** Avisa al catálogo (y a otros procesos por el archivo SYNC.json de la capa local) de que cambió. */
async function touch(root: string) { const p = join(root, 'SYNC.json'); const cur = (await readJson(p)) ?? {}; await writeJson(p, { ...cur, source: 'local', license: 'taller', rev: (Number(cur.rev) || 0) + 1, at: new Date().toISOString() }); resetCatalogCache(); }
/** Campo opcional de un formulario: omitido (undefined) = no se toca; null o vacío = se borra. */
const opt = <T,>(v: T | null | undefined | ''): T | null | undefined => (v === '' ? null : v);
/** Aplica `fields` sobre un JSON sin perder lo que no se edita; null o vacío borra el campo. */
function patch(base: Record<string, unknown>, fields: Record<string, unknown>) { const out = { ...base }; for (const [k, v] of Object.entries(fields)) { if (v === undefined) continue; if (v === null) delete out[k]; else out[k] = v; } return out; }

const keyParts = (key: string) => { const [b, m, f, ...rest] = key.split('/'); if (!b || !m || !f || rest.length) throw new Error('Filamento no válido.'); return { b, m, f }; };

/** Copia a la capa local un filamento de OFD (con todos sus colores) para poder editarlo. No hace nada si ya está. */
async function ensureLocal(key: string, roots: CatalogRoots) {
  const root = localRoot(roots); const { b, m, f } = keyParts(key); const dst = dirOf(root, b, m, f);
  if (await exists(join(dst, 'filament.json'))) return dst;
  const src = dirOf(roots.ofd, b, m, f); if (!(await exists(src))) throw new Error('Filamento no encontrado.');
  await mkdir(dirname(dst), { recursive: true }); await cp(src, dst, { recursive: true });
  const bsrc = join(roots.ofd, 'data', b, 'brand.json'), bdst = join(root, 'data', b, 'brand.json');
  if ((await exists(bsrc)) && !(await exists(bdst))) await cp(bsrc, bdst);
  const msrc = join(roots.ofd, 'data', b, m, 'material.json'), mdst = join(root, 'data', b, m, 'material.json');
  if ((await exists(msrc)) && !(await exists(mdst))) await cp(msrc, mdst);
  return dst;
}

export async function listHidden(roots: CatalogRoots = defaultRoots()) { return (await getIndex(roots)).hidden; }

/** Crea un filamento propio (`existingKey` vacío) o edita uno existente (propio o de OFD). Devuelve su clave. */
export async function saveFilament(raw: FilamentInput, existingKey?: string | null, roots: CatalogRoots = defaultRoots()): Promise<{ key: string }> {
  const i = FilamentInput.parse(raw); const root = localRoot(roots);
  if (i.tempMin != null && i.tempMax != null && i.tempMin > i.tempMax) throw new Error('La temperatura mínima no puede superar a la máxima.');
  if (i.bedMin != null && i.bedMax != null && i.bedMin > i.bedMax) throw new Error('La temperatura mínima de la cama no puede superar a la máxima.');
  const ix = await getIndex(roots);
  // marca: una existente se completa; una nueva recibe un identificador derivado del nombre
  const brandId = existingKey ? keyParts(existingKey).b : (i.brandId || (() => {
    const same = (x: string) => { const b = ix.brandById.get(x); return !!b && b.name.trim().toLowerCase() === i.brandName.trim().toLowerCase(); };
    let id = slug(i.brandName), n = 2; if (same(id)) return id; // misma marca: se agrega a ella
    while (ix.brandById.has(id) || existsSync(join(root, 'data', id))) id = `${slug(i.brandName)}_${n++}`; return id;
  })());
  const bdir = dirOf(root, brandId); const prevBrand = (await readJson(join(bdir, 'brand.json'))) ?? (await readJson(join(roots.ofd, 'data', brandId, 'brand.json'))) ?? {};
  await writeJson(join(bdir, 'brand.json'), patch({ ...prevBrand, id: brandId }, { name: i.brandName, website: opt(i.brandWebsite), origin: opt(i.brandOrigin) }));

  let key = existingKey ?? ''; let fdir: string;
  if (existingKey) { fdir = await ensureLocal(existingKey, roots); }
  else {
    const material = i.material; // se respeta como se escribió (PLA, PETG-CF…)
    let id = slug(i.name), n = 2; while (ix.byKey.has(`${brandId}/${material}/${id}`) || (await exists(dirOf(root, brandId, material, id)))) id = `${slug(i.name)}_${n++}`;
    key = `${brandId}/${material}/${id}`; fdir = dirOf(root, brandId, material, id);
  }
  const { f } = keyParts(key); const prev = (await readJson(join(fdir, 'filament.json'))) ?? {};
  const slicerSettings = { ...(prev.slicer_settings ?? {}) } as Record<string, any>;
  for (const k of Object.keys(slicerSettings)) if (!(k in i.slicers)) delete slicerSettings[k];
  for (const [k, v] of Object.entries(i.slicers)) if (v) slicerSettings[k] = { ...(slicerSettings[k] ?? {}), profile_name: v }; else delete slicerSettings[k];
  await writeJson(join(fdir, 'filament.json'), patch(prev, {
    id: f, name: i.name, density: i.density, diameter_tolerance: opt(i.diameterTolerance), min_print_temperature: opt(i.tempMin), max_print_temperature: opt(i.tempMax),
    min_bed_temperature: opt(i.bedMin), max_bed_temperature: opt(i.bedMax), max_dry_temperature: opt(i.dryMax), chamber_temperature: opt(i.chamber),
    shore_hardness_a: opt(i.shoreA), shore_hardness_d: opt(i.shoreD), data_sheet_url: opt(i.datasheetUrl), safety_sheet_url: opt(i.safetyUrl), discontinued: i.discontinued ? true : null,
    slicer_settings: Object.keys(slicerSettings).length ? slicerSettings : null,
  }));
  // si estaba oculto y se vuelve a guardar, reaparece
  await setHidden(key, false, roots, false);
  await touch(root); return { key };
}

async function setHidden(key: string, hide: boolean, roots: CatalogRoots, bump = true) {
  const root = localRoot(roots); const p = join(root, 'hidden.json'); const cur: string[] = ((await readJson<string[]>(p)) ?? []).filter((k) => typeof k === 'string');
  const next = hide ? [...new Set([...cur, key])].sort() : cur.filter((k) => k !== key);
  if (next.length === cur.length && next.every((k, n) => k === cur[n])) return;
  await writeJson(p, next); if (bump) await touch(root);
}

/** Quita un filamento: uno propio se borra; uno de OFD se oculta (y se descarta su copia editada). */
export async function deleteFilament(key: string, roots: CatalogRoots = defaultRoots()): Promise<'deleted' | 'hidden'> {
  const root = localRoot(roots); const { b, m, f } = keyParts(key);
  const inOfd = await exists(join(dirOf(roots.ofd, b, m, f), 'filament.json'));
  await rm(dirOf(root, b, m, f), { recursive: true, force: true });
  if (inOfd) { await setHidden(key, true, roots, false); await touch(root); return 'hidden'; }
  await touch(root); return 'deleted';
}
/** Vuelve a mostrar un filamento oculto de OFD. */
export async function restoreFilament(key: string, roots: CatalogRoots = defaultRoots()) { keyParts(key); await setHidden(key, false, roots); }
/** Descarta la copia editada de un filamento de OFD y vuelve a la versión original. */
export async function resetFilament(key: string, roots: CatalogRoots = defaultRoots()) {
  const root = localRoot(roots); const { b, m, f } = keyParts(key);
  if (!(await exists(join(dirOf(roots.ofd, b, m, f), 'filament.json')))) throw new Error('Este filamento es propio: no tiene versión original.');
  await rm(dirOf(root, b, m, f), { recursive: true, force: true }); await touch(root);
}

/** Crea o edita un color (variante) de un filamento. Devuelve su identificador. */
export async function saveVariant(filamentKey: string, variantId: string | null, raw: VariantInput, roots: CatalogRoots = defaultRoots()): Promise<{ id: string }> {
  const i = VariantInput.parse(raw); const root = localRoot(roots); const f = await getFilament(filamentKey, roots); if (!f) throw new Error('Filamento no encontrado.');
  const fdir = await ensureLocal(filamentKey, roots);
  let id = variantId ?? ''; if (!id) { let n = 2; const base = slug(i.name); id = base; while (await exists(join(fdir, id))) id = `${base}_${n++}`; }
  const vdir = dirOf(root, ...filamentKey.split('/'), id);
  const prev = (await readJson(join(vdir, 'variant.json'))) ?? {};
  const traits: Record<string, boolean> = {}; for (const k of Object.keys((prev.traits ?? {}) as object)) traits[k] = false; // lo desmarcado queda en false
  for (const t of i.traits) traits[t] = true;
  await writeJson(join(vdir, 'variant.json'), patch(prev, { id, name: i.name, color_hex: i.hexes.length === 1 ? i.hexes[0] : i.hexes, traits: Object.keys(traits).length ? traits : null, discontinued: i.discontinued ? true : null }));
  const sizes = i.sizes.map((s) => ({
    filament_weight: s.weight, ...(s.diameter != null ? { diameter: s.diameter } : {}), ...(s.gtin ? { gtin: s.gtin } : {}), ...(s.articleNumber ? { article_number: s.articleNumber } : {}),
    ...(s.emptySpoolWeight != null ? { empty_spool_weight: s.emptySpoolWeight } : {}), ...(s.refill ? { spool_refill: true } : {}), ...(s.discontinued ? { discontinued: true } : {}),
    ...(s.links.length ? { purchase_links: s.links.map((l) => ({ store_id: l.store, url: l.url })) } : {}),
  }));
  if (sizes.length) await writeJson(join(vdir, 'sizes.json'), sizes); else await rm(join(vdir, 'sizes.json'), { force: true });
  await touch(root); return { id };
}

export async function deleteVariant(filamentKey: string, variantId: string, roots: CatalogRoots = defaultRoots()) {
  const root = localRoot(roots); if (!SEG.test(variantId)) throw new Error('Identificador no válido.');
  if (!(await getVariant(filamentKey, variantId, roots))) throw new Error('Color no encontrado.');
  await ensureLocal(filamentKey, roots);
  await rm(dirOf(root, ...filamentKey.split('/'), variantId), { recursive: true, force: true }); await touch(root);
}

/** Datos para rellenar el formulario de edición: lo que el índice conoce más el nombre y el sitio de la marca. */
export async function filamentForEdit(key: string, roots: CatalogRoots = defaultRoots()) {
  const ix = await getIndex(roots); const f = ix.byKey.get(key); if (!f) return null; const b = ix.brandById.get(f.brandId);
  const inOfd = await exists(join(dirOf(roots.ofd, ...key.split('/')), 'filament.json'));
  return { filament: f, brand: b ?? null, inOfd, traitOptions: [...new Set(ix.filaments.flatMap((x) => x.traits))].sort() };
}
export async function localVariantIds(key: string, roots: CatalogRoots = defaultRoots()) { const ix = await getIndex(roots); const f = ix.byKey.get(key); if (!f) return []; try { return (await readdir(dirOf(f.local && roots.local ? roots.local : roots.ofd, ...key.split('/')), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return []; } }
