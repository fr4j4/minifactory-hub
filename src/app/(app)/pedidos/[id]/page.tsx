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
import { dmy, dmyHm, dur, grams, money, pct, SOURCES } from '@/lib/format';

export const metadata = { title: 'Pedido' };
const STEPS = [['recibido', 'Recibido'], ['en_produccion', 'En producción'], ['post_proceso', 'Post-proceso'], ['listo', 'Listo'], ['entregado', 'Entregado']];

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pagePerm('pedidos', 'V'); const { id } = await params; const db = await getDb(); const st = await getSettings();
  const [o] = await db.select().from(s.orders).where(eq(s.orders.id, id)); if (!o) notFound();
  const items = await db.select().from(s.orderItems).where(eq(s.orderItems.orderId, id)).orderBy(asc(s.orderItems.position));
  const iids = items.map((i) => i.id).concat(['00000000-0000-0000-0000-000000000000']);
  const models = await db.select({ qm: s.quoteItemModels, name: s.modelFiles.name }).from(s.quoteItemModels).innerJoin(s.modelFiles, eq(s.modelFiles.id, s.quoteItemModels.modelFileId)).where(inArray(s.quoteItemModels.orderItemId, iids));
  const links = await db.select().from(s.referenceLinks).where(and(inArray(s.referenceLinks.ownerType, ['order', 'order_item']), inArray(s.referenceLinks.ownerId, [id, ...iids])));
  const jobs = await db.select({ j: s.printJobs, m: s.machines.name }).from(s.printJobs).leftJoin(s.machines, eq(s.machines.id, s.printJobs.machineId)).where(and(eq(s.printJobs.orderId, id), isNull(s.printJobs.deletedAt))).orderBy(asc(s.printJobs.createdAt));
  const pays = await db.select().from(s.payments).where(and(eq(s.payments.orderId, id), isNull(s.payments.deletedAt))).orderBy(desc(s.payments.paidAt));
  const contacts = await db.select().from(s.contactLog).where(eq(s.contactLog.orderId, id)).orderBy(desc(s.contactLog.createdAt));
  const photos = await db.select().from(s.photos).where(and(eq(s.photos.orderId, id), isNull(s.photos.deletedAt))).orderBy(desc(s.photos.takenAt)).limit(24);
  const hist = await db.select().from(s.activityLog).where(and(eq(s.activityLog.entity, 'order'), eq(s.activityLog.entityId, id))).orderBy(desc(s.activityLog.createdAt)).limit(15);
  const [quote] = o.quoteId ? await db.select().from(s.quotes).where(eq(s.quotes.id, o.quoteId)) : [];
  const [cust] = o.customerId ? await db.select().from(s.customers).where(eq(s.customers.id, o.customerId)) : [];
  const costs = canSeeCosts(user); const balance = o.total - o.paid; const pst = paymentStatus(o.total, o.paid);
  const needsPrint = items.some((i) => !(i.variantId && i.fromStock >= i.qty));
  const planned = jobs.some((j) => j.j.status !== 'cancelado');
  const stepIdx = Math.max(0, STEPS.findIndex(([k]) => k === o.status));
  const vars = { cliente: o.customerName, numero: o.number, seguimiento: o.tracking ?? '' };
  const phone = o.customerPhone ?? cust?.phone;
  const estCost = o.costEstimated; const real = o.costReal; const margin = o.total > 0 ? ((o.total / (st.rates.taxMode === 'incluido' ? 1 + st.rates.taxPct / 100 : 1) - (real ?? estCost)) / (o.total / (st.rates.taxMode === 'incluido' ? 1 + st.rates.taxPct / 100 : 1))) * 100 : null;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader back={{ href: '/pedidos', label: 'Pedidos' }} title={<span>{o.number} <StatusBadge status={o.status} /> <StatusBadge status={pst} /></span>}
        subtitle={<>{cust ? <Link className="underline" href={`/clientes/${cust.id}`}>{o.customerName}</Link> : o.customerName ?? 'Sin cliente'}{phone ? ` · ${phone}` : ''}{o.source ? ` · ${SOURCES[o.source] ?? o.source}` : ''} · creado {dmy(o.createdAt)}{o.dueDate ? ` · entrega ${dmy(o.dueDate)}` : ''}{o.dueDate && o.dueDate < today && !['entregado', 'cancelado'].includes(o.status) ? ' ⚠ atrasado' : ''}</>}
        actions={<OrderActions id={o.id} status={o.status} canPlan={needsPrint && !planned} canReady={o.status === 'post_proceso' || (!needsPrint && o.status === 'recibido')} hasStockLines={items.some((i) => i.variantId)} shipMethod={o.shipMethod} tracking={o.tracking} canEdit={can(user, 'pedidos', 'E')} occasional={!o.customerId}
          msgReady={fillTemplate(st.templates.whatsappReady, vars)} msgShipped={fillTemplate(st.templates.whatsappShipped, vars)} wa={waLink(phone, fillTemplate(st.templates.whatsappReady, vars))} waShipped={waLink(phone, fillTemplate(st.templates.whatsappShipped, vars))} />} />
      {o.status !== 'cancelado' ? (
        <ol className="flex mb-5 overflow-x-auto" aria-label="Avance del pedido">{STEPS.map(([k, l], i) => <li key={k} className="flex-1 min-w-[84px] text-center text-xs"><div className={`mx-auto h-2 rounded-full ${i <= stepIdx ? 'bg-brand-600' : 'bg-slate-200 dark:bg-slate-700'} ${i === 0 ? 'rounded-l-full' : ''}`} /><div className={`mt-1.5 ${i === stepIdx ? 'font-semibold' : 'muted'}`}>{l}</div></li>)}</ol>
      ) : <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 text-sm mb-4">Pedido cancelado: {o.canceledReason}</div>}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-4">
          <Card title={`Líneas del pedido${quote ? ` · desde ${quote.number} v${quote.version}` : ''}`} pad={false}>
            <Table><thead><tr><th className="th">Descripción</th><th className="th text-right">Cant.</th><th className="th text-right">Precio u.</th><th className="th text-right">Total</th><th className="th">Estado</th></tr></thead>
              <tbody>{items.map((it) => { const ms = models.filter((m) => m.qm.orderItemId === it.id); const ls = links.filter((l) => l.ownerType === 'order_item' && l.ownerId === it.id);
                return (<tr key={it.id}><td className="td"><div className="font-medium">{it.description}</div><div className="text-xs muted">{it.variantId ? `Producto de catálogo · ${it.fromStock} de stock${it.qty - it.fromStock > 0 ? ` + ${it.qty - it.fromStock} a producir` : ''}` : it.gramsTotal > 0 ? `${grams(it.gramsTotal)} · ${dur(it.hoursTotal * 3600)}` : 'Sin datos de impresión'}</div>
                  {ms.map((m) => <Link key={m.qm.id} href={`/archivos/${m.qm.modelFileId}`} className="badge bg-slate-100 dark:bg-slate-800 border-transparent hover:underline mr-1 mt-1">{m.name}</Link>)}{ls.map((l) => <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" className="text-xs underline mr-2">🔗 {l.title ?? l.url}</a>)}</td>
                  <td className="td text-right tabular">{it.qty}</td><td className="td text-right tabular">{money(it.finalUnit)}{costs && it.finalUnit !== it.suggestedUnit && it.suggestedUnit > 0 && <div className="text-xs muted line-through">{money(it.suggestedUnit)}</div>}</td><td className="td text-right tabular font-medium">{money(it.finalUnit * it.qty)}</td><td className="td"><StatusBadge status={it.status === 'pendiente' ? 'pendiente' : it.status === 'en_cola' ? 'en_cola' : it.status === 'imprimiendo' ? 'imprimiendo' : it.status === 'listo' ? 'listo' : it.status === 'entregado' ? 'entregado' : 'post_proceso'} /></td></tr>); })}</tbody></Table>
          </Card>
          <Card title="Trabajos de impresión" pad={false} actions={<Link href="/cola" className="btn-ghost btn-sm">Ver cola</Link>}>
            {jobs.length === 0 ? <p className="p-4 text-sm muted">{needsPrint ? 'Aún no hay trabajos: usa “Enviar a producción”.' : 'Todo sale del stock del catálogo; no requiere impresión.'}</p> : (
              <Table><thead><tr><th className="th">Trabajo</th><th className="th">Máquina</th><th className="th">Estado</th><th className="th text-right">Estimado</th><th className="th text-right">Real</th><th className="th">Término</th></tr></thead><tbody>{jobs.map(({ j, m }) => <tr key={j.id}><td className="td font-medium">{j.number}{j.reprintOfId && <Badge tone="amber" className="ml-1">Reimpresión</Badge>}</td><td className="td">{m ?? '—'}</td><td className="td"><StatusBadge status={j.status} /></td><td className="td text-right tabular text-xs">{grams(j.estG)} · {dur(j.estH * 3600)}</td><td className="td text-right tabular text-xs">{j.realG ? `${grams(j.realG)} · ${dur((j.realH ?? 0) * 3600)}` : '—'}</td><td className="td tabular text-xs">{dmyHm(j.realEnd ?? j.plannedEnd)}</td></tr>)}</tbody></Table>
            )}
          </Card>
          <Card title="Fotos del pedido">
            {can(user, 'galeria', 'C') && <div className="mb-3"><PhotoCapture intent={{ orderId: o.id, customerId: o.customerId }} /></div>}
            {photos.length === 0 ? <p className="text-sm muted">Sin fotos todavía. Toma fotos desde el celular junto a la impresora; si no hay señal se suben solas después.</p> : <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">{photos.map((p) => <Link key={p.id} href="/galeria" className="relative"><img src={`/api/media/${p.variants?.['320'] ?? p.storageKey}`} alt={p.caption ?? 'Foto del pedido'} className="rounded aspect-square object-cover w-full" />{p.internalOnly && <span className="absolute left-1 top-1 badge bg-amber-100 text-amber-900 border-transparent text-[10px]">Interno</span>}</Link>)}</div>}
          </Card>
          <Card title="Contactos con el cliente" actions={phone ? <a className="btn-ghost btn-sm" href={waLink(phone, '')} target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a> : undefined}>
            {can(user, 'pedidos', 'E') && <ContactForm orderId={o.id} customerId={o.customerId} />}
            <ul className="mt-3 space-y-1.5 text-sm">{contacts.map((c) => <li key={c.id} className="flex gap-2"><span className="muted text-xs tabular shrink-0 pt-0.5">{dmyHm(c.createdAt)}</span><span>{c.summary} <Badge>{SOURCES[c.channel ?? ''] ?? c.channel}</Badge></span></li>)}{contacts.length === 0 && <li className="muted text-sm">Aún no hay contactos anotados. Copia el aviso y anota que se envió.</li>}</ul>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Totales y pagos" actions={can(user, 'pagos', 'C') && o.status !== 'cancelado' ? <PaymentButton orderId={o.id} balance={Math.max(0, balance)} /> : undefined}>
            <dl className="text-sm space-y-1.5 tabular"><div className="flex justify-between text-lg font-bold"><dt>Total</dt><dd data-testid="order-view-total">{money(o.total)}</dd></div><div className="flex justify-between"><dt className="muted">Pagado</dt><dd data-testid="order-paid">{money(o.paid)}</dd></div><div className="flex justify-between font-medium"><dt>Saldo</dt><dd className={balance > 0 ? 'text-amber-600' : 'text-emerald-600'}>{money(balance)}</dd></div></dl>
            <div className="mt-2"><Meter value={o.paid} max={o.total} tone={balance <= 0 ? 'ok' : 'warn'} /></div>
            <ul className="mt-3 space-y-1.5 text-xs">{pays.map((p) => <li key={p.id} className="flex justify-between"><span>{dmy(p.paidAt)} · {p.method}{p.taxDocType ? ` · ${p.taxDocType} ${p.taxDocFolio ?? ''}` : ''}{p.note ? ` · ${p.note}` : ''}</span><span className="tabular font-medium">{money(p.amount)}</span></li>)}</ul>
          </Card>
          {costs && <Card title="Costo y margen"><dl className="text-sm space-y-1.5 tabular"><div className="flex justify-between"><dt className="muted">Costo estimado</dt><dd>{money(estCost)}</dd></div><div className="flex justify-between"><dt className="muted">Costo real</dt><dd>{real != null ? money(real) : 'se calcula al terminar los trabajos'}</dd></div>{real != null && estCost > 0 && <div className="flex justify-between"><dt className="muted">Desvío</dt><dd className={real > estCost ? 'text-red-600' : 'text-emerald-600'}>{pct(((real - estCost) / estCost) * 100, 0)}</dd></div>}<div className="flex justify-between font-medium"><dt>Margen {real != null ? 'real' : 'estimado'}</dt><dd>{pct(margin, 0)}</dd></div></dl></Card>}
          <Card title="Entrega"><dl className="text-sm space-y-1"><div className="flex justify-between"><dt className="muted">Modalidad</dt><dd>{o.shipMethod === 'despacho' ? 'Despacho' : 'Retiro en taller'}</dd></div>{o.shipAddress && <div className="flex justify-between gap-3"><dt className="muted">Dirección</dt><dd className="text-right">{o.shipAddress}</dd></div>}{o.tracking && <div className="flex justify-between"><dt className="muted">Seguimiento</dt><dd>{o.tracking}</dd></div>}{o.deliveredAt && <div className="flex justify-between"><dt className="muted">Entregado</dt><dd>{dmy(o.deliveredAt)}</dd></div>}</dl>{o.approvedBy && <p className="text-xs muted mt-2">Aprobado por {o.approvedBy} vía {o.approvedChannel}.</p>}{o.notes && <p className="text-sm mt-2 whitespace-pre-wrap">{o.notes}</p>}</Card>
          <Card title="Links de referencia"><LinksEditor value={links.filter((l) => l.ownerType === 'order').map((l) => ({ ...l }))} persist={{ ownerType: 'order', ownerId: o.id, revalidate: `/pedidos/${o.id}` }} readOnly={!can(user, 'pedidos', 'E')} compact /></Card>
          <Card title="Historial"><ul className="text-xs space-y-1.5">{hist.map((h) => <li key={h.id}><span className="muted tabular">{dmyHm(h.createdAt)}</span> · {h.action}{(h.changes as any)?.to ? ` → ${(h.changes as any).to}` : ''}</li>)}</ul></Card>
        </div>
      </div>
    </>
  );
}
