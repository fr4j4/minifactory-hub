import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can, canSeeCosts } from '@/lib/perm';
import { PageHeader, Card, StatusBadge, Table, Stat, Badge } from '@/components/ui';
import { CustomerForm } from '@/components/customer-form';
import { dmy, money, pct } from '@/lib/format';

export const metadata = { title: 'Cliente' };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pagePerm('clientes', 'V'); const { id } = await params; const db = await getDb();
  const [c] = await db.select().from(s.customers).where(eq(s.customers.id, id)); if (!c) notFound();
  const pl = await db.select().from(s.priceLists);
  const quotes = await db.select().from(s.quotes).where(and(eq(s.quotes.customerId, id), isNull(s.quotes.deletedAt))).orderBy(desc(s.quotes.createdAt)).limit(30);
  const orders = await db.select().from(s.orders).where(and(eq(s.orders.customerId, id), isNull(s.orders.deletedAt))).orderBy(desc(s.orders.createdAt)).limit(30);
  const files = await db.select().from(s.modelFiles).where(and(eq(s.modelFiles.customerId, id), isNull(s.modelFiles.deletedAt))).limit(12);
  const photos = await db.select().from(s.photos).where(and(eq(s.photos.customerId, id), isNull(s.photos.deletedAt))).orderBy(desc(s.photos.takenAt)).limit(12);
  const sent = quotes.filter((q) => ['enviado', 'aprobado', 'rechazado', 'vencido'].includes(q.status)); const rate = sent.length ? (quotes.filter((q) => q.status === 'aprobado').length / sent.length) * 100 : null;
  const total = orders.filter((o) => o.status !== 'cancelado').reduce((a, o) => a + o.total, 0);
  return (
    <>
      <PageHeader back={{ href: '/clientes', label: 'Clientes' }} title={c.name} subtitle={<>{c.phone} {c.email && `· ${c.email}`} {c.taxId && `· ${c.taxId}`}</>} actions={<>{can(user, 'pedidos', 'C') && <Link className="btn-ghost" href={`/pedidos/nuevo?cliente=${c.id}`}>Nuevo pedido</Link>}{can(user, 'presupuestos', 'C') && <Link className="btn-primary" href={`/presupuestos/nuevo?customer=${c.id}`}>Nuevo presupuesto</Link>}</>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4"><Stat label="Pedidos" value={orders.length} /><Stat label="Total comprado" value={money(total)} /><Stat label="Aprobación de presupuestos" value={rate != null ? pct(rate, 0) : '—'} sub={`${sent.length} enviados`} /><Stat label="Último pedido" value={orders[0] ? dmy(orders[0].createdAt) : '—'} /></div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-4">
          <Card title="Pedidos" pad={false}><Table><tbody>{orders.map((o) => <tr key={o.id}><td className="td font-medium"><Link className="hover:underline" href={`/pedidos/${o.id}`}>{o.number}</Link></td><td className="td">{o.title}</td><td className="td tabular">{dmy(o.createdAt)}</td><td className="td text-right tabular">{money(o.total)}</td><td className="td"><StatusBadge status={o.status} /></td></tr>)}{orders.length === 0 && <tr><td className="td muted">Sin pedidos aún.</td></tr>}</tbody></Table></Card>
          <Card title="Presupuestos" pad={false}><Table><tbody>{quotes.map((q) => <tr key={q.id}><td className="td font-medium"><Link className="hover:underline" href={`/presupuestos/${q.id}`}>{q.number} v{q.version}</Link></td><td className="td">{q.title}</td><td className="td tabular">{dmy(q.createdAt)}</td><td className="td text-right tabular">{money(q.total)}</td><td className="td"><StatusBadge status={q.status} /></td></tr>)}{quotes.length === 0 && <tr><td className="td muted">Sin presupuestos.</td></tr>}</tbody></Table></Card>
          {(files.length > 0 || photos.length > 0) && <Card title="Archivos y fotos">{files.length > 0 && <div className="flex flex-wrap gap-2 mb-3">{files.map((f) => <Link key={f.id} className="badge bg-slate-100 dark:bg-slate-800 border-transparent hover:underline" href={`/archivos/${f.id}`}>{f.name}</Link>)}</div>}<div className="grid grid-cols-4 sm:grid-cols-6 gap-2">{photos.map((p) => <img key={p.id} src={`/api/media/${p.variants?.['320'] ?? p.storageKey}`} alt="" className="rounded aspect-square object-cover" />)}</div></Card>}
        </div>
        <Card title="Datos y consentimiento">{can(user, 'clientes', 'E') ? <CustomerForm priceLists={pl} c={{ id: c.id, type: c.type, name: c.name, phone: c.phone, email: c.email, taxId: c.taxId, priceListId: c.priceListId, photoConsent: c.photoConsent, tags: c.tags ?? [], notes: c.notes, depositPct: c.depositPct, addresses: c.addresses ?? [] }} /> : <p className="text-sm muted">Sin permiso para editar.</p>}</Card>
      </div>
    </>
  );
}
