import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { seedDemo } from '@/lib/seed';
import { cancelOrder, createOrder, planProduction, setOrderStatus } from '@/lib/services/orders';
import { cancelJob, createJob, finishJob, moveJob, startJob } from '@/lib/services/production';

let admin: any; let db: Awaited<ReturnType<typeof getDb>>; let pla: any; let a1: any; let ender: any;
const U = (u: any) => ({ id: u.id, role: u.role, permOverrides: {} });
const line = (o: any = {}) => ({ description: 'Pieza', qty: 1, materialId: pla.id, machineId: a1.id, mode: 'manual' as const, gramsTotal: 40, hoursTotal: 2, ...o });
const order = async (id: string) => (await db.select().from(s.orders).where(eq(s.orders.id, id)))[0];
const job = async (id: string) => (await db.select().from(s.printJobs).where(eq(s.printJobs.id, id)))[0];

beforeAll(async () => {
  fs.rmSync('data/test-storage', { recursive: true, force: true });
  await seedDemo(); db = await getDb();
  admin = U((await db.select().from(s.users)).find((u) => u.role === 'admin'));
  pla = (await db.select().from(s.materials).where(eq(s.materials.colorName, 'Negro'))).find((m) => m.type === 'PLA');
  const ms = await db.select().from(s.machines); a1 = ms.find((m) => m.name.startsWith('Bambu')); ender = ms.find((m) => m.name.startsWith('Ender'));
});

describe('cola de impresión', () => {
  it('mover un trabajo deja posiciones enteras 1..n en la máquina destino', async () => {
    const a = await createJob({ kind: 'prueba', title: 'A', estG: 5, estH: 0.5, machineId: ender.id });
    const b = await createJob({ kind: 'prueba', title: 'B', estG: 5, estH: 0.5, machineId: ender.id });
    await moveJob(b, ender.id, 1, admin.id);
    const rows = await db.select().from(s.printJobs).where(and(eq(s.printJobs.machineId, ender.id), inArray(s.printJobs.status, ['en_cola', 'pausado', 'imprimiendo']))).orderBy(asc(s.printJobs.position));
    expect(rows.map((r) => r.position)).toEqual(rows.map((_, i) => i + 1));
    expect(rows.findIndex((r) => r.id === b)).toBeLessThan(rows.findIndex((r) => r.id === a));
  });
  it('un trabajo para una máquina simulada se asigna a una máquina real', async () => {
    const sim = (await db.select().from(s.machines).where(eq(s.machines.simulated, true)))[0];
    expect(sim).toBeTruthy();
    const j = await createJob({ kind: 'prueba', title: 'Sim', estG: 5, estH: 0.5, machineId: sim.id });
    expect((await job(j)).machineId).not.toBe(sim.id);
  });
  it('cerrar dos veces un trabajo no consume material dos veces; uno en cola no se cierra', async () => {
    const queued = await createJob({ kind: 'prueba', title: 'Q', estG: 5, estH: 0.5, materialId: pla.id, machineId: ender.id });
    await expect(finishJob(queued, { result: 'exito', userId: admin.id })).rejects.toThrow();
    await startJob(queued, { userId: admin.id });
    await expect(startJob(queued, { userId: admin.id })).rejects.toThrow();
    await finishJob(queued, { result: 'exito', realG: 7, userId: admin.id });
    await expect(finishJob(queued, { result: 'exito', realG: 7, userId: admin.id })).rejects.toThrow();
    expect((await db.select().from(s.inventoryMovements).where(eq(s.inventoryMovements.jobId, queued))).length).toBe(1);
  });
});

describe('estados del pedido', () => {
  it('falla total sin reimpresión: el pedido no pasa a post-proceso y la línea se puede planificar otra vez', async () => {
    const oid = await createOrder({ customerName: 'Falla', items: [line()] }, admin);
    const [j] = await planProduction(oid, admin); await startJob(j, { userId: admin.id });
    await finishJob(j, { result: 'falla_total', failCause: 'Despegue', reprint: false, userId: admin.id });
    expect((await order(oid)).status).not.toBe('post_proceso');
    expect((await db.select().from(s.orderItems).where(eq(s.orderItems.orderId, oid)))[0].status).toBe('pendiente');
    expect((await planProduction(oid, admin)).length).toBe(1);
  });
  it('cancelar el único trabajo devuelve la línea a pendiente y el pedido a recibido', async () => {
    const oid = await createOrder({ customerName: 'Cancela trabajo', items: [line()] }, admin);
    const [j] = await planProduction(oid, admin); expect((await order(oid)).status).toBe('en_produccion');
    await cancelJob(j, admin.id);
    expect((await order(oid)).status).toBe('recibido');
    expect((await db.select().from(s.orderItems).where(eq(s.orderItems.orderId, oid)))[0].status).toBe('pendiente');
  });
  it('planificar dos veces a la vez no duplica los trabajos', async () => {
    const oid = await createOrder({ customerName: 'Doble plan', items: [line()] }, admin);
    const [r1, r2] = await Promise.all([planProduction(oid, admin), planProduction(oid, admin)]);
    expect(r1.length + r2.length).toBe(1);
  });
  it('entregar o cancelar dos veces no mueve el stock dos veces', async () => {
    const [v] = await db.select().from(s.productVariants).where(eq(s.productVariants.active, true)).limit(1);
    await db.update(s.productVariants).set({ stock: 10, reserved: 0 }).where(eq(s.productVariants.id, v.id));
    const oid = await createOrder({ customerName: 'Entrega', items: [{ description: 'Stock', qty: 2, variantId: v.id, kind: 'producto' as const }] }, admin);
    expect((await order(oid)).status).toBe('listo');
    await setOrderStatus(oid, 'entregado', admin);
    await expect(setOrderStatus(oid, 'entregado', admin)).rejects.toThrow();
    const [after] = await db.select().from(s.productVariants).where(eq(s.productVariants.id, v.id));
    expect(after.stock).toBe(8); expect(after.reserved).toBe(0);
    const c = await createOrder({ customerName: 'Cancela', items: [{ description: 'Stock', qty: 3, variantId: v.id, kind: 'producto' as const }] }, admin);
    const other = await createOrder({ customerName: 'Otro', items: [{ description: 'Stock', qty: 2, variantId: v.id, kind: 'producto' as const }] }, admin);
    await cancelOrder(c, 'x', admin);
    await expect(cancelOrder(c, 'x', admin)).rejects.toThrow();
    expect((await db.select().from(s.productVariants).where(eq(s.productVariants.id, v.id)))[0].reserved).toBe(2);
    expect(other).toBeTruthy();
  });
});
