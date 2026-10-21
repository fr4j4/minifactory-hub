import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { seedDemo } from '@/lib/seed';
import { getPurchase, listPurchases, planPurchase, receivePurchase, voidPurchase } from '@/lib/services/purchases';
import { checkAvailability, consumeFromSpool, ensureGenericMaterials, materialCostPerKg, materialStock, shoppingList } from '@/lib/services/inventory';
import { cancelJob, createJob, finishJob, pickSpool, startJob } from '@/lib/services/production';
import { addCatalogColorOwned, addCatalogColors } from '@/lib/services/catalog-add';
import { applySupplyRules, saveSupplyRule } from '@/lib/services/supplies';
import { setOrderStatus } from '@/lib/services/orders';

let db: Awaited<ReturnType<typeof getDb>>; let petg: typeof s.materials.$inferSelect; let sup: typeof s.suppliers.$inferSelect; let supVat: typeof s.suppliers.$inferSelect;
beforeAll(async () => {
  await seedDemo(); db = await getDb();
  [petg] = await db.insert(s.materials).values({ workspaceId: WORKSPACE_ID, manufacturer: 'Prueba', line: 'PETG Test', type: 'PETG', colorName: 'Verde test', hex: '#22aa55', density: 1.27, costPerKg: 1, stockMinG: 500 }).returning();
  [sup] = await db.insert(s.suppliers).values({ workspaceId: WORKSPACE_ID, name: 'Tienda sin IVA', recoversVat: false }).returning();
  [supVat] = await db.insert(s.suppliers).values({ workspaceId: WORKSPACE_ID, name: 'Tienda con IVA recuperable', recoversVat: true }).returning();
});

const line = (o: any = {}) => ({ kind: 'filamento' as const, materialId: petg.id, qty: 2, netG: 1000, unitPrice: 20000, ...o });

describe('compras: costo real', () => {
  it('reparte envío y descuento entre las líneas y calcula el costo por kg', async () => {
    const p = await planPurchase({ supplierId: sup.id, shipping: 3000, discount: 1000, lines: [line()] });
    expect(p).toMatchObject({ subtotal: 40000, total: 42000, spools: 2, recoversVat: false });
    expect(p.lines[0]).toMatchObject({ extra: 2000, unitCost: 21000, costPerKg: 21000 });
  });
  it('con proveedor que recupera IVA el costo va sin IVA y se informa el total neto', async () => {
    const p = await planPurchase({ supplierId: supVat.id, lines: [line({ qty: 1, netG: 500, unitPrice: 11900 })] });
    expect(p.recoversVat).toBe(true);
    expect(p.lines[0].unitCost).toBe(10000); expect(p.lines[0].costPerKg).toBe(20000); expect(p.netTotal).toBe(10000);
  });
  it('rechaza compras vacías, carretes no enteros, descuentos mayores que lo pagado y materiales genéricos', async () => {
    await expect(planPurchase({ lines: [] })).rejects.toThrow();
    await expect(planPurchase({ lines: [line({ qty: 1.5 })] })).rejects.toThrow();
    await expect(planPurchase({ discount: 999999, lines: [line()] })).rejects.toThrow();
    await ensureGenericMaterials(db, true);
    const [gen] = await db.select().from(s.materials).where(and(eq(s.materials.generic, true), eq(s.materials.type, 'PETG')));
    await expect(planPurchase({ lines: [line({ materialId: gen.id })] })).rejects.toThrow();
  });
});

describe('compras: recibir y anular', () => {
  let purchaseId: string; let spoolIds: string[];
  it('crea los carretes con su costo real, el movimiento de entrada y aprende el peso habitual', async () => {
    const r = await receivePurchase({ supplierId: sup.id, boughtAt: '2026-10-01', docNumber: 'B-123', shipping: 3000, discount: 1000, lines: [line({ lot: 'L1' })] });
    expect(r.number).toMatch(/^C-\d{4}-0001$/); expect(r.spools).toBe(2); purchaseId = r.id; spoolIds = r.spoolIds;
    const sp = await db.select().from(s.spools).where(and(eq(s.spools.materialId, petg.id), isNull(s.spools.deletedAt)));
    expect(sp).toHaveLength(2); expect(sp[0]).toMatchObject({ initialG: 1000, remainingG: 1000, unitCost: 21000, boughtAt: '2026-10-01', status: 'nueva', lot: 'L1' }); expect(sp[0].purchaseLineId).toBeTruthy();
    expect(new Set(sp.map((x) => x.code)).size).toBe(2);
    const mv = await db.select().from(s.inventoryMovements).where(eq(s.inventoryMovements.purchaseId, purchaseId));
    expect(mv).toHaveLength(2); expect(mv[0]).toMatchObject({ kind: 'entrada', qty: 1000, unitCost: 21000 });
    const [m] = await db.select().from(s.materials).where(eq(s.materials.id, petg.id)); expect(m).toMatchObject({ costPerKg: 21000, packG: 1000 });
    const d = (await getPurchase(purchaseId))!; expect(d.purchase).toMatchObject({ total: 42000, docNumber: 'B-123', supplierText: 'Tienda sin IVA' }); expect(d.lines[0].spools).toHaveLength(2);
    expect((await listPurchases()).some((p) => p.id === purchaseId && p.spools === 2 && p.kg === 2)).toBe(true);
    const st = (await materialStock()).find((x) => x.materialId === petg.id)!; expect(st).toMatchObject({ physicalG: 2000, spools: 2 });
  });
  it('el número de compra sigue la secuencia y el código de carrete no se repite', async () => {
    const r2 = await receivePurchase({ lines: [line({ qty: 1, unitPrice: 15000 })] });
    expect(r2.number).toMatch(/-0002$/);
    const codes = (await db.select({ c: s.spools.code }).from(s.spools)).map((x) => x.c); expect(new Set(codes).size).toBe(codes.length);
    await voidPurchase(r2.id); // nada usado: se puede anular
    expect((await getPurchase(r2.id))!.purchase.status).toBe('anulada');
    expect((await materialStock()).find((x) => x.materialId === petg.id)!.physicalG).toBe(2000);
    await expect(voidPurchase(r2.id)).rejects.toThrow();
  });
  it('no se anula una compra cuyo material ya se usó', async () => {
    await consumeFromSpool({ spoolId: spoolIds[0], grams: 50, kind: 'consumo' });
    await expect(voidPurchase(purchaseId)).rejects.toThrow();
  });
  it('los insumos suman al stock y promedian el costo', async () => {
    const [it] = await db.insert(s.inventoryItems).values({ workspaceId: WORKSPACE_ID, name: 'Caja chica test', category: 'embalaje', unit: 'un', stock: 10, unitCost: 500, minStock: 5 }).returning();
    const r = await receivePurchase({ lines: [{ kind: 'item', itemId: it.id, qty: 10, unitPrice: 700 }] });
    const [after] = await db.select().from(s.inventoryItems).where(eq(s.inventoryItems.id, it.id)); expect(after.stock).toBe(20); expect(after.unitCost).toBe(600);
    expect((await listPurchases()).find((p) => p.id === r.id)!.spools).toBe(0);
    await voidPurchase(r.id); expect((await db.select().from(s.inventoryItems).where(eq(s.inventoryItems.id, it.id)))[0].stock).toBe(10);
  });
});

describe('materiales genéricos y disponibilidad', () => {
  it('se crean una vez, suman el stock de su tipo y no dan alerta', async () => {
    expect(await ensureGenericMaterials(db, true)).toBe(0);
    const gens = await db.select().from(s.materials).where(and(eq(s.materials.generic, true), isNull(s.materials.deletedAt))); expect(gens.map((g) => g.type).sort()).toEqual(['ABS', 'ASA', 'PA', 'PC', 'PETG', 'PLA', 'TPU']);
    const gen = gens.find((g) => g.type === 'PETG')!;
    const st = (await materialStock()).find((x) => x.materialId === gen.id)!;
    expect(st.physicalG).toBeGreaterThanOrEqual(1950); expect(st.low).toBe(false);
    expect(await materialCostPerKg(gen.id)).toBeGreaterThan(0);
    expect((await pickSpool(gen.id, 100))?.id).toBeTruthy();
    expect((await shoppingList()).every((x) => x.materialId !== gen.id)).toBe(true);
  });
  it('avisa sin bloquear: sin stock, insuficiente o suficiente', async () => {
    const [empty] = await db.insert(s.materials).values({ workspaceId: WORKSPACE_ID, type: 'PLA', colorName: 'Sin carretes', hex: '#ffffff', density: 1.24, costPerKg: 15000, stockMinG: 0 }).returning();
    expect((await checkAvailability(empty.id, 100)).state).toBe('none');
    expect((await checkAvailability(petg.id, 99999)).state).toBe('short');
    expect((await checkAvailability(petg.id, 100)).state).toBe('ok');
    expect((await checkAvailability(null, 100)).state).toBe('unknown');
  });
  it('cerrar un trabajo sin carrete deja el consumo registrado y avisa; iniciar sin stock también avisa', async () => {
    const [empty] = await db.insert(s.materials).values({ workspaceId: WORKSPACE_ID, type: 'PLA', colorName: 'Sin carretes 2', hex: '#eeeeee', density: 1.24, costPerKg: 15000, stockMinG: 0 }).returning();
    for (const j of await db.select().from(s.printJobs).where(and(inArray(s.printJobs.status, ['en_cola', 'imprimiendo', 'pausado']), isNull(s.printJobs.deletedAt)))) await cancelJob(j.id);
    const m = (await db.select().from(s.machines)).find((x) => !x.simulated && x.status !== 'fuera_de_servicio' && x.tech === 'FDM')!;
    const id = await createJob({ kind: 'prueba', title: 'sin carrete', materialId: empty.id, estG: 30, estH: 1, machineId: m.id });
    const st = await startJob(id, { machineId: m.id }); expect(st.warning).toMatchObject({ state: 'none' });
    await finishJob(id, { result: 'exito', realG: 33 });
    const mv = await db.select().from(s.inventoryMovements).where(eq(s.inventoryMovements.jobId, id));
    expect(mv).toHaveLength(1); expect(mv[0]).toMatchObject({ spoolId: null, kind: 'consumo', qty: -33 });
    const notes = await db.select().from(s.notifications).where(eq(s.notifications.kind, 'stock_bajo')); expect(notes.some((n) => n.body?.includes('33'))).toBe(true);
  });
});

describe('catálogo → mis filamentos, lista de compras e insumos por pedido', () => {
  it('agrega colores del catálogo sin carretes y repetir no duplica', async () => {
    const key = 'bambu_lab/ABS/abs';
    const a = await addCatalogColors(key, ['lavender']); expect(a).toMatchObject({ created: 1, spools: 0 });
    expect(a.materialIds).toHaveLength(1);
    const [m] = await db.select().from(s.materials).where(eq(s.materials.id, a.materialIds[0])); expect(m).toMatchObject({ variantId: `${key}/lavender`, packG: 1000 });
    expect((await materialStock()).find((x) => x.materialId === m.id)).toMatchObject({ physicalG: 0, spools: 0 });
    const b = await addCatalogColors(key, ['lavender']); expect(b).toMatchObject({ created: 0 });
    await expect(addCatalogColors(key, [])).rejects.toThrow();
  });
  it('desde un selector: sin cantidades queda en 0 g y avisa que falta; con cantidades carga el stock inicial', async () => {
    const key = 'bambu_lab/ABS/abs';
    const none = await addCatalogColorOwned(key, 'red'); expect(none).toMatchObject({ created: true, spools: 0 });
    const st0 = (await materialStock()).find((x) => x.materialId === none.materialId)!; expect(st0).toMatchObject({ physicalG: 0, spools: 0, low: true });
    expect((await checkAvailability(none.materialId, 50)).state).toBe('none');
    const some = await addCatalogColorOwned(key, 'white', { fullSpools: 2, openG: 300, costPerKg: 21000, stockMinG: 0 });
    expect(some).toMatchObject({ created: true, spools: 3 });
    const [m] = await db.select().from(s.materials).where(eq(s.materials.id, some.materialId)); expect(m).toMatchObject({ costPerKg: 21000, stockMinG: 0 });
    const st = (await materialStock()).find((x) => x.materialId === some.materialId)!; expect(st).toMatchObject({ physicalG: 2 * (m.packG ?? 1000) + 300, spools: 3, low: false });
    const open = (await db.select().from(s.spools).where(eq(s.spools.materialId, some.materialId))).filter((x) => x.status === 'abierta'); expect(open).toHaveLength(1); expect(open[0].remainingG).toBe(300);
    const movs = await db.select().from(s.inventoryMovements).where(eq(s.inventoryMovements.spoolId, open[0].id)); expect(movs.every((x) => x.kind === 'ajuste')).toBe(true);
  });
  it('desde un selector: si el color ya estaba no duplica ni vuelve a cargar stock', async () => {
    const key = 'bambu_lab/ABS/abs';
    const again = await addCatalogColorOwned(key, 'white', { fullSpools: 5 }); expect(again).toMatchObject({ created: false, spools: 0 });
    const spools = await db.select().from(s.spools).where(eq(s.spools.materialId, again.materialId)); expect(spools).toHaveLength(3);
    await expect(addCatalogColorOwned(key, 'no_existe')).rejects.toThrow();
  });
  it('la lista de compras pide carretes del tamaño habitual del filamento', async () => {
    await db.update(s.materials).set({ packG: 250, stockMinG: 1000 }).where(eq(s.materials.id, petg.id));
    await db.update(s.spools).set({ remainingG: 0, status: 'agotada' }).where(eq(s.spools.materialId, petg.id));
    const row = (await shoppingList()).find((x) => x.materialId === petg.id)!;
    expect(row.packG).toBe(250); expect(row.qty).toBe(8); // faltan 2000 g para llegar al doble del mínimo
  });
  it('las reglas de insumos descuentan al entregar y suman al costo real del pedido', async () => {
    const [it] = await db.insert(s.inventoryItems).values({ workspaceId: WORKSPACE_ID, name: 'Bolsa test', category: 'embalaje', unit: 'un', stock: 5, unitCost: 300, minStock: 1 }).returning();
    await saveSupplyRule({ itemId: it.id, qtyPerOrder: 2 });
    await expect(saveSupplyRule({ itemId: it.id, qtyPerOrder: 0 })).rejects.toThrow();
    const [o] = await db.select().from(s.orders).limit(1);
    const r = await applySupplyRules(o.id, o.number);
    expect(r.cost).toBeGreaterThanOrEqual(600);
    expect((await db.select().from(s.inventoryItems).where(eq(s.inventoryItems.id, it.id)))[0].stock).toBe(3);
    expect(typeof setOrderStatus).toBe('function');
  });
});
