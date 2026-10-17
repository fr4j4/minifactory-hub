import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { seedDemo } from '@/lib/seed';
import { addPayment, approveQuote, cancelOrder, createOrder } from '@/lib/services/orders';
import { saveQuote, sendQuote } from '@/lib/services/quotes';
import { adjustStock, saveProduct } from '@/lib/services/catalog';
import { removalInfo, removeRecord } from '@/lib/services/removal';

let admin: any; let db: Awaited<ReturnType<typeof getDb>>; let pla: any; let a1: any;
const line = (o: any = {}) => ({ description: 'Pieza', qty: 1, materialId: pla.id, machineId: a1.id, mode: 'manual' as const, gramsTotal: 40, hoursTotal: 2, ...o });
const blockKey = async (kind: any, id: string, actor?: string) => (await removalInfo(kind, id, actor)).block?.key;

beforeAll(async () => {
  fs.rmSync('data/test-storage', { recursive: true, force: true });
  await seedDemo(); db = await getDb();
  admin = (await db.select().from(s.users)).find((u) => u.role === 'admin');
  pla = (await db.select().from(s.materials).where(eq(s.materials.colorName, 'Negro'))).find((m) => m.type === 'PLA');
  a1 = (await db.select().from(s.machines)).find((m) => m.name.startsWith('Bambu'));
});

describe('eliminar y archivar', () => {
  it('un cliente con pedidos abiertos no se puede eliminar; sin ellos sí, y su historial queda', async () => {
    const [c] = await db.insert(s.customers).values({ workspaceId: admin.workspaceId, name: 'Cliente de prueba' }).returning();
    const oid = await createOrder({ customerId: c.id, customerName: c.name, items: [line()] }, { id: admin.id, role: 'admin', permOverrides: {} });
    expect(await blockKey('customer', c.id)).toBe('remove.block.customerOrders');
    await cancelOrder(oid, 'prueba', { id: admin.id, role: 'admin', permOverrides: {} } as any);
    expect((await removalInfo('customer', c.id)).canDelete).toBe(true);
    await removeRecord('customer', c.id, admin.id);
    expect((await db.select().from(s.customers).where(and(eq(s.customers.id, c.id), isNull(s.customers.deletedAt)))).length).toBe(0);
    expect((await db.select().from(s.orders).where(eq(s.orders.id, oid)))[0].customerName).toBe('Cliente de prueba');
  });

  it('solo se eliminan pedidos cancelados', async () => {
    const u = { id: admin.id, role: 'admin' as const, permOverrides: {} };
    const oid = await createOrder({ customerName: 'Otro', items: [line()] }, u);
    expect(await blockKey('order', oid)).toBe('remove.block.orderNotCancelled');
    await cancelOrder(oid, 'x', u as any); await removeRecord('order', oid, admin.id);
    expect((await db.select().from(s.orders).where(eq(s.orders.id, oid)))[0].deletedAt).not.toBeNull();
  });

  it('presupuestos: enviado y aprobado se bloquean; el borrador se elimina', async () => {
    const u = { id: admin.id, role: 'admin' as const, permOverrides: {} };
    const q = await saveQuote({ customerName: 'Q', items: [line()] }, u); expect((await removalInfo('quote', q)).canDelete).toBe(true);
    await sendQuote(q, admin.id); expect(await blockKey('quote', q)).toBe('remove.block.quoteSent');
    const d = await saveQuote({ customerName: 'Q2', items: [line()] }, u); await removeRecord('quote', d, admin.id);
    expect((await db.select().from(s.quotes).where(eq(s.quotes.id, d)))[0].deletedAt).not.toBeNull();
  });

  it('un presupuesto aprobado se bloquea mientras tenga pedidos; al eliminar el pedido queda libre y se puede eliminar (borrado lógico)', async () => {
    const u = { id: admin.id, role: 'admin' as const, permOverrides: {} };
    const q = await saveQuote({ customerName: 'Q aprobado', items: [line()] }, u); await sendQuote(q, admin.id);
    const oid = await approveQuote(q, { by: 'Cliente', channel: 'whatsapp' }, u);
    const num = (await db.select().from(s.orders).where(eq(s.orders.id, oid)))[0].number;
    const info = await removalInfo('quote', q); expect(info.block?.key).toBe('remove.block.quoteHasOrders'); expect(info.block?.params).toMatchObject({ count: 1, orders: num });
    await expect(removeRecord('quote', q, admin.id)).rejects.toThrow();
    expect(await blockKey('order', oid)).toBe('remove.block.orderNotCancelled'); // el pedido solo se elimina cancelado
    await cancelOrder(oid, 'datos mal ingresados', u as any);
    expect(await blockKey('quote', q)).toBe('remove.block.quoteHasOrders'); // cancelado pero aún no eliminado: sigue vigente
    await removeRecord('order', oid, admin.id);
    expect((await removalInfo('quote', q)).canDelete).toBe(true);
    await removeRecord('quote', q, admin.id);
    const [row] = await db.select().from(s.quotes).where(eq(s.quotes.id, q)); expect(row.deletedAt).not.toBeNull(); expect(row.status).toBe('aprobado'); // se conserva el registro
  });

  it('productos y variantes: se bloquean con stock y se eliminan liberando el SKU', async () => {
    const u = { id: admin.id, role: 'admin' as const, permOverrides: {} };
    const pid = await saveProduct({ name: 'Borrable', mode: 'simple', price: 1000 }, u);
    const [v] = await db.select().from(s.productVariants).where(eq(s.productVariants.productId, pid));
    await adjustStock({ variantId: v.id, kind: 'ajuste', qty: 3, reason: 'inicio' }, u);
    expect(await blockKey('product', pid)).toBe('remove.block.productStock');
    await adjustStock({ variantId: v.id, kind: 'merma', qty: 3, reason: 'cero' }, u);
    await removeRecord('product', pid, admin.id);
    expect((await db.select().from(s.products).where(eq(s.products.id, pid)))[0].deletedAt).not.toBeNull();
    const [gone] = await db.select().from(s.productVariants).where(eq(s.productVariants.id, v.id)); expect(gone.deletedAt).not.toBeNull(); expect(gone.sku).not.toBe(v.sku);
  });

  it('materiales: se bloquea con bobinas con material y se elimina junto a sus bobinas vacías', async () => {
    expect(await blockKey('material', pla.id)).toBe('remove.block.materialSpools');
    const [m] = await db.insert(s.materials).values({ workspaceId: admin.workspaceId, type: 'PLA', colorName: 'Prueba', hex: '#123456' } as any).returning();
    await removeRecord('material', m.id, admin.id);
    expect((await db.select().from(s.materials).where(eq(s.materials.id, m.id)))[0].deletedAt).not.toBeNull();
  });

  it('usuarios: no a uno mismo ni al último administrador; el eliminado libera su correo', async () => {
    expect(await blockKey('user', admin.id, admin.id)).toBe('remove.block.userSelf');
    const [extra] = await db.insert(s.users).values({ workspaceId: admin.workspaceId, email: 'otro@x.cl', name: 'Otro', role: 'ventas', passwordHash: 'x' } as any).returning();
    await removeRecord('user', extra.id, admin.id);
    const [u] = await db.select().from(s.users).where(eq(s.users.id, extra.id)); expect(u.deletedAt).not.toBeNull(); expect(u.email).not.toBe('otro@x.cl'); expect(u.active).toBe(false);
    const others = (await db.select().from(s.users)).filter((x) => x.role === 'admin' && x.active && !x.deletedAt && x.id !== admin.id);
    for (const o of others) await db.update(s.users).set({ active: false }).where(eq(s.users.id, o.id));
    expect(await blockKey('user', admin.id, 'otro')).toBe('remove.block.lastAdmin');
  });

  it('pagos: al eliminar uno se recalcula lo pagado del pedido', async () => {
    const u = { id: admin.id, role: 'admin' as const, permOverrides: {} };
    const oid = await createOrder({ customerName: 'Pagos', items: [line()] }, u);
    await addPayment({ orderId: oid, amount: 1000, method: 'efectivo' }, u as any); await addPayment({ orderId: oid, amount: 500, method: 'efectivo' }, u as any);
    const pays = await db.select().from(s.payments).where(eq(s.payments.orderId, oid));
    await removeRecord('payment', pays.find((p) => p.amount === 1000)!.id, admin.id);
    expect((await db.select().from(s.orders).where(eq(s.orders.id, oid)))[0].paid).toBe(500);
  });

  it('listas de precios y canales respetan sus dependencias', async () => {
    const used = (await db.select().from(s.priceLists))[0];
    const [c] = await db.select().from(s.customers).where(isNull(s.customers.deletedAt)).limit(1);
    await db.update(s.customers).set({ priceListId: used.id }).where(eq(s.customers.id, c.id));
    expect(await blockKey('priceList', used.id)).toBe('remove.block.priceListCustomers');
  });
});
