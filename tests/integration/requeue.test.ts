import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { seedDemo } from '@/lib/seed';
import { createOrder, pendingPrintItems, planProduction } from '@/lib/services/orders';
import { cancelJob, requeueJob, startJob } from '@/lib/services/production';

let db: Awaited<ReturnType<typeof getDb>>; let admin: any, pla: any, a1: any;
beforeAll(async () => {
  await seedDemo(); db = await getDb();
  const u = (await db.select().from(s.users)).find((x) => x.role === 'admin')!; admin = { id: u.id, role: u.role, permOverrides: {} };
  pla = (await db.select().from(s.materials).where(eq(s.materials.colorName, 'Negro'))).find((m) => m.type === 'PLA');
  a1 = (await db.select().from(s.machines)).find((m) => m.name.startsWith('Bambu'));
});
const line = (d: string) => ({ description: d, qty: 1, materialId: pla.id, machineId: a1.id, mode: 'manual' as const, gramsTotal: 40, hoursTotal: 2 });
const jobsOf = async (orderId: string) => db.select().from(s.printJobs).where(eq(s.printJobs.orderId, orderId));
const orderOf = async (id: string) => (await db.select().from(s.orders).where(eq(s.orders.id, id)))[0];
const itemStatuses = async (id: string) => (await db.select().from(s.orderItems).where(eq(s.orderItems.orderId, id))).map((i) => i.status);

describe('relanzar trabajos cancelados', () => {
  it('cancelar uno de varios trabajos deja su línea pendiente y se puede lanzar sola, sin duplicar el resto', async () => {
    const oid = await createOrder({ customerName: 'Relanzar', items: [line('Pieza A'), line('Pieza B')] }, admin);
    expect(await planProduction(oid, admin)).toHaveLength(2);
    expect(await pendingPrintItems(oid)).toHaveLength(0);
    const [ja] = await jobsOf(oid); await cancelJob(ja.id, admin.id);
    expect(await pendingPrintItems(oid)).toHaveLength(1); // la línea del trabajo cancelado
    expect((await itemStatuses(oid)).sort()).toEqual(['en_cola', 'pendiente']);
    expect((await orderOf(oid)).status).toBe('en_produccion'); // el otro trabajo sigue vivo
    const [pend] = await pendingPrintItems(oid); const all = await db.select().from(s.orderItems).where(eq(s.orderItems.orderId, oid)); const other = all.find((i) => i.id !== pend.id)!;
    expect(await planProduction(oid, admin, [other.id])).toHaveLength(0); // lanzamiento individual de una línea que ya tiene trabajo: no duplica
    expect(await planProduction(oid, admin, [pend.id])).toHaveLength(1); // lanzar solo la pendiente
    expect(await pendingPrintItems(oid)).toHaveLength(0);
    expect((await jobsOf(oid)).filter((j) => j.status === 'en_cola')).toHaveLength(2);
    expect(await planProduction(oid, admin)).toHaveLength(0); // idempotente
  });

  it('se puede lanzar una sola línea de un pedido sin trabajos; las demás quedan pendientes', async () => {
    const oid = await createOrder({ customerName: 'Individual', items: [line('Pieza X'), line('Pieza Y')] }, admin);
    const [x, y] = await db.select().from(s.orderItems).where(eq(s.orderItems.orderId, oid)).orderBy(s.orderItems.position);
    expect(await planProduction(oid, admin, [y.id])).toHaveLength(1);
    expect((await pendingPrintItems(oid)).map((i) => i.id)).toEqual([x.id]);
    expect((await jobsOf(oid)).map((j) => j.title)).toEqual([expect.stringContaining('Pieza Y')]);
    expect(await planProduction(oid, admin)).toHaveLength(1); // y luego el resto
  });

  it('si se cancelan todos, el pedido vuelve a «recibido»; relanzar crea un trabajo igual en la cola y no se puede duplicar', async () => {
    const oid = await createOrder({ customerName: 'Relanzar 2', items: [line('Pieza C')] }, admin);
    await planProduction(oid, admin); const [j] = await jobsOf(oid);
    await cancelJob(j.id, admin.id);
    expect((await orderOf(oid)).status).toBe('recibido'); expect(await itemStatuses(oid)).toEqual(['pendiente']);
    const nid = await requeueJob(j.id, admin.id);
    const [n] = await db.select().from(s.printJobs).where(eq(s.printJobs.id, nid));
    expect(n).toMatchObject({ status: 'en_cola', title: j.title, orderId: oid, machineId: j.machineId, estH: j.estH, estG: j.estG, qty: j.qty });
    expect(n.id).not.toBe(j.id); expect(n.notes).toContain(j.number);
    expect(await itemStatuses(oid)).toEqual(['en_cola']); expect((await orderOf(oid)).status).toBe('en_produccion');
    expect((await db.select().from(s.jobItems).where(eq(s.jobItems.jobId, nid))).length).toBe(1); // conserva la línea
    await expect(requeueJob(j.id)).rejects.toThrow(); // la línea ya tiene otro trabajo activo
    await expect(requeueJob(nid)).rejects.toThrow(); // solo se relanzan los cancelados
  });

  it('un trabajo de stock cancelado reactiva su orden de producción al relanzarse', async () => {
    const [v] = await db.select().from(s.productVariants).limit(1);
    const { createProductionOrder } = await import('@/lib/services/production');
    const po = await createProductionOrder({ variantId: v.id, qty: 2, userId: admin.id });
    await cancelJob(po.jobId, admin.id);
    expect((await db.select().from(s.productionOrders).where(eq(s.productionOrders.id, po.productionOrderId)))[0].status).toBe('cancelada');
    const nid = await requeueJob(po.jobId, admin.id);
    expect((await db.select().from(s.productionOrders).where(eq(s.productionOrders.id, po.productionOrderId)))[0].status).toBe('en_cola');
    await startJob(nid, { machineId: a1.id }); // y se puede iniciar normalmente
  });
});
