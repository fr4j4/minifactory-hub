import Link from 'next/link';
import { and, desc, eq, ilike, isNull, or, inArray } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can } from '@/lib/perm';
import { PageHeader, Card, Table, StatusBadge, Empty, Badge } from '@/components/ui';
import { dmy, money, SOURCES } from '@/lib/format';
import { paymentStatus } from '@/lib/services/orders';

export const metadata = { title: 'Pedidos' };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; st?: string; src?: string }> }) {
  const user = await pagePerm('pedidos', 'V'); const sp = await searchParams; const db = await getDb();
  const conds = [isNull(s.orders.deletedAt)];
  if (sp.q) conds.push(or(ilike(s.orders.number, `%${sp.q}%`), ilike(s.orders.customerName, `%${sp.q}%`), ilike(s.orders.title, `%${sp.q}%`))!);
  if (sp.st) conds.push(eq(s.orders.status, sp.st)); else conds.push(inArray(s.orders.status, ['recibido', 'en_produccion', 'post_proceso', 'listo']));
  if (sp.src) conds.push(eq(s.orders.source, sp.src));
  const rows = await db.select().from(s.orders).where(and(...conds)).orderBy(desc(s.orders.createdAt)).limit(200);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader title="Pedidos" subtitle="Todo lo que está en el taller: estado, responsable, máquina y fecha comprometida." actions={can(user, 'pedidos', 'C') && <Link href="/pedidos/nuevo" className="btn-primary" data-testid="new-order">+ Registrar pedido</Link>} />
      <form className="flex flex-wrap gap-2 mb-4" role="search"><input name="q" defaultValue={sp.q} className="input sm:max-w-xs" placeholder="Buscar por número, cliente o título" aria-label="Buscar pedidos" />
        <select name="st" defaultValue={sp.st ?? ''} className="input sm:!w-44" aria-label="Estado"><option value="">En curso</option>{['recibido', 'en_produccion', 'post_proceso', 'listo', 'entregado', 'cancelado'].map((x) => <option key={x} value={x}>{x.replace('_', ' ')}</option>)}</select>
        <select name="src" defaultValue={sp.src ?? ''} className="input sm:!w-44" aria-label="Origen"><option value="">Todos los orígenes</option>{Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><button className="btn-ghost">Filtrar</button></form>
      {rows.length === 0 ? <Card><Empty title="No hay pedidos en esta vista" hint="Registra el primero: cliente, qué pidió y por dónde llegó. Toma menos de un minuto." action={<Link className="btn-primary" href="/pedidos/nuevo">Registrar pedido</Link>} /></Card> : (
        <>
          <Card pad={false} className="hidden md:block"><Table><thead><tr><th className="th">N°</th><th className="th">Cliente</th><th className="th">Pedido</th><th className="th">Origen</th><th className="th">Entrega</th><th className="th text-right">Total</th><th className="th">Pago</th><th className="th">Estado</th></tr></thead>
            <tbody>{rows.map((o) => { const late = o.dueDate && o.dueDate < today && !['entregado', 'cancelado'].includes(o.status); return (
              <tr key={o.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40"><td className="td font-medium"><Link className="hover:underline" href={`/pedidos/${o.id}`}>{o.number}</Link></td><td className="td">{o.customerName ?? '—'}</td><td className="td">{o.title ?? '—'} {o.kind === 'mixto' && <Badge tone="violet">Mixto</Badge>}{o.kind === 'solo_stock' && <Badge tone="blue">Stock</Badge>}</td><td className="td text-xs">{o.source ? SOURCES[o.source] ?? o.source : '—'}</td><td className={`td tabular ${late ? 'text-red-600 font-medium' : ''}`}>{dmy(o.dueDate)}{late && ' ⚠'}</td><td className="td text-right tabular font-medium">{money(o.total)}</td><td className="td"><StatusBadge status={paymentStatus(o.total, o.paid)} /></td><td className="td"><StatusBadge status={o.status} /></td></tr>); })}</tbody></Table></Card>
          <ul className="md:hidden space-y-2">{rows.map((o) => <li key={o.id}><Link href={`/pedidos/${o.id}`} className="card p-3 flex items-center justify-between gap-3 min-h-[64px]"><div className="min-w-0"><div className="font-medium">{o.number} <span className="muted font-normal">· {o.customerName}</span></div><div className="text-xs muted truncate">{o.title} · {o.source ? SOURCES[o.source] : ''}</div></div><div className="text-right shrink-0"><div className="tabular font-semibold">{money(o.total)}</div><StatusBadge status={o.status} /></div></Link></li>)}</ul>
        </>
      )}
    </>
  );
}
