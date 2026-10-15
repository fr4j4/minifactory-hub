import { beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { seedDemo } from '@/lib/seed';
import { getSettings, saveSettings } from '@/lib/settings';
import { approveQuote, cancelOrder, createOrder, planProduction, setOrderStatus, addPayment } from '@/lib/services/orders';
import { loadQuote, newQuoteVersion, saveQuote, sendQuote } from '@/lib/services/quotes';
import { createProductionOrder, finishJob, startJob, maintenanceDue, checkMaintenance } from '@/lib/services/production';
import { createSale, saveProduct, setSaleStatus, adjustStock } from '@/lib/services/catalog';
import { materialStock, weighSpool, shoppingList } from '@/lib/services/inventory';
import { enqueueSlice, waitForRuns } from '@/lib/slicer/queue';
import { orcaAvailable } from '@/lib/slicer/catalog';
import { reportData, REPORTS } from '@/lib/reports';
import { dashboardData } from '@/lib/stats';

let admin: any, ventas: any, op: any; let db: Awaited<ReturnType<typeof getDb>>;
let pla: any, a1: any, ender: any;
const U = (u: any) => ({ id: u.id, role: u.role, permOverrides: {} });

beforeAll(async () => {
  fs.rmSync('data/test-storage', { recursive: true, force: true });
  await seedDemo(); db = await getDb();
  const users = await db.select().from(s.users);
  admin = U(users.find((u) => u.role === 'admin')); ventas = U(users.find((u) => u.role === 'ventas')); op = U(users.find((u) => u.role === 'operador'));
  pla = (await db.select().from(s.materials).where(eq(s.materials.colorName, 'Negro'))).find((m) => m.type === 'PLA');
  const ms = await db.select().from(s.machines); a1 = ms.find((m) => m.name.startsWith('Bambu')); ender = ms.find((m) => m.name.startsWith('Ender'));
});

const line = (o: any = {}) => ({ description: 'Pieza', qty: 1, materialId: pla.id, machineId: a1.id, mode: 'manual' as const, gramsTotal: 40, hoursTotal: 2, ...o });

describe('presupuestos: varios modelos, precio final y congelado', () => {
  it('un presupuesto puede tener varios modelos y links de referencia', async () => {
    const files = await db.select().from(s.modelFiles); const q = await saveQuote({ customerName: 'Cliente X', items: [
      line({ description: 'Barco + engranaje', qty: 2, models: [{ modelFileId: files[0].id, qty: 1 }, { modelFileId: files[1].id, qty: 2 }], links: [{ url: 'printables.com/model/123', title: 'Barco', kind: 'modelo_original' }] }),
      line({ description: 'Llavero', qty: 10, models: [{ modelFileId: files[2].id }] }), line({ description: 'Soporte', qty: 1, models: [] }) ],
      links: [{ url: 'https://www.instagram.com/p/abc', title: 'Inspiración', kind: 'inspiracion', showInPdf: true }] }, admin);
    const d = (await loadQuote(q))!;
    expect(d.items.length).toBe(3); expect(d.models.filter((m) => m.qm.quoteItemId === d.items[0].id).length).toBe(2);
    expect(d.links.filter((l) => l.ownerType === 'quote').length).toBe(1); expect(d.links.some((l) => l.ownerType === 'quote_item' && l.url.startsWith('https://printables.com'))).toBe(true);
    expect(d.quote.total).toBeGreaterThan(0); expect(d.quote.number).toMatch(/^P-\d{4}-\d{4}$/);
  });
  it('el precio final lo decide el usuario aunque haya sugerido', async () => {
    const id = await saveQuote({ items: [line({ finalUnit: 25000 })] }, admin); const d = (await loadQuote(id))!;
    expect(d.items[0].finalUnit).toBe(25000); expect(d.items[0].suggestedUnit).not.toBe(25000);
    const adj = await db.select().from(s.priceAdjustments).where(eq(s.priceAdjustments.ownerId, d.items[0].id)); expect(adj.length).toBe(1); expect(adj[0].next).toBe(25000);
  });
  it('un total fijado por el usuario se reparte entre las líneas', async () => {
    const id = await saveQuote({ finalTotal: 50000, items: [line({ qty: 1 }), line({ qty: 2, gramsTotal: 80, hoursTotal: 4 })] }, admin); const d = (await loadQuote(id))!;
    expect(d.quote.total).toBe(50000); expect((d.quote.calc as any).lines.reduce((a: number, l: any) => a + l.finalTotal, 0)).toBe(50000);
  });
  it('vender bajo el costo: Ventas no puede; el Administrador sí, con motivo', async () => {
    await expect(saveQuote({ items: [line({ finalUnit: 500 })] }, ventas)).rejects.toThrow(/bajo el costo/);
    await expect(saveQuote({ items: [line({ finalUnit: 500 })] }, admin)).rejects.toThrow(/motivo/);
    const id = await saveQuote({ priceReason: 'Cliente fundador', items: [line({ finalUnit: 500 })] }, admin); expect(id).toBeTruthy();
  });
  it('cambiar la tarifa de kWh no altera los presupuestos ya enviados', async () => {
    const id = await saveQuote({ items: [line({ gramsTotal: 200, hoursTotal: 10 })] }, admin); await sendQuote(id, admin.id);
    const before = (await loadQuote(id))!.quote.total; const st = await getSettings();
    await saveSettings({ rates: { ...st.rates, kwh: st.rates.kwh * 10, laborHour: st.rates.laborHour * 3 } });
    expect((await loadQuote(id))!.quote.total).toBe(before);
    await expect(saveQuote({ id, items: [line()] }, admin)).rejects.toThrow(/nueva versión/);
    const v2 = await newQuoteVersion(id, admin, true); const d2 = (await loadQuote(v2))!;
    expect(d2.quote.version).toBe(2); expect(d2.quote.number).toBe((await loadQuote(id))!.quote.number); expect(d2.quote.total).toBeGreaterThan(before); expect((await loadQuote(id))!.quote.status).toBe('reemplazado');
    await saveSettings({ rates: st.rates });
  });
});

describe('aprobación manual → pedido → producción → inventario', () => {
  it('flujo completo con consumo de bobina, falla con reimpresión y estados derivados', async () => {
    const spool = (await db.select().from(s.spools).where(and(eq(s.spools.materialId, pla.id), eq(s.spools.status, 'en_uso'))))[0]; const before = spool.remainingG;
    const q = await saveQuote({ customerName: 'Ana', customerPhone: '+56911111111', source: 'whatsapp', items: [line({ description: 'Carcasa', qty: 3, gramsTotal: 90, hoursTotal: 4.5, finalUnit: 12000 })] }, admin);
    const oid = await approveQuote(q, { by: 'Ana', channel: 'whatsapp', deposit: { amount: 10000, method: 'transferencia' } }, admin);
    const [o] = await db.select().from(s.orders).where(eq(s.orders.id, oid)); const [qq] = await db.select().from(s.quotes).where(eq(s.quotes.id, q));
    expect(qq.status).toBe('aprobado'); expect(o.total).toBe(qq.total); expect(o.paid).toBe(10000); expect(o.status).toBe('recibido'); expect(o.approvedBy).toBe('Ana');
    const items = await db.select().from(s.orderItems).where(eq(s.orderItems.orderId, oid)); expect(items[0].finalUnit).toBe(12000);
    const jobIds = await planProduction(oid, admin); expect(jobIds.length).toBe(1);
    expect((await db.select().from(s.orders).where(eq(s.orders.id, oid)))[0].status).toBe('en_produccion');
    expect((await materialStock(db)).find((x) => x.materialId === pla.id)!.reservedG).toBeGreaterThanOrEqual(90);
    await startJob(jobIds[0], { userId: admin.id });
    // falla total: consume material, crea reimpresión
    const f = await finishJob(jobIds[0], { result: 'falla_total', realG: 30, failCause: 'Despegue de la cama', failCharge: 'taller', userId: admin.id });
    expect(f.reprintId).toBeTruthy(); expect((await db.select().from(s.printJobs).where(eq(s.printJobs.id, f.reprintId!)))[0].reprintOfId).toBe(jobIds[0]);
    expect((await db.select().from(s.spools).where(eq(s.spools.id, spool.id)))[0].remainingG).toBeCloseTo(before - 30, 1);
    expect((await db.select().from(s.inventoryMovements).where(and(eq(s.inventoryMovements.spoolId, spool.id), eq(s.inventoryMovements.kind, 'falla')))).length).toBe(1);
    // reimpresión exitosa
    await startJob(f.reprintId!, { userId: admin.id }); const ok = await finishJob(f.reprintId!, { result: 'exito', realG: 92, realH: 4.7, userId: admin.id });
    expect((await db.select().from(s.spools).where(eq(s.spools.id, spool.id)))[0].remainingG).toBeCloseTo(before - 30 - 92, 1);
    const [o2] = await db.select().from(s.orders).where(eq(s.orders.id, oid)); expect(o2.status).toBe('post_proceso'); expect(o2.costReal).toBeGreaterThan(0);
    const [m] = await db.select().from(s.machines).where(eq(s.machines.id, a1.id)); expect(m.jobsFailed).toBeGreaterThanOrEqual(1); expect(m.jobsOk).toBeGreaterThanOrEqual(1);
    await setOrderStatus(oid, 'listo', admin); await addPayment({ orderId: oid, amount: o.total - 10000, method: 'efectivo' }, admin); await setOrderStatus(oid, 'entregado', admin, { tracking: 'ABC123' });
    const fin = (await db.select().from(s.orders).where(eq(s.orders.id, oid)))[0]; expect(fin.status).toBe('entregado'); expect(fin.paid).toBe(o.total); expect(fin.tracking).toBe('ABC123');
  });
  it('al terminar un trabajo y quedar bajo el mínimo se genera la alerta de stock bajo', async () => {
    const mat = (await db.select().from(s.materials).where(eq(s.materials.colorName, 'Transparente')))[0];
    const id = await createOrder({ customerName: 'Luis', items: [line({ materialId: mat.id, gramsTotal: 100, hoursTotal: 3 })] }, admin);
    const [j] = (await planProduction(id, admin)); await startJob(j, { userId: admin.id }); await finishJob(j, { result: 'exito', realG: 100, userId: admin.id });
    const n = await db.select().from(s.notifications).where(eq(s.notifications.kind, 'stock_bajo')); expect(n.some((x) => x.title.includes('Transparente'))).toBe(true);
    expect((await shoppingList()).some((x) => x.name.includes('Transparente'))).toBe(true);
  });
  it('cancelar un pedido libera material y stock reservados', async () => {
    const id = await createOrder({ customerName: 'Pía', items: [line({ gramsTotal: 500, hoursTotal: 20 })] }, admin); await planProduction(id, admin);
    const r1 = (await materialStock(db)).find((x) => x.materialId === pla.id)!.reservedG; await cancelOrder(id, 'El cliente desistió', admin);
    const r2 = (await materialStock(db)).find((x) => x.materialId === pla.id)!.reservedG; expect(r1 - r2).toBeGreaterThanOrEqual(500);
  });
  it('pesaje: se resta la tara y se registra el ajuste', async () => {
    const sp = (await db.select().from(s.spools).where(eq(s.spools.status, 'abierta')))[0]; const r = await weighSpool(sp.id, 600 + sp.tareG, admin.id);
    expect(r.after).toBe(600); expect((await db.select().from(s.spools).where(eq(s.spools.id, sp.id)))[0].remainingG).toBe(600);
  });
  it('mantenimiento por horas: aviso al cumplirse las horas de la máquina', async () => {
    const [m] = await db.select().from(s.machines).where(eq(s.machines.id, ender.id)); await db.update(s.machines).set({ hoursTotal: 250 }).where(eq(s.machines.id, ender.id));
    const due = await maintenanceDue(); expect(due.some((d) => d.machineId === ender.id)).toBe(true); await checkMaintenance(ender.id);
    expect((await db.select().from(s.notifications).where(eq(s.notifications.kind, 'mantenimiento'))).length).toBeGreaterThan(0);
  });
});

describe('catálogo: productos con variantes, stock y ventas', () => {
  let variantIds: string[] = []; let productId = '';
  it('producto con variantes genera las combinaciones y uno simple, una referencia', async () => {
    productId = await saveProduct({ name: 'Posavasos', mode: 'variantes', attributes: [{ name: 'Color', values: ['Negro', 'Rojo'] }, { name: 'Forma', values: ['Redondo', 'Cuadrado', 'Hexagonal'] }], price: 2990, materialId: pla.id, weightG: 12, printH: 0.4, minStock: 5 }, admin);
    const v = await db.select().from(s.productVariants).where(eq(s.productVariants.productId, productId)); expect(v.length).toBe(6); variantIds = v.map((x) => x.id); expect(new Set(v.map((x) => x.sku)).size).toBe(6);
    const simple = await saveProduct({ name: 'Maceta simple', mode: 'simple', price: 5990 }, admin); expect((await db.select().from(s.productVariants).where(eq(s.productVariants.productId, simple))).length).toBe(1);
    await saveProduct({ id: productId, name: 'Posavasos', mode: 'variantes', attributes: [{ name: 'Color', values: ['Negro', 'Rojo', 'Azul'] }, { name: 'Forma', values: ['Redondo', 'Cuadrado', 'Hexagonal'] }] }, admin);
    expect((await db.select().from(s.productVariants).where(and(eq(s.productVariants.productId, productId), eq(s.productVariants.active, true)))).length).toBe(9);
  });
  it('producción para stock: al terminar suma unidades buenas y calcula el costo promedio', async () => {
    const po = await createProductionOrder({ variantId: variantIds[0], qty: 10, userId: admin.id }); await startJob(po.jobId, { userId: admin.id });
    await finishJob(po.jobId, { result: 'falla_parcial', realG: 120, realH: 4, qtyGood: 8, failCause: 'Warping', reprint: false, userId: admin.id });
    const [v] = await db.select().from(s.productVariants).where(eq(s.productVariants.id, variantIds[0])); expect(v.stock).toBe(8); expect(v.avgCost).toBeGreaterThan(0);
    const mv = await db.select().from(s.stockMovements).where(eq(s.stockMovements.variantId, variantIds[0])); expect(mv.some((m) => m.kind === 'produccion' && m.qty === 8)).toBe(true);
    const [p] = await db.select().from(s.productionOrders).where(eq(s.productionOrders.id, po.productionOrderId)); expect(p.qtyGood).toBe(8); expect(p.qtyFailed).toBe(2);
  });
  it('venta rápida de marketplace: descuenta stock y calcula comisión y margen neto; anular reingresa', async () => {
    const ml = (await db.select().from(s.salesChannels).where(eq(s.salesChannels.name, 'Mercado Libre')))[0]; const [v0] = await db.select().from(s.productVariants).where(eq(s.productVariants.id, variantIds[0]));
    const r = await createSale({ channelId: ml.id, items: [{ variantId: variantIds[0], qty: 3 }], externalOrder: 'ML-12345' }, ventas);
    expect(r.subtotal).toBe(v0.price * 3); expect(r.commission).toBe(Math.round(r.subtotal * 0.12 + 700)); expect(r.netMargin).toBe(r.subtotal - r.commission - ml.avgShipping - v0.avgCost * 3);
    expect((await db.select().from(s.productVariants).where(eq(s.productVariants.id, variantIds[0])))[0].stock).toBe(v0.stock - 3);
    const [sale] = await db.select().from(s.sales).where(eq(s.sales.id, r.id)); expect(sale.status).toBe('por_despachar');
    await expect(setSaleStatus(r.id, 'anulada', ventas)).rejects.toThrow(/motivo/); await setSaleStatus(r.id, 'anulada', ventas, { reason: 'Devolución', returnToStock: true });
    expect((await db.select().from(s.productVariants).where(eq(s.productVariants.id, variantIds[0])))[0].stock).toBe(v0.stock);
  });
  it('pedido mixto: reserva stock, produce solo lo que falta y descuenta al entregar', async () => {
    const [v] = await db.select().from(s.productVariants).where(eq(s.productVariants.id, variantIds[0])); expect(v.stock).toBeGreaterThanOrEqual(5);
    const oid = await createOrder({ customerName: 'Mixto', items: [line({ description: 'Pieza a medida' }), { description: 'Posavasos', qty: v.stock + 2, variantId: variantIds[0], kind: 'producto' as const }] }, admin);
    const [o] = await db.select().from(s.orders).where(eq(s.orders.id, oid)); expect(o.kind).toBe('mixto');
    const oi = (await db.select().from(s.orderItems).where(eq(s.orderItems.orderId, oid))).find((i) => i.variantId)!; expect(oi.fromStock).toBe(v.stock);
    expect((await db.select().from(s.productVariants).where(eq(s.productVariants.id, variantIds[0])))[0].reserved).toBe(v.stock);
    const jobs = await planProduction(oid, admin); expect(jobs.length).toBe(2);
    for (const j of jobs) { await startJob(j, { userId: admin.id }); await finishJob(j, { result: 'exito', userId: admin.id }); }
    await setOrderStatus(oid, 'listo', admin); await setOrderStatus(oid, 'entregado', admin);
    const [after] = await db.select().from(s.productVariants).where(eq(s.productVariants.id, variantIds[0])); expect(after.reserved).toBe(0); expect(after.stock).toBe(0);
  });
  it('ajustes de stock exigen motivo y no dejan negativos', async () => {
    await expect(adjustStock({ variantId: variantIds[1], kind: 'ajuste', qty: 4 }, admin)).rejects.toThrow(/motivo/); await adjustStock({ variantId: variantIds[1], kind: 'ajuste', qty: 4, reason: 'Conteo' }, admin);
    await expect(adjustStock({ variantId: variantIds[1], kind: 'merma', qty: 10, reason: 'x' }, admin)).rejects.toThrow(/negativo/);
  });
});

describe('reportes y dashboard', () => {
  it('todos los reportes se generan', async () => { for (const k of Object.keys(REPORTS)) { const d = await reportData(k, { from: new Date(Date.now() - 120 * 86400_000), to: new Date() }, true); expect(d.columns.length).toBeGreaterThan(2); } });
  it('el dashboard calcula indicadores y alertas', async () => { const d = await dashboardData(); expect(d.ind.revenue).toBeGreaterThan(0); expect(d.val.total).toBeGreaterThan(0); expect(d.lowMaterials.length + d.lowItems.length + d.maint.length).toBeGreaterThan(0); });
  it('Ventas solo ve sus propias ventas', async () => { const all = await reportData('ventas', { from: new Date(Date.now() - 365 * 86400_000), to: new Date() }, true); const mine = await reportData('ventas', { from: new Date(Date.now() - 365 * 86400_000), to: new Date() }, true, ventas.id); expect(mine.rows.reduce((a, r) => a + r.revenue, 0)).toBeLessThan(all.rows.reduce((a, r) => a + r.revenue, 0)); });
});

describe.skipIf(!orcaAvailable())('laminador (OrcaSlicer real)', () => {
  it('lamina, es determinista, usa caché, cotiza por placa y detecta piezas que no caben', async () => {
    const profs = await db.select().from(s.slicerProfiles); const P = (n: string) => profs.find((p) => p.name === n)!.id;
    const [bar] = await db.select().from(s.modelFiles).where(eq(s.modelFiles.name, 'Barquito decorativo')); const [big] = await db.select().from(s.modelFiles).where(eq(s.modelFiles.name, 'Placa grande 300 mm'));
    const base = { fileVersionId: bar.currentVersionId!, machineProfileId: P('Bambu Lab A1 0.4'), processProfileId: P('A1 · 0,20 Standard'), filamentProfileId: P('PLA Basic') };
    const r1 = await enqueueSlice({ ...base, label: 't1' }); const r2 = await enqueueSlice({ ...base, copies: 4, label: 't4' }); const r3 = await enqueueSlice({ ...base, processProfileId: P('A1 · 0,12 Fine'), label: 'fine' });
    const rows = await waitForRuns([r1, r2, r3], 120000); const [a, c4, fine] = rows;
    expect(a.status).toBe('done'); expect(a.timeS).toBeGreaterThan(600); expect(a.filament![0].g).toBeGreaterThan(3); expect(a.layers).toBe(164); expect(a.engineVersion).toBe('2.4.2');
    expect(fine.layers).toBeGreaterThan(a.layers!); expect(fine.timeS).toBeGreaterThan(a.timeS!);
    expect(c4.timeS!).toBeLessThan(a.timeS! * 4); expect(c4.filament![0].g).toBeGreaterThan(a.filament![0].g * 3.5);
    const again = (await waitForRuns([await enqueueSlice({ ...base, label: 'cache' })]))[0]; expect((again.result as any).cached).toBe(true); expect(again.timeS).toBe(a.timeS);
    const forced = (await waitForRuns([await enqueueSlice({ ...base, label: 'forced', force: true })]))[0];
    const { getBuffer } = await import('@/lib/storage'); const sha = async (k: string) => crypto.createHash('sha256').update((await getBuffer(k)).toString().split('\n').filter((l) => !l.startsWith('; generated by') && !l.startsWith('; HEADER_BLOCK')).join('\n')).digest('hex');
    expect(await sha(forced.gcodeKey!)).toBe(await sha(a.gcodeKey!));
    const big1 = (await waitForRuns([await enqueueSlice({ fileVersionId: big.currentVersionId!, machineProfileId: P('Ender-3 V3 SE 0.4'), processProfileId: P('Ender · 0,20 Standard'), filamentProfileId: P('PLA genérico Ender'), label: 'grande' })]))[0];
    expect(big1.status).toBe('error'); expect(big1.error).toMatch(/no cabe/);
  });
});

describe.skipIf(!orcaAvailable())('orientación automática (P5)', () => {
  it('--orient lamina de verdad y se separa en la caché del laminado sin orientar', async () => {
    const profs = await db.select().from(s.slicerProfiles); const P = (n: string) => profs.find((p) => p.name === n)!.id;
    const [bar] = await db.select().from(s.modelFiles).where(eq(s.modelFiles.name, 'Barquito decorativo'));
    const base = { fileVersionId: bar.currentVersionId!, machineProfileId: P('Bambu Lab A1 0.4'), processProfileId: P('A1 · 0,20 Standard'), filamentProfileId: P('PLA Basic') };
    const [plain, oriented] = await waitForRuns([await enqueueSlice({ ...base, label: 'sin orientar' }), await enqueueSlice({ ...base, orient: true, label: 'orientado' })], 180000);
    expect(plain.status).toBe('done'); expect(oriented.status).toBe('done');
    expect((oriented.result as any).cached).not.toBe(true); expect((oriented.inputs as any).orient).toBe(true);
  });
});

describe('alta masiva de filamentos (N4)', async () => {
  const { planBulkMaterials, applyBulkMaterials } = await import('@/lib/services/inventory');
  const common = { manufacturer: 'Cicla 3D', line: 'PLA reciclado', type: 'PLA', diameter: 1.75, density: 1.24, costPerKg: 14000, netG: 1000, tareG: 200 };
  it('vista previa detecta repetidos y existentes; aplicar crea materiales y bobinas', async () => {
    const rows = [{ colorName: 'Verde', hex: '#2f9d4b', spools: 2 }, { colorName: 'verde ', hex: '#2f9d4b', spools: 1 }, { colorName: 'Beige', hex: '#e3d3b0', spools: 0 }];
    const p = await planBulkMaterials(common, rows);
    expect(p.items.map((i) => i.status)).toEqual(['new', 'repeat', 'new']); expect(p.newMaterials).toBe(2); expect(p.spools).toBe(2);
    const r = await applyBulkMaterials(common, rows);
    expect(r).toMatchObject({ created: 2, spools: 2 });
    const again = await planBulkMaterials(common, rows);
    expect(again.items.map((i) => i.status)).toEqual(['exists', 'repeat', 'exists']);
    const r2 = await applyBulkMaterials(common, [{ colorName: 'Verde', hex: '#000', spools: 1 }]); // ya existe: solo ingresa bobina
    expect(r2).toMatchObject({ created: 0, existing: 1, spools: 1 });
  });
});

describe('directorio de proveedores (N4b)', () => {
  it('se siembra una vez, con el origen sin verificar, y la bobina recuerda dónde se compró', async () => {
    const { seedSuppliers, listSuppliers, createSpool } = await import('@/lib/services/inventory');
    const list = await listSuppliers();
    expect(list.length).toBeGreaterThan(20); expect(list.every((x) => !x.verified)).toBe(true);
    expect(await seedSuppliers()).toBe(0); // idempotente
    expect(list[0].country).toBe('CL'); // primero los de Chile
    const todo = list.find((x) => x.name === 'TodoToner')!;
    const dbx = await getDb(); const [mat] = await dbx.select().from(s.materials).limit(1);
    const sp = await createSpool({ materialId: mat.id, supplierId: todo.id });
    expect(sp.supplierId).toBe(todo.id);
    const [mv] = await dbx.select().from(s.inventoryMovements).where(eq(s.inventoryMovements.spoolId, sp.id));
    expect(String(mv.note)).toContain('TodoToner');
  });
});

describe('documento de cliente congelado al enviar (N7)', () => {
  it('al enviar un presupuesto se guarda la plantilla vigente y no cambia si el taller la edita después', async () => {
    const { saveSettings } = await import('@/lib/settings');
    const { sendQuote } = await import('@/lib/services/quotes');
    const dbx = await getDb(); const [qq] = await dbx.select().from(s.quotes).where(eq(s.quotes.status, 'borrador')).limit(1);
    if (!qq) return; // la semilla trae al menos uno; si no, no hay nada que probar
    await saveSettings({ documents: { quote: { footer: 'Gracias por confiar en nosotros' } } });
    const [u] = await dbx.select().from(s.users).limit(1);
    await sendQuote(qq.id, u.id);
    await saveSettings({ documents: { quote: { footer: 'OTRO PIE' } } });
    const [after] = await dbx.select().from(s.quotes).where(eq(s.quotes.id, qq.id));
    expect((after.docTemplate as any).footer).toBe('Gracias por confiar en nosotros');
  });
});

describe('origen y etiquetas del modelo (N2/N3)', () => {
  it('registrar el origen guarda metadatos, licencia normalizada y etiquetas del sitio con procedencia', async () => {
    const { attachSource } = await import('@/lib/library/import');
    const dbx = await getDb(); const [mf] = await dbx.select().from(s.modelFiles).limit(1);
    const html = '<meta property="og:title" content="Soporte de celular"><meta property="og:description" content="Un soporte"><meta property="og:image" content="https://cdn.ejemplo/x.jpg"><meta name="keywords" content="soporte, celular"><script type="application/ld+json">{"license":"CC BY-NC 4.0","author":{"name":"Ana"}}</script>';
    const getter = (async (u: string) => ({ status: 200, body: html, finalUrl: u, contentType: 'text/html' })) as any;
    const r = await attachSource(mf.id, 'https://ejemplo.cl/pieza/1', null, getter);
    expect(r).toMatchObject({ status: 'parcial', license: 'cc-by-nc', commercial: 'no', title: 'Soporte de celular' });
    const [after] = await dbx.select().from(s.modelFiles).where(eq(s.modelFiles.id, mf.id));
    expect(after.license).toBe('cc-by-nc'); expect(after.author).toBeTruthy(); expect(after.sourceId).toBe(r.sourceId);
    expect(after.tags).toEqual(expect.arrayContaining(['soporte', 'celular'])); expect(after.tagMeta!['soporte']).toMatchObject({ source: 'import' });
    const again = await attachSource(mf.id, 'https://ejemplo.cl/pieza/1', null, getter); // actualizar no duplica
    expect(again.sourceId).toBe(r.sourceId);
    await expect(attachSource(mf.id, 'javascript:alert(1)', null, getter)).rejects.toThrow();
  });
});

describe('biblioteca: ZIP y acciones masivas (R4)', () => {
  it('un ZIP crea un modelo por archivo compatible y usa las carpetas internas', async () => {
    const fsx = await import('node:fs'); const { zipSync } = await import('fflate'); const { ingestZip } = await import('@/lib/files');
    const stl = new Uint8Array(fsx.readFileSync('samples/engranaje.stl')); const dbx = await getDb(); const [u] = await dbx.select().from(s.users).limit(1);
    const z = zipSync({ 'pack/llaveros/a.stl': stl, 'pack/b.stl': stl, '__MACOSX/pack/._a.stl': stl, 'leeme.txt': new Uint8Array([1, 2]), '../../etc/x.stl': stl });
    fsx.writeFileSync('data/test-data-pack.zip', z);
    const r = await ingestZip({ tmpPath: 'data/test-data-pack.zip', filename: 'pack.zip', userId: u.id, folder: 'Importados' });
    expect(r.created).toBe(2);
    const rows = await dbx.select().from(s.modelFiles).where(eq(s.modelFiles.format, 'stl'));
    const folders = rows.filter((m) => ['a', 'b'].includes(m.name)).map((m) => m.folder).sort();
    expect(folders).toEqual(['Importados/pack', 'Importados/pack/llaveros']);
  });
});

describe('recuperación de análisis interrumpidos (P0)', () => {
  it('una versión que quedó en «processing» se vuelve a analizar al arrancar', async () => {
    const { recoverPendingVersions } = await import('@/lib/files');
    const dbx = await getDb(); const [v] = await dbx.select().from(s.fileVersions).where(eq(s.fileVersions.format, 'stl')).limit(1);
    await dbx.update(s.fileVersions).set({ meta: { status: 'processing' } }).where(eq(s.fileVersions.id, v.id));
    expect(await recoverPendingVersions()).toBeGreaterThanOrEqual(1);
    const [after] = await dbx.select().from(s.fileVersions).where(eq(s.fileVersions.id, v.id));
    expect((after.meta as any).status).toBe('ready');
  });
});

describe('eliminar un material en uso (F0.2)', () => {
  it('se bloquea mientras un presupuesto abierto lo usa y se puede reemplazar por otro', async () => {
    const { removalInfo, replaceAndRemoveMaterial } = await import('@/lib/services/removal');
    const [cand] = await db.select().from(s.materials).where(and(eq(s.materials.type, 'PETG'), isNull(s.materials.deletedAt))).limit(1);
    const spare = (await db.select().from(s.materials).where(isNull(s.materials.deletedAt))).find((m) => m.id !== cand.id && m.id !== pla.id)!;
    // sin bobinas con material: la única razón para bloquear es el presupuesto
    await db.update(s.spools).set({ remainingG: 0 }).where(eq(s.spools.materialId, cand.id));
    const q = await saveQuote({ customerName: 'Cliente Y', items: [line({ materialId: cand.id })] }, admin);
    const info = await removalInfo('material', cand.id);
    expect(info.canDelete).toBe(false); expect(info.block?.key).toBe('remove.block.materialUsed');
    await replaceAndRemoveMaterial(cand.id, spare.id, admin.id);
    const d = (await loadQuote(q))!; expect(d.items[0].materialId).toBe(spare.id);
    const [gone] = await db.select().from(s.materials).where(eq(s.materials.id, cand.id)); expect(gone.deletedAt).not.toBeNull();
  });
});

describe('recalcular con tarifas actuales (P2)', () => {
  it('la vista previa compara el precio guardado con el de las tarifas vigentes', async () => {
    const { previewRecalc } = await import('@/lib/services/quotes');
    const q = await saveQuote({ customerName: 'Cliente Z', items: [line({ gramsTotal: 100, hoursTotal: 3 })] }, admin);
    await sendQuote(q, admin.id);
    const st = await getSettings(); const before = await previewRecalc(q); expect(before!.delta).toBe(0);
    await saveSettings({ rates: { ...st.rates, marginPct: st.rates.marginPct + 20 } });
    const after = await previewRecalc(q); expect(after!.delta).toBeGreaterThan(0); expect(after!.lines[0].newUnit).toBeGreaterThan(after!.lines[0].oldUnit);
    await saveSettings({ rates: st.rates });
  });
});

describe('avisos de seguimiento de presupuestos (P3)', () => {
  it('avisa una vez por plazo cuando un presupuesto enviado sigue sin respuesta', async () => {
    const { followUpQuotes } = await import('@/lib/services/quotes');
    const q = await saveQuote({ customerName: 'Cliente Seguimiento', items: [line()] }, admin); await sendQuote(q, admin.id);
    expect(await followUpQuotes(new Date())).toBe(0);
    const in4 = new Date(Date.now() + 4 * 86400_000);
    expect(await followUpQuotes(in4)).toBeGreaterThanOrEqual(1);
    expect(await followUpQuotes(in4)).toBe(0); // no repite el mismo plazo
    const ns = await db.select().from(s.notifications).where(eq(s.notifications.kind, 'seguimiento')); expect(ns.some((n) => n.href === `/presupuestos/${q}`)).toBe(true);
  });
});

describe('papelera de archivos 3D (P4)', () => {
  it('un archivo eliminado aparece en archivados y se restaura', async () => {
    const { removeRecord } = await import('@/lib/services/removal'); const { listArchived, restoreRecord } = await import('@/lib/services/archive');
    const [f] = await db.select().from(s.modelFiles).where(isNull(s.modelFiles.deletedAt)).limit(1);
    await removeRecord('file', f.id, admin.id);
    expect((await listArchived('file')).some((r) => r.id === f.id)).toBe(true);
    await restoreRecord('file', f.id, admin.id);
    const [back] = await db.select().from(s.modelFiles).where(eq(s.modelFiles.id, f.id)); expect(back.deletedAt).toBeNull();
  });
});

describe('edición masiva por línea de filamento (P2)', () => {
  it('cambia costo y stock mínimo de todos los colores de una marca + línea', async () => {
    const { bulkUpdateLine } = await import('@/lib/services/inventory');
    const [m] = await db.select().from(s.materials).where(and(isNull(s.materials.deletedAt), eq(s.materials.manufacturer, 'Cicla 3D'))).limit(1);
    const target = m ?? (await db.select().from(s.materials).where(isNull(s.materials.deletedAt)))[0];
    const n = await bulkUpdateLine({ manufacturer: target.manufacturer, line: target.line }, { costPerKg: 12345, stockMinG: 777 }, admin.id);
    expect(n).toBeGreaterThanOrEqual(1);
    const rows = await db.select().from(s.materials).where(and(isNull(s.materials.deletedAt), target.manufacturer ? eq(s.materials.manufacturer, target.manufacturer) : isNull(s.materials.manufacturer), target.line ? eq(s.materials.line, target.line) : isNull(s.materials.line)));
    expect(rows.every((r) => r.costPerKg === 12345 && r.stockMinG === 777)).toBe(true);
    expect(await bulkUpdateLine({ manufacturer: target.manufacturer, line: target.line }, {}, admin.id)).toBe(0);
  });
});
