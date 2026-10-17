import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID, type Tx } from '@/db';
import { audit, notify } from '../audit';
import { getSettings, nextNumber } from '../settings';
import { calcLine, calcQuote, roundPrice, type CostBreakdown, type MachineCost, type QuoteLine } from '../pricing';
import { materialCostPerKg } from './inventory';
import { canSellBelowCost, type PermUser } from '../perm';
import { normalizeUrl } from '../links';
import { getT } from '@/i18n/server';
import { normalizeTemplate } from '../documents';

type Db = Awaited<ReturnType<typeof getDb>>;

export interface LinkInput { id?: string; url: string; title?: string | null; kind?: string; note?: string | null; imageUrl?: string | null; showInPdf?: boolean }
export interface ModelRef { modelFileId: string; fileVersionId?: string | null; qty?: number }
export interface ItemInput {
  id?: string; kind?: string; description: string; qty: number; optional?: boolean; groupName?: string | null;
  materialId?: string | null; color?: string | null; machineId?: string | null; processProfileId?: string | null;
  mode?: 'auto' | 'semi' | 'manual'; gramsTotal?: number; hoursTotal?: number; origin?: Record<string, any>;
  postMinutes?: number; postSupplies?: number; prepMinutes?: number; shipping?: number;
  finalUnit?: number | null; sliceRunId?: string | null; variantId?: string | null;
  models?: ModelRef[]; links?: LinkInput[];
}
export interface QuoteInput {
  id?: string; customerId?: string | null; customerName?: string | null; customerPhone?: string | null; source?: string | null; title?: string | null;
  urgency?: string; discount?: number; applyTax?: boolean; finalTotal?: number | null; priceReason?: string | null; notes?: string | null; validUntil?: string | null;
  items: ItemInput[]; links?: LinkInput[];
  _version?: { number: string; version: number; rootId: string };
}

export async function pricingContext(db?: Db) {
  db = db ?? (await getDb());
  const settings = await getSettings();
  const machines = await db.select().from(s.machines).where(isNull(s.machines.deletedAt));
  const mMap = new Map(machines.map((m) => [m.id, m]));
  return { settings, machines: mMap, db };
}

export function machineCostOf(m: typeof s.machines.$inferSelect | undefined | null): MachineCost | null {
  if (!m) return null;
  const done = m.jobsOk + m.jobsFailed;
  return {
    purchaseValue: m.purchaseValue, residualValue: m.residualValue, lifeHours: m.lifeHours, watts: m.watts, maintCostHour: m.maintCostHour,
    failRatePct: done >= 10 ? (m.jobsFailed / done) * 100 : null, timeFactor: m.timeFactor,
  };
}

export interface PricedItem { breakdown: CostBreakdown; suggestedUnit: number; costTotal: number; frozenCost: number }

/** Calcula costos y precio sugerido de una línea con las tarifas y datos actuales. */
export async function priceItem(it: ItemInput, ctx: Awaited<ReturnType<typeof pricingContext>>, priceAdjPct = 0): Promise<PricedItem> {
  const rt = ctx.settings.rates;
  const qty = Math.max(1, Math.floor(it.qty || 1));
  if (it.variantId) {
    const [v] = await ctx.db.select().from(s.productVariants).where(eq(s.productVariants.id, it.variantId));
    const price = v ? (priceAdjPct ? roundPrice(v.price * (1 + priceAdjPct / 100), rt.rounding) : v.price) : 0;
    const cost = (v?.avgCost ?? 0) * qty;
    const bd = { material: 0, machine: 0, energy: 0, prep: 0, post: 0, failure: 0, cost, marginPct: price > 0 ? ((price - (v?.avgCost ?? 0)) / price) * 100 : 0, urgencyPct: 0, volumePct: 0, priceBeforeRound: price * qty, suggestedTotal: price * qty, suggestedUnit: price, shipping: it.shipping ?? 0, hoursEffective: 0, gramsEffective: 0 };
    return { breakdown: bd, suggestedUnit: price, costTotal: cost + (it.shipping ?? 0), frozenCost: cost };
  }
  const costPerKg = it.materialId ? await materialCostPerKg(it.materialId, ctx.db) : 0;
  const machine = it.machineId ? machineCostOf(ctx.machines.get(it.machineId)) : null;
  const bd = calcLine({
    qty, gramsTotal: it.gramsTotal ?? 0, hoursTotal: it.hoursTotal ?? 0, costPerKg, machine, prepMinutes: it.prepMinutes, postMinutesPerUnit: it.postMinutes,
    postSuppliesPerUnit: it.postSupplies, shipping: it.shipping, applyTimeFactor: it.mode !== 'manual',
  }, rt);
  const unit = priceAdjPct ? roundPrice((bd.suggestedUnit * (1 + priceAdjPct / 100)), rt.rounding) : bd.suggestedUnit;
  // costTotal incluye el envío, igual que en los productos de catálogo (quien lo usa resta el envío)
  return { breakdown: bd, suggestedUnit: unit, costTotal: bd.cost + (it.shipping ?? 0), frozenCost: bd.cost };
}

/** Ajuste (%) de la lista de precios del cliente. */
export async function customerPriceAdj(db: Db, customerId?: string | null): Promise<number> {
  if (!customerId) return 0;
  const [c] = await db.select().from(s.customers).where(eq(s.customers.id, customerId));
  if (!c?.priceListId) return 0;
  const [pl] = await db.select().from(s.priceLists).where(eq(s.priceLists.id, c.priceListId));
  return pl?.adjustPct ?? 0;
}

/** Precio de una línea de presupuesto: tarifas actuales + lista de precios del cliente + recargo por urgencia (lo mismo al guardar y en la vista previa). */
async function priceQuoteItem(it: ItemInput, ctx: Awaited<ReturnType<typeof pricingContext>>, adj: number, urgency?: string | null): Promise<PricedItem> {
  const rt = ctx.settings.rates;
  const p = await priceItem(it, ctx, adj);
  const urgPct = rt.urgency.find((u) => u.key === (urgency ?? 'normal'))?.pct ?? 0;
  if (urgPct) p.suggestedUnit = roundPrice(p.suggestedUnit * (1 + urgPct / 100), rt.rounding);
  return p;
}

async function replaceLinks(db: Db | Tx, ownerType: string, ownerId: string, links: LinkInput[] | undefined, userId?: string | null) {
  if (!links) return;
  await db.delete(s.referenceLinks).where(and(eq(s.referenceLinks.ownerType, ownerType), eq(s.referenceLinks.ownerId, ownerId)));
  for (const l of links) {
    if (!l.url?.trim()) continue;
    await db.insert(s.referenceLinks).values({
      workspaceId: WORKSPACE_ID, url: normalizeUrl(l.url), title: l.title ?? null, kind: l.kind ?? 'otro', note: l.note ?? null, imageUrl: l.imageUrl ?? null,
      showInPdf: !!l.showInPdf, ownerType, ownerId, createdBy: userId ?? null,
    });
  }
}

export async function saveQuote(input: QuoteInput, user: PermUser & { id: string }): Promise<string> {
  const t = await getT();
  const ctx = await pricingContext();
  const db = ctx.db;
  const rt = ctx.settings.rates;
  const [existing] = input.id ? await db.select().from(s.quotes).where(eq(s.quotes.id, input.id)) : [];
  if (input.id && !existing) throw new Error(t('quotes.quoteNotFound'));
  if (existing?.frozen) throw new Error(t('quotes.theQuoteHasAlreadyBeen'));
  const adj = await customerPriceAdj(db, input.customerId);
  const valid = input.validUntil ?? new Date(Date.now() + ctx.settings.quoteValidDays * 86400_000).toISOString().slice(0, 10);
  const header = {
    customerId: input.customerId ?? null, customerName: input.customerName ?? null, customerPhone: input.customerPhone ?? null, source: input.source ?? null,
    title: input.title ?? null, urgency: input.urgency ?? 'normal', applyTax: input.applyTax ?? (ctx.settings.rates.taxDefault ?? false), discount: Math.max(0, Math.round(input.discount ?? 0)), finalTotal: input.finalTotal ?? null,
    priceReason: input.priceReason ?? null, notes: input.notes ?? null, validUntil: valid, updatedAt: new Date(),
  };

  // 1) precios y validaciones antes de escribir: un guardado rechazado no deja líneas ni totales a medias
  const priced: Array<{ it: ItemInput; p: PricedItem; finalUnit: number | null }> = [];
  const lines: QuoteLine[] = [];
  for (const it of input.items) {
    const p = await priceQuoteItem(it, ctx, adj, input.urgency);
    const finalUnit = it.finalUnit != null && it.finalUnit >= 0 ? Math.round(it.finalUnit) : null;
    lines.push({ id: String(priced.length), qty: Math.max(1, it.qty), optional: !!it.optional, suggestedUnit: p.suggestedUnit, finalUnit, cost: p.costTotal - (it.shipping ?? 0), shipping: it.shipping });
    priced.push({ it, p, finalUnit });
  }
  const shipping = input.items.filter((i) => !i.optional).reduce((a, i) => a + (i.shipping ?? 0), 0);
  if (header.finalTotal != null && header.finalTotal < shipping) throw new Error(t('quotes.finalTotalBelowShipping'));
  const tt = calcQuote(lines, rt, { discount: header.discount, finalTotalOverride: header.finalTotal, applyTax: header.applyTax });
  if ((tt.belowCost || tt.lines.some((l) => l.belowCost)) && !canSellBelowCost(user)) {
    throw new Error(t('quotes.theFinalPriceIsBelow2'));
  }
  if (tt.belowCost && !(header.priceReason ?? '').trim()) throw new Error(t('quotes.enterTheReasonForThe'));

  // 2) escritura en una transacción (dentro solo se usa `tx`: en PGlite una consulta fuera de ella quedaría esperando)
  const number = existing ? null : input._version?.number ?? await nextNumber('quote');
  const quoteId = await db.transaction(async (tx) => {
    let quoteId = existing?.id;
    if (!quoteId) {
      const [q] = await tx.insert(s.quotes).values({ workspaceId: WORKSPACE_ID, number: number!, version: input._version?.version ?? 1, rootId: input._version?.rootId, createdBy: user.id, ...header }).returning({ id: s.quotes.id });
      quoteId = q.id;
      if (!input._version) await tx.update(s.quotes).set({ rootId: quoteId }).where(eq(s.quotes.id, quoteId));
    } else {
      // condicionado: si otra pestaña lo envió o aprobó entretanto, no se reescriben sus líneas (lanza y se deshace la transacción)
      const [open] = await tx.update(s.quotes).set(header).where(and(eq(s.quotes.id, quoteId), eq(s.quotes.frozen, false))).returning({ id: s.quotes.id });
      if (!open) throw new Error(t('quotes.theQuoteHasAlreadyBeen'));
    }

    // reemplazar líneas: cada línea conocida conserva su id (historial de precios, enlaces y vistas de detalle siguen apuntando a ella)
    const oldItems = await tx.select().from(s.quoteItems).where(eq(s.quoteItems.quoteId, quoteId));
    const oldById = new Map(oldItems.map((o) => [o.id, o]));
    if (oldItems.length) {
      const ids = oldItems.map((o) => o.id);
      await tx.delete(s.quoteItemModels).where(inArray(s.quoteItemModels.quoteItemId, ids));
      await tx.delete(s.referenceLinks).where(and(eq(s.referenceLinks.ownerType, 'quote_item'), inArray(s.referenceLinks.ownerId, ids)));
      await tx.delete(s.quoteItems).where(eq(s.quoteItems.quoteId, quoteId));
    }
    const rowIds: string[] = [];
    for (const [pos, { it, p, finalUnit }] of priced.entries()) {
      const prev = it.id ? oldById.get(it.id) : undefined;
      if (prev) oldById.delete(prev.id); // una línea duplicada en el navegador trae el mismo id: solo la primera lo conserva
      const [row] = await tx.insert(s.quoteItems).values({
        id: prev?.id, workspaceId: WORKSPACE_ID, quoteId, position: pos, kind: it.kind ?? (it.variantId ? 'producto' : it.models?.length ? 'modelo' : 'manual'),
        description: it.description ?? '', qty: Math.max(1, Math.floor(it.qty || 1)), optional: !!it.optional, groupName: it.groupName ?? null,
        materialId: it.materialId ?? null, color: it.color ?? null, machineId: it.machineId ?? null, processProfileId: it.processProfileId ?? null,
        mode: it.mode ?? 'manual', gramsTotal: it.gramsTotal ?? 0, hoursTotal: it.hoursTotal ?? 0, origin: it.origin ?? {},
        postMinutes: it.postMinutes ?? 0, postSupplies: it.postSupplies ?? 0, prepMinutes: it.prepMinutes ?? rt.prepMinutes, shipping: it.shipping ?? 0,
        costBreakdown: p.breakdown as any, suggestedUnit: p.suggestedUnit, finalUnit, sliceRunId: it.sliceRunId ?? null, variantId: it.variantId ?? null, createdBy: prev?.createdBy ?? user.id,
      }).returning({ id: s.quoteItems.id });
      rowIds.push(row.id);
      let k = 0;
      for (const m of it.models ?? []) await tx.insert(s.quoteItemModels).values({ workspaceId: WORKSPACE_ID, quoteItemId: row.id, modelFileId: m.modelFileId, fileVersionId: m.fileVersionId ?? null, qty: m.qty ?? 1, position: k++ });
      await replaceLinks(tx, 'quote_item', row.id, it.links, user.id);
      // historial de precio final
      const prevFinal = prev?.finalUnit ?? null;
      if (finalUnit !== prevFinal && (finalUnit != null || prevFinal != null)) {
        const net = finalUnit ?? p.suggestedUnit;
        await tx.insert(s.priceAdjustments).values({
          workspaceId: WORKSPACE_ID, ownerType: 'quote_item', ownerId: row.id, suggested: p.suggestedUnit, previous: prevFinal, next: finalUnit,
          reason: input.priceReason ?? null, belowCost: net * Math.max(1, it.qty) < p.costTotal - (it.shipping ?? 0), authorizedBy: canSellBelowCost(user) ? user.id : null, createdBy: user.id,
        });
      }
    }
    await replaceLinks(tx, 'quote', quoteId, input.links, user.id);
    await tx.update(s.quotes).set({
      suggestedTotal: tt.suggestedTotal, total: tt.total, taxAmount: tt.tax, costTotal: tt.cost,
      calc: { totals: { subtotal: tt.subtotal, net: tt.net, marginPct: tt.marginPct, diffPct: tt.diffPct, belowMin: tt.belowMin, belowCost: tt.belowCost }, lines: tt.lines.map((l) => ({ ...l, id: rowIds[Number(l.id)] })) } as any,
    }).where(eq(s.quotes.id, quoteId));
    return quoteId;
  });
  await audit('quote', quoteId, existing ? 'editar' : 'crear', { total: tt.total, suggested: tt.suggestedTotal, final: header.finalTotal }, user.id);
  return quoteId;
}

export async function loadQuote(id: string) {
  const db = await getDb();
  const [q] = await db.select().from(s.quotes).where(eq(s.quotes.id, id));
  if (!q || q.deletedAt) return null;
  const items = await db.select().from(s.quoteItems).where(eq(s.quoteItems.quoteId, id)).orderBy(asc(s.quoteItems.position));
  const ids = items.map((i) => i.id);
  const models = ids.length ? await db.select({ qm: s.quoteItemModels, name: s.modelFiles.name, thumb: s.fileVersions.thumbKey, vnum: s.fileVersions.number })
    .from(s.quoteItemModels).innerJoin(s.modelFiles, eq(s.modelFiles.id, s.quoteItemModels.modelFileId))
    .leftJoin(s.fileVersions, eq(s.fileVersions.id, s.modelFiles.currentVersionId)).where(inArray(s.quoteItemModels.quoteItemId, ids)) : [];
  const links = await db.select().from(s.referenceLinks).where(and(inArray(s.referenceLinks.ownerType, ['quote', 'quote_item']), inArray(s.referenceLinks.ownerId, [id, ...ids])));
  const customer = q.customerId ? (await db.select().from(s.customers).where(eq(s.customers.id, q.customerId)))[0] : null;
  return { quote: q, items, models, links, customer };
}

/** Marca el presupuesto como enviado: congela precios y costos (cambiar tarifas ya no lo altera). */
export async function sendQuote(id: string, userId: string) {
  const db = await getDb();
  // al enviar se congela la plantilla del documento (lo que ve el cliente no cambia aunque el taller edite su plantilla después)
  const docTemplate = normalizeTemplate((await getSettings()).documents.quote) as unknown as Record<string, unknown>;
  const [sent] = await db.update(s.quotes).set({ status: 'enviado', frozen: true, docTemplate, updatedAt: new Date() }).where(and(eq(s.quotes.id, id), eq(s.quotes.status, 'borrador'))).returning({ id: s.quotes.id });
  // solo se anota si cambió: la fecha de envío que usan los avisos de seguimiento no se corre con un clic repetido
  if (sent) await audit('quote', id, 'estado', { to: 'enviado' }, userId);
}

export async function rejectQuote(id: string, reason: string, userId: string) {
  const t = await getT();
  const db = await getDb();
  // solo un presupuesto enviado o vencido se rechaza (uno aprobado tiene pedido)
  const [done] = await db.update(s.quotes).set({ status: 'rechazado', notes: sql`coalesce(${s.quotes.notes},'') || ${'\n' + t('quotes.rejectedPrefix') + ' ' + reason}`, frozen: true, updatedAt: new Date() })
    .where(and(eq(s.quotes.id, id), inArray(s.quotes.status, ['enviado', 'vencido']))).returning({ id: s.quotes.id });
  if (!done) throw new Error(t('quotes.quoteStatusChanged'));
  await audit('quote', id, 'estado', { to: 'rechazado', reason }, userId);
}

/** Cada cambio pedido por el cliente crea una versión nueva y conserva las anteriores. */
export async function newQuoteVersion(id: string, user: PermUser & { id: string }, recalc = false): Promise<string> {
  const t = await getT();
  const db = await getDb();
  const data = await loadQuote(id);
  if (!data) throw new Error(t('quotes.quoteNotFound'));
  const { quote: q, items, models, links } = data;
  const rootId = q.rootId ?? q.id;
  const [mx] = await db.select({ v: sql<number>`max(${s.quotes.version})` }).from(s.quotes).where(eq(s.quotes.rootId, rootId));
  const itemInputs: ItemInput[] = items.map((it) => ({
    ...(it as any), models: models.filter((m) => m.qm.quoteItemId === it.id).map((m) => ({ modelFileId: m.qm.modelFileId, fileVersionId: m.qm.fileVersionId, qty: m.qm.qty })),
    links: links.filter((l) => l.ownerType === 'quote_item' && l.ownerId === it.id).map((l) => ({ ...l })),
    finalUnit: recalc ? null : it.finalUnit, id: undefined,
  }));
  const newId = await saveQuote({
    customerId: q.customerId, customerName: q.customerName, customerPhone: q.customerPhone, source: q.source, title: q.title, urgency: q.urgency,
    applyTax: q.applyTax, discount: q.discount, finalTotal: recalc ? null : q.finalTotal, priceReason: q.priceReason, notes: q.notes, items: itemInputs,
    links: links.filter((l) => l.ownerType === 'quote').map((l) => ({ ...l })),
    _version: { number: q.number, version: Number(mx.v) + 1, rootId },
  }, user);
  if (q.status !== 'aprobado') await db.update(s.quotes).set({ status: 'reemplazado', frozen: true }).where(eq(s.quotes.id, id));
  await audit('quote', newId, 'nueva_version', { from: id, recalc }, user.id);
  return newId;
}

/** Vista previa de «recalcular con tarifas actuales»: por línea, lo que vale hoy contra lo que figura en el presupuesto. */
export async function previewRecalc(id: string) {
  const data = await loadQuote(id); if (!data) return null;
  const ctx = await pricingContext();
  const adj = await customerPriceAdj(ctx.db, data.quote.customerId);
  const lines: Array<{ id: string; description: string; qty: number; oldUnit: number; newUnit: number }> = [];
  for (const it of data.items) {
    const priced = await priceQuoteItem(it as unknown as ItemInput, ctx, adj, data.quote.urgency);
    lines.push({ id: it.id, description: it.description, qty: it.qty, oldUnit: it.finalUnit ?? it.suggestedUnit, newUnit: priced.suggestedUnit });
  }
  const oldTotal = lines.reduce((a, l) => a + l.oldUnit * l.qty, 0); const newTotal = lines.reduce((a, l) => a + l.newUnit * l.qty, 0);
  return { lines, oldTotal, newTotal, delta: newTotal - oldTotal };
}

/**
 * Avisos de seguimiento: a los N días de enviado un presupuesto que sigue sin respuesta se crea una notificación
 * (una vez por presupuesto y plazo; queda anotado en la actividad del presupuesto).
 */
export async function followUpQuotes(now = new Date()) {
  const db = await getDb(); const st = await getSettings(); const days = [...(st.quoteFollowUpDays ?? [])].filter((d) => d > 0).sort((a, b) => a - b);
  if (!days.length) return 0;
  const t = await getT();
  const sent = await db.select({ q: s.quotes }).from(s.quotes).where(and(eq(s.quotes.status, 'enviado'), isNull(s.quotes.deletedAt)));
  let made = 0;
  for (const { q } of sent) {
    const log = await db.select().from(s.activityLog).where(and(eq(s.activityLog.entity, 'quote'), eq(s.activityLog.entityId, q.id)));
    const sentAt = log.filter((a) => a.action === 'estado' && (a.changes as any)?.to === 'enviado').map((a) => a.createdAt).sort((a, b) => +b - +a)[0]; if (!sentAt) continue;
    const done = new Set(log.filter((a) => a.action === 'seguimiento').map((a) => Number((a.changes as any)?.day)));
    const due = days.filter((d) => !done.has(d) && now.getTime() >= sentAt.getTime() + d * 86400_000);
    if (!due.length) continue;
    const d = due[due.length - 1]; // si hubo varios plazos vencidos, se avisa solo por el último
    for (const x of due) await audit('quote', q.id, 'seguimiento', { day: x });
    await notify('seguimiento', t('quotes.followUpTitle', { number: q.number }), t('quotes.followUpBody', { days: d, customer: q.customerName ?? '—' }), `/presupuestos/${q.id}`);
    made++;
  }
  return made;
}

/** Presupuestos enviados o en borrador cuya vigencia ya pasó pasan a "vencido". */
export async function expireQuotes() {
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  await db.update(s.quotes).set({ status: 'vencido' }).where(and(inArray(s.quotes.status, ['enviado', 'borrador']), sql`${s.quotes.validUntil} < ${today}`, isNull(s.quotes.deletedAt)));
}

