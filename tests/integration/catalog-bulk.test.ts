import { beforeAll, describe, expect, it } from 'vitest';
import { eq, isNull, and } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { seedDemo } from '@/lib/seed';
import { applyBulkMaterials, planBulkMaterials, type BulkCommon } from '@/lib/services/inventory';
import { getFilament } from '@/lib/catalog/ofd';

const KEY = 'bambu_lab/ABS/abs';
let db: Awaited<ReturnType<typeof getDb>>;
const common = (o: Partial<BulkCommon> = {}): BulkCommon => ({ manufacturer: 'Bambu Lab', line: 'ABS', type: 'ABS', diameter: 1.75, density: 1.04, costPerKg: 50000, netG: 1000, tareG: 240, catalogId: KEY, ...o });

beforeAll(async () => { await seedDemo(); db = await getDb(); });

describe('alta rápida con catálogo', () => {
  it('copia temperaturas, GTIN y vínculo de color desde el catálogo (no de lo que manda el cliente)', async () => {
    const f = await getFilament(KEY); expect(f).toBeTruthy();
    const r = await applyBulkMaterials(common({ tempNozzle: 'basura' }), [{ colorName: 'Lavender', hex: '#b9a0d8', spools: 1, variantId: 'lavender' }]);
    expect(r).toMatchObject({ created: 1, spools: 1 });
    const [m] = await db.select().from(s.materials).where(and(eq(s.materials.manufacturer, 'Bambu Lab'), eq(s.materials.line, 'ABS'), isNull(s.materials.deletedAt)));
    expect(m).toMatchObject({ variantId: `${KEY}/lavender`, gtin: '921128098883', tempNozzle: '230–260', tempBed: '90–110' });
    const [l] = await db.select().from(s.filamentLines).where(eq(s.filamentLines.id, m.lineId!));
    expect(l.catalogId).toBe(KEY); expect(l.specs).toMatchObject({ tempMax: 260, source: 'open-filament-database' });
  });
  it('detecta duplicados por color del catálogo aunque cambie el nombre', async () => {
    const plan = await planBulkMaterials(common(), [{ colorName: 'Lavanda', hex: '#b9a0d8', spools: 1, variantId: 'lavender' }]);
    expect(plan.items[0].status).toBe('exists'); expect(plan.newMaterials).toBe(0);
  });
  it('sin catálogo el alta sigue igual que antes', async () => {
    const r = await applyBulkMaterials({ ...common({ catalogId: null }), manufacturer: 'Taller', line: 'PLA propio', type: 'PLA', density: 1.24 }, [{ colorName: 'Azul', hex: '#0000ff', spools: 0 }]);
    expect(r.created).toBe(1);
    const [m] = await db.select().from(s.materials).where(eq(s.materials.line, 'PLA propio')); expect(m.variantId).toBeNull(); expect(m.gtin).toBeNull();
  });
  it('rechaza una línea de catálogo inexistente', async () => {
    await expect(applyBulkMaterials(common({ catalogId: 'no/existe/x' }), [{ colorName: 'X', hex: '#111111', spools: 0, variantId: 'x' }])).rejects.toThrow();
  });
});

import { applyCatalogFill, previewCatalogFill } from '@/lib/services/catalog-fill';
import { matchMaterial } from '@/lib/catalog/match';
import { WORKSPACE_ID } from '@/db';

describe('completar materiales existentes desde el catálogo', () => {
  it('propone solo campos vacíos y no pisa lo escrito', async () => {
    const [m] = await db.insert(s.materials).values({ workspaceId: WORKSPACE_ID, manufacturer: 'Bambu Lab', line: 'ABS', type: 'ABS', colorName: 'Lavender', hex: '#b9a0d8', density: 1.04, tempNozzle: '999', diameter: null }).returning();
    const r = await matchMaterial({ id: m.id, manufacturer: m.manufacturer, line: m.line, type: m.type, colorName: m.colorName, hex: m.hex, density: m.density, diameter: m.diameter, tempNozzle: m.tempNozzle, tempBed: m.tempBed, gtin: null, traits: null, variantId: null });
    expect(r).toMatchObject({ filamentKey: KEY, variantId: 'lavender', confidence: 'alta' });
    expect(r!.fill).toMatchObject({ tempBed: '90–110', gtin: '921128098883', variantId: `${KEY}/lavender`, diameter: 1.75 });
    expect(r!.fill.tempNozzle).toBeUndefined();
  });
  it('no empareja marcas desconocidas', async () => {
    expect(await matchMaterial({ id: 'x', manufacturer: 'Marca Inventada XYZ', line: 'PLA', type: 'PLA', colorName: 'Negro', hex: '#000000', density: 1.24, diameter: 1.75, tempNozzle: null, tempBed: null, gtin: null, traits: null, variantId: null })).toBeNull();
  });
  it('vista previa y aplicación: vincula el material y su línea; rechaza un emparejamiento distinto del propuesto', async () => {
    const prev = await previewCatalogFill(db); const hit = prev.find((p) => p.label.includes('Lavender'));
    expect(hit).toBeTruthy();
    expect(await applyCatalogFill([{ materialId: hit!.materialId, filamentKey: 'otra/cosa/x', variantId: null }], null, db)).toEqual({ updated: 0, skipped: 1 });
    expect(await applyCatalogFill([{ materialId: hit!.materialId, filamentKey: hit!.filamentKey, variantId: hit!.variantId }], null, db)).toEqual({ updated: 1, skipped: 0 });
    const [m] = await db.select().from(s.materials).where(eq(s.materials.id, hit!.materialId));
    expect(m).toMatchObject({ variantId: `${KEY}/lavender`, tempBed: '90–110', tempNozzle: '999', gtin: '921128098883' });
    expect((await previewCatalogFill(db)).some((p) => p.materialId === hit!.materialId)).toBe(false);
  });
});
