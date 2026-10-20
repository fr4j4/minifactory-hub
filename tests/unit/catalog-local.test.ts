import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getFilament, getIndex, listFilaments, listVariants, lookupGtin, resetCatalogCache, type CatalogRoots } from '@/lib/catalog/ofd';
import { deleteFilament, deleteVariant, filamentForEdit, listHidden, resetFilament, restoreFilament, saveFilament, saveVariant, slug } from '@/lib/catalog/local';

let tmp = ''; let roots: CatalogRoots;
const put = (root: string, rel: string, data: unknown) => { const p = join(root, rel); mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, JSON.stringify(data)); };
const base = { brandName: 'Taller', material: 'PLA', name: 'PLA Casero', density: 1.24 };

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'cat-local-')); const o = join(tmp, 'ofd'); const l = join(tmp, 'local');
  put(o, 'SYNC.json', { source: 'x', license: 'MIT', commit: 'abc1234', commitDate: '2026-01-01' });
  put(o, 'data/acme/brand.json', { id: 'acme', name: 'Acme', origin: 'US', website: 'https://acme.example' });
  put(o, 'data/acme/PLA/basic/filament.json', { id: 'basic', name: 'Basic', density: 1.24, min_print_temperature: 190, max_print_temperature: 220, custom_field: 'se conserva' });
  put(o, 'data/acme/PLA/basic/negro/variant.json', { id: 'negro', name: 'Negro', color_hex: '#000000', traits: { matte: true }, color_standards: { ral: '9005' } });
  put(o, 'data/acme/PLA/basic/negro/sizes.json', [{ filament_weight: 1000, diameter: 1.75, gtin: '1234567890123' }]);
  put(o, 'data/acme/PLA/basic/rojo/variant.json', { id: 'rojo', name: 'Rojo', color_hex: '#ff0000' });
  mkdirSync(l, { recursive: true }); roots = { ofd: o, local: l }; resetCatalogCache();
});
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); resetCatalogCache(); });

describe('filamentos propios', () => {
  it('crea una marca y un filamento nuevos, con identificadores derivados del nombre', async () => {
    const { key } = await saveFilament({ ...base, brandName: 'Cicla Ñandú 3D', brandOrigin: 'CL', tempMin: 195, tempMax: 215, slicers: { orcaslicer: 'Generic PLA' } }, null, roots);
    expect(key).toBe('cicla_nandu_3d/PLA/pla_casero');
    const f = await getFilament(key, roots);
    expect(f).toMatchObject({ brandName: 'Cicla Ñandú 3D', name: 'PLA Casero', density: 1.24, tempMin: 195, tempMax: 215, local: true, slicers: { orcaslicer: 'Generic PLA' }, colorCount: 0 });
    expect((await getIndex(roots)).brandById.get('cicla_nandu_3d')).toMatchObject({ origin: 'CL', local: true });
  });
  it('un nombre repetido recibe otro identificador en vez de pisar el anterior', async () => {
    const a = await saveFilament(base, null, roots), b = await saveFilament(base, null, roots);
    expect(a.key).toBe('taller/PLA/pla_casero'); expect(b.key).toBe('taller/PLA/pla_casero_2');
    expect((await listFilaments({ q: 'casero' }, roots)).total).toBe(2);
  });
  it('rechaza datos inválidos', async () => {
    await expect(saveFilament({ ...base, density: 0 }, null, roots)).rejects.toThrow();
    await expect(saveFilament({ ...base, tempMin: 250, tempMax: 200 }, null, roots)).rejects.toThrow(/mínima/);
    await expect(saveFilament({ ...base, material: '../etc' }, null, roots)).rejects.toThrow();
    await expect(saveFilament({ ...base, brandId: '..' }, null, roots)).rejects.toThrow();
    await expect(saveFilament({ ...base, datasheetUrl: 'no es url' }, null, roots)).rejects.toThrow();
    expect((await getIndex(roots)).filaments.length).toBe(1);
  });
  it('editar un filamento de OFD copia todo y conserva sus colores y los campos que no se editan', async () => {
    const { key } = await saveFilament({ brandName: 'Acme', material: 'PLA', name: 'Basic (taller)', density: 1.25, tempMin: 200, tempMax: 230 }, 'acme/PLA/basic', roots);
    expect(key).toBe('acme/PLA/basic');
    const f = await getFilament(key, roots);
    expect(f).toMatchObject({ name: 'Basic (taller)', density: 1.25, tempMin: 200, tempMax: 230, local: true, colorCount: 2 });
    expect((await listVariants(key, {}, roots))!.items.map((v) => v.name)).toEqual(['Negro', 'Rojo']);
    expect(JSON.parse(readFileSync(join(roots.local!, 'data/acme/PLA/basic/filament.json'), 'utf8')).custom_field).toBe('se conserva');
    // OFD no se tocó
    expect(JSON.parse(readFileSync(join(roots.ofd, 'data/acme/PLA/basic/filament.json'), 'utf8')).name).toBe('Basic');
    // la marca conserva su sitio web
    expect((await getIndex(roots)).brandById.get('acme')).toMatchObject({ website: 'https://acme.example', origin: 'US' });
  });
  it('quitar un campo opcional lo borra y volver al original descarta la copia', async () => {
    await saveFilament({ brandName: 'Acme', material: 'PLA', name: 'Basic', density: 1.24, tempMin: null, tempMax: null }, 'acme/PLA/basic', roots);
    expect(await getFilament('acme/PLA/basic', roots)).toMatchObject({ tempMin: null, tempMax: null });
    await resetFilament('acme/PLA/basic', roots);
    expect(await getFilament('acme/PLA/basic', roots)).toMatchObject({ tempMin: 190, tempMax: 220, local: false });
    await expect(resetFilament('nada/PLA/x', roots)).rejects.toThrow();
  });
  it('borrar uno propio lo elimina; borrar uno de OFD lo oculta y se puede restaurar', async () => {
    const { key } = await saveFilament(base, null, roots);
    expect(await deleteFilament(key, roots)).toBe('deleted'); expect(await getFilament(key, roots)).toBeNull();
    expect(await deleteFilament('acme/PLA/basic', roots)).toBe('hidden');
    expect(await getFilament('acme/PLA/basic', roots)).toBeNull(); expect(await listHidden(roots)).toEqual(['acme/PLA/basic']);
    expect((await getIndex(roots)).brands.map((b) => b.id)).toEqual([]);
    await restoreFilament('acme/PLA/basic', roots);
    expect(await getFilament('acme/PLA/basic', roots)).toMatchObject({ name: 'Basic', local: false }); expect(await listHidden(roots)).toEqual([]);
  });
});

describe('colores propios', () => {
  it('agrega un color con tamaños, enlaces y rasgos, y lo encuentra por su código de barras', async () => {
    const { key } = await saveFilament(base, null, roots);
    const { id } = await saveVariant(key, null, { name: 'Azul Cielo', hexes: ['#6cc0ee'], traits: ['matte'], sizes: [{ weight: 1000, diameter: 1.75, gtin: '7801234567895', articleNumber: 'AZ-1', emptySpoolWeight: 230, links: [{ store: 'tienda', url: 'https://t.example/azul' }] }] }, roots);
    expect(id).toBe('azul_cielo');
    const v = (await listVariants(key, {}, roots))!.items[0];
    expect(v).toMatchObject({ name: 'Azul Cielo', hex: '#6cc0ee', traits: ['matte'] });
    expect(v.sizes[0]).toMatchObject({ weight: 1000, diameter: 1.75, gtin: '7801234567895', articleNumber: 'AZ-1', emptySpoolWeight: 230, links: [{ store: 'tienda', url: 'https://t.example/azul' }] });
    expect(await lookupGtin('7801234567895', roots)).toEqual({ filament: key, variant: 'azul_cielo' });
    expect((await getFilament(key, roots))!.colorCount).toBe(1);
  });
  it('editar un color de OFD conserva sus otros datos y desmarcar un rasgo lo apaga', async () => {
    await saveVariant('acme/PLA/basic', 'negro', { name: 'Negro mate', hexes: ['#111111', '#222222'], traits: [], sizes: [] }, roots);
    const v = (await listVariants('acme/PLA/basic', {}, roots))!.items.find((x) => x.id === 'negro')!;
    expect(v).toMatchObject({ name: 'Negro mate', hex: '#111111', hexes: ['#111111', '#222222'], traits: [], standards: { ral: '9005' } });
    expect(v.sizes).toEqual([]); // sin tamaños: se borró el archivo
    expect((await listVariants('acme/PLA/basic', {}, roots))!.total).toBe(2); // Rojo se conservó
    expect(await lookupGtin('1234567890123', roots)).toBeNull();
  });
  it('elimina un color y valida sus datos', async () => {
    await deleteVariant('acme/PLA/basic', 'rojo', roots);
    expect((await listVariants('acme/PLA/basic', {}, roots))!.items.map((v) => v.id)).toEqual(['negro']);
    await expect(deleteVariant('acme/PLA/basic', 'rojo', roots)).rejects.toThrow();
    await expect(saveVariant('acme/PLA/basic', null, { name: 'X', hexes: ['rojo'] }, roots)).rejects.toThrow();
    await expect(saveVariant('acme/PLA/basic', null, { name: 'X', hexes: ['#ffffff'], sizes: [{ weight: 1000, gtin: '12' }] }, roots)).rejects.toThrow();
    await expect(saveVariant('acme/PLA/basic', '../x', { name: 'X', hexes: ['#ffffff'] }, roots)).rejects.toThrow();
    await expect(saveVariant('no/existe/x', null, { name: 'X', hexes: ['#ffffff'] }, roots)).rejects.toThrow();
  });
});

describe('utilidades', () => {
  it('slug quita tildes y símbolos', () => { expect(slug('  PLA+ Sílk ¡Ñandú!  ')).toBe('pla_silk_nandu'); expect(slug('***')).toBe('item'); });
  it('sin capa local no se puede editar', async () => { await expect(saveFilament(base, null, { ofd: roots.ofd, local: null })).rejects.toThrow(/no está disponible/); });
  it('el formulario de edición sabe si el filamento existe en OFD', async () => {
    expect((await filamentForEdit('acme/PLA/basic', roots))).toMatchObject({ inOfd: true });
    const { key } = await saveFilament(base, null, roots); expect(await filamentForEdit(key, roots)).toMatchObject({ inOfd: false });
    expect(await filamentForEdit('x/y/z', roots)).toBeNull(); expect(existsSync(join(roots.local!, 'SYNC.json'))).toBe(true);
  });
});
