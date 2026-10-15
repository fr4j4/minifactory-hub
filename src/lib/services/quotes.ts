import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { audit } from '../audit';
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
    const price = v ? Math.round((v.price * (1 + priceAdjPct / 100)) / 10) * 10 : 0;
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
  return { breakdown: bd, suggestedUnit: unit, costTotal: bd.cost, frozenCost: bd.cost };
}

async function replaceLinks(db: Db, ownerType: string, ownerId: string, links: LinkInput[] | undefined, userId?: string | null) {
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
  let quoteId = input.id;
  const [existing] = quoteId ? await db.select().from(s.quotes).where(eq(s.quotes.id, quoteId)) : [];
  if (existing?.frozen) throw new Error(t('quotes.theQuoteHasAlreadyBeen'));
  // lista de precios del cliente
  let adj = 0;
  if (input.customerId) {
    const [c] = await db.select().from(s.customers).where(eq(s.customers.id, input.customerId));
    if (c?.priceListId) { const [pl] = await db.select().from(s.priceLists).where(eq(s.priceLists.id, c.priceListId)); adj = pl?.adjustPct ?? 0; }
  }
  const valid = input.validUntil ?? new Date(Date.now() + ctx.settings.quoteValidDays * 86400_000).toISOString().slice(0, 10);
  const header = {
    customerId: input.customerId ?? null, customerName: input.customerName ?? null, customerPhone: input.customerPhone ?? null, source: input.source ?? null,
    title: input.title ?? null, urgency: input.urgency ?? 'normal', applyTax: input.applyTax ?? (ctx.settings.rates.taxDefault ?? false), discount: Math.max(0, Math.round(input.discount ?? 0)), finalTotal: input.finalTotal ?? null,
    priceReason: input.priceReason ?? null, notes: input.notes ?? null, validUntil: valid, updatedAt: new Date(),
  };
  if (!quoteId) {
    const number = input._version?.number ?? await nextNumber('quote');
    const [q] = await db.insert(s.quotes).values({ workspaceId: WORKSPACE_ID, number, version: input._version?.version ?? 1, rootId: input._version?.rootId, createdBy: user.id, ...header }).returning({ id: s.quotes.id });
    quoteId = q.id;
    if (!input._version) await db.update(s.quotes).set({ rootId: quoteId }).where(eq(s.quotes.id, quoteId));
  } else await db.update(s.quotes).set(header).where(eq(s.quotes.id, quoteId));

  // reemplazar líneas conservando precios finales anteriores para el historial
  const oldItems = await db.select().from(s.quoteItems).where(eq(s.quoteItems.quoteId, quoteId));
  const oldById = new Map(oldItems.map((o) => [o.id, o]));
  if (oldItems.length) {
    const ids = oldItems.map((o) => o.id);
    await db.delete(s.quoteItemModels).where(inArray(s.quoteItemModels.quoteItemId, ids));
    await db.delete(s.referenceLinks).where(and(eq(s.referenceLinks.ownerType, 'quote_item'), inArray(s.referenceLinks.ownerId, ids)));
    await db.delete(s.quoteItems).where(eq(s.quoteItems.quoteId, quoteId));
  }
  const lines: QuoteLine[] = [];
  let pos = 0;
  for (const it of input.items) {
    const priced = await priceItem(it, ctx, adj);
    const urgPct = rt.urgency.find((u) => u.key === (input.urgency ?? 'normal'))?.pct ?? 0;
    if (urgPct) priced.suggestedUnit = Math.round((priced.suggestedUnit * (1 + urgPct / 100)) / 10) * 10;
    const finalUnit = it.finalUnit != null && it.finalUnit >= 0 ? Math.round(it.finalUnit) : null;
    const [row] = await db.insert(s.quoteItems).values({
      workspaceId: WORKSPACE_ID, quoteId, position: pos++, kind: it.kind ?? (it.variantId ? 'producto' : it.models?.length ? 'modelo' : 'manual'),
      description: it.description ?? '', qty: Math.max(1, Math.floor(it.qty || 1)), optional: !!it.optional, groupName: it.groupName ?? null,
      materialId: it.materialId ?? null, color: it.color ?? null, machineId: it.machineId ?? null, processProfileId: it.processProfileId ?? null,
      mode: it.mode ?? 'manual', gramsTotal: it.gramsTotal ?? 0, hoursTotal: it.hoursTotal ?? 0, origin: it.origin ?? {},
      postMinutes: it.postMinutes ?? 0, postSupplies: it.postSupplies ?? 0, prepMinutes: it.prepMinutes ?? rt.prepMinutes, shipping: it.shipping ?? 0,
      costBreakdown: priced.breakdown as any, suggestedUnit: priced.suggestedUnit, finalUnit, sliceRunId: it.sliceRunId ?? null, variantId: it.variantId ?? null, createdBy: user.id,
    }).returning({ id: s.quoteItems.id });
    let k = 0;
    for (const m of it.models ?? []) await db.insert(s.quoteItemModels).values({ workspaceId: WORKSPACE_ID, quoteItemId: row.id, modelFileId: m.modelFileId, fileVersionId: m.fileVersionId ?? null, qty: m.qty ?? 1, position: k++ });
    await replaceLinks(db, 'quote_item', row.id, it.links, user.id);
    // historial de precio final
    const prev = it.id ? oldById.get(it.id) : undefined;
    const prevFinal = prev?.finalUnit ?? null;
    if (finalUnit !== prevFinal && (finalUnit != null || prevFinal != null)) {
      const net = rt.pricingModel === 'neto' ? (finalUnit ?? priced.suggestedUnit) : ctx.settings.rates.taxMode === 'incluido' ? (finalUnit ?? priced.suggestedUnit) / (1 + rt.taxPct / 100) : (finalUnit ?? priced.suggestedUnit);
      await db.insert(s.priceAdjustments).values({
        workspaceId: WORKSPACE_ID, ownerType: 'quote_item', ownerId: row.id, suggested: priced.suggestedUnit, previous: prevFinal, next: finalUnit,
        reason: input.priceReason ?? null, belowCost: net * Math.max(1, it.qty) < priced.costTotal, authorizedBy: canSellBelowCost(user) ? user.id : null, createdBy: user.id,
      });
    }
    lines.push({ id: row.id, qty: Math.max(1, it.qty), optional: !!it.optional, suggestedUnit: priced.suggestedUnit, finalUnit, cost: priced.costTotal - (it.shipping ?? 0), shipping: it.shipping });
  }
  await replaceLinks(db, 'quote', quoteId, input.links, user.id);
  const tt = calcQuote(lines, rt, { discount: header.discount, finalTotalOverride: header.finalTotal, applyTax: header.applyTax });
  if ((tt.belowCost || tt.lines.some((l) => l.belowCost)) && !canSellBelowCost(user)) {
    throw new Error(t('quotes.theFinalPriceIsBelow2'));
  }
  if (tt.belowCost && !(header.priceReason ?? '').trim()) throw new Error(t('quotes.enterTheReasonForThe'));
  await db.update(s.quotes).set({
    suggestedTotal: tt.suggestedTotal, total: tt.total, taxAmount: tt.tax, costTotal: tt.cost,
    calc: { totals: { subtotal: tt.subtotal, net: tt.net, marginPct: tt.marginPct, diffPct: tt.diffPct, belowMin: tt.belowMin, belowCost: tt.belowCost }, lines: tt.lines } as any,
  }).where(eq(s.quotes.id, quoteId));
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
  await db.update(s.quotes).set({ status: 'enviado', frozen: true, docTemplate, updatedAt: new Date() }).where(and(eq(s.quotes.id, id), eq(s.quotes.status, 'borrador')));
  await audit('quote', id, 'estado', { to: 'enviado' }, userId);
}

export async function rejectQuote(id: string, reason: string, userId: string) {
  const db = await getDb();
  await db.update(s.quotes).set({ status: 'rechazado', notes: sql`coalesce(${s.quotes.notes},'') || ${'\n' + (await getT())('quotes.rejectedPrefix') + ' ' + reason}`, frozen: true, updatedAt: new Date() }).where(eq(s.quotes.id, id));
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
    discount: q.discount, finalTotal: recalc ? null : q.finalTotal, priceReason: q.priceReason, notes: q.notes, items: itemInputs,
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
  const lines: Array<{ id: string; description: string; qty: number; oldUnit: number; newUnit: number }> = [];
  for (const it of data.items) {
    const priced = await priceItem(it as unknown as ItemInput, ctx);
    lines.push({ id: it.id, description: it.description, qty: it.qty, oldUnit: it.finalUnit ?? it.suggestedUnit, newUnit: priced.suggestedUnit });
  }
  const oldTotal = lines.reduce((a, l) => a + l.oldUnit * l.qty, 0); const newTotal = lines.reduce((a, l) => a + l.newUnit * l.qty, 0);
  return { lines, oldTotal, newTotal, delta: newTotal - oldTotal };
}

/** Presupuestos enviados o en borrador cuya vigencia ya pasó pasan a "vencido". */
export async function expireQuotes() {
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  await db.update(s.quotes).set({ status: 'vencido' }).where(and(inArray(s.quotes.status, ['enviado', 'borrador']), sql`${s.quotes.validUntil} < ${today}`, isNull(s.quotes.deletedAt)));
}

