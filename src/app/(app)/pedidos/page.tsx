import Link from 'next/link';
import { and, desc, eq, ilike, isNull, or, inArray } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can } from '@/lib/perm';
import { PageHeader, Card, Table, StatusBadge, Empty, Badge } from '@/components/ui';
import { dmy, money, sources } from '@/lib/format';
import { paymentStatus } from '@/lib/services/orders';
import { getT } from '@/i18n/server';

export async function generateMetadata() { return { title: (await getT())('meta.orders') }; }

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; st?: string; src?: string }> }) {
  const t = await getT();
  const user = await pagePerm('pedidos', 'V'); const sp = await searchParams; const db = await getDb();
  const conds = [isNull(s.orders.deletedAt)];
  if (sp.q) conds.push(or(ilike(s.orders.number, `%${sp.q}%`), ilike(s.orders.customerName, `%${sp.q}%`), ilike(s.orders.title, `%${sp.q}%`))!);
  if (sp.st) conds.push(eq(s.orders.status, sp.st)); else conds.push(inArray(s.orders.status, ['recibido', 'en_produccion', 'post_proceso', 'listo']));
  if (sp.src) conds.push(eq(s.orders.source, sp.src));
  const rows = await db.select().from(s.orders).where(and(...conds)).orderBy(desc(s.orders.createdAt)).limit(200);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader title={t('common.orders')} subtitle={t('orders.everythingInTheWorkshopStatus')} actions={can(user, 'pedidos', 'C') && <Link href="/pedidos/nuevo" className="btn-primary" data-testid="new-order">{t('orders.registerOrder')}</Link>} />
      <form className="flex flex-wrap gap-2 mb-4" role="search"><input name="q" defaultValue={sp.q} className="input sm:max-w-xs" placeholder={t('orders.searchByNumberCustomerOr')} aria-label={t('orders.searchOrders')} />
        <select name="st" defaultValue={sp.st ?? ''} className="input sm:!w-44" aria-label={t('common.status')}><option value="">{t('orders.inProgress')}</option>{['recibido', 'en_produccion', 'post_proceso', 'listo', 'entregado', 'cancelado'].map((x) => <option key={x} value={x}>{t(`status.${x}` as 'status.listo')}</option>)}</select>
        <select name="src" defaultValue={sp.src ?? ''} className="input sm:!w-44" aria-label={t('orders.source')}><option value="">{t('orders.allSources')}</option>{Object.entries(sources(t)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><button className="btn-ghost">{t('common.filter')}</button></form>
      {rows.length === 0 ? <Card><Empty title={t('orders.thereAreNoOrdersIn')} hint={t('orders.registerTheFirstOneCustomer')} action={<Link className="btn-primary" href="/pedidos/nuevo">{t('common.registerOrder')}</Link>} /></Card> : (
        <>
          <Card pad={false} className="hidden md:block"><Table><thead><tr><th className="th">{t('common.noLabel')}</th><th className="th">{t('common.customer')}</th><th className="th">{t('common.order')}</th><th className="th">{t('orders.source')}</th><th className="th">{t('common.delivery')}</th><th className="th text-right">{t('common.total')}</th><th className="th">{t('orders.payment')}</th><th className="th">{t('common.status')}</th></tr></thead>
            <tbody>{rows.map((o) => { const late = o.dueDate && o.dueDate < today && !['entregado', 'cancelado'].includes(o.status); return (
              <tr key={o.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40"><td className="td font-medium"><Link className="hover:underline" href={`/pedidos/${o.id}`}>{o.number}</Link></td><td className="td">{o.customerName ?? '—'}</td><td className="td">{o.title ?? '—'} {o.kind === 'mixto' && <Badge tone="violet">{t('orders.mixed')}</Badge>}{o.kind === 'solo_stock' && <Badge tone="blue">{t('common.stock')}</Badge>}</td><td className="td text-xs">{o.source ? sources(t)[o.source] ?? o.source : '—'}</td><td className={`td tabular ${late ? 'text-red-600 dark:text-red-400 font-medium' : ''}`}>{dmy(o.dueDate)}{late && ' ⚠'}</td><td className="td text-right tabular font-medium">{money(o.total)}</td><td className="td"><StatusBadge status={paymentStatus(o.total, o.paid)} /></td><td className="td"><StatusBadge status={o.status} /></td></tr>); })}</tbody></Table></Card>
          <ul className="md:hidden space-y-2">{rows.map((o) => <li key={o.id}><Link href={`/pedidos/${o.id}`} className="card p-3 flex items-center justify-between gap-3 min-h-[64px]"><div className="min-w-0"><div className="font-medium">{o.number} <span className="muted font-normal">· {o.customerName}</span></div><div className="text-xs muted truncate">{o.title} · {o.source ? sources(t)[o.source] : ''}</div></div><div className="text-right shrink-0"><div className="tabular font-semibold">{money(o.total)}</div><StatusBadge status={o.status} /></div></Link></li>)}</ul>
        </>
      )}
    </>
  );
}
