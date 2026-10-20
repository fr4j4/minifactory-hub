import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getFilament, getIndex, listBrands, listFilaments, listMaterials, listVariants, norm, paginate, parseSizes, resetCatalogCache, type CatalogRoots } from '@/lib/catalog/ofd';

let tmp = ''; let roots: CatalogRoots;
const put = (root: string, rel: string, data: unknown) => { const p = join(root, rel); mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, JSON.stringify(data)); };

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'ofd-'));
  const o = join(tmp, 'ofd'); const l = join(tmp, 'local');
  put(o, 'SYNC.json', { source: 'x', license: 'MIT', commit: 'abc1234', commitDate: '2026-01-01' });
  put(o, 'data/acme/brand.json', { id: 'acme', name: 'Acme Ñandú', origin: 'US' });
  put(o, 'data/acme/PLA/material.json', { material: 'PLA', default_slicer_settings: { orcaslicer: { profile_name: 'Generic PLA' } } });
  put(o, 'data/acme/PLA/basic/filament.json', { id: 'basic', name: 'Basic', density: 1.24, diameter_tolerance: 0.02, min_print_temperature: 190, max_print_temperature: 220, min_bed_temperature: 50, max_bed_temperature: 60 });
  put(o, 'data/acme/PLA/basic/negro/variant.json', { id: 'negro', name: 'Negro', color_hex: '#000000', traits: { matte: true, silk: false } });
  put(o, 'data/acme/PLA/basic/negro/sizes.json', [{ filament_weight: 1000, diameter: 1.75, ean: '123', empty_spool_weight: 250, purchase_links: [{ store_id: 's', url: 'https://x' }] }, { diameter: 2.85 }]);
  put(o, 'data/acme/PLA/basic/rojo/variant.json', { id: 'rojo', name: 'Rojo', color_hex: ['#ff0000', '#aa0000'] });
  put(o, 'data/acme/PETG/hf/filament.json', { id: 'hf', name: 'PETG HF', density: 1.27, slicer_settings: { orcaslicer: { profile_name: 'Acme PETG HF' } } });
  put(o, 'data/vacia/brand.json', { id: 'vacia', name: 'Vacía' });
  put(l, 'data/acme/PLA/basic/filament.json', { id: 'basic', name: 'Basic (taller)', density: 1.25 });
  put(l, 'data/cicla_3d/brand.json', { id: 'cicla_3d', name: 'Cicla 3D', origin: 'CL' });
  put(l, 'data/cicla_3d/PLA/reciclado/filament.json', { id: 'reciclado', name: 'PLA reciclado', density: 1.24 });
  roots = { ofd: o, local: l }; resetCatalogCache();
});
afterAll(() => { rmSync(tmp, { recursive: true, force: true }); resetCatalogCache(); });

describe('catálogo OFD', () => {
  it('indexa marcas y filamentos y descarta marcas vacías', async () => {
    const ix = await getIndex(roots);
    expect(ix.brands.map((b) => b.id)).toEqual(['acme', 'cicla_3d']);
    expect(ix.meta).toMatchObject({ commit: 'abc1234', filaments: 3, brands: 2, localBrands: 1 });
    expect(ix.meta.cover.printTemps).toBe(0); // el filamento local reemplaza al de OFD completo
  });
  it('la capa local gana en un filamento repetido y suma marcas nuevas', async () => {
    const f = await getFilament('acme/PLA/basic', roots);
    expect(f).toMatchObject({ name: 'Basic (taller)', density: 1.25, local: true });
    expect((await getFilament('cicla_3d/PLA/reciclado', roots))?.brandName).toBe('Cicla 3D');
  });
  it('lee temperaturas, perfiles de slicer (el filamento pisa al material) y rasgos', async () => {
    const o2: CatalogRoots = { ofd: roots.ofd, local: null }; resetCatalogCache();
    const b = await getFilament('acme/PLA/basic', o2); expect(b).toMatchObject({ tempMin: 190, tempMax: 220, bedMin: 50, bedMax: 60, colorCount: 2, traits: ['matte'], slicers: { orcaslicer: 'Generic PLA' } });
    expect((await getFilament('acme/PETG/hf', o2))?.slicers.orcaslicer).toBe('Acme PETG HF');
    resetCatalogCache();
  });
  it('busca sin tildes, por varias palabras, y filtra por material y rasgo', async () => {
    expect((await listBrands({ q: 'nandu' }, roots)).items.map((b) => b.id)).toEqual(['acme']);
    expect((await listFilaments({ q: 'acme petg' }, roots)).items.map((f) => f.key)).toEqual(['acme/PETG/hf']);
    expect((await listFilaments({ material: 'pla' }, roots)).total).toBe(2);
    expect((await listFilaments({ hasTemps: true }, roots)).items.every((f) => f.tempMax !== null)).toBe(true);
    expect((await listMaterials(roots)).find((m) => m.material === 'PLA')?.filaments).toBe(2);
  });
  it('lista los colores con hex múltiple, tamaños válidos, GTIN y enlaces', async () => {
    resetCatalogCache(); const o2: CatalogRoots = { ofd: roots.ofd, local: null };
    const r = await listVariants('acme/PLA/basic', {}, o2);
    expect(r?.items.map((v) => v.name)).toEqual(['Negro', 'Rojo']);
    expect(r?.items[1]).toMatchObject({ hex: '#ff0000', hexes: ['#ff0000', '#aa0000'] });
    expect(r?.items[0].sizes).toEqual([{ weight: 1000, diameter: 1.75, gtin: '123', articleNumber: null, emptySpoolWeight: 250, refill: false, discontinued: false, links: [{ store: 's', url: 'https://x' }] }]);
    expect(await listVariants('no/existe/x', {}, o2)).toBeNull();
    expect((await listVariants('acme/PLA/basic', { q: 'roj' }, o2))?.total).toBe(1);
    resetCatalogCache();
  });
});

describe('paginación', () => {
  it('limita el tamaño de página, acota la página y calcula la siguiente', () => {
    const all = Array.from({ length: 205 }, (_, i) => i);
    expect(paginate(all, 1, 50)).toMatchObject({ page: 1, pageSize: 50, total: 205, nextPage: 2 });
    expect(paginate(all, 5, 50)).toMatchObject({ page: 5, nextPage: null });
    expect(paginate(all, 99, 50).page).toBe(5); expect(paginate(all, 0, 9999).pageSize).toBe(200); expect(paginate(all, undefined, undefined).items).toHaveLength(50);
    expect(paginate([], 1, 10)).toMatchObject({ items: [], total: 0, nextPage: null });
  });
  it('utilidades', () => { expect(norm('ÁÑú Éo')).toBe('anu eo'); expect(parseSizes(null)).toEqual([]); });
});

describe('catálogo real sincronizado (vendor/)', () => {
  it('carga las miles de líneas y sirve una ficha conocida', async () => {
    resetCatalogCache(); const ix = await getIndex();
    expect(ix.meta.filaments).toBeGreaterThan(1500); expect(ix.meta.license).toBe('MIT');
    const f = await getFilament('bambu_lab/PC/pc_fr'); expect(f?.density).toBeGreaterThan(1);
    resetCatalogCache();
  });
});
