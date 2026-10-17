import { and, asc, desc, eq, inArray, isNull, ne, notInArray, sql } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID, type Tx } from '@/db';
import { audit, notify } from '../audit';
import { getSettings, nextNumber } from '../settings';
import { calcQuote, type QuoteLine } from '../pricing';
import { canSellBelowCost, type PermUser } from '../perm';
import { normalizeUrl } from '../links';
import { cancelJob, createJob } from './production';
import { customerPriceAdj, loadQuote, pricingContext, priceItem, type ItemInput, type LinkInput } from './quotes';
import { freezeDoc } from './quote-doc';
import { getT } from '@/i18n/server';
import { LocalizedError } from '@/i18n/errors';
import { ymd } from '../format';

type Db = Awaited<ReturnType<typeof getDb>>;
type User = PermUser & { id: string };

export interface OrderInput {
  customerId?: string | null; customerName?: string | null; customerPhone?: string | null; source?: string | null; title?: string | null; dueDate?: string | null;
  priority?: string; notes?: string | null; shipMethod?: string | null; shipAddress?: string | null; quoteId?: string | null;
  discount?: number; items: ItemInput[]; links?: LinkInput[]; deposit?: { amount: number; method: string } | null; approvedBy?: string | null; approvedChannel?: string | null;
}

/** Costos y precio sugerido ya congelados de una línea de presupuesto aprobado: no se recalculan. Solo lo pasa approveQuote (nunca viene del navegador). */
export interface FrozenPrice { breakdown: any; suggestedUnit: number; costTotal: number }
interface CreateOrderInternal {
  /** por índice de `input.items` */
  frozen?: Array<FrozenPrice | undefined>;
  /** total y IVA del presupuesto aprobado (reemplazan los recalculados) */
  totals?: { total: number; taxAmount: number };
  /** se ejecuta al final de la misma transacción: si lanza, no queda pedido, ni reservas, ni abono */
  claim?: (tx: Tx, orderId: string) => Promise<void>;
}

/** Registro manual de un pedido (WhatsApp, Instagram, marketplace, feria…), con o sin presupuesto previo. Mixto: líneas a medida + productos de stock. */
export async function createOrder(input: OrderInput, user: User, internal: CreateOrderInternal = {}): Promise<string> {
  const t = await getT();
  // entrada no confiable (acción del servidor): mismas reglas que saveQuote
  for (const it of input.items) { it.qty = Math.max(1, Math.floor(it.qty || 1)); if (it.finalUnit != null && !(it.finalUnit >= 0)) throw new LocalizedError('edit.invalid'); }
  const discount = Math.max(0, Math.round(input.discount ?? 0));
  const ctx = await pricingContext();
  const db = ctx.db; const rt = ctx.settings.rates;
  const adj = await customerPriceAdj(db, input.customerId);
  const priced = [] as Array<{ it: ItemInput; p: Awaited<ReturnType<typeof priceItem>>; finalUnit: number }>;
  const lines: QuoteLine[] = [];
  for (const [i, it] of input.items.entries()) {
    const fz = internal.frozen?.[i];
    const p = fz ? { ...fz, frozenCost: fz.costTotal - (it.shipping ?? 0) } : await priceItem(it, ctx, adj);
    const finalUnit = it.finalUnit != null ? Math.round(it.finalUnit) : p.suggestedUnit;
    priced.push({ it, p, finalUnit });
    lines.push({ id: String(priced.length), qty: Math.max(1, it.qty), suggestedUnit: p.suggestedUnit, finalUnit, cost: p.costTotal - (it.shipping ?? 0), shipping: it.shipping });
  }
  const tt = calcQuote(lines, rt, { discount });
  // las líneas congeladas ya pasaron este control al guardar el presupuesto
  const fresh = input.items.some((_, i) => !internal.frozen?.[i]);
  if (fresh && (tt.belowCost || tt.lines.some((l) => l.belowCost)) && !canSellBelowCost(user)) throw new Error(t('orders.theFinalPriceIsBelow'));
  const total = internal.totals?.total ?? tt.total;
  const deposit = input.deposit && input.deposit.amount > 0 ? { ...input.deposit, amount: Math.round(input.deposit.amount) } : null;
  if (deposit && deposit.amount > total) throw new Error(t('orders.depositAboveTotal'));
  // el número se pide antes de la transacción (lee ajustes fuera de ella); si algo falla queda un salto en la numeración
  const number = await nextNumber('order');
  const hasProduct = input.items.some((i) => i.variantId), hasCustom = input.items.some((i) => !i.variantId);
  // pedido, líneas, reservas y abono en una transacción (dentro solo se usa `tx`): un error no deja un pedido a medias
  const orderId = await db.transaction(async (tx) => {
    const [order] = await tx.insert(s.orders).values({
      workspaceId: WORKSPACE_ID, number, kind: hasProduct && hasCustom ? 'mixto' : hasProduct ? 'solo_stock' : 'a_medida', status: 'recibido',
      customerId: input.customerId ?? null, customerName: input.customerName ?? null, customerPhone: input.customerPhone ?? null, quoteId: input.quoteId ?? null,
      source: input.source ?? null, priority: input.priority ?? 'normal', dueDate: input.dueDate ?? null, title: input.title ?? null, total, taxAmount: internal.totals?.taxAmount ?? 0, costEstimated: tt.cost,
      shipAddress: input.shipAddress ?? null, shipMethod: input.shipMethod ?? 'retiro', notes: input.notes ?? null, approvedBy: input.approvedBy ?? null,
      approvedChannel: input.approvedChannel ?? null, approvedAt: input.approvedBy ? new Date() : null, createdBy: user.id,
    }).returning({ id: s.orders.id });
    let pos = 0;
    for (const { it, p, finalUnit } of priced) {
      let fromStock = 0;
      if (it.variantId) {
        const [v] = await tx.select().from(s.productVariants).where(eq(s.productVariants.id, it.variantId));
        if (v) {
          fromStock = Math.max(0, Math.min(it.qty, v.stock - v.reserved));
          // reserva atómica: si otro pedido tomó esas unidades entretanto, no se reserva (la línea se produce)
          const [ok] = fromStock > 0 ? await tx.update(s.productVariants).set({ reserved: sql`${s.productVariants.reserved} + ${fromStock}`, updatedAt: new Date() })
            .where(and(eq(s.productVariants.id, v.id), sql`${s.productVariants.stock} - ${s.productVariants.reserved} >= ${fromStock}`)).returning({ id: s.productVariants.id }) : [];
          if (!ok) fromStock = 0;
          if (fromStock > 0) {
            await tx.insert(s.stockMovements).values({ workspaceId: WORKSPACE_ID, variantId: v.id, kind: 'reserva', qty: 0, reason: t('orders.reservationOfUnitsFor', { fromStock, number }), orderId: order.id, createdBy: user.id });
          }
        }
      }
      const [oi] = await tx.insert(s.orderItems).values({
        workspaceId: WORKSPACE_ID, orderId: order.id, position: pos++, kind: it.kind ?? (it.variantId ? 'producto' : it.models?.length ? 'modelo' : 'manual'), description: it.description, qty: it.qty,
        materialId: it.materialId ?? null, color: it.color ?? null, machineId: it.machineId ?? null, processProfileId: it.processProfileId ?? null,
        gramsTotal: it.gramsTotal ?? 0, hoursTotal: it.hoursTotal ?? 0, costBreakdown: p.breakdown as any, suggestedUnit: p.suggestedUnit, finalUnit,
        costUnit: Math.round((p.costTotal - (it.shipping ?? 0)) / Math.max(1, it.qty)), variantId: it.variantId ?? null, fromStock,
        status: it.variantId && fromStock >= it.qty ? 'listo' : 'pendiente', sliceRunId: it.sliceRunId ?? null, createdBy: user.id,
      }).returning({ id: s.orderItems.id });
      for (const m of it.models ?? []) await tx.insert(s.quoteItemModels).values({ workspaceId: WORKSPACE_ID, orderItemId: oi.id, modelFileId: m.modelFileId, fileVersionId: m.fileVersionId ?? null, qty: m.qty ?? 1 });
      for (const l of it.links ?? []) if (l.url) await tx.insert(s.referenceLinks).values({ workspaceId: WORKSPACE_ID, url: normalizeUrl(l.url), title: l.title ?? null, kind: l.kind ?? 'otro', note: l.note ?? null, imageUrl: l.imageUrl ?? null, showInPdf: !!l.showInPdf, ownerType: 'order_item', ownerId: oi.id, createdBy: user.id });
    }
    for (const l of input.links ?? []) if (l.url) await tx.insert(s.referenceLinks).values({ workspaceId: WORKSPACE_ID, url: normalizeUrl(l.url), title: l.title ?? null, kind: l.kind ?? 'otro', note: l.note ?? null, imageUrl: l.imageUrl ?? null, showInPdf: !!l.showInPdf, ownerType: 'order', ownerId: order.id, createdBy: user.id });
    if (deposit) {
      await tx.insert(s.payments).values({ workspaceId: WORKSPACE_ID, orderId: order.id, amount: deposit.amount, method: deposit.method, paidAt: ymd(), note: t('orders.initialDeposit'), createdBy: user.id });
      await recomputePaid(tx, { orderId: order.id, saleId: null });
    }
    if (internal.claim) await internal.claim(tx, order.id);
    return order.id;
  });
  await recomputeOrderStatus(orderId);
  if (deposit) await audit('order', orderId, 'pago', { amount: deposit.amount, method: deposit.method }, user.id);
  await audit('order', orderId, 'crear', { number, total, source: input.source }, user.id);
  return orderId;
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
  // otra versión ya aprobada con su pedido vigente: aprobar esta crearía un segundo pedido del mismo presupuesto
  const [twin] = await db.select({ number: s.orders.number }).from(s.orders).innerJoin(s.quotes, eq(s.quotes.id, s.orders.quoteId))
    .where(and(eq(s.quotes.rootId, q.rootId ?? q.id), ne(s.quotes.id, q.id), notInArray(s.orders.status, ['cancelado', 'entregado']), isNull(s.orders.deletedAt))).limit(1);
  if (twin) throw new Error(t('orders.otherVersionHasOrder', { number: twin.number }));
  // precio final por línea: si se fijó el total, se reparte
  const totals = (q.calc as any)?.lines as Array<{ id: string; finalTotal: number }> | undefined;
  const kept = items.filter((i) => !i.optional);
  const itemInputs: ItemInput[] = kept.map((it) => {
    const lt = totals?.find((l) => l.id === it.id);
    const unit = lt ? Math.round(lt.finalTotal / Math.max(1, it.qty)) : it.finalUnit ?? it.suggestedUnit;
    return {
      ...(it as any), finalUnit: unit, id: undefined,
      models: models.filter((m) => m.qm.quoteItemId === it.id).map((m) => ({ modelFileId: m.qm.modelFileId, fileVersionId: m.qm.fileVersionId, qty: m.qm.qty })),
      links: links.filter((l) => l.ownerType === 'quote_item' && l.ownerId === it.id).map((l) => ({ ...l })),
    };
  });
  const frozen = kept.map((it) => ({ breakdown: it.costBreakdown as any, suggestedUnit: it.suggestedUnit, costTotal: ((it.costBreakdown as any)?.cost ?? 0) + (it.shipping ?? 0) }));
  // aprobar un borrador directo congela plantilla y datos del taller igual que enviar (fuera de la transacción: en PGlite una consulta fuera de `tx` quedaría esperando)
  const docTemplate = q.docTemplate ? null : await freezeDoc(await getSettings());
  const orderId = await createOrder({
    customerId: q.customerId, customerName: q.customerName, customerPhone: q.customerPhone, source: q.source, title: q.title, quoteId: q.id, discount: q.discount,
    notes: q.notes, items: itemInputs, links: links.filter((l) => l.ownerType === 'quote').map((l) => ({ ...l })), deposit: o.deposit, dueDate: o.dueDate ?? null,
    approvedBy: o.by, approvedChannel: o.channel,
  }, user, {
    frozen, totals: { total: q.total, taxAmount: q.taxAmount },
    // el presupuesto se toma con un update condicionado en la misma transacción: dos aprobaciones simultáneas no crean dos pedidos
    claim: async (tx) => {
      const [claimed] = await tx.update(s.quotes).set({ status: 'aprobado', frozen: true, ...(docTemplate ? { docTemplate } : {}), approvedBy: o.by, approvedChannel: o.channel, approvedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(s.quotes.id, quoteId), inArray(s.quotes.status, ['borrador', 'enviado', 'vencido']), sql`date_trunc('milliseconds', ${s.quotes.updatedAt}) = ${q.updatedAt}`)).returning({ id: s.quotes.id });
      if (claimed) return;
      // sin cambio de estado: un guardado (otra pestaña) lo modificó después de leerlo; no se aprueba con líneas viejas
      const [now] = await tx.select({ status: s.quotes.status }).from(s.quotes).where(eq(s.quotes.id, quoteId));
      throw new Error(t(now?.status === q.status ? 'orders.quoteChangedWhileApproving' : 'orders.theQuoteIsAlreadyApproved'));
    },
  });
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
    // la línea se reserva antes de crear el trabajo: dos planificaciones simultáneas no la duplican
    const [mine] = await db.update(s.orderItems).set({ status: 'en_cola' }).where(and(eq(s.orderItems.id, it.id), eq(s.orderItems.status, it.status))).returning({ id: s.orderItems.id });
    if (!mine) continue;
    const mm = await db.select({ f: s.modelFiles }).from(s.quoteItemModels).innerJoin(s.modelFiles, eq(s.modelFiles.id, s.quoteItemModels.modelFileId)).where(eq(s.quoteItemModels.orderItemId, it.id));
    const dims = mm.length ? ([Math.max(...mm.map((x) => x.f.dimX ?? 0)), Math.max(...mm.map((x) => x.f.dimY ?? 0)), Math.max(...mm.map((x) => x.f.dimZ ?? 0))] as [number, number, number]) : null;
    let id: string;
    try { id = await createJob({ kind: 'pedido', title: `${order.number} · ${it.description || t('orders.part')} ×${qty}`, materialId, qty, estG, estH, orderId, orderItemIds: [it.id], machineId: it.machineId, dims: dims && dims[0] > 0 ? dims : null, sliceRunId: it.sliceRunId, userId: user.id }); }
    catch (e) { await db.update(s.orderItems).set({ status: it.status }).where(eq(s.orderItems.id, it.id)); throw e; }
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
    // una línea sin imprimir (p. ej. falla total sin reimpresión) impide pasar a post-proceso
    const unprinted = items.some((i) => i.status === 'pendiente' || i.status === 'en_cola');
    if (!open.length && closedOk && !unprinted) status = 'post_proceso'; else status = printing || live.some((j) => j.status === 'terminado') || open.length ? 'en_produccion' : 'recibido';
  } else if (items.length && items.every((i) => i.variantId && i.fromStock >= i.qty)) status = 'listo';
  if (status !== o.status) {
    await db.update(s.orders).set({ status, updatedAt: new Date() }).where(eq(s.orders.id, orderId));
    await audit('order', orderId, 'estado', { from: o.status, to: status });
  }
}

export async function setOrderStatus(orderId: string, to: 'listo' | 'entregado' | 'post_proceso', user: User, o: { tracking?: string; shipMethod?: string } = {}) {
  const t = await getT();
  const db = await getDb();
  const [ord] = await db.select().from(s.orders).where(eq(s.orders.id, orderId));
  if (!ord) throw new Error(t('orders.orderNotFound'));
  if (ord.status === 'cancelado') throw new Error(t('orders.theOrderIsCancelled'));
  // solo avances válidos: listo desde post-proceso (o recibido si todo sale de stock), entregado desde listo; nada retrocede
  const lines = to === 'listo' && ord.status === 'recibido' ? await db.select().from(s.orderItems).where(eq(s.orderItems.orderId, orderId)) : [];
  const allowed = to === 'entregado' ? ord.status === 'listo'
    : to === 'listo' ? ord.status === 'post_proceso' || (ord.status === 'recibido' && lines.length > 0 && lines.every((i) => i.variantId && i.fromStock >= i.qty))
    : to === 'post_proceso' ? ord.status === 'en_produccion' : false;
  if (!allowed) throw new Error(t('orders.orderStatusChanged'));
  const patch: Record<string, any> = { status: to, updatedAt: new Date() };
  if (o.tracking !== undefined) patch.tracking = o.tracking;
  if (o.shipMethod) patch.shipMethod = o.shipMethod;
  if (to === 'entregado') patch.deliveredAt = new Date();
  // transición condicionada antes de mover stock: una entrega repetida (doble clic, otra pestaña) no descuenta dos veces
  const [claimed] = await db.update(s.orders).set(patch).where(and(eq(s.orders.id, orderId), eq(s.orders.status, ord.status))).returning({ id: s.orders.id });
  if (!claimed) throw new Error(t('orders.orderStatusChanged'));
  // las líneas impresas acompañan al pedido: «Listo» no deja líneas en post-proceso
  if (to === 'listo') await db.update(s.orderItems).set({ status: 'listo' }).where(and(eq(s.orderItems.orderId, orderId), eq(s.orderItems.status, 'post_proceso')));
  if (to === 'entregado') {
    // las unidades reservadas de stock salen definitivamente
    const items = await db.select().from(s.orderItems).where(and(eq(s.orderItems.orderId, orderId), sql`${s.orderItems.variantId} is not null`));
    for (const it of items) {
      const qty = it.fromStock;
      if (qty <= 0) continue;
      const [v] = await db.update(s.productVariants).set({ stock: sql`${s.productVariants.stock} - ${qty}`, reserved: sql`greatest(0, ${s.productVariants.reserved} - ${qty})`, updatedAt: new Date() }).where(eq(s.productVariants.id, it.variantId!)).returning();
      if (!v) continue;
      await db.insert(s.stockMovements).values({ workspaceId: WORKSPACE_ID, variantId: v.id, kind: 'venta', qty: -qty, unitCost: v.avgCost, orderId, reason: t('orders.order', { number: ord.number }), createdBy: user.id });
      if (v.stock <= v.minStock) await notify('stock_bajo', t('orders.lowProductStock', { sku: v.sku }), t('orders.unitsLeftMinimum', { stock: v.stock, min: v.minStock }), '/catalogo');
    }
    await db.update(s.orderItems).set({ status: 'entregado' }).where(eq(s.orderItems.orderId, orderId));
  }
  await audit('order', orderId, 'estado', { from: ord.status, to, tracking: o.tracking }, user.id);
}

export async function cancelOrder(orderId: string, reason: string, user: User) {
  const t = await getT();
  const db = await getDb();
  const [ord] = await db.select().from(s.orders).where(eq(s.orders.id, orderId));
  if (!ord) throw new Error(t('orders.orderNotFound'));
  if (ord.status === 'entregado') throw new Error(t('orders.aDeliveredOrderCannotBe'));
  if (ord.status === 'cancelado') throw new Error(t('orders.theOrderIsCancelled'));
  // se cancela primero (condicionado): una segunda cancelación no libera reservas de otros pedidos
  const [claimed] = await db.update(s.orders).set({ status: 'cancelado', canceledReason: reason, updatedAt: new Date() })
    .where(and(eq(s.orders.id, orderId), eq(s.orders.status, ord.status))).returning({ id: s.orders.id });
  if (!claimed) throw new Error(t('orders.orderStatusChanged'));
  const jobs = await db.select().from(s.printJobs).where(and(eq(s.printJobs.orderId, orderId), inArray(s.printJobs.status, ['en_cola', 'pausado'])));
  for (const j of jobs) await cancelJob(j.id, user.id);
  const items = await db.select().from(s.orderItems).where(and(eq(s.orderItems.orderId, orderId), sql`${s.orderItems.variantId} is not null`));
  for (const it of items) if (it.fromStock > 0) {
    await db.update(s.productVariants).set({ reserved: sql`greatest(0, ${s.productVariants.reserved} - ${it.fromStock})` }).where(eq(s.productVariants.id, it.variantId!));
  }
  await audit('order', orderId, 'cancelar', { reason }, user.id);
}

export async function addPayment(o: { orderId?: string; saleId?: string; amount: number; method: string; note?: string; receiptKey?: string; taxDocType?: string; taxDocFolio?: string; paidAt?: string }, user: User) {
  const t = await getT();
  const db = await getDb();
  if (o.amount <= 0) throw new Error(t('orders.theAmountMustBeGreater'));
  await db.insert(s.payments).values({
    workspaceId: WORKSPACE_ID, orderId: o.orderId ?? null, saleId: o.saleId ?? null, amount: Math.round(o.amount), method: o.method, paidAt: o.paidAt ?? ymd(),
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
export async function recomputePaid(db: Db | Tx, p: { orderId: string | null; saleId: string | null }) {
  if (p.orderId) { const [r] = await db.select({ t: sql<number>`coalesce(sum(${s.payments.amount}),0)` }).from(s.payments).where(and(eq(s.payments.orderId, p.orderId), isNull(s.payments.deletedAt))); await db.update(s.orders).set({ paid: Number(r.t), updatedAt: new Date() }).where(eq(s.orders.id, p.orderId)); }
  if (p.saleId) { const [r] = await db.select({ t: sql<number>`coalesce(sum(${s.payments.amount}),0)` }).from(s.payments).where(and(eq(s.payments.saleId, p.saleId), isNull(s.payments.deletedAt))); await db.update(s.sales).set({ paid: Number(r.t) }).where(eq(s.sales.id, p.saleId)); }
}
