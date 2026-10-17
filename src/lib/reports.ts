import { and, desc, eq, gte, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { getSettings } from './settings';
import { stockValue } from './stats';
import { getT } from '@/i18n/server';
import { tOr, type MessageKey } from '@/i18n/translate';
import { netOfGross } from './pricing';
import { canSeeCosts, type PermUser } from './perm';

export interface Col { key: string; label: string; fmt?: 'money' | 'num' | 'pct' | 'text' | 'date' | 'h' | 'kg' }
export interface ReportData { title: string; question: string; columns: Col[]; rows: Array<Record<string, any>>; summary?: Array<{ label: string; value: string }> }
export const REPORTS: Record<string, { title: MessageKey; question: MessageKey; costs?: boolean }> = {
  ventas: { title: 'reports.kind.ventas.title', question: 'reports.kind.ventas.question', costs: true },
  estimado_real: { title: 'reports.kind.estimado_real.title', question: 'reports.kind.estimado_real.question', costs: true },
  utilizacion: { title: 'reports.kind.utilizacion.title', question: 'reports.kind.utilizacion.question' },
  materiales: { title: 'reports.kind.materiales.title', question: 'reports.kind.materiales.question' },
  embudo: { title: 'reports.kind.embudo.title', question: 'reports.kind.embudo.question' },
  clientes: { title: 'reports.kind.clientes.title', question: 'reports.kind.clientes.question' },
  entregas: { title: 'reports.kind.entregas.title', question: 'reports.kind.entregas.question' },
  canales: { title: 'reports.kind.canales.title', question: 'reports.kind.canales.question', costs: true },
  precio_final: { title: 'reports.kind.precio_final.title', question: 'reports.kind.precio_final.question', costs: true },
  catalogo: { title: 'reports.kind.catalogo.title', question: 'reports.kind.catalogo.question' },
};

/** Reportes que el usuario puede ver: los de costos solo con canSeeCosts. Lo usan la página y la exportación. */
export const reportAllowed = (user: PermUser, kind: string) => !!REPORTS[kind] && (canSeeCosts(user) || !REPORTS[kind].costs);

const mon = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** El rol Ventas ve solo lo suyo (pedidos, ventas y presupuestos que creó); la decisión vive aquí para que página y exportación no diverjan. */
export async function reportData(kind: string, r: { from: Date; to: Date }, user: PermUser & { id: string }): Promise<ReportData> {
  const t = await getT();
  if (!reportAllowed(user, kind)) throw new Error(t('reports.unknownReport'));
  const costs = canSeeCosts(user); const onlyUser = user.role === 'ventas' ? user.id : undefined;
  const db = await getDb(); const st = await getSettings(); const meta = REPORTS[kind];
  const netOf = (g: number, tax = 0) => netOfGross(g, st.rates, tax);
  const oc = [gte(s.orders.createdAt, r.from), lte(s.orders.createdAt, r.to), ne(s.orders.status, 'cancelado'), isNull(s.orders.deletedAt)]; if (onlyUser) oc.push(eq(s.orders.createdBy, onlyUser));
  const orders = await db.select().from(s.orders).where(and(...oc));
  const sc = [gte(s.sales.createdAt, r.from), lte(s.sales.createdAt, r.to), ne(s.sales.status, 'anulada'), isNull(s.sales.deletedAt)]; if (onlyUser) sc.push(eq(s.sales.createdBy, onlyUser));
  const sales = await db.select().from(s.sales).where(and(...sc));
  const base = { title: t(meta.title), question: t(meta.question) };
  if (kind === 'ventas') {
    const by = new Map<string, { month: string; orders: number; sales: number; revenue: number; cost: number; tax: number }>();
    const add = (d: Date, rev: number, cost: number, o: number, sl: number, tax = 0) => { const k = mon(d); const e = by.get(k) ?? { month: k, orders: 0, sales: 0, revenue: 0, cost: 0, tax: 0 }; e.orders += o; e.sales += sl; e.revenue += rev; e.cost += cost; e.tax += tax; by.set(k, e); };
    for (const o of orders) add(o.createdAt, o.total, o.costReal ?? o.costEstimated, 1, 0, o.taxAmount);
    for (const x of sales) add(x.createdAt, x.total, x.costTotal + x.commission + x.shipping, 0, 1);
    const rows = [...by.values()].sort((a, b) => a.month.localeCompare(b.month)).map((e) => ({ ...e, margin: Math.round(netOf(e.revenue, e.tax) - e.cost), marginPct: e.revenue ? ((netOf(e.revenue, e.tax) - e.cost) / netOf(e.revenue, e.tax)) * 100 : null }));
    const cols: Col[] = [{ key: 'month', label: t('reports.month') }, { key: 'orders', label: t('common.orders'), fmt: 'num' }, { key: 'sales', label: t('reports.quickSales'), fmt: 'num' }, { key: 'revenue', label: t('common.sales'), fmt: 'money' }];
    if (costs) cols.push({ key: 'cost', label: t('common.cost'), fmt: 'money' }, { key: 'margin', label: t('common.margin'), fmt: 'money' }, { key: 'marginPct', label: t('reports.margin'), fmt: 'pct' });
    return { ...base, columns: cols, rows, summary: [{ label: t('reports.salesInThePeriod'), value: String(rows.reduce((a, x) => a + x.revenue, 0)) }] };
  }
  if (kind === 'estimado_real') {
    const rows = orders.filter((o) => o.costReal != null).map((o) => ({ number: o.number, customer: o.customerName, title: o.title, est: o.costEstimated, real: o.costReal, diff: (o.costReal ?? 0) - o.costEstimated, diffPct: o.costEstimated ? (((o.costReal ?? 0) - o.costEstimated) / o.costEstimated) * 100 : null })).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    return { ...base, columns: [{ key: 'number', label: t('common.order') }, { key: 'customer', label: t('common.customer') }, { key: 'title', label: t('common.details') }, { key: 'est', label: t('reports.estimatedCost'), fmt: 'money' }, { key: 'real', label: t('reports.actualCost'), fmt: 'money' }, { key: 'diff', label: t('reports.difference'), fmt: 'money' }, { key: 'diffPct', label: t('reports.variance'), fmt: 'pct' }], rows };
  }
  if (kind === 'utilizacion') {
    const machines = await db.select().from(s.machines).where(isNull(s.machines.deletedAt));
    const jobs = await db.select().from(s.printJobs).where(and(gte(s.printJobs.realEnd, r.from), lte(s.printJobs.realEnd, r.to)));
    const days = Math.max(1, (r.to.getTime() - r.from.getTime()) / 86400_000);
    const [hh] = st.workHours.start.split(':').map(Number); const [he] = st.workHours.end.split(':').map(Number); const dayH = Math.max(1, he - hh);
    const avail = days * (st.workHours.days.length / 7) * dayH;
    const rows = machines.map((m) => { const j = jobs.filter((x) => x.machineId === m.id); const used = j.reduce((a, x) => a + (x.realH ?? 0), 0); const ok = j.filter((x) => x.result === 'exito').length; return { machine: m.name, jobs: j.length, hours: used, util: (used / avail) * 100, failed: j.length - ok, success: j.length ? (ok / j.length) * 100 : null, factor: m.timeFactor }; });
    return { ...base, columns: [{ key: 'machine', label: t('common.machine') }, { key: 'jobs', label: t('reports.jobs'), fmt: 'num' }, { key: 'hours', label: t('common.hours'), fmt: 'h' }, { key: 'util', label: t('reports.utilizationWorkshopHours'), fmt: 'pct' }, { key: 'failed', label: t('reports.failures'), fmt: 'num' }, { key: 'success', label: t('reports.success'), fmt: 'pct' }, { key: 'factor', label: t('reports.actualEstimatedTimeFactor'), fmt: 'num' }], rows };
  }
  if (kind === 'materiales') {
    const mats = await db.select().from(s.materials);
    const mv = await db.select().from(s.inventoryMovements).where(and(gte(s.inventoryMovements.createdAt, r.from), lte(s.inventoryMovements.createdAt, r.to), inArray(s.inventoryMovements.kind, ['consumo', 'falla']), sql`${s.inventoryMovements.spoolId} is not null`));
    const sp = await db.select().from(s.spools); const mOf = new Map(sp.map((x) => [x.id, x.materialId]));
    const rows = mats.map((m) => { const mm = mv.filter((x) => mOf.get(x.spoolId!) === m.id); const used = mm.filter((x) => x.kind === 'consumo').reduce((a, x) => a - x.qty, 0); const fail = mm.filter((x) => x.kind === 'falla').reduce((a, x) => a - x.qty, 0); return { material: `${m.type} ${m.colorName}`, kg: (used + fail) / 1000, fail: fail / 1000, failPct: used + fail > 0 ? (fail / (used + fail)) * 100 : null }; }).filter((x) => x.kg > 0).sort((a, b) => b.kg - a.kg);
    return { ...base, columns: [{ key: 'material', label: t('common.material') }, { key: 'kg', label: t('reports.kgConsumed'), fmt: 'kg' }, { key: 'fail', label: t('reports.kgInFailures'), fmt: 'kg' }, { key: 'failPct', label: t('reports.failPct'), fmt: 'pct' }], rows };
  }
  if (kind === 'embudo') {
    const qs = await db.select().from(s.quotes).where(and(gte(s.quotes.createdAt, r.from), lte(s.quotes.createdAt, r.to), isNull(s.quotes.deletedAt), onlyUser ? eq(s.quotes.createdBy, onlyUser) : undefined));
    const cnt = (st_: string[]) => qs.filter((q) => st_.includes(q.status));
    const sent = cnt(['enviado', 'aprobado', 'rechazado', 'vencido']);
    const rows = [[t('reports.drafts'), cnt(['borrador'])], [t('reports.sentTotal'), sent], [t('reports.approved'), cnt(['aprobado'])], [t('reports.rejected'), cnt(['rechazado'])], [t('reports.expiredWithoutAReply'), cnt(['vencido'])]].map(([l, a]) => ({ stage: l as string, n: (a as any[]).length, amount: (a as any[]).reduce((x: number, q: any) => x + q.total, 0), rate: sent.length ? ((a as any[]).length / sent.length) * 100 : null }));
    const reasons = qs.filter((q) => q.status === 'rechazado').map((q) => (q.notes ?? '').split(/(?:Rechazado|Rejected):/).pop()?.trim() || t('reports.noReason'));
    const counts = reasons.reduce<Record<string, number>>((a, x) => ({ ...a, [x]: (a[x] ?? 0) + 1 }), {});
    for (const [k, v] of Object.entries(counts)) rows.push({ stage: `   ${t('reports.reasonPrefix')} ${k}`, n: v, amount: 0, rate: null });
    return { ...base, columns: [{ key: 'stage', label: t('common.stage') }, { key: 'n', label: t('common.quotes'), fmt: 'num' }, { key: 'amount', label: t('reports.amount'), fmt: 'money' }, { key: 'rate', label: t('reports.ofSent'), fmt: 'pct' }], rows };
  }
  if (kind === 'clientes') {
    const by = new Map<string, { customer: string; orders: number; revenue: number; last: Date }>();
    for (const o of orders) { const k = o.customerName ?? t('reports.unnamed'); const e = by.get(k) ?? { customer: k, orders: 0, revenue: 0, last: o.createdAt }; e.orders++; e.revenue += o.total; if (o.createdAt > e.last) e.last = o.createdAt; by.set(k, e); }
    const rows = [...by.values()].sort((a, b) => b.revenue - a.revenue).map((e) => ({ ...e, ticket: e.revenue / e.orders, recurrent: e.orders > 1 ? t('common.yesLabel') : t('reports.noLabel') }));
    return { ...base, columns: [{ key: 'customer', label: t('common.customer') }, { key: 'orders', label: t('common.orders'), fmt: 'num' }, { key: 'revenue', label: t('common.sales'), fmt: 'money' }, { key: 'ticket', label: t('reports.averageTicket'), fmt: 'money' }, { key: 'recurrent', label: t('reports.repeat') }, { key: 'last', label: t('common.lastOrder'), fmt: 'date' }], rows };
  }
  if (kind === 'entregas') {
    const del = orders.filter((o) => o.deliveredAt); 
    const rows = del.map((o) => { const days = (o.deliveredAt!.getTime() - o.createdAt.getTime()) / 86400_000; const onTime = !o.dueDate || o.deliveredAt!.toISOString().slice(0, 10) <= o.dueDate; return { number: o.number, customer: o.customerName, days, due: o.dueDate, onTime: onTime ? t('reports.onTime') : t('reports.late') }; });
    const avg = rows.length ? rows.reduce((a, x) => a + x.days, 0) / rows.length : 0; const pctOk = rows.length ? (rows.filter((x) => x.onTime === t('reports.onTime')).length / rows.length) * 100 : null;
    return { ...base, columns: [{ key: 'number', label: t('common.order') }, { key: 'customer', label: t('common.customer') }, { key: 'days', label: t('reports.daysToDelivery'), fmt: 'num' }, { key: 'due', label: t('reports.committedDate'), fmt: 'date' }, { key: 'onTime', label: t('reports.onTimeRate') }], rows, summary: [{ label: t('reports.average'), value: t('reports.daysValue', { n: avg.toFixed(1) }) }, { label: t('reports.onTime'), value: pctOk != null ? `${pctOk.toFixed(0)}%` : '—' }] };
  }
  if (kind === 'canales') {
    const ch = await db.select().from(s.salesChannels); const by = new Map<string, { channel: string; n: number; revenue: number; commission: number; shipping: number; net: number }>();
    for (const x of sales) { const name = ch.find((c) => c.id === x.channelId)?.name ?? t('reports.noChannel'); const e = by.get(name) ?? { channel: name, n: 0, revenue: 0, commission: 0, shipping: 0, net: 0 }; e.n++; e.revenue += x.total; e.commission += x.commission; e.shipping += x.shipping; e.net += x.netMargin; by.set(name, e); }
    for (const o of orders) { const name = `${t('common.orders')} · ${o.source ? tOr(t, `sources.${o.source}`, o.source) : t('reports.noSource')}`; const e = by.get(name) ?? { channel: name, n: 0, revenue: 0, commission: 0, shipping: 0, net: 0 }; e.n++; e.revenue += o.total; e.net += Math.round(netOf(o.total) - (o.costReal ?? o.costEstimated)); by.set(name, e); }
    const rows = [...by.values()].sort((a, b) => b.revenue - a.revenue);
    return { ...base, columns: [{ key: 'channel', label: t('reports.channelSource') }, { key: 'n', label: t('common.sales'), fmt: 'num' }, { key: 'revenue', label: t('reports.amount'), fmt: 'money' }, { key: 'commission', label: t('reports.commissions'), fmt: 'money' }, { key: 'shipping', label: t('reports.shipping'), fmt: 'money' }, { key: 'net', label: t('common.netMargin'), fmt: 'money' }], rows };
  }
  if (kind === 'precio_final') {
    const qs = await db.select().from(s.quotes).where(and(gte(s.quotes.createdAt, r.from), lte(s.quotes.createdAt, r.to), isNull(s.quotes.deletedAt), inArray(s.quotes.status, ['enviado', 'aprobado', 'rechazado', 'vencido']), onlyUser ? eq(s.quotes.createdBy, onlyUser) : undefined));
    const rows = qs.map((q) => ({ number: `${q.number} v${q.version}`, customer: q.customerName, suggested: q.suggestedTotal, final: q.total, diff: q.total - q.suggestedTotal, diffPct: q.suggestedTotal ? ((q.total - q.suggestedTotal) / q.suggestedTotal) * 100 : null, status: q.status, margin: (q.calc as any)?.totals?.marginPct ?? null }));
    return { ...base, columns: [{ key: 'number', label: t('common.quote') }, { key: 'customer', label: t('common.customer') }, { key: 'suggested', label: t('common.suggested'), fmt: 'money' }, { key: 'final', label: t('reports.final'), fmt: 'money' }, { key: 'diff', label: t('reports.difference'), fmt: 'money' }, { key: 'diffPct', label: '%', fmt: 'pct' }, { key: 'margin', label: t('reports.margin'), fmt: 'pct' }, { key: 'status', label: t('common.status') }], rows };
  }
  if (kind === 'catalogo') {
    const vs = await db.select({ v: s.productVariants, p: s.products }).from(s.productVariants).innerJoin(s.products, eq(s.products.id, s.productVariants.productId)).where(isNull(s.productVariants.deletedAt));
    const items = await db.select({ i: s.saleItems, d: s.sales.date, st: s.sales.status }).from(s.saleItems).innerJoin(s.sales, eq(s.sales.id, s.saleItems.saleId)).where(and(gte(s.sales.createdAt, r.from), lte(s.sales.createdAt, r.to), ne(s.sales.status, 'anulada'), onlyUser ? eq(s.sales.createdBy, onlyUser) : undefined));
    const rows = vs.map(({ v, p }) => { const it = items.filter((x) => x.i.variantId === v.id); const units = it.reduce((a, x) => a + x.i.qty, 0); const rev = it.reduce((a, x) => a + x.i.qty * x.i.unitPrice, 0); const cost = it.reduce((a, x) => a + x.i.qty * x.i.frozenCost, 0); return { product: `${p.name} ${Object.values(v.attrs ?? {}).join(' ')}`.trim(), sku: v.sku, units, revenue: rev, margin: rev - cost, marginPct: rev ? ((rev - cost) / rev) * 100 : null, stock: v.stock, value: v.stock * v.avgCost, idle: units === 0 && v.stock > 0 ? t('reports.noMovement') : '' }; }).sort((a, b) => b.revenue - a.revenue);
    const val = await stockValue();
    return { ...base, columns: [{ key: 'product', label: t('reports.productVariant') }, { key: 'sku', label: 'SKU' }, { key: 'units', label: t('reports.unitsSold'), fmt: 'num' }, { key: 'revenue', label: t('common.sales'), fmt: 'money' }, { key: 'margin', label: t('common.margin'), fmt: 'money' }, { key: 'marginPct', label: t('reports.margin'), fmt: 'pct' }, { key: 'stock', label: t('common.stock'), fmt: 'num' }, { key: 'value', label: t('common.stockValue'), fmt: 'money' }, { key: 'idle', label: t('reports.alert') }], rows, summary: [{ label: t('reports.totalStockValue'), value: String(val.total) }] };
  }
  throw new Error(t('reports.unknownReport'));
}
