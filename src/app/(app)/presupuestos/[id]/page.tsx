import Link from 'next/link';
import { cn } from '@/lib/format';
import { TONES } from '@/components/badge';
import { notFound } from 'next/navigation';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
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
import { dmy, dmyHm, dur, grams, money, num, pct, sources } from '@/lib/format';
import { getT } from '@/i18n/server';
import { tOr } from '@/i18n/translate';
import { RemoveButton } from '@/components/remove-button';
import { LineDetailLink } from '@/components/line-detail';
import { QuoteDocument } from '@/components/quote-document';
import { buildQuoteDoc } from '@/lib/services/quote-doc';
import { diffQuotes } from '@/lib/quote-diff';

export async function generateMetadata() { return { title: (await getT())('meta.quote') }; }

export default async function QuotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ vs?: string }> }) {
  const t = await getT();
  const user = await pagePerm('presupuestos', 'V'); const { id } = await params; const { vs } = await searchParams;
  const data = await loadQuote(id); if (!data) notFound();
  const { quote: q, items, models, links, customer } = data; const db = await getDb(); const st = await getSettings();
  const editable = q.status === 'borrador' && can(user, 'presupuestos', 'E');
  if (editable) {
    const { ctx, customers, models: lib, variants } = await loadEditorData();
    const initial: QuoteState = {
      id: q.id, customerId: q.customerId, customerName: q.customerName ?? '', customerPhone: q.customerPhone ?? '', source: q.source ?? '', title: q.title ?? '', urgency: q.urgency, discount: q.discount, applyTax: q.applyTax, finalTotal: q.finalTotal, priceReason: q.priceReason ?? '', notes: q.notes ?? '', validUntil: q.validUntil ?? '',
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
    return (<><PageHeader back={{ href: '/presupuestos', label: t('nav.quotes') }} title={<span>{q.number} <span className="muted text-base">v{q.version}</span> <StatusBadge status={q.status} /></span>} subtitle={t('quotes.draftItIsSavedAutomatically')}
      actions={<><QuoteActions id={q.id} status={q.status} canEdit canOrder={can(user, 'pedidos', 'C')} msg={fillTemplate(st.templates.whatsappQuote, { cliente: q.customerName, numero: q.number, total: money(q.total), vigencia: dmy(q.validUntil) })} wa={waLink(q.customerPhone ?? customer?.phone, fillTemplate(st.templates.whatsappQuote, { cliente: q.customerName, numero: q.number, total: money(q.total), vigencia: dmy(q.validUntil) }))} defaultBy={q.customerName ?? ''} depositPct={customer?.depositPct ?? st.minDepositPct} total={q.total} />{can(user, 'presupuestos', 'X') && <RemoveButton kind="quote" id={q.id} name={q.number} redirectTo="/presupuestos" />}</>} />
      <QuoteEditor initial={initial} ctx={ctx} customers={customers} models={lib} variants={variants} showCosts={canSeeCosts(user)} canPrice={canSetFinalPrice(user)} number={q.number} version={q.version} /></>);
  }
  // vista de solo lectura (enviado, aprobado, etc., o sin permiso de edición)
  const costs = canSeeCosts(user);
  const mats = new Map((await db.select().from(s.materials)).map((m) => [m.id, `${m.manufacturer ? m.manufacturer + ' ' : ''}${m.type} ${m.colorName}`]));
  const machs = new Map((await db.select({ id: s.machines.id, name: s.machines.name }).from(s.machines)).map((m) => [m.id, m.name]));
  const procs = new Map((await db.select({ id: s.slicerProfiles.id, name: s.slicerProfiles.name }).from(s.slicerProfiles)).map((m) => [m.id, m.name]));
  const versions = await db.select().from(s.quotes).where(and(eq(s.quotes.rootId, q.rootId ?? q.id), isNull(s.quotes.deletedAt))).orderBy(desc(s.quotes.version));
  const adj = await db.select().from(s.priceAdjustments).where(and(eq(s.priceAdjustments.ownerType, 'quote_item'), inArray(s.priceAdjustments.ownerId, items.map((i) => i.id).concat(['00000000-0000-0000-0000-000000000000'])))).orderBy(desc(s.priceAdjustments.createdAt));
  const [order] = await db.select().from(s.orders).where(eq(s.orders.quoteId, q.id)).limit(1);
  const toDiff = (d: NonNullable<Awaited<ReturnType<typeof loadQuote>>>) => ({ total: d.quote.total, items: d.items.map((i) => ({ description: i.description, qty: i.qty, unit: i.finalUnit ?? i.suggestedUnit, grams: i.gramsTotal, hours: i.hoursTotal, materialId: i.materialId })) });
  const other = vs && versions.some((v) => v.id === vs) && vs !== q.id ? await loadQuote(vs) : null;
  const diff = other ? (other.quote.version < q.version ? diffQuotes(toDiff(other), toDiff(data)) : diffQuotes(toDiff(data), toDiff(other))) : null;
  const acts = await db.select().from(s.activityLog).where(and(eq(s.activityLog.entity, 'quote'), inArray(s.activityLog.entityId, versions.map((v) => v.id)))).orderBy(desc(s.activityLog.createdAt)).limit(30);
  const actUsers = new Map((await db.select({ id: s.users.id, name: s.users.name }).from(s.users)).map((u) => [u.id, u.name]));
  const msg = fillTemplate(st.templates.whatsappQuote, { cliente: q.customerName, numero: q.number, total: money(q.total), vigencia: dmy(q.validUntil) });
  const lt = ((q.calc as any)?.lines ?? []) as Array<{ id: string; suggestedTotal: number; finalTotal: number; cost: number; marginPct: number | null }>;
  const tot = (q.calc as any)?.totals ?? {};
  return (
    <>
      <PageHeader back={{ href: '/presupuestos', label: t('nav.quotes') }} title={<span>{q.number} <span className="muted text-base">v{q.version}</span> <StatusBadge status={q.status} /></span>}
        subtitle={<>{q.customerName ?? t('common.noCustomer')}{q.customerPhone ? ` · ${q.customerPhone}` : ''} · {t('quotes.validUntilOn', { date: dmy(q.validUntil) })}{q.source ? ` · ${t('quotes.sourceOf', { source: sources(t)[q.source] ?? q.source })}` : ''}</>}
        actions={<><QuoteActions id={q.id} status={q.status} canEdit={can(user, 'presupuestos', 'E')} canOrder={can(user, 'pedidos', 'C')} msg={msg} wa={waLink(q.customerPhone ?? customer?.phone, msg)} defaultBy={q.customerName ?? ''} depositPct={customer?.depositPct ?? st.minDepositPct} total={q.total} />{can(user, 'presupuestos', 'X') && <RemoveButton kind="quote" id={q.id} name={q.number} redirectTo="/presupuestos" />}</>} />
      {order && <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 p-3 text-sm mb-4">{t('quotes.approvedLine', { name: q.approvedBy, channel: q.approvedChannel, date: dmyHm(q.approvedAt) })} → {t('quotes.orderWord')} <Link className="underline font-medium" href={`/pedidos/${order.id}`}>{order.number}</Link></div>}
      {q.frozen && q.status !== 'aprobado' && <p className="text-xs muted mb-3">{t('quotes.thisQuoteIsFrozenChanging')}</p>}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-4">
          <Card title={t('quotes.items')} pad={false}>
            <Table><thead><tr><th className="th">{t('common.description')}</th><th className="th text-right">{t('common.qty')}</th><th className="th text-right">{t('common.unitPrice')}</th><th className="th text-right">{t('common.total')}</th>{costs && <th className="th text-right">{t('common.margin')}</th>}</tr></thead>
              <tbody>{items.map((it) => { const l = lt.find((x) => x.id === it.id); const ms = models.filter((m) => m.qm.quoteItemId === it.id); const ls = links.filter((x) => x.ownerType === 'quote_item' && x.ownerId === it.id);
                return (<tr key={it.id} className={it.optional ? 'opacity-60' : ''}><td className="td"><div className="font-medium">{it.description || t('quotes.part')} {it.optional && <Badge>{t('quotes.optional')}</Badge>} {it.groupName && <Badge tone="blue">{it.groupName}</Badge>}</div>
                  <div className="text-xs muted">{it.variantId ? t('quotes.catalogProduct') : `${grams(it.gramsTotal)} · ${dur(it.hoursTotal * 3600)} · ${tOr(t, `calculator.origin.${(it.origin as any)?.grams ?? 'manual'}`, 'manual')}`}</div>
                  {ms.length > 0 && <div className="flex flex-wrap gap-1.5 mt-1">{ms.map((m) => <Link key={m.qm.id} href={`/archivos/${m.qm.modelFileId}`} className={cn('badge hover:underline', TONES.gray)}>{m.name} ×{m.qm.qty}</Link>)}</div>}
                  {ls.length > 0 && <div className="mt-1 text-xs">{ls.map((x) => <a key={x.id} href={x.url} target="_blank" rel="noopener noreferrer" className="underline mr-2">🔗 {x.title ?? x.url}</a>)}</div>}
                  <LineDetailLink href={`/presupuestos/${q.id}/linea/${it.id}`} /></td>
                  <td className="td text-right tabular">{it.qty}</td><td className="td text-right tabular">{money(it.finalUnit ?? it.suggestedUnit)}{costs && it.finalUnit != null && it.finalUnit !== it.suggestedUnit && <div className="text-xs muted line-through">{money(it.suggestedUnit)}</div>}</td>
                  <td className="td text-right tabular font-medium">{money((it.finalUnit ?? it.suggestedUnit) * it.qty)}</td>{costs && <td className="td text-right tabular">{l?.marginPct != null ? pct(l.marginPct, 0) : '—'}</td>}</tr>); })}</tbody></Table>
          </Card>
          <Card title={t('common.referenceLinks')}><LinksEditor value={links.filter((l) => l.ownerType === 'quote').map((l) => ({ ...l }))} persist={{ ownerType: 'quote', ownerId: q.id, revalidate: `/presupuestos/${q.id}` }} readOnly={!can(user, 'presupuestos', 'E')} /></Card>
          <details className="card" data-testid="client-view"><summary className="px-4 py-3 cursor-pointer font-medium text-sm">{t('quotes.clientView')}</summary><div className="border-t border-[var(--line)] overflow-auto"><QuoteDocument data={buildQuoteDoc(data, st, t)} template={(q.docTemplate as any) ?? st.documents.quote} t={t} /></div></details>
          {q.notes && <Card title={t('common.notes')}><p className="text-sm whitespace-pre-wrap">{q.notes}</p></Card>}
        </div>
        <div className="space-y-4">
          <Card title={t('quotes.totals')}>
            <dl className="text-sm space-y-1.5 tabular">
              {costs && <div className="flex justify-between"><dt className="muted">{t('common.suggestedPrice')}</dt><dd>{money(q.suggestedTotal)}</dd></div>}
              <div className="flex justify-between"><dt className="muted">{t('quotes.subtotal')}</dt><dd>{money(tot.subtotal ?? q.total)}</dd></div>
              {q.discount > 0 && <div className="flex justify-between"><dt className="muted">{t('common.discount')}</dt><dd>−{money(q.discount)}</dd></div>}
              <div className="flex justify-between"><dt className="muted">{q.applyTax ? t('quotes.plusVat', { pct: st.rates.taxPct }) : t('quotes.noVat')}</dt><dd>{money(q.taxAmount)}</dd></div>
              <div className="flex justify-between text-lg font-bold border-t border-slate-200 dark:border-slate-700 pt-2"><dt>{t('common.total')}</dt><dd data-testid="view-total">{money(q.total)}</dd></div>
              {costs && <><div className="flex justify-between"><dt className="muted">{t('common.cost')}</dt><dd>{money(q.costTotal)}</dd></div><div className="flex justify-between"><dt className="muted">{t('common.margin')}</dt><dd>{tot.marginPct != null ? pct(tot.marginPct, 0) : '—'}</dd></div>{q.suggestedTotal > 0 && <div className="flex justify-between"><dt className="muted">{t('quotes.finalVsSuggested')}</dt><dd>{num(((q.total - q.suggestedTotal) / q.suggestedTotal) * 100, 1)}%</dd></div>}</>}
            </dl>
            {q.priceReason && <p className="text-xs muted mt-2">{t('quotes.reasonForThePrice')} {q.priceReason}</p>}
          </Card>
          <Card title={t('quotes.versions')}><ul className="text-sm space-y-1.5">{versions.map((v) => <li key={v.id} className="flex items-center justify-between"><Link className={v.id === q.id ? 'font-semibold' : 'underline'} href={`/presupuestos/${v.id}`}>v{v.version} · {dmy(v.createdAt)}</Link>{v.id !== q.id && <Link className="text-xs underline muted" href={`/presupuestos/${q.id}?vs=${v.id}`} data-testid={`compare-v${v.version}`}>{t('quotes.compareWith')}</Link>}<span className="flex items-center gap-2"><span className="tabular text-xs">{money(v.total)}</span><StatusBadge status={v.status} /></span></li>)}</ul></Card>
          {diff && other && <Card title={t('quotes.diffTitle', { a: Math.min(q.version, other.quote.version), b: Math.max(q.version, other.quote.version) })}><div className="text-sm space-y-2" data-testid="quote-diff">
            <p className="tabular">{t('quotes.diffTotal')}: {money(diff.totalBefore)} → <b>{money(diff.totalAfter)}</b> <span className="muted">({diff.delta >= 0 ? '+' : '−'}{money(Math.abs(diff.delta))})</span></p>
            {!diff.added.length && !diff.removed.length && !diff.changed.length && <p className="muted">{t('quotes.diffNone')}</p>}
            {diff.added.map((i, k) => <p key={`a${k}`}><Badge tone="green">{t('quotes.diffAdded')}</Badge> {i.description} × {i.qty}</p>)}
            {diff.removed.map((i, k) => <p key={`r${k}`}><Badge tone="red">{t('quotes.diffRemoved')}</Badge> {i.description} × {i.qty}</p>)}
            {diff.changed.map((c, k) => <p key={`c${k}`}><Badge tone="amber">{t('quotes.diffChanged')}</Badge> {c.description}: {c.changes.map((x) => `${t(`quotes.diffField_${x.field}`)} ${x.field === 'unit' ? money(Number(x.before)) : String(x.before ?? '—')} → ${x.field === 'unit' ? money(Number(x.after)) : String(x.after ?? '—')}`).join(' · ')}</p>)}
          </div></Card>}
          <Card title={t('quotes.activity')}>{acts.length === 0 ? <p className="text-xs muted">{t('quotes.activityNone')}</p> : <ul className="text-xs space-y-1.5" data-testid="quote-activity">{acts.map((a) => <li key={a.id}>{dmyHm(a.createdAt)} · <b>{tOr(t, a.action === 'estado' ? `quotes.act_estado_${(a.changes as any)?.to}` : `quotes.act_${a.action}`, a.action)}</b>{a.userId && actUsers.get(a.userId) ? <span className="muted"> · {actUsers.get(a.userId)}</span> : null}</li>)}</ul>}</Card>
          {costs && adj.length > 0 && <Card title={t('quotes.finalPriceHistory')}><ul className="text-xs space-y-1.5">{adj.map((a) => <li key={a.id}>{dmyHm(a.createdAt)} · {t('quotes.suggestedAmount', { amount: money(a.suggested) })} → <b>{a.next != null ? money(a.next) : t('quotes.suggestedWord')}</b>{a.belowCost && <Badge tone="red" className="ml-1">{t('quotes.belowCost')}</Badge>}{a.reason && <span className="muted"> · {a.reason}</span>}</li>)}</ul></Card>}
        </div>
      </div>
    </>
  );
}
