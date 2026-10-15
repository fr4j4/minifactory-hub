import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can, canSeeCosts } from '@/lib/perm';
import { PageHeader, Card, StatusBadge, Table, Badge, Meter } from '@/components/ui';
import { OrderActions, PaymentButton, ContactForm } from '@/components/order-bits';
import { LinksEditor } from '@/components/links-editor';
import { PhotoCapture } from '@/components/photo-capture';
import { getSettings } from '@/lib/settings';
import { fillTemplate, waLink } from '@/lib/messages';
import { paymentStatus } from '@/lib/services/orders';
import { dmy, dmyHm, dur, grams, money, pct, sources } from '@/lib/format';
import { tOr } from '@/i18n/translate';
import { getT } from '@/i18n/server';
import { RemoveButton } from '@/components/remove-button';
import { EditButton } from '@/components/edit-button';
import { editFields } from '@/lib/edit-fields';
import { netOfGross } from '@/lib/pricing';

export async function generateMetadata() { return { title: (await getT())('meta.order') }; }
const STEPS = ['recibido', 'en_produccion', 'post_proceso', 'listo', 'entregado'] as const;

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const user = await pagePerm('pedidos', 'V'); const { id } = await params; const db = await getDb(); const st = await getSettings();
  const [o] = await db.select().from(s.orders).where(eq(s.orders.id, id)); if (!o || o.deletedAt) notFound();
  const items = await db.select().from(s.orderItems).where(eq(s.orderItems.orderId, id)).orderBy(asc(s.orderItems.position));
  const iids = items.map((i) => i.id).concat(['00000000-0000-0000-0000-000000000000']);
  const models = await db.select({ qm: s.quoteItemModels, name: s.modelFiles.name }).from(s.quoteItemModels).innerJoin(s.modelFiles, eq(s.modelFiles.id, s.quoteItemModels.modelFileId)).where(inArray(s.quoteItemModels.orderItemId, iids));
  const links = await db.select().from(s.referenceLinks).where(and(inArray(s.referenceLinks.ownerType, ['order', 'order_item']), inArray(s.referenceLinks.ownerId, [id, ...iids])));
  const jobs = await db.select({ j: s.printJobs, m: s.machines.name }).from(s.printJobs).leftJoin(s.machines, eq(s.machines.id, s.printJobs.machineId)).where(and(eq(s.printJobs.orderId, id), isNull(s.printJobs.deletedAt))).orderBy(asc(s.printJobs.createdAt));
  const pays = await db.select().from(s.payments).where(and(eq(s.payments.orderId, id), isNull(s.payments.deletedAt))).orderBy(desc(s.payments.paidAt));
  const contacts = await db.select().from(s.contactLog).where(and(eq(s.contactLog.orderId, id), isNull(s.contactLog.deletedAt))).orderBy(desc(s.contactLog.createdAt));
  const photos = await db.select().from(s.photos).where(and(eq(s.photos.orderId, id), isNull(s.photos.deletedAt))).orderBy(desc(s.photos.takenAt)).limit(24);
  const hist = await db.select().from(s.activityLog).where(and(eq(s.activityLog.entity, 'order'), eq(s.activityLog.entityId, id))).orderBy(desc(s.activityLog.createdAt)).limit(15);
  const [quote] = o.quoteId ? await db.select().from(s.quotes).where(eq(s.quotes.id, o.quoteId)) : [];
  const [cust] = o.customerId ? await db.select().from(s.customers).where(eq(s.customers.id, o.customerId)) : [];
  const costs = canSeeCosts(user); const balance = o.total - o.paid; const pst = paymentStatus(o.total, o.paid);
  const needsPrint = items.some((i) => !(i.variantId && i.fromStock >= i.qty));
  const planned = jobs.some((j) => j.j.status !== 'cancelado');
  const stepIdx = Math.max(0, STEPS.findIndex((k) => k === o.status));
  const vars = { cliente: o.customerName, numero: o.number, seguimiento: o.tracking ?? '' };
  const phone = o.customerPhone ?? cust?.phone;
  const estCost = o.costEstimated; const real = o.costReal; const netTotal = netOfGross(o.total, st.rates, o.taxAmount); const margin = o.total > 0 && netTotal > 0 ? ((netTotal - (real ?? estCost)) / netTotal) * 100 : null;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader back={{ href: '/pedidos', label: t('nav.orders') }} title={<span>{o.number} <StatusBadge status={o.status} /> <StatusBadge status={pst} /></span>}
        subtitle={<>{cust ? <Link className="underline" href={`/clientes/${cust.id}`}>{o.customerName}</Link> : o.customerName ?? t('common.noCustomer')}{phone ? ` · ${phone}` : ''}{o.source ? ` · ${sources(t)[o.source] ?? o.source}` : ''} · {t('orders.createdOn', { date: dmy(o.createdAt) })}{o.dueDate ? ` · ${t('orders.dueOn', { date: dmy(o.dueDate) })}` : ''}{o.dueDate && o.dueDate < today && !['entregado', 'cancelado'].includes(o.status) ? ` ⚠ ${t('orders.late')}` : ''}</>}
        actions={<>{o.status !== 'cancelado' && can(user, 'pedidos', 'E') && <EditButton kind="order" id={o.id} fields={editFields('order', t)} values={o} className="btn-secondary" testId="edit-order" />}<OrderActions id={o.id} status={o.status} canPlan={needsPrint && !planned} canReady={o.status === 'post_proceso' || (!needsPrint && o.status === 'recibido')} hasStockLines={items.some((i) => i.variantId)} shipMethod={o.shipMethod} tracking={o.tracking} canEdit={can(user, 'pedidos', 'E')} occasional={!o.customerId}
          msgReady={fillTemplate(st.templates.whatsappReady, vars)} msgShipped={fillTemplate(st.templates.whatsappShipped, vars)} wa={waLink(phone, fillTemplate(st.templates.whatsappReady, vars))} waShipped={waLink(phone, fillTemplate(st.templates.whatsappShipped, vars))} /></>} />
      {o.status !== 'cancelado' ? (
        <ol className="flex mb-5 overflow-x-auto" aria-label={t('orders.orderProgress')}>{STEPS.map((k, i) => <li key={k} className="flex-1 min-w-[84px] text-center text-xs"><div className={`mx-auto h-2 rounded-full ${i <= stepIdx ? 'bg-brand-600' : 'bg-slate-200 dark:bg-slate-700'} ${i === 0 ? 'rounded-l-full' : ''}`} /><div className={`mt-1.5 ${i === stepIdx ? 'font-semibold' : 'muted'}`}>{t(`status.${k}`)}</div></li>)}</ol>
      ) : <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 text-sm mb-4"><div className="flex flex-wrap items-center justify-between gap-2"><span>{t('orders.orderCancelled')} {o.canceledReason}</span>{can(user, 'pedidos', 'X') && <RemoveButton kind="order" id={o.id} name={o.number} redirectTo="/pedidos" />}</div></div>}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-4">
          <Card title={`${t('orders.orderItems')}${quote ? ` · ${t('orders.fromQuote', { number: quote.number, version: quote.version })}` : ''}`} pad={false}>
            <Table><thead><tr><th className="th">{t('common.description')}</th><th className="th text-right">{t('common.qty')}</th><th className="th text-right">{t('common.unitPrice')}</th><th className="th text-right">{t('common.total')}</th><th className="th">{t('common.status')}</th></tr></thead>
              <tbody>{items.map((it) => { const ms = models.filter((m) => m.qm.orderItemId === it.id); const ls = links.filter((l) => l.ownerType === 'order_item' && l.ownerId === it.id);
                return (<tr key={it.id}><td className="td"><div className="font-medium">{it.description}</div><div className="text-xs muted">{it.variantId ? `${t('orders.catalogProductStock', { n: it.fromStock })}${it.qty - it.fromStock > 0 ? ` + ${t('orders.toProduce', { n: it.qty - it.fromStock })}` : ''}` : it.gramsTotal > 0 ? `${grams(it.gramsTotal)} · ${dur(it.hoursTotal * 3600)}` : t('orders.noPrintData')}</div>
                  {ms.map((m) => <Link key={m.qm.id} href={`/archivos/${m.qm.modelFileId}`} className="badge bg-slate-100 dark:bg-slate-800 border-transparent hover:underline mr-1 mt-1">{m.name}</Link>)}{ls.map((l) => <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" className="text-xs underline mr-2">🔗 {l.title ?? l.url}</a>)}</td>
                  <td className="td text-right tabular">{it.qty}</td><td className="td text-right tabular">{money(it.finalUnit)}{costs && it.finalUnit !== it.suggestedUnit && it.suggestedUnit > 0 && <div className="text-xs muted line-through">{money(it.suggestedUnit)}</div>}</td><td className="td text-right tabular font-medium">{money(it.finalUnit * it.qty)}</td><td className="td"><StatusBadge status={it.status === 'pendiente' ? 'pendiente' : it.status === 'en_cola' ? 'en_cola' : it.status === 'imprimiendo' ? 'imprimiendo' : it.status === 'listo' ? 'listo' : it.status === 'entregado' ? 'entregado' : 'post_proceso'} /></td></tr>); })}</tbody></Table>
          </Card>
          <Card title={t('orders.printJobs')} pad={false} actions={<Link href="/cola" className="btn-ghost btn-sm">{t('orders.viewQueue')}</Link>}>
            {jobs.length === 0 ? <p className="p-4 text-sm muted">{needsPrint ? t('orders.thereAreNoJobsYet') : t('orders.everythingComesFromCatalogStock')}</p> : (
              <Table><thead><tr><th className="th">{t('common.job')}</th><th className="th">{t('common.machine')}</th><th className="th">{t('common.status')}</th><th className="th text-right">{t('orders.estimated')}</th><th className="th text-right">{t('orders.actual')}</th><th className="th">{t('orders.finished')}</th></tr></thead><tbody>{jobs.map(({ j, m }) => <tr key={j.id}><td className="td font-medium">{j.number}{j.reprintOfId && <Badge tone="amber" className="ml-1">{t('orders.reprint')}</Badge>}</td><td className="td">{m ?? '—'}</td><td className="td"><StatusBadge status={j.status} /></td><td className="td text-right tabular text-xs">{grams(j.estG)} · {dur(j.estH * 3600)}</td><td className="td text-right tabular text-xs">{j.realG ? `${grams(j.realG)} · ${dur((j.realH ?? 0) * 3600)}` : '—'}</td><td className="td tabular text-xs">{dmyHm(j.realEnd ?? j.plannedEnd)}</td></tr>)}</tbody></Table>
            )}
          </Card>
          <Card title={t('orders.orderPhotos')}>
            {can(user, 'galeria', 'C') && <div className="mb-3"><PhotoCapture intent={{ orderId: o.id, customerId: o.customerId }} /></div>}
            {photos.length === 0 ? <p className="text-sm muted">{t('orders.noPhotosYetTakePhotos')}</p> : <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">{photos.map((p) => <Link key={p.id} href="/galeria" className="relative"><img src={`/api/media/${p.variants?.['320'] ?? p.storageKey}`} alt={p.caption ?? t('orders.orderPhoto')} className="rounded aspect-square object-cover w-full" />{p.internalOnly && <span className="absolute left-1 top-1 badge bg-amber-100 text-amber-900 border-transparent text-[10px]">{t('orders.internal')}</span>}</Link>)}</div>}
          </Card>
          <Card title={t('orders.customerContacts')} actions={phone ? <a className="btn-ghost btn-sm" href={waLink(phone, '')} target="_blank" rel="noopener noreferrer">{t('orders.openWhatsapp')}</a> : undefined}>
            {can(user, 'pedidos', 'E') && <ContactForm orderId={o.id} customerId={o.customerId} />}
            <ul className="mt-3 space-y-1.5 text-sm">{contacts.map((c) => <li key={c.id} className="flex gap-2"><span className="muted text-xs tabular shrink-0 pt-0.5">{dmyHm(c.createdAt)}</span><span>{c.summary} <Badge>{sources(t)[c.channel ?? ''] ?? c.channel}</Badge></span>{can(user, 'pedidos', 'E') && <span className="ml-auto"><EditButton kind="contact" id={c.id} fields={editFields('contact', t)} values={c} label="✎" className="btn-ghost btn-sm !px-2 !min-h-[28px]" testId="edit-contact" /></span>}{can(user, 'pedidos', 'X') && <span className="ml-auto"><RemoveButton kind="contact" id={c.id} name={dmyHm(c.createdAt)} label="✕" className="btn-ghost btn-sm !px-2 !min-h-[28px] text-red-600 dark:text-red-400" testId="remove-contact" /></span>}</li>)}{contacts.length === 0 && <li className="muted text-sm">{t('orders.noContactsLoggedYetCopy')}</li>}</ul>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title={t('orders.totalsPayments')} actions={can(user, 'pagos', 'C') && o.status !== 'cancelado' ? <PaymentButton orderId={o.id} balance={Math.max(0, balance)} /> : undefined}>
            <dl className="text-sm space-y-1.5 tabular"><div className="flex justify-between text-lg font-bold"><dt>{t('common.total')}</dt><dd data-testid="order-view-total">{money(o.total)}</dd></div><div className="flex justify-between"><dt className="muted">{t('orders.paid')}</dt><dd data-testid="order-paid">{money(o.paid)}</dd></div><div className="flex justify-between font-medium"><dt>{t('orders.balance')}</dt><dd className={balance > 0 ? 'text-amber-600' : 'text-emerald-600'}>{money(balance)}</dd></div></dl>
            <div className="mt-2"><Meter value={o.paid} max={o.total} tone={balance <= 0 ? 'ok' : 'warn'} /></div>
            <ul className="mt-3 space-y-1.5 text-xs">{pays.map((p) => <li key={p.id} className="flex justify-between"><span>{dmy(p.paidAt)} · {tOr(t, `payMethod.${p.method}`, p.method)}{p.taxDocType ? ` · ${tOr(t, `taxDoc.${p.taxDocType}`, p.taxDocType)} ${p.taxDocFolio ?? ''}` : ''}{p.note ? ` · ${p.note}` : ''}</span><span className="tabular font-medium">{money(p.amount)}{can(user, 'pagos', 'E') && <EditButton kind="payment" id={p.id} fields={editFields('payment', t)} values={p} label="✎" className="btn-ghost btn-sm !px-2 !min-h-[28px]" testId="edit-payment" />}{can(user, 'pagos', 'X') && <RemoveButton kind="payment" id={p.id} name={money(p.amount)} label="✕" className="btn-ghost btn-sm !px-2 !min-h-[28px] text-red-600 dark:text-red-400" testId="remove-payment" />}</span></li>)}</ul>
          </Card>
          {costs && <Card title={t('orders.costMargin')}><dl className="text-sm space-y-1.5 tabular"><div className="flex justify-between"><dt className="muted">{t('orders.estimatedCost')}</dt><dd>{money(estCost)}</dd></div><div className="flex justify-between"><dt className="muted">{t('orders.actualCost')}</dt><dd>{real != null ? money(real) : t('orders.calculatedWhenTheJobsFinish')}</dd></div>{real != null && estCost > 0 && <div className="flex justify-between"><dt className="muted">{t('orders.variance')}</dt><dd className={real > estCost ? 'text-red-600 dark:text-red-400' : 'text-emerald-600'}>{pct(((real - estCost) / estCost) * 100, 0)}</dd></div>}<div className="flex justify-between font-medium"><dt>{real != null ? t('orders.actualMargin') : t('orders.estimatedMargin')}</dt><dd>{pct(margin, 0)}</dd></div></dl></Card>}
          <Card title={t('common.delivery')}><dl className="text-sm space-y-1"><div className="flex justify-between"><dt className="muted">{t('orders.deliveryType')}</dt><dd>{o.shipMethod === 'despacho' ? t('common.shipping') : t('common.workshopPickup')}</dd></div>{o.shipAddress && <div className="flex justify-between gap-3"><dt className="muted">{t('orders.address')}</dt><dd className="text-right">{o.shipAddress}</dd></div>}{o.tracking && <div className="flex justify-between"><dt className="muted">{t('orders.trackingNo')}</dt><dd>{o.tracking}</dd></div>}{o.deliveredAt && <div className="flex justify-between"><dt className="muted">{t('orders.delivered')}</dt><dd>{dmy(o.deliveredAt)}</dd></div>}</dl>{o.approvedBy && <p className="text-xs muted mt-2">{t('orders.approvedBy', { name: o.approvedBy, channel: o.approvedChannel })}</p>}{o.notes && <p className="text-sm mt-2 whitespace-pre-wrap">{o.notes}</p>}</Card>
          <Card title={t('common.referenceLinks')}><LinksEditor value={links.filter((l) => l.ownerType === 'order').map((l) => ({ ...l }))} persist={{ ownerType: 'order', ownerId: o.id, revalidate: `/pedidos/${o.id}` }} readOnly={!can(user, 'pedidos', 'E')} compact /></Card>
          <Card title={t('orders.history')}><ul className="text-xs space-y-1.5">{hist.map((h) => <li key={h.id}><span className="muted tabular">{dmyHm(h.createdAt)}</span> · {tOr(t, `audit.${h.action}`, h.action)}{(h.changes as any)?.to ? ` → ${tOr(t, `status.${(h.changes as any).to}`, String((h.changes as any).to))}` : ''}</li>)}</ul></Card>
        </div>
      </div>
    </>
  );
}
