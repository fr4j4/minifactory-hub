import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { seedDemo } from '@/lib/seed';
import { addPayment, cancelOrder, createOrder } from '@/lib/services/orders';
import { saveProduct, adjustStock } from '@/lib/services/catalog';
import { editRecord } from '@/lib/services/edits';
import { listArchived, restoreRecord } from '@/lib/services/archive';
import { removeRecord } from '@/lib/services/removal';

let admin: any; let db: Awaited<ReturnType<typeof getDb>>; let pla: any; let a1: any; let u: any;
const line = (o: any = {}) => ({ description: 'Pieza', qty: 1, materialId: pla.id, machineId: a1.id, mode: 'manual' as const, gramsTotal: 40, hoursTotal: 2, ...o });

beforeAll(async () => {
  fs.rmSync('data/test-storage', { recursive: true, force: true });
  await seedDemo(); db = await getDb();
  admin = (await db.select().from(s.users)).find((x) => x.role === 'admin'); u = { id: admin.id, role: 'admin', permOverrides: {} };
  pla = (await db.select().from(s.materials)).find((m) => m.type === 'PLA');
  a1 = (await db.select().from(s.machines))[0];
});

describe('editar registros ya creados', () => {
  it('corregir un pago recalcula lo pagado y descarta campos no permitidos', async () => {
    const oid = await createOrder({ customerName: 'Edit', items: [line()] }, u);
    await addPayment({ orderId: oid, amount: 1000, method: 'efectivo' }, u);
    const [p] = await db.select().from(s.payments).where(eq(s.payments.orderId, oid));
    await editRecord('payment', p.id, { amount: '1500', method: 'transferencia', orderId: 'otro', taxDocType: '' }, admin.id);
    const [after] = await db.select().from(s.payments).where(eq(s.payments.id, p.id));
    expect(after.amount).toBe(1500); expect(after.method).toBe('transferencia'); expect(after.orderId).toBe(oid);
    expect((await db.select().from(s.orders).where(eq(s.orders.id, oid)))[0].paid).toBe(1500);
    await expect(editRecord('payment', p.id, { amount: '-3' }, admin.id)).rejects.toThrow();
    await expect(editRecord('payment', p.id, { method: 'trueque' }, admin.id)).rejects.toThrow();
  });

  it('pedidos: se editan los datos, no si está cancelado', async () => {
    const oid = await createOrder({ customerName: 'Antes', items: [line()] }, u);
    await editRecord('order', oid, { customerName: 'Después', priority: 'alta', total: '1' }, admin.id);
    const [o] = await db.select().from(s.orders).where(eq(s.orders.id, oid));
    expect(o.customerName).toBe('Después'); expect(o.priority).toBe('alta'); expect(o.total).not.toBe(1);
    await cancelOrder(oid, 'x', u);
    await expect(editRecord('order', oid, { notes: 'n' }, admin.id)).rejects.toThrow();
  });

  it('planes: exigen tarea y un intervalo', async () => {
    const [pl] = await db.insert(s.maintenancePlans).values({ workspaceId: admin.workspaceId, machineId: a1.id, task: 'Lubricar', intervalHours: 100 } as any).returning();
    await editRecord('plan', pl.id, { task: 'Lubricar ejes', intervalHours: '200' }, admin.id);
    expect((await db.select().from(s.maintenancePlans).where(eq(s.maintenancePlans.id, pl.id)))[0]).toMatchObject({ task: 'Lubricar ejes', intervalHours: 200 });
    await expect(editRecord('plan', pl.id, { task: '  ' }, admin.id)).rejects.toThrow();
    await expect(editRecord('plan', pl.id, { intervalHours: '', intervalDays: '' }, admin.id)).rejects.toThrow();
  });
});

describe('archivados y restaurar', () => {
  it('un producto eliminado reaparece con sus variantes y su SKU original', async () => {
    const pid = await saveProduct({ name: 'Restaurable', mode: 'simple', price: 1000 }, u);
    const [v] = await db.select().from(s.productVariants).where(eq(s.productVariants.productId, pid));
    await removeRecord('product', pid, admin.id);
    expect((await listArchived('product')).some((r) => r.id === pid && r.name === 'Restaurable')).toBe(true);
    await expect(restoreRecord('variant', v.id, admin.id)).rejects.toThrow();
    await restoreRecord('product', pid, admin.id);
    const [back] = await db.select().from(s.productVariants).where(eq(s.productVariants.id, v.id));
    expect(back.deletedAt).toBeNull(); expect(back.sku).toBe(v.sku);
    expect((await db.select().from(s.products).where(eq(s.products.id, pid)))[0].deletedAt).toBeNull();
  });

  it('restaurar un pago recalcula lo pagado; un correo ocupado impide restaurar al usuario', async () => {
    const oid = await createOrder({ customerName: 'Pago', items: [line()] }, u);
    await addPayment({ orderId: oid, amount: 700, method: 'efectivo' }, u);
    const [p] = await db.select().from(s.payments).where(eq(s.payments.orderId, oid));
    await removeRecord('payment', p.id, admin.id);
    expect((await db.select().from(s.orders).where(eq(s.orders.id, oid)))[0].paid).toBe(0);
    await restoreRecord('payment', p.id, admin.id);
    expect((await db.select().from(s.orders).where(eq(s.orders.id, oid)))[0].paid).toBe(700);

    const [x] = await db.insert(s.users).values({ workspaceId: admin.workspaceId, email: 'dup@x.cl', name: 'Dup', role: 'ventas', passwordHash: 'x' } as any).returning();
    await removeRecord('user', x.id, admin.id);
    await db.insert(s.users).values({ workspaceId: admin.workspaceId, email: 'dup@x.cl', name: 'Nuevo', role: 'ventas', passwordHash: 'x' } as any);
    await expect(restoreRecord('user', x.id, admin.id)).rejects.toThrow();
  });
});
