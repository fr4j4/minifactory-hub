import { and, desc, eq, gte, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { getSettings } from './settings';
import { stockValue } from './stats';

export interface Col { key: string; label: string; fmt?: 'money' | 'num' | 'pct' | 'text' | 'date' | 'h' | 'kg' }
export interface ReportData { title: string; question: string; columns: Col[]; rows: Array<Record<string, any>>; summary?: Array<{ label: string; value: string }> }
export const REPORTS: Record<string, { title: string; question: string; costs?: boolean }> = {
  ventas: { title: 'Ventas y margen', question: 'Cuánto se vendió y ganó, por mes, canal y cliente', costs: true },
  estimado_real: { title: 'Costo estimado vs. real', question: 'Qué pedidos se cotizaron mal y por cuánto', costs: true },
  utilizacion: { title: 'Utilización de máquinas', question: '% de horas ocupadas, fallas y rentabilidad por máquina' },
  materiales: { title: 'Consumo de materiales', question: 'kg por material/color, desperdicio y fallas' },
  embudo: { title: 'Embudo comercial', question: 'Presupuestos enviados, aprobados, rechazados y motivos' },
  clientes: { title: 'Clientes', question: 'Mejores clientes, recurrencia, ticket promedio' },
  entregas: { title: 'Tiempos de entrega', question: 'Promedio y % de entregas a tiempo' },
  canales: { title: 'Ventas por canal', question: 'Ventas, comisiones y margen neto por origen', costs: true },
  precio_final: { title: 'Precio final vs. sugerido', question: 'Cuánto se aparta el precio final del sugerido y su efecto en el margen', costs: true },
  catalogo: { title: 'Catálogo y stock', question: 'Rotación y margen por producto y variante, stock valorizado' },
};

const mon = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export async function reportData(kind: string, r: { from: Date; to: Date }, costs: boolean, onlyUser?: string): Promise<ReportData> {
  const db = await getDb(); const st = await getSettings(); const meta = REPORTS[kind];
  const netOf = (g: number) => (st.rates.taxMode === 'incluido' ? g / (1 + st.rates.taxPct / 100) : g);
  const oc = [gte(s.orders.createdAt, r.from), lte(s.orders.createdAt, r.to), ne(s.orders.status, 'cancelado'), isNull(s.orders.deletedAt)]; if (onlyUser) oc.push(eq(s.orders.createdBy, onlyUser));
  const orders = await db.select().from(s.orders).where(and(...oc));
  const sc = [gte(s.sales.createdAt, r.from), lte(s.sales.createdAt, r.to), ne(s.sales.status, 'anulada'), isNull(s.sales.deletedAt)]; if (onlyUser) sc.push(eq(s.sales.createdBy, onlyUser));
  const sales = await db.select().from(s.sales).where(and(...sc));
  const base = { title: meta.title, question: meta.question };
  if (kind === 'ventas') {
    const by = new Map<string, { month: string; orders: number; sales: number; revenue: number; cost: number }>();
    const add = (d: Date, rev: number, cost: number, o: number, sl: number) => { const k = mon(d); const e = by.get(k) ?? { month: k, orders: 0, sales: 0, revenue: 0, cost: 0 }; e.orders += o; e.sales += sl; e.revenue += rev; e.cost += cost; by.set(k, e); };
    for (const o of orders) add(o.createdAt, o.total, o.costReal ?? o.costEstimated, 1, 0);
    for (const x of sales) add(x.createdAt, x.total, x.costTotal + x.commission + x.shipping, 0, 1);
    const rows = [...by.values()].sort((a, b) => a.month.localeCompare(b.month)).map((e) => ({ ...e, margin: Math.round(netOf(e.revenue) - e.cost), marginPct: e.revenue ? ((netOf(e.revenue) - e.cost) / netOf(e.revenue)) * 100 : null }));
    const cols: Col[] = [{ key: 'month', label: 'Mes' }, { key: 'orders', label: 'Pedidos', fmt: 'num' }, { key: 'sales', label: 'Ventas rápidas', fmt: 'num' }, { key: 'revenue', label: 'Ventas', fmt: 'money' }];
    if (costs) cols.push({ key: 'cost', label: 'Costo', fmt: 'money' }, { key: 'margin', label: 'Margen', fmt: 'money' }, { key: 'marginPct', label: 'Margen %', fmt: 'pct' });
    return { ...base, columns: cols, rows, summary: [{ label: 'Ventas del período', value: String(rows.reduce((a, x) => a + x.revenue, 0)) }] };
  }
  if (kind === 'estimado_real') {
    const rows = orders.filter((o) => o.costReal != null).map((o) => ({ number: o.number, customer: o.customerName, title: o.title, est: o.costEstimated, real: o.costReal, diff: (o.costReal ?? 0) - o.costEstimated, diffPct: o.costEstimated ? (((o.costReal ?? 0) - o.costEstimated) / o.costEstimated) * 100 : null })).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    return { ...base, columns: [{ key: 'number', label: 'Pedido' }, { key: 'customer', label: 'Cliente' }, { key: 'title', label: 'Detalle' }, { key: 'est', label: 'Costo estimado', fmt: 'money' }, { key: 'real', label: 'Costo real', fmt: 'money' }, { key: 'diff', label: 'Diferencia', fmt: 'money' }, { key: 'diffPct', label: 'Desvío', fmt: 'pct' }], rows };
  }
  if (kind === 'utilizacion') {
    const machines = await db.select().from(s.machines).where(isNull(s.machines.deletedAt));
    const jobs = await db.select().from(s.printJobs).where(and(gte(s.printJobs.realEnd, r.from), lte(s.printJobs.realEnd, r.to)));
    const days = Math.max(1, (r.to.getTime() - r.from.getTime()) / 86400_000);
    const [hh] = st.workHours.start.split(':').map(Number); const [he] = st.workHours.end.split(':').map(Number); const dayH = Math.max(1, he - hh);
    const avail = days * (st.workHours.days.length / 7) * dayH;
    const rows = machines.map((m) => { const j = jobs.filter((x) => x.machineId === m.id); const used = j.reduce((a, x) => a + (x.realH ?? 0), 0); const ok = j.filter((x) => x.result === 'exito').length; return { machine: m.name, jobs: j.length, hours: used, util: (used / avail) * 100, failed: j.length - ok, success: j.length ? (ok / j.length) * 100 : null, factor: m.timeFactor }; });
    return { ...base, columns: [{ key: 'machine', label: 'Máquina' }, { key: 'jobs', label: 'Trabajos', fmt: 'num' }, { key: 'hours', label: 'Horas', fmt: 'h' }, { key: 'util', label: '% ocupación (horario del taller)', fmt: 'pct' }, { key: 'failed', label: 'Fallas', fmt: 'num' }, { key: 'success', label: '% éxito', fmt: 'pct' }, { key: 'factor', label: 'Factor tiempo real/estimado', fmt: 'num' }], rows };
  }
  if (kind === 'materiales') {
    const mats = await db.select().from(s.materials);
    const mv = await db.select().from(s.inventoryMovements).where(and(gte(s.inventoryMovements.createdAt, r.from), lte(s.inventoryMovements.createdAt, r.to), inArray(s.inventoryMovements.kind, ['consumo', 'falla']), sql`${s.inventoryMovements.spoolId} is not null`));
    const sp = await db.select().from(s.spools); const mOf = new Map(sp.map((x) => [x.id, x.materialId]));
    const rows = mats.map((m) => { const mm = mv.filter((x) => mOf.get(x.spoolId!) === m.id); const used = mm.filter((x) => x.kind === 'consumo').reduce((a, x) => a - x.qty, 0); const fail = mm.filter((x) => x.kind === 'falla').reduce((a, x) => a - x.qty, 0); return { material: `${m.type} ${m.colorName}`, kg: (used + fail) / 1000, fail: fail / 1000, failPct: used + fail > 0 ? (fail / (used + fail)) * 100 : null }; }).filter((x) => x.kg > 0).sort((a, b) => b.kg - a.kg);
    return { ...base, columns: [{ key: 'material', label: 'Material' }, { key: 'kg', label: 'kg consumidos', fmt: 'kg' }, { key: 'fail', label: 'kg en fallas', fmt: 'kg' }, { key: 'failPct', label: '% fallas', fmt: 'pct' }], rows };
  }
  if (kind === 'embudo') {
    const qs = await db.select().from(s.quotes).where(and(gte(s.quotes.createdAt, r.from), lte(s.quotes.createdAt, r.to), isNull(s.quotes.deletedAt)));
    const cnt = (st_: string[]) => qs.filter((q) => st_.includes(q.status));
    const sent = cnt(['enviado', 'aprobado', 'rechazado', 'vencido']);
    const rows = [['Borradores', cnt(['borrador'])], ['Enviados (en total)', sent], ['Aprobados', cnt(['aprobado'])], ['Rechazados', cnt(['rechazado'])], ['Vencidos sin respuesta', cnt(['vencido'])]].map(([l, a]) => ({ stage: l as string, n: (a as any[]).length, amount: (a as any[]).reduce((x: number, q: any) => x + q.total, 0), rate: sent.length ? ((a as any[]).length / sent.length) * 100 : null }));
    const reasons = qs.filter((q) => q.status === 'rechazado').map((q) => (q.notes ?? '').split('Rechazado:').pop()?.trim() || 'Sin motivo');
    const counts = reasons.reduce<Record<string, number>>((a, x) => ({ ...a, [x]: (a[x] ?? 0) + 1 }), {});
    for (const [k, v] of Object.entries(counts)) rows.push({ stage: `   Motivo: ${k}`, n: v, amount: 0, rate: null });
    return { ...base, columns: [{ key: 'stage', label: 'Etapa' }, { key: 'n', label: 'Presupuestos', fmt: 'num' }, { key: 'amount', label: 'Monto', fmt: 'money' }, { key: 'rate', label: '% de enviados', fmt: 'pct' }], rows };
  }
  if (kind === 'clientes') {
    const by = new Map<string, { customer: string; orders: number; revenue: number; last: Date }>();
    for (const o of orders) { const k = o.customerName ?? 'Sin nombre'; const e = by.get(k) ?? { customer: k, orders: 0, revenue: 0, last: o.createdAt }; e.orders++; e.revenue += o.total; if (o.createdAt > e.last) e.last = o.createdAt; by.set(k, e); }
    const rows = [...by.values()].sort((a, b) => b.revenue - a.revenue).map((e) => ({ ...e, ticket: e.revenue / e.orders, recurrent: e.orders > 1 ? 'Sí' : 'No' }));
    return { ...base, columns: [{ key: 'customer', label: 'Cliente' }, { key: 'orders', label: 'Pedidos', fmt: 'num' }, { key: 'revenue', label: 'Ventas', fmt: 'money' }, { key: 'ticket', label: 'Ticket promedio', fmt: 'money' }, { key: 'recurrent', label: 'Recurrente' }, { key: 'last', label: 'Último pedido', fmt: 'date' }], rows };
  }
  if (kind === 'entregas') {
    const del = orders.filter((o) => o.deliveredAt); 
    const rows = del.map((o) => { const days = (o.deliveredAt!.getTime() - o.createdAt.getTime()) / 86400_000; const onTime = !o.dueDate || o.deliveredAt!.toISOString().slice(0, 10) <= o.dueDate; return { number: o.number, customer: o.customerName, days, due: o.dueDate, onTime: onTime ? 'A tiempo' : 'Atrasado' }; });
    const avg = rows.length ? rows.reduce((a, x) => a + x.days, 0) / rows.length : 0; const pctOk = rows.length ? (rows.filter((x) => x.onTime === 'A tiempo').length / rows.length) * 100 : null;
    return { ...base, columns: [{ key: 'number', label: 'Pedido' }, { key: 'customer', label: 'Cliente' }, { key: 'days', label: 'Días hasta entrega', fmt: 'num' }, { key: 'due', label: 'Fecha comprometida', fmt: 'date' }, { key: 'onTime', label: 'Cumplimiento' }], rows, summary: [{ label: 'Promedio', value: `${avg.toFixed(1)} días` }, { label: 'A tiempo', value: pctOk != null ? `${pctOk.toFixed(0)}%` : '—' }] };
  }
  if (kind === 'canales') {
    const ch = await db.select().from(s.salesChannels); const by = new Map<string, { channel: string; n: number; revenue: number; commission: number; shipping: number; net: number }>();
    for (const x of sales) { const name = ch.find((c) => c.id === x.channelId)?.name ?? 'Sin canal'; const e = by.get(name) ?? { channel: name, n: 0, revenue: 0, commission: 0, shipping: 0, net: 0 }; e.n++; e.revenue += x.total; e.commission += x.commission; e.shipping += x.shipping; e.net += x.netMargin; by.set(name, e); }
    for (const o of orders) { const name = `Pedidos · ${o.source ?? 'sin origen'}`; const e = by.get(name) ?? { channel: name, n: 0, revenue: 0, commission: 0, shipping: 0, net: 0 }; e.n++; e.revenue += o.total; e.net += Math.round(netOf(o.total) - (o.costReal ?? o.costEstimated)); by.set(name, e); }
    const rows = [...by.values()].sort((a, b) => b.revenue - a.revenue);
    return { ...base, columns: [{ key: 'channel', label: 'Canal / origen' }, { key: 'n', label: 'Ventas', fmt: 'num' }, { key: 'revenue', label: 'Monto', fmt: 'money' }, { key: 'commission', label: 'Comisiones', fmt: 'money' }, { key: 'shipping', label: 'Envíos', fmt: 'money' }, { key: 'net', label: 'Margen neto', fmt: 'money' }], rows };
  }
  if (kind === 'precio_final') {
    const qs = await db.select().from(s.quotes).where(and(gte(s.quotes.createdAt, r.from), lte(s.quotes.createdAt, r.to), isNull(s.quotes.deletedAt), inArray(s.quotes.status, ['enviado', 'aprobado', 'rechazado', 'vencido'])));
    const rows = qs.map((q) => ({ number: `${q.number} v${q.version}`, customer: q.customerName, suggested: q.suggestedTotal, final: q.total, diff: q.total - q.suggestedTotal, diffPct: q.suggestedTotal ? ((q.total - q.suggestedTotal) / q.suggestedTotal) * 100 : null, status: q.status, margin: (q.calc as any)?.totals?.marginPct ?? null }));
    return { ...base, columns: [{ key: 'number', label: 'Presupuesto' }, { key: 'customer', label: 'Cliente' }, { key: 'suggested', label: 'Sugerido', fmt: 'money' }, { key: 'final', label: 'Final', fmt: 'money' }, { key: 'diff', label: 'Diferencia', fmt: 'money' }, { key: 'diffPct', label: '%', fmt: 'pct' }, { key: 'margin', label: 'Margen %', fmt: 'pct' }, { key: 'status', label: 'Estado' }], rows };
  }
  if (kind === 'catalogo') {
    const vs = await db.select({ v: s.productVariants, p: s.products }).from(s.productVariants).innerJoin(s.products, eq(s.products.id, s.productVariants.productId)).where(isNull(s.productVariants.deletedAt));
    const items = await db.select({ i: s.saleItems, d: s.sales.date, st: s.sales.status }).from(s.saleItems).innerJoin(s.sales, eq(s.sales.id, s.saleItems.saleId)).where(and(gte(s.sales.createdAt, r.from), lte(s.sales.createdAt, r.to), ne(s.sales.status, 'anulada')));
    const rows = vs.map(({ v, p }) => { const it = items.filter((x) => x.i.variantId === v.id); const units = it.reduce((a, x) => a + x.i.qty, 0); const rev = it.reduce((a, x) => a + x.i.qty * x.i.unitPrice, 0); const cost = it.reduce((a, x) => a + x.i.qty * x.i.frozenCost, 0); return { product: `${p.name} ${Object.values(v.attrs ?? {}).join(' ')}`.trim(), sku: v.sku, units, revenue: rev, margin: rev - cost, marginPct: rev ? ((rev - cost) / rev) * 100 : null, stock: v.stock, value: v.stock * v.avgCost, idle: units === 0 && v.stock > 0 ? 'Sin movimiento' : '' }; }).sort((a, b) => b.revenue - a.revenue);
    const val = await stockValue();
    return { ...base, columns: [{ key: 'product', label: 'Producto / variante' }, { key: 'sku', label: 'SKU' }, { key: 'units', label: 'Unidades vendidas', fmt: 'num' }, { key: 'revenue', label: 'Ventas', fmt: 'money' }, { key: 'margin', label: 'Margen', fmt: 'money' }, { key: 'marginPct', label: 'Margen %', fmt: 'pct' }, { key: 'stock', label: 'Stock', fmt: 'num' }, { key: 'value', label: 'Stock valorizado', fmt: 'money' }, { key: 'idle', label: 'Alerta' }], rows, summary: [{ label: 'Stock valorizado total', value: String(val.total) }] };
  }
  throw new Error('Reporte desconocido');
}
