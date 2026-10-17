import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { audit, notify } from '../audit';
import { getSettings, nextNumber } from '../settings';
import { calcQuote, type QuoteLine } from '../pricing';
import { canSellBelowCost, type PermUser } from '../perm';
import { normalizeUrl } from '../links';
import { createJob } from './production';
import { loadQuote, pricingContext, priceItem, type ItemInput, type LinkInput } from './quotes';
import { getT } from '@/i18n/server';

type Db = Awaited<ReturnType<typeof getDb>>;
type User = PermUser & { id: string };

export interface OrderInput {
  customerId?: string | null; customerName?: string | null; customerPhone?: string | null; source?: string | null; title?: string | null; dueDate?: string | null;
  priority?: string; notes?: string | null; shipMethod?: string | null; shipAddress?: string | null; quoteId?: string | null;
  discount?: number; items: ItemInput[]; links?: LinkInput[]; deposit?: { amount: number; method: string } | null; approvedBy?: string | null; approvedChannel?: string | null;
}

/** Registro manual de un pedido (WhatsApp, Instagram, marketplace, feria…), con o sin presupuesto previo. Mixto: líneas a medida + productos de stock. */
export async function createOrder(input: OrderInput, user: User): Promise<string> {
  const t = await getT();
  const ctx = await pricingContext();
  const db = ctx.db; const rt = ctx.settings.rates;
  let adj = 0;
  if (input.customerId) {
    const [c] = await db.select().from(s.customers).where(eq(s.customers.id, input.customerId));
    if (c?.priceListId) { const [pl] = await db.select().from(s.priceLists).where(eq(s.priceLists.id, c.priceListId)); adj = pl?.adjustPct ?? 0; }
  }
  const priced = [] as Array<{ it: ItemInput; p: Awaited<ReturnType<typeof priceItem>>; finalUnit: number }>;
  const lines: QuoteLine[] = [];
  for (const it of input.items) {
    const p = await priceItem(it, ctx, adj);
    const finalUnit = it.finalUnit != null ? Math.round(it.finalUnit) : p.suggestedUnit;
    priced.push({ it, p, finalUnit });
    lines.push({ id: String(priced.length), qty: Math.max(1, it.qty), suggestedUnit: p.suggestedUnit, finalUnit, cost: p.costTotal - (it.shipping ?? 0), shipping: it.shipping });
  }
  const tt = calcQuote(lines, rt, { discount: input.discount ?? 0 });
  if ((tt.belowCost || tt.lines.some((l) => l.belowCost)) && !canSellBelowCost(user)) throw new Error(t('orders.theFinalPriceIsBelow'));
  const number = await nextNumber('order');
  const hasProduct = input.items.some((i) => i.variantId), hasCustom = input.items.some((i) => !i.variantId);
  const [order] = await db.insert(s.orders).values({
    workspaceId: WORKSPACE_ID, number, kind: hasProduct && hasCustom ? 'mixto' : hasProduct ? 'solo_stock' : 'a_medida', status: 'recibido',
    customerId: input.customerId ?? null, customerName: input.customerName ?? null, customerPhone: input.customerPhone ?? null, quoteId: input.quoteId ?? null,
    source: input.source ?? null, priority: input.priority ?? 'normal', dueDate: input.dueDate ?? null, title: input.title ?? null, total: tt.total, costEstimated: tt.cost,
    shipAddress: input.shipAddress ?? null, shipMethod: input.shipMethod ?? 'retiro', notes: input.notes ?? null, approvedBy: input.approvedBy ?? null,
    approvedChannel: input.approvedChannel ?? null, approvedAt: input.approvedBy ? new Date() : null, createdBy: user.id,
  }).returning({ id: s.orders.id });
  let pos = 0;
  for (const { it, p, finalUnit } of priced) {
    let fromStock = 0;
    if (it.variantId) {
      const [v] = await db.select().from(s.productVariants).where(eq(s.productVariants.id, it.variantId));
      if (v) {
        fromStock = Math.max(0, Math.min(it.qty, v.stock - v.reserved));
        if (fromStock > 0) {
          await db.update(s.productVariants).set({ reserved: v.reserved + fromStock, updatedAt: new Date() }).where(eq(s.productVariants.id, v.id));
          await db.insert(s.stockMovements).values({ workspaceId: WORKSPACE_ID, variantId: v.id, kind: 'reserva', qty: 0, reason: t('orders.reservationOfUnitsFor', { fromStock, number }), orderId: order.id, createdBy: user.id });
        }
      }
    }
    const [oi] = await db.insert(s.orderItems).values({
      workspaceId: WORKSPACE_ID, orderId: order.id, position: pos++, kind: it.kind ?? (it.variantId ? 'producto' : it.models?.length ? 'modelo' : 'manual'), description: it.description, qty: it.qty,
      materialId: it.materialId ?? null, color: it.color ?? null, machineId: it.machineId ?? null, processProfileId: it.processProfileId ?? null,
      gramsTotal: it.gramsTotal ?? 0, hoursTotal: it.hoursTotal ?? 0, costBreakdown: p.breakdown as any, suggestedUnit: p.suggestedUnit, finalUnit,
      costUnit: Math.round((p.costTotal - (it.shipping ?? 0)) / Math.max(1, it.qty)), variantId: it.variantId ?? null, fromStock,
      status: it.variantId && fromStock >= it.qty ? 'listo' : 'pendiente', sliceRunId: it.sliceRunId ?? null, createdBy: user.id,
    }).returning({ id: s.orderItems.id });
    for (const m of it.models ?? []) await db.insert(s.quoteItemModels).values({ workspaceId: WORKSPACE_ID, orderItemId: oi.id, modelFileId: m.modelFileId, fileVersionId: m.fileVersionId ?? null, qty: m.qty ?? 1 });
    for (const l of it.links ?? []) if (l.url) await db.insert(s.referenceLinks).values({ workspaceId: WORKSPACE_ID, url: normalizeUrl(l.url), title: l.title ?? null, kind: l.kind ?? 'otro', note: l.note ?? null, imageUrl: l.imageUrl ?? null, showInPdf: !!l.showInPdf, ownerType: 'order_item', ownerId: oi.id, createdBy: user.id });
  }
  for (const l of input.links ?? []) if (l.url) await db.insert(s.referenceLinks).values({ workspaceId: WORKSPACE_ID, url: normalizeUrl(l.url), title: l.title ?? null, kind: l.kind ?? 'otro', note: l.note ?? null, imageUrl: l.imageUrl ?? null, showInPdf: !!l.showInPdf, ownerType: 'order', ownerId: order.id, createdBy: user.id });
  if (input.deposit && input.deposit.amount > 0) await addPayment({ orderId: order.id, amount: input.deposit.amount, method: input.deposit.method, note: t('orders.initialDeposit') }, user);
  await recomputeOrderStatus(order.id);
  await audit('order', order.id, 'crear', { number, total: tt.total, source: input.source }, user.id);
  return order.id;
}

/** El cliente aceptó el presupuesto (se registra a mano): se crea el pedido con sus líneas. */
export async function approveQuote(quoteId: string, o: { by: string; channel: string; deposit?: { amount: number; method: string } | null; dueDate?: string | null }, user: User): Promise<string> {
  const t = await getT();
  const data = await loadQuote(quoteId);
  if (!data) throw new Error(t('orders.quoteNotFound'));
  const { quote: q, items, models, links } = data;
  if (q.status === 'aprobado') throw new Error(t('orders.theQuoteIsAlreadyApproved'));
  if (['rechazado', 'reemplazado'].includes(q.status)) throw new Error(t('orders.thisQuoteIsNoLonger'));
  const db = await getDb();
  const st = await getSettings();
  // precio final por línea: si se fijó el total, se reparte
  const totals = (q.calc as any)?.lines as Array<{ id: string; finalTotal: number }> | undefined;
  const itemInputs: ItemInput[] = items.filter((i) => !i.optional).map((it) => {
    const lt = totals?.find((l) => l.id === it.id);
    const unit = lt ? Math.round(lt.finalTotal / Math.max(1, it.qty)) : it.finalUnit ?? it.suggestedUnit;
    return {
      ...(it as any), finalUnit: unit, id: undefined,
      models: models.filter((m) => m.qm.quoteItemId === it.id).map((m) => ({ modelFileId: m.qm.modelFileId, fileVersionId: m.qm.fileVersionId, qty: m.qm.qty })),
      links: links.filter((l) => l.ownerType === 'quote_item' && l.ownerId === it.id).map((l) => ({ ...l })),
    };
  });
  const depositMin = (q.customerId ? (await db.select().from(s.customers).where(eq(s.customers.id, q.customerId)))[0]?.depositPct : null) ?? null;
  const orderId = await createOrder({
    customerId: q.customerId, customerName: q.customerName, customerPhone: q.customerPhone, source: q.source, title: q.title, quoteId: q.id, discount: q.discount,
    notes: q.notes, items: itemInputs, links: links.filter((l) => l.ownerType === 'quote').map((l) => ({ ...l })), deposit: o.deposit, dueDate: o.dueDate ?? null,
    approvedBy: o.by, approvedChannel: o.channel,
  }, user);
  await db.update(s.orders).set({ total: q.total, taxAmount: q.taxAmount }).where(eq(s.orders.id, orderId));
  await db.update(s.quotes).set({ status: 'aprobado', frozen: true, approvedBy: o.by, approvedChannel: o.channel, approvedAt: new Date(), updatedAt: new Date() }).where(eq(s.quotes.id, quoteId));
  await audit('quote', quoteId, 'estado', { to: 'aprobado', by: o.by, channel: o.channel, orderId }, user.id);
  return orderId;
}

/** Líneas del pedido que ya tienen un trabajo en cola, en curso, pausado o terminado (las canceladas o fallidas sin reimpresión no cuentan). */
async function plannedItemIds(db: Awaited<ReturnType<typeof getDb>>, orderId: string) {
  const rows = await db.select({ oi: s.jobItems.orderItemId }).from(s.jobItems).innerJoin(s.printJobs, eq(s.printJobs.id, s.jobItems.jobId)).where(and(eq(s.printJobs.orderId, orderId), isNull(s.printJobs.deletedAt), inArray(s.printJobs.status, ['en_cola', 'imprimiendo', 'pausado', 'terminado'])));
  return new Set(rows.map((r) => r.oi));
}

/** Líneas que hay que imprimir y todavía no tienen trabajo (p. ej. porque se canceló el que tenían). */
export async function pendingPrintItems(orderId: string) {
  const db = await getDb();
  const items = await db.select().from(s.orderItems).where(eq(s.orderItems.orderId, orderId)).orderBy(asc(s.orderItems.position));
  const planned = await plannedItemIds(db, orderId);
  return items.filter((it) => !planned.has(it.id) && (it.variantId ? it.qty - it.fromStock > 0 : true));
}

/** Crea los trabajos de las líneas sin trabajo. Con `itemIds` solo lanza esas líneas (lanzamiento individual). */
export async function planProduction(orderId: string, user: User, itemIds?: string[]) {
  const t = await getT();
  const db = await getDb();
  const [order] = await db.select().from(s.orders).where(eq(s.orders.id, orderId));
  if (!order) throw new Error(t('orders.orderNotFound'));
  if (['cancelado', 'entregado'].includes(order.status)) throw new Error(t('orders.theOrderIsAlreadyClosed'));
  const items = await db.select().from(s.orderItems).where(eq(s.orderItems.orderId, orderId)).orderBy(asc(s.orderItems.position));
  const planned = await plannedItemIds(db, orderId);
  const created: string[] = [];
  const only = itemIds ? new Set(itemIds) : null;
  for (const it of items) {
    if (planned.has(it.id) || (only && !only.has(it.id))) continue;
    let qty = it.qty, estG = it.gramsTotal, estH = it.hoursTotal, materialId = it.materialId;
    if (it.variantId) {
      const need = it.qty - it.fromStock;
      if (need <= 0) continue;
      const [v] = await db.select().from(s.productVariants).where(eq(s.productVariants.id, it.variantId));
      qty = need; estG = (v?.weightG ?? 0) * need; estH = (v?.printH ?? 0) * need; materialId = v?.materialId ?? materialId;
    }
    const mm = await db.select({ f: s.modelFiles }).from(s.quoteItemModels).innerJoin(s.modelFiles, eq(s.modelFiles.id, s.quoteItemModels.modelFileId)).where(eq(s.quoteItemModels.orderItemId, it.id));
    const dims = mm.length ? ([Math.max(...mm.map((x) => x.f.dimX ?? 0)), Math.max(...mm.map((x) => x.f.dimY ?? 0)), Math.max(...mm.map((x) => x.f.dimZ ?? 0))] as [number, number, number]) : null;
    const id = await createJob({ kind: 'pedido', title: `${order.number} · ${it.description || t('orders.part')} ×${qty}`, materialId, qty, estG, estH, orderId, orderItemIds: [it.id], machineId: it.machineId, dims: dims && dims[0] > 0 ? dims : null, sliceRunId: it.sliceRunId, userId: user.id });
    await db.update(s.orderItems).set({ status: 'en_cola' }).where(eq(s.orderItems.id, it.id));
    created.push(id);
  }
  await recomputeOrderStatus(orderId);
  await audit('order', orderId, 'planificar', { jobs: created.length }, user.id);
  return created;
}

/** El estado del pedido se deriva de sus trabajos. No retrocede desde Listo/Entregado/Cancelado. */
export async function recomputeOrderStatus(orderId: string) {
  const db = await getDb();
  const [o] = await db.select().from(s.orders).where(eq(s.orders.id, orderId));
  if (!o || ['listo', 'entregado', 'cancelado'].includes(o.status)) return;
  const jobs = await db.select().from(s.printJobs).where(and(eq(s.printJobs.orderId, orderId), isNull(s.printJobs.deletedAt)));
  const items = await db.select().from(s.orderItems).where(eq(s.orderItems.orderId, orderId));
  const live = jobs.filter((j) => j.status !== 'cancelado');
  let status = 'recibido';
  if (live.length) {
    const open = live.filter((j) => ['en_cola', 'imprimiendo', 'pausado'].includes(j.status));
    const printing = live.some((j) => ['imprimiendo', 'pausado'].includes(j.status));
    const closedOk = live.every((j) => j.status === 'terminado' || j.status === 'fallido');
    if (!open.length && closedOk) status = 'post_proceso'; else status = printing || live.some((j) => j.status === 'terminado') || open.length ? 'en_produccion' : 'recibido';
  } else if (items.length && items.every((i) => i.variantId && i.fromStock >= i.qty)) status = 'listo';
  if (status !== o.status) {
    await db.update(s.orders).set({ status, updatedAt: new Date() }).where(eq(s.orders.id, orderId));
    await audit('order', orderId, 'estado', { from: o.status, to: status });
  }
}

export async function setOrderStatus(orderId: string, to: 'listo' | 'entregado' | 'post_proceso' | 'en_produccion' | 'recibido', user: User, o: { tracking?: string; shipMethod?: string } = {}) {
  const t = await getT();
  const db = await getDb();
  const [ord] = await db.select().from(s.orders).where(eq(s.orders.id, orderId));
  if (!ord) throw new Error(t('orders.orderNotFound'));
  if (ord.status === 'cancelado') throw new Error(t('orders.theOrderIsCancelled'));
  const patch: Record<string, any> = { status: to, updatedAt: new Date() };
  if (o.tracking !== undefined) patch.tracking = o.tracking;
  if (o.shipMethod) patch.shipMethod = o.shipMethod;
  if (to === 'entregado') {
    patch.deliveredAt = new Date();
    // las unidades reservadas de stock salen definitivamente
    const items = await db.select().from(s.orderItems).where(and(eq(s.orderItems.orderId, orderId), sql`${s.orderItems.variantId} is not null`));
    for (const it of items) {
      const [v] = await db.select().from(s.productVariants).where(eq(s.productVariants.id, it.variantId!));
      const qty = it.fromStock;
      if (v && qty > 0) {
        await db.update(s.productVariants).set({ stock: v.stock - qty, reserved: Math.max(0, v.reserved - qty), updatedAt: new Date() }).where(eq(s.productVariants.id, v.id));
        await db.insert(s.stockMovements).values({ workspaceId: WORKSPACE_ID, variantId: v.id, kind: 'venta', qty: -qty, unitCost: v.avgCost, orderId, reason: t('orders.order', { number: ord.number }), createdBy: user.id });
        if (v.stock - qty <= v.minStock) await notify('stock_bajo', t('orders.lowProductStock', { sku: v.sku }), t('orders.unitsLeftMinimum', { stock: v.stock - qty, min: v.minStock }), '/catalogo');
      }
    }
    await db.update(s.orderItems).set({ status: 'entregado' }).where(eq(s.orderItems.orderId, orderId));
  }
  await db.update(s.orders).set(patch).where(eq(s.orders.id, orderId));
  await audit('order', orderId, 'estado', { from: ord.status, to, tracking: o.tracking }, user.id);
}

export async function cancelOrder(orderId: string, reason: string, user: User) {
  const t = await getT();
  const db = await getDb();
  const [ord] = await db.select().from(s.orders).where(eq(s.orders.id, orderId));
  if (!ord) throw new Error(t('orders.orderNotFound'));
  if (ord.status === 'entregado') throw new Error(t('orders.aDeliveredOrderCannotBe'));
  const jobs = await db.select().from(s.printJobs).where(and(eq(s.printJobs.orderId, orderId), inArray(s.printJobs.status, ['en_cola', 'pausado'])));
  for (const j of jobs) await db.update(s.printJobs).set({ status: 'cancelado' }).where(eq(s.printJobs.id, j.id));
  const items = await db.select().from(s.orderItems).where(and(eq(s.orderItems.orderId, orderId), sql`${s.orderItems.variantId} is not null`));
  for (const it of items) if (it.fromStock > 0) {
    const [v] = await db.select().from(s.productVariants).where(eq(s.productVariants.id, it.variantId!));
    if (v) await db.update(s.productVariants).set({ reserved: Math.max(0, v.reserved - it.fromStock) }).where(eq(s.productVariants.id, v.id));
  }
  await db.update(s.orders).set({ status: 'cancelado', canceledReason: reason, updatedAt: new Date() }).where(eq(s.orders.id, orderId));
  await audit('order', orderId, 'cancelar', { reason }, user.id);
}

export async function addPayment(o: { orderId?: string; saleId?: string; amount: number; method: string; note?: string; receiptKey?: string; taxDocType?: string; taxDocFolio?: string; paidAt?: string }, user: User) {
  const t = await getT();
  const db = await getDb();
  if (o.amount <= 0) throw new Error(t('orders.theAmountMustBeGreater'));
  await db.insert(s.payments).values({
    workspaceId: WORKSPACE_ID, orderId: o.orderId ?? null, saleId: o.saleId ?? null, amount: Math.round(o.amount), method: o.method, paidAt: o.paidAt ?? new Date().toISOString().slice(0, 10),
    note: o.note ?? null, receiptKey: o.receiptKey ?? null, taxDocType: o.taxDocType ?? null, taxDocFolio: o.taxDocFolio ?? null, createdBy: user.id,
  });
  if (o.orderId) {
    const [r] = await db.select({ t: sql<number>`coalesce(sum(${s.payments.amount}),0)` }).from(s.payments).where(and(eq(s.payments.orderId, o.orderId), isNull(s.payments.deletedAt)));
    await db.update(s.orders).set({ paid: Number(r.t), updatedAt: new Date() }).where(eq(s.orders.id, o.orderId));
  }
  if (o.saleId) {
    const [r] = await db.select({ t: sql<number>`coalesce(sum(${s.payments.amount}),0)` }).from(s.payments).where(and(eq(s.payments.saleId, o.saleId), isNull(s.payments.deletedAt)));
    await db.update(s.sales).set({ paid: Number(r.t) }).where(eq(s.sales.id, o.saleId));
  }
  await audit(o.orderId ? 'order' : 'sale', o.orderId ?? o.saleId ?? null, 'pago', { amount: o.amount, method: o.method }, user.id);
}

export function paymentStatus(total: number, paid: number): 'pendiente' | 'parcial' | 'pagado' {
  if (paid <= 0) return 'pendiente'; return paid >= total ? 'pagado' : 'parcial';
}


/** Recalcula lo pagado de un pedido o venta a partir de sus pagos vigentes. */
export async function recomputePaid(db: Db, p: { orderId: string | null; saleId: string | null }) {
  if (p.orderId) { const [r] = await db.select({ t: sql<number>`coalesce(sum(${s.payments.amount}),0)` }).from(s.payments).where(and(eq(s.payments.orderId, p.orderId), isNull(s.payments.deletedAt))); await db.update(s.orders).set({ paid: Number(r.t), updatedAt: new Date() }).where(eq(s.orders.id, p.orderId)); }
  if (p.saleId) { const [r] = await db.select({ t: sql<number>`coalesce(sum(${s.payments.amount}),0)` }).from(s.payments).where(and(eq(s.payments.saleId, p.saleId), isNull(s.payments.deletedAt))); await db.update(s.sales).set({ paid: Number(r.t) }).where(eq(s.sales.id, p.saleId)); }
}
