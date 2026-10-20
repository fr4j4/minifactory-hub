import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { seedDemo } from '@/lib/seed';
import { createOrder, planProduction } from '@/lib/services/orders';
import { cancelJob, createProductionOrder, requeueJob } from '@/lib/services/production';

let db: Awaited<ReturnType<typeof getDb>>; let admin: any, pla: any;
beforeAll(async () => {
  await seedDemo(); db = await getDb();
  const u = (await db.select().from(s.users)).find((x) => x.role === 'admin')!; admin = { id: u.id, role: u.role, permOverrides: {} };
  pla = (await db.select().from(s.materials).where(eq(s.materials.colorName, 'Negro'))).find((m) => m.type === 'PLA');
});
const live = (rows: { status: string }[]) => rows.filter((j) => j.status === 'en_cola');

describe('relanzar respeta las transiciones condicionadas', () => {
  it('dos «Relanzar» simultáneos del mismo trabajo crean un solo trabajo', async () => {
    const oid = await createOrder({ customerName: 'Doble relanzar', items: [{ description: 'Pieza', qty: 1, materialId: pla.id, mode: 'manual' as const, gramsTotal: 10, hoursTotal: 1 }] }, admin);
    await planProduction(oid, admin); const [j] = await db.select().from(s.printJobs).where(eq(s.printJobs.orderId, oid));
    await cancelJob(j.id, admin.id);
    const r = await Promise.allSettled([requeueJob(j.id, admin.id), requeueJob(j.id, admin.id)]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(live(await db.select().from(s.printJobs).where(eq(s.printJobs.orderId, oid)))).toHaveLength(1);
    expect(await planProduction(oid, admin)).toHaveLength(0); // la línea ya tiene trabajo
  });

  it('dos «Relanzar» simultáneos de un trabajo de stock crean un solo trabajo', async () => {
    const [v] = await db.select().from(s.productVariants).limit(1);
    const po = await createProductionOrder({ variantId: v.id, qty: 1, userId: admin.id });
    await cancelJob(po.jobId, admin.id);
    const r = await Promise.allSettled([requeueJob(po.jobId, admin.id), requeueJob(po.jobId, admin.id)]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(live(await db.select().from(s.printJobs).where(eq(s.printJobs.productionOrderId, po.productionOrderId)))).toHaveLength(1);
  });
});
