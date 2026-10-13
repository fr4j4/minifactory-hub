import { and, eq, gte, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { getSettings } from './settings';
import { materialStock, shoppingList } from './services/inventory';
import { maintenanceDue } from './services/production';

export interface Range { from: Date; to: Date }
export const monthRange = (d = new Date()): Range => ({ from: new Date(d.getFullYear(), d.getMonth(), 1), to: new Date(d.getFullYear(), d.getMonth() + 1, 1) });

/** Neto sin IVA según la configuración de impuestos. */
function net(gross: number, st: Awaited<ReturnType<typeof getSettings>>) { return st.rates.taxMode === 'incluido' ? gross / (1 + st.rates.taxPct / 100) : gross; }

export async function monthIndicators(r: Range = monthRange()) {
  const db = await getDb(); const st = await getSettings();
  const orders = await db.select().from(s.orders).where(and(gte(s.orders.createdAt, r.from), lt(s.orders.createdAt, r.to), ne(s.orders.status, 'cancelado'), isNull(s.orders.deletedAt)));
  const sales = await db.select().from(s.sales).where(and(gte(s.sales.createdAt, r.from), lt(s.sales.createdAt, r.to), ne(s.sales.status, 'anulada'), isNull(s.sales.deletedAt)));
  const revenue = orders.reduce((a, o) => a + o.total, 0) + sales.reduce((a, x) => a + x.total, 0);
  const cost = orders.reduce((a, o) => a + (o.costReal ?? o.costEstimated), 0) + sales.reduce((a, x) => a + x.costTotal + x.commission + x.shipping, 0);
  const netRev = orders.reduce((a, o) => a + net(o.total, st), 0) + sales.reduce((a, x) => a + net(x.total, st), 0);
  const delivered = orders.filter((o) => o.status === 'entregado').length;
  const quotes = await db.select().from(s.quotes).where(and(gte(s.quotes.createdAt, r.from), lt(s.quotes.createdAt, r.to), isNull(s.quotes.deletedAt), inArray(s.quotes.status, ['enviado', 'aprobado', 'rechazado', 'vencido'])));
  const approved = quotes.filter((q) => q.status === 'aprobado').length;
  const jobs = await db.select().from(s.printJobs).where(and(gte(s.printJobs.realEnd, r.from), lt(s.printJobs.realEnd, r.to)));
  return {
    revenue, grossMargin: netRev - cost, marginPct: netRev > 0 ? ((netRev - cost) / netRev) * 100 : null, ordersCount: orders.length, delivered, salesCount: sales.length,
    approvalRate: quotes.length ? (approved / quotes.length) * 100 : null, quotesCount: quotes.length, machineHours: jobs.reduce((a, j) => a + (j.realH ?? 0), 0), kgUsed: jobs.reduce((a, j) => a + (j.realG ?? 0), 0) / 1000,
  };
}

export async function stockValue() {
  const db = await getDb();
  const sp = await db.select({ g: s.spools.remainingG, c: s.spools.unitCost, mc: s.materials.costPerKg }).from(s.spools).innerJoin(s.materials, eq(s.materials.id, s.spools.materialId)).where(and(isNull(s.spools.deletedAt), inArray(s.spools.status, ['nueva', 'abierta', 'en_uso'])));
  const materials = sp.reduce((a, x) => a + (x.g / 1000) * (x.c ?? x.mc), 0);
  const vs = await db.select().from(s.productVariants).where(isNull(s.productVariants.deletedAt));
  const products = vs.reduce((a, v) => a + v.stock * v.avgCost, 0);
  const items = (await db.select().from(s.inventoryItems).where(isNull(s.inventoryItems.deletedAt))).reduce((a, i) => a + i.stock * i.unitCost, 0);
  return { materials: Math.round(materials), products, items: Math.round(items), total: Math.round(materials + products + items) };
}

export async function dashboardData() {
  const db = await getDb(); const st = await getSettings();
  const today = new Date().toISOString().slice(0, 10); const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
  const printing = await db.select({ j: s.printJobs, m: s.machines.name }).from(s.printJobs).leftJoin(s.machines, eq(s.machines.id, s.printJobs.machineId)).where(eq(s.printJobs.status, 'imprimiendo'));
  const due = await db.select().from(s.orders).where(and(inArray(s.orders.status, ['recibido', 'en_produccion', 'post_proceso', 'listo']), sql`${s.orders.dueDate} <= ${tomorrow}`, isNull(s.orders.deletedAt)));
  const waiting = await db.select().from(s.quotes).where(and(eq(s.quotes.status, 'enviado'), lt(s.quotes.createdAt, new Date(Date.now() - 3 * 86400_000)), isNull(s.quotes.deletedAt)));
  const stock = (await materialStock(db)).filter((x) => x.low);
  const mats = await db.select().from(s.materials);
  const lowItems = (await db.select().from(s.inventoryItems).where(isNull(s.inventoryItems.deletedAt))).filter((i) => i.stock <= i.minStock);
  const lowProducts = await db.select({ v: s.productVariants, p: s.products.name }).from(s.productVariants).innerJoin(s.products, eq(s.products.id, s.productVariants.productId)).where(and(isNull(s.productVariants.deletedAt), eq(s.productVariants.active, true), sql`${s.productVariants.stock} <= ${s.productVariants.minStock}`, sql`${s.productVariants.minStock} > 0`));
  const maint = await maintenanceDue();
  const machines = await db.select().from(s.machines).where(isNull(s.machines.deletedAt));
  const stopped = machines.filter((m) => ['fuera_de_servicio', 'pausada', 'mantenimiento'].includes(m.status));
  const unpaid = await db.select().from(s.orders).where(and(inArray(s.orders.status, ['listo', 'entregado']), sql`${s.orders.paid} < ${s.orders.total}`, isNull(s.orders.deletedAt)));
  const toShip = await db.select().from(s.sales).where(and(eq(s.sales.status, 'por_despachar'), isNull(s.sales.deletedAt)));
  const oldJobs = await db.select({ j: s.printJobs }).from(s.printJobs).where(and(eq(s.printJobs.status, 'en_cola'), lt(s.printJobs.createdAt, new Date(Date.now() - st.reservationDays * 86400_000))));
  const [ind, val] = await Promise.all([monthIndicators(), stockValue()]);
  return { printing, due, waiting, lowMaterials: stock.map((x) => ({ ...x, m: mats.find((m) => m.id === x.materialId)! })), lowItems, lowProducts, maint, machines, stopped, unpaid, toShip, oldJobs, ind, val, today };
}
