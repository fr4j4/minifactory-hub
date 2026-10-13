import Link from 'next/link';
import { and, asc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can } from '@/lib/perm';
import { PageHeader, Card, Table, Badge, Empty } from '@/components/ui';
import { ImportCustomers } from '@/components/customer-form';
import { dmy, money } from '@/lib/format';

export const metadata = { title: 'Clientes' };
const CONSENT: Record<string, [string, 'green' | 'amber' | 'red' | 'gray']> = { yes: ['Fotos: sí', 'green'], no_brand: ['Fotos: sin marca', 'amber'], no: ['Fotos: no', 'red'], unknown: ['Fotos: sin definir', 'gray'] };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string }> }) {
  const user = await pagePerm('clientes', 'V'); const sp = await searchParams; const db = await getDb();
  const conds = [isNull(s.customers.deletedAt)];
  if (sp.q) conds.push(or(ilike(s.customers.name, `%${sp.q}%`), ilike(s.customers.phone, `%${sp.q}%`), ilike(s.customers.email, `%${sp.q}%`), ilike(s.customers.taxId, `%${sp.q}%`))!);
  if (sp.tag) conds.push(sql`${s.customers.tags}::text ilike ${'%"' + sp.tag + '"%'}`);
  const rows = await db.select().from(s.customers).where(and(...conds)).orderBy(asc(s.customers.name)).limit(300);
  const stats = await db.select({ id: s.orders.customerId, n: sql<number>`count(*)::int`, t: sql<number>`coalesce(sum(${s.orders.total}),0)::int`, last: sql<Date>`max(${s.orders.createdAt})` }).from(s.orders).where(and(isNull(s.orders.deletedAt), sql`${s.orders.status} <> 'cancelado'`)).groupBy(s.orders.customerId);
  const st = new Map(stats.map((x) => [x.id, x]));
  return (
    <>
      <PageHeader title="Clientes" subtitle="Agenda interna: contacto, historial y consentimiento de fotos. El cliente no accede al sistema." actions={<>{can(user, 'clientes', 'C') && <ImportCustomers />}<a className="btn-ghost" href="/api/export/clientes?fmt=csv">Exportar CSV</a>{can(user, 'clientes', 'C') && <Link className="btn-primary" href="/clientes/nuevo" data-testid="new-customer">+ Nuevo cliente</Link>}</>} />
      <form className="flex gap-2 mb-4" role="search"><input name="q" defaultValue={sp.q} className="input sm:max-w-sm" placeholder="Buscar por nombre, teléfono, email o RUT" aria-label="Buscar clientes" /><button className="btn-ghost">Buscar</button></form>
      {rows.length === 0 ? <Card><Empty title="Sin clientes" hint="Crea la ficha de tus clientes recurrentes para cotizarles en segundos. Los clientes ocasionales no necesitan ficha." /></Card> : (
        <Card pad={false}><Table><thead><tr><th className="th">Nombre</th><th className="th">Contacto</th><th className="th">Tipo</th><th className="th text-right">Pedidos</th><th className="th text-right">Total</th><th className="th">Último pedido</th><th className="th">Fotos</th></tr></thead>
          <tbody>{rows.map((c) => { const x = st.get(c.id); const [cl, tone] = CONSENT[c.photoConsent] ?? CONSENT.unknown; return (
            <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40"><td className="td font-medium"><Link className="hover:underline" href={`/clientes/${c.id}`}>{c.name}</Link> {c.isOccasional && <Badge>Ocasional</Badge>}<div className="flex gap-1 mt-0.5">{(c.tags ?? []).map((t) => <Badge key={t}>{t}</Badge>)}</div></td><td className="td text-xs">{c.phone}<br />{c.email}</td><td className="td capitalize">{c.type}</td><td className="td text-right tabular">{x?.n ?? 0}</td><td className="td text-right tabular">{money(x?.t ?? 0)}</td><td className="td tabular">{x?.last ? dmy(x.last) : '—'}</td><td className="td"><Badge tone={tone}>{cl}</Badge></td></tr>); })}</tbody></Table></Card>
      )}
    </>
  );
}
