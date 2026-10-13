import Link from 'next/link';
import { and, desc, eq, ilike, isNull, or, inArray } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can, canSeeCosts } from '@/lib/perm';
import { PageHeader, Card, Table, StatusBadge, Empty, Badge } from '@/components/ui';
import { dmy, money, num } from '@/lib/format';

export const metadata = { title: 'Presupuestos' };

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ q?: string; st?: string }> }) {
  const user = await pagePerm('presupuestos', 'V'); const sp = await searchParams; const db = await getDb();
  const conds = [isNull(s.quotes.deletedAt)];
  if (sp.q) conds.push(or(ilike(s.quotes.number, `%${sp.q}%`), ilike(s.quotes.customerName, `%${sp.q}%`), ilike(s.quotes.title, `%${sp.q}%`))!);
  if (sp.st) conds.push(eq(s.quotes.status, sp.st)); else conds.push(inArray(s.quotes.status, ['borrador', 'enviado', 'aprobado', 'rechazado', 'vencido']));
  const rows = await db.select().from(s.quotes).where(and(...conds)).orderBy(desc(s.quotes.createdAt)).limit(150);
  const costs = canSeeCosts(user);
  return (
    <>
      <PageHeader title="Presupuestos" subtitle="Cotiza con varios modelos por presupuesto; el precio sugerido es una guía y el precio final lo decides tú." actions={can(user, 'presupuestos', 'C') && <><Link href="/calculadora" className="btn-ghost">Calculadora rápida</Link><Link href="/presupuestos/nuevo" className="btn-primary" data-testid="new-quote">+ Nuevo presupuesto</Link></>} />
      <form className="flex flex-wrap gap-2 mb-4" role="search"><input name="q" defaultValue={sp.q} className="input sm:max-w-xs" placeholder="Buscar por número, cliente o título" aria-label="Buscar presupuestos" />
        <select name="st" defaultValue={sp.st ?? ''} className="input sm:!w-44" aria-label="Estado"><option value="">Vigentes</option>{['borrador', 'enviado', 'aprobado', 'rechazado', 'vencido', 'reemplazado'].map((x) => <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>)}</select><button className="btn-ghost">Filtrar</button></form>
      {rows.length === 0 ? <Card><Empty title="No hay presupuestos" hint="Crea el primero: sube un modelo y obtén el precio en menos de 2 minutos." action={<Link className="btn-primary" href="/presupuestos/nuevo">Nuevo presupuesto</Link>} /></Card> : (
        <>
          <Card pad={false} className="hidden md:block"><Table><thead><tr><th className="th">N°</th><th className="th">Cliente</th><th className="th">Título</th><th className="th text-right">Sugerido</th><th className="th text-right">Total</th>{costs && <th className="th text-right">Margen</th>}<th className="th">Vigencia</th><th className="th">Estado</th></tr></thead>
            <tbody>{rows.map((q) => { const m = (q.calc as any)?.totals?.marginPct; const diff = q.suggestedTotal ? ((q.total - q.suggestedTotal) / q.suggestedTotal) * 100 : 0; return (
              <tr key={q.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40"><td className="td font-medium"><Link className="hover:underline" href={`/presupuestos/${q.id}`}>{q.number}{q.version > 1 && <span className="muted"> v{q.version}</span>}</Link></td><td className="td">{q.customerName ?? '—'}</td><td className="td">{q.title ?? '—'}</td><td className="td text-right tabular muted">{money(q.suggestedTotal)}</td><td className="td text-right tabular font-medium">{money(q.total)} {Math.abs(diff) >= 1 && <span className={`text-xs ${diff < 0 ? 'text-amber-600' : 'text-blue-600'}`}>{diff > 0 ? '+' : ''}{num(diff, 0)}%</span>}</td>{costs && <td className="td text-right tabular">{m != null ? `${num(m, 0)}%` : '—'}</td>}<td className="td tabular">{dmy(q.validUntil)}</td><td className="td"><StatusBadge status={q.status} /></td></tr>); })}</tbody></Table></Card>
          <ul className="md:hidden space-y-2">{rows.map((q) => <li key={q.id}><Link href={`/presupuestos/${q.id}`} className="card p-3 flex items-center justify-between gap-3 min-h-[64px]"><div className="min-w-0"><div className="font-medium">{q.number}{q.version > 1 && ` v${q.version}`} <span className="muted font-normal">· {q.customerName ?? 'Sin cliente'}</span></div><div className="text-xs muted truncate">{q.title}</div></div><div className="text-right shrink-0"><div className="tabular font-semibold">{money(q.total)}</div><StatusBadge status={q.status} /></div></Link></li>)}</ul>
        </>
      )}
    </>
  );
}
