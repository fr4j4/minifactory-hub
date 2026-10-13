import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can, canSeeCosts, canSetFinalPrice } from '@/lib/perm';
import { PageHeader, Card, StatusBadge, Table, Badge, Empty } from '@/components/ui';
import { QuoteEditor, type QuoteState } from '@/components/quote-editor';
import { QuoteActions } from '@/components/quote-actions';
import { LinksEditor } from '@/components/links-editor';
import { type ItemState } from '@/components/line-editor';
import { loadQuote } from '@/lib/services/quotes';
import { loadEditorData } from '@/lib/editor-data';
import { getSettings } from '@/lib/settings';
import { fillTemplate, waLink } from '@/lib/messages';
import { dmy, dmyHm, dur, grams, money, num, pct } from '@/lib/format';

export const metadata = { title: 'Presupuesto' };

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pagePerm('presupuestos', 'V'); const { id } = await params;
  const data = await loadQuote(id); if (!data) notFound();
  const { quote: q, items, models, links, customer } = data; const db = await getDb(); const st = await getSettings();
  const editable = q.status === 'borrador' && can(user, 'presupuestos', 'E');
  if (editable) {
    const { ctx, customers, models: lib, variants } = await loadEditorData();
    const initial: QuoteState = {
      id: q.id, customerId: q.customerId, customerName: q.customerName ?? '', customerPhone: q.customerPhone ?? '', source: q.source ?? '', title: q.title ?? '', urgency: q.urgency, discount: q.discount, finalTotal: q.finalTotal, priceReason: q.priceReason ?? '', notes: q.notes ?? '', validUntil: q.validUntil ?? '',
      links: links.filter((l) => l.ownerType === 'quote').map((l) => ({ id: l.id, url: l.url, title: l.title, kind: l.kind, note: l.note, imageUrl: l.imageUrl, showInPdf: l.showInPdf })),
      items: items.map((it): ItemState => ({
        uid: it.id, id: it.id, kind: it.kind as any, description: it.description, qty: it.qty, optional: it.optional, groupName: it.groupName ?? '', materialId: it.materialId, color: it.color ?? '', machineId: it.machineId, processProfileId: it.processProfileId, mode: it.mode as any,
        gramsTotal: it.gramsTotal, hoursTotal: it.hoursTotal, unitGrams: it.gramsTotal / Math.max(1, it.qty), unitHours: it.hoursTotal / Math.max(1, it.qty), origin: (it.origin ?? {}) as any, postMinutes: it.postMinutes, postSupplies: it.postSupplies, prepMinutes: it.prepMinutes, shipping: it.shipping,
        finalUnit: it.finalUnit, sliceRunId: it.sliceRunId, variantId: it.variantId, open: false,
        models: models.filter((m) => m.qm.quoteItemId === it.id).map((m) => ({ modelFileId: m.qm.modelFileId, fileVersionId: m.qm.fileVersionId, qty: m.qm.qty, name: m.name })),
        links: links.filter((l) => l.ownerType === 'quote_item' && l.ownerId === it.id).map((l) => ({ id: l.id, url: l.url, title: l.title, kind: l.kind, note: l.note, imageUrl: l.imageUrl, showInPdf: l.showInPdf })),
      })),
    };
    if (initial.items.length === 1) initial.items[0].open = true;
    return (<><PageHeader back={{ href: '/presupuestos', label: 'Presupuestos' }} title={<span>{q.number} <span className="muted text-base">v{q.version}</span> <StatusBadge status={q.status} /></span>} subtitle="Borrador: se guarda solo cada vez que cambias algo."
      actions={<QuoteActions id={q.id} status={q.status} canEdit canOrder={can(user, 'pedidos', 'C')} msg={fillTemplate(st.templates.whatsappQuote, { cliente: q.customerName, numero: q.number, total: money(q.total), vigencia: dmy(q.validUntil) })} wa={waLink(q.customerPhone ?? customer?.phone, fillTemplate(st.templates.whatsappQuote, { cliente: q.customerName, numero: q.number, total: money(q.total), vigencia: dmy(q.validUntil) }))} defaultBy={q.customerName ?? ''} depositPct={customer?.depositPct ?? st.minDepositPct} total={q.total} />} />
      <QuoteEditor initial={initial} ctx={ctx} customers={customers} models={lib} variants={variants} showCosts={canSeeCosts(user)} canPrice={canSetFinalPrice(user)} number={q.number} version={q.version} /></>);
  }
  // vista de solo lectura (enviado, aprobado, etc., o sin permiso de edición)
  const costs = canSeeCosts(user);
  const versions = await db.select().from(s.quotes).where(eq(s.quotes.rootId, q.rootId ?? q.id)).orderBy(desc(s.quotes.version));
  const adj = await db.select().from(s.priceAdjustments).where(and(eq(s.priceAdjustments.ownerType, 'quote_item'), inArray(s.priceAdjustments.ownerId, items.map((i) => i.id).concat(['00000000-0000-0000-0000-000000000000'])))).orderBy(desc(s.priceAdjustments.createdAt));
  const [order] = await db.select().from(s.orders).where(eq(s.orders.quoteId, q.id)).limit(1);
  const msg = fillTemplate(st.templates.whatsappQuote, { cliente: q.customerName, numero: q.number, total: money(q.total), vigencia: dmy(q.validUntil) });
  const lt = ((q.calc as any)?.lines ?? []) as Array<{ id: string; suggestedTotal: number; finalTotal: number; cost: number; marginPct: number | null }>;
  const tot = (q.calc as any)?.totals ?? {};
  return (
    <>
      <PageHeader back={{ href: '/presupuestos', label: 'Presupuestos' }} title={<span>{q.number} <span className="muted text-base">v{q.version}</span> <StatusBadge status={q.status} /></span>}
        subtitle={<>{q.customerName ?? 'Sin cliente'}{q.customerPhone ? ` · ${q.customerPhone}` : ''} · vigencia {dmy(q.validUntil)}{q.source ? ` · origen ${q.source}` : ''}</>}
        actions={<QuoteActions id={q.id} status={q.status} canEdit={can(user, 'presupuestos', 'E')} canOrder={can(user, 'pedidos', 'C')} msg={msg} wa={waLink(q.customerPhone ?? customer?.phone, msg)} defaultBy={q.customerName ?? ''} depositPct={customer?.depositPct ?? st.minDepositPct} total={q.total} />} />
      {order && <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 p-3 text-sm mb-4">Aprobado por <b>{q.approvedBy}</b> vía {q.approvedChannel} el {dmyHm(q.approvedAt)} → pedido <Link className="underline font-medium" href={`/pedidos/${order.id}`}>{order.number}</Link></div>}
      {q.frozen && q.status !== 'aprobado' && <p className="text-xs muted mb-3">Este presupuesto está congelado: cambiar tarifas no altera sus precios. Para modificarlo, crea una nueva versión.</p>}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-4">
          <Card title="Líneas" pad={false}>
            <Table><thead><tr><th className="th">Descripción</th><th className="th text-right">Cant.</th><th className="th text-right">Precio u.</th><th className="th text-right">Total</th>{costs && <th className="th text-right">Margen</th>}</tr></thead>
              <tbody>{items.map((it) => { const l = lt.find((x) => x.id === it.id); const ms = models.filter((m) => m.qm.quoteItemId === it.id); const ls = links.filter((x) => x.ownerType === 'quote_item' && x.ownerId === it.id);
                return (<tr key={it.id} className={it.optional ? 'opacity-60' : ''}><td className="td"><div className="font-medium">{it.description || 'Pieza'} {it.optional && <Badge>Opcional</Badge>} {it.groupName && <Badge tone="blue">{it.groupName}</Badge>}</div>
                  <div className="text-xs muted">{it.variantId ? 'Producto de catálogo' : `${grams(it.gramsTotal)} · ${dur(it.hoursTotal * 3600)} · ${(it.origin as any)?.grams === 'slicer' ? 'laminador del sitio' : (it.origin as any)?.grams === 'file' ? 'archivo externo' : (it.origin as any)?.grams === 'estimate' ? 'estimado' : 'manual'}`}</div>
                  {ms.length > 0 && <div className="flex flex-wrap gap-1.5 mt-1">{ms.map((m) => <Link key={m.qm.id} href={`/archivos/${m.qm.modelFileId}`} className="badge bg-slate-100 dark:bg-slate-800 border-transparent hover:underline">{m.name} ×{m.qm.qty}</Link>)}</div>}
                  {ls.length > 0 && <div className="mt-1 text-xs">{ls.map((x) => <a key={x.id} href={x.url} target="_blank" rel="noopener noreferrer" className="underline mr-2">🔗 {x.title ?? x.url}</a>)}</div>}</td>
                  <td className="td text-right tabular">{it.qty}</td><td className="td text-right tabular">{money(it.finalUnit ?? it.suggestedUnit)}{costs && it.finalUnit != null && it.finalUnit !== it.suggestedUnit && <div className="text-xs muted line-through">{money(it.suggestedUnit)}</div>}</td>
                  <td className="td text-right tabular font-medium">{money((it.finalUnit ?? it.suggestedUnit) * it.qty)}</td>{costs && <td className="td text-right tabular">{l?.marginPct != null ? pct(l.marginPct, 0) : '—'}</td>}</tr>); })}</tbody></Table>
          </Card>
          <Card title="Links de referencia"><LinksEditor value={links.filter((l) => l.ownerType === 'quote').map((l) => ({ ...l }))} persist={{ ownerType: 'quote', ownerId: q.id, revalidate: `/presupuestos/${q.id}` }} readOnly={!can(user, 'presupuestos', 'E')} /></Card>
          {q.notes && <Card title="Notas"><p className="text-sm whitespace-pre-wrap">{q.notes}</p></Card>}
        </div>
        <div className="space-y-4">
          <Card title="Totales">
            <dl className="text-sm space-y-1.5 tabular">
              {costs && <div className="flex justify-between"><dt className="muted">Precio sugerido</dt><dd>{money(q.suggestedTotal)}</dd></div>}
              <div className="flex justify-between"><dt className="muted">Subtotal</dt><dd>{money(tot.subtotal ?? q.total)}</dd></div>
              {q.discount > 0 && <div className="flex justify-between"><dt className="muted">Descuento</dt><dd>−{money(q.discount)}</dd></div>}
              <div className="flex justify-between"><dt className="muted">{st.rates.taxMode === 'incluido' ? `IVA ${st.rates.taxPct}% incluido` : 'IVA'}</dt><dd>{money(q.taxAmount)}</dd></div>
              <div className="flex justify-between text-lg font-bold border-t border-slate-200 dark:border-slate-700 pt-2"><dt>Total</dt><dd data-testid="view-total">{money(q.total)}</dd></div>
              {costs && <><div className="flex justify-between"><dt className="muted">Costo</dt><dd>{money(q.costTotal)}</dd></div><div className="flex justify-between"><dt className="muted">Margen</dt><dd>{tot.marginPct != null ? pct(tot.marginPct, 0) : '—'}</dd></div>{q.suggestedTotal > 0 && <div className="flex justify-between"><dt className="muted">Final vs sugerido</dt><dd>{num(((q.total - q.suggestedTotal) / q.suggestedTotal) * 100, 1)}%</dd></div>}</>}
            </dl>
            {q.priceReason && <p className="text-xs muted mt-2">Motivo del precio: {q.priceReason}</p>}
          </Card>
          <Card title="Versiones"><ul className="text-sm space-y-1.5">{versions.map((v) => <li key={v.id} className="flex items-center justify-between"><Link className={v.id === q.id ? 'font-semibold' : 'underline'} href={`/presupuestos/${v.id}`}>v{v.version} · {dmy(v.createdAt)}</Link><span className="flex items-center gap-2"><span className="tabular text-xs">{money(v.total)}</span><StatusBadge status={v.status} /></span></li>)}</ul></Card>
          {costs && adj.length > 0 && <Card title="Historial del precio final"><ul className="text-xs space-y-1.5">{adj.map((a) => <li key={a.id}>{dmyHm(a.createdAt)} · sugerido {money(a.suggested)} → <b>{a.next != null ? money(a.next) : 'sugerido'}</b>{a.belowCost && <Badge tone="red" className="ml-1">bajo costo</Badge>}{a.reason && <span className="muted"> · {a.reason}</span>}</li>)}</ul></Card>}
        </div>
      </div>
    </>
  );
}
