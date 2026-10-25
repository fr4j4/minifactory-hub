import {modelAccess,photoAccess} from '@/lib/library/access';
import { getSettings } from '@/lib/settings';
import Link from 'next/link';
import { cn } from '@/lib/format';
import { TONES } from '@/components/badge';
import { notFound } from 'next/navigation';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can, canSeeCosts } from '@/lib/perm';
import { PageHeader, Card, StatusBadge, Table, Stat, Badge } from '@/components/ui';
import { CustomerForm } from '@/components/customer-form';
import { dmy, money, pct } from '@/lib/format';
import { getT } from '@/i18n/server';
import { RemoveButton } from '@/components/remove-button';

export async function generateMetadata() { return { title: (await getT())('meta.customer') }; }

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const user = await pagePerm('clientes', 'V'); const { id } = await params; const db = await getDb();
  const [c] = await db.select().from(s.customers).where(eq(s.customers.id, id)); if (!c || c.deletedAt) notFound();
  const pl = await db.select().from(s.priceLists).where(isNull(s.priceLists.deletedAt));
  const quotes = await db.select().from(s.quotes).where(and(eq(s.quotes.customerId, id), isNull(s.quotes.deletedAt))).orderBy(desc(s.quotes.createdAt)).limit(30);
  const orders = await db.select().from(s.orders).where(and(eq(s.orders.customerId, id), isNull(s.orders.deletedAt))).orderBy(desc(s.orders.createdAt)).limit(30);
  const files = await db.select().from(s.modelFiles).where(and(modelAccess(user),eq(s.modelFiles.customerId, id), isNull(s.modelFiles.deletedAt))).limit(12);
  const photos = await db.select().from(s.photos).where(and(photoAccess(user),eq(s.photos.customerId, id), isNull(s.photos.deletedAt))).orderBy(desc(s.photos.takenAt)).limit(12);
  const sent = quotes.filter((q) => ['enviado', 'aprobado', 'rechazado', 'vencido'].includes(q.status)); const rate = sent.length ? (quotes.filter((q) => q.status === 'aprobado').length / sent.length) * 100 : null;
  const total = orders.filter((o) => o.status !== 'cancelado').reduce((a, o) => a + o.total, 0);
  return (
    <>
      <PageHeader back={{ href: '/clientes', label: t('nav.customers') }} title={c.name} subtitle={<>{c.phone} {c.email && `· ${c.email}`} {c.taxId && `· ${c.taxId}`}</>} actions={<>{can(user, 'pedidos', 'C') && <Link className="btn-ghost" href={`/pedidos/nuevo?cliente=${c.id}`}>{t('customers.newOrder')}</Link>}{can(user, 'presupuestos', 'C') && <Link className="btn-primary" href={`/presupuestos/nuevo?customer=${c.id}`}>{t('common.newQuote')}</Link>}{can(user, 'clientes', 'X') && <RemoveButton kind="customer" id={c.id} name={c.name} redirectTo="/clientes" />}</>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4"><Stat label={t('common.orders')} value={orders.length} /><Stat label={t('customers.totalPurchased')} value={money(total)} /><Stat label={t('customers.quoteApproval')} value={rate != null ? pct(rate, 0) : '—'} sub={t('customers.sent', { sent: sent.length })} /><Stat label={t('common.lastOrder')} value={orders[0] ? dmy(orders[0].createdAt) : '—'} /></div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 min-w-0 space-y-4">
          <Card title={t('common.orders')} pad={false}><Table><tbody>{orders.map((o) => <tr key={o.id}><td className="td font-medium"><Link className="hover:underline" href={`/pedidos/${o.id}`}>{o.number}</Link></td><td className="td">{o.title}</td><td className="td tabular">{dmy(o.createdAt)}</td><td className="td text-right tabular">{money(o.total)}</td><td className="td"><StatusBadge status={o.status} /></td></tr>)}{orders.length === 0 && <tr><td className="td muted">{t('customers.noOrdersYet')}</td></tr>}</tbody></Table></Card>
          <Card title={t('common.quotes')} pad={false}><Table><tbody>{quotes.map((q) => <tr key={q.id}><td className="td font-medium"><Link className="hover:underline" href={`/presupuestos/${q.id}`}>{q.number} v{q.version}</Link></td><td className="td">{q.title}</td><td className="td tabular">{dmy(q.createdAt)}</td><td className="td text-right tabular">{money(q.total)}</td><td className="td"><StatusBadge status={q.status} /></td></tr>)}{quotes.length === 0 && <tr><td className="td muted">{t('customers.noQuotes')}</td></tr>}</tbody></Table></Card>
          {(files.length > 0 || photos.length > 0) && <Card title={t('customers.filesPhotos')}>{files.length > 0 && <div className="flex flex-wrap gap-2 mb-3">{files.map((f) => <Link key={f.id} className={cn('badge hover:underline', TONES.gray)} href={`/archivos/${f.id}`}>{f.name}</Link>)}</div>}<div className="grid grid-cols-4 sm:grid-cols-6 gap-2">{photos.map((p) => <img key={p.id} src={`/api/media/${p.variants?.['320'] ?? p.storageKey}`} alt="" className="rounded aspect-square object-cover" />)}</div></Card>}
        </div>
        <Card title={t('customers.detailsConsent')}>{can(user, 'clientes', 'E') ? <CustomerForm priceLists={pl} calcProfiles={(await getSettings()).calcProfiles} c={{ calcProfileId: c.calcProfileId, id: c.id, type: c.type, name: c.name, phone: c.phone, email: c.email, taxId: c.taxId, priceListId: c.priceListId, photoConsent: c.photoConsent, tags: c.tags ?? [], notes: c.notes, depositPct: c.depositPct, addresses: c.addresses ?? [] }} /> : <p className="text-sm muted">{t('customers.youDoNotHavePermission')}</p>}</Card>
      </div>
    </>
  );
}
