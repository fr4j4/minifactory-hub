import Link from 'next/link';
import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can, canSeeCosts } from '@/lib/perm';
import { PageHeader, Card, Table, StatusBadge, Empty, Badge } from '@/components/ui';
import { SaleActions } from '@/components/sale-actions';
import { dmy, money } from '@/lib/format';

export const metadata = { title: 'Ventas' };
export default async function SalesPage({ searchParams }: { searchParams: Promise<{ st?: string; ch?: string }> }) {
  const user = await pagePerm('ventas', 'V'); const sp = await searchParams; const db = await getDb(); const costs = canSeeCosts(user);
  const channels = await db.select().from(s.salesChannels);
  const conds = [isNull(s.sales.deletedAt)]; if (sp.st) conds.push(eq(s.sales.status, sp.st)); if (sp.ch) conds.push(eq(s.sales.channelId, sp.ch));
  const rows = await db.select().from(s.sales).where(and(...conds)).orderBy(desc(s.sales.createdAt)).limit(120);
  const pending = rows.filter((r) => r.status === 'por_despachar');
  return (
    <>
      <PageHeader title="Ventas rápidas" subtitle="Ventas de productos del catálogo: mostrador, ferias y marketplaces." actions={can(user, 'ventas', 'C') && <Link href="/ventas/nueva" className="btn-primary" data-testid="new-sale">+ Venta rápida</Link>} />
      {pending.length > 0 && <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm mb-4" role="status">{pending.length} venta(s) de marketplace por despachar: {pending.map((x) => x.externalOrder || x.number).join(', ')}</div>}
      <form className="flex flex-wrap gap-2 mb-4"><select name="ch" defaultValue={sp.ch ?? ''} className="input sm:!w-48" aria-label="Canal"><option value="">Todos los canales</option>{channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><select name="st" defaultValue={sp.st ?? ''} className="input sm:!w-44" aria-label="Estado"><option value="">Todos los estados</option>{['registrada', 'por_despachar', 'despachada', 'entregada', 'anulada'].map((x) => <option key={x} value={x}>{x.replace('_', ' ')}</option>)}</select><button className="btn-ghost">Filtrar</button></form>
      {rows.length === 0 ? <Card><Empty title="Sin ventas" hint="Registra la primera venta rápida desde el celular o el mostrador." /></Card> : (
        <Card pad={false}><Table><thead><tr><th className="th">N°</th><th className="th">Fecha</th><th className="th">Canal</th><th className="th">Cliente / orden</th><th className="th text-right">Total</th>{costs && <th className="th text-right">Comisión</th>}{costs && <th className="th text-right">Margen neto</th>}<th className="th">Estado</th><th className="th" /></tr></thead>
          <tbody>{rows.map((x) => <tr key={x.id}><td className="td font-medium">{x.number}</td><td className="td tabular">{dmy(x.date)}</td><td className="td">{channels.find((c) => c.id === x.channelId)?.name ?? '—'}</td><td className="td text-xs">{x.customerName ?? ''} {x.externalOrder && <Badge>{x.externalOrder}</Badge>}{x.tracking && <div className="muted">Seg. {x.tracking}</div>}</td><td className="td text-right tabular font-medium">{money(x.total)}</td>{costs && <td className="td text-right tabular muted">{money(x.commission)}</td>}{costs && <td className={`td text-right tabular ${x.netMargin < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{money(x.netMargin)}</td>}<td className="td"><StatusBadge status={x.status} /></td><td className="td text-right"><SaleActions id={x.id} status={x.status} canEdit={can(user, 'ventas', 'E')} /></td></tr>)}</tbody></Table></Card>
      )}
    </>
  );
}
