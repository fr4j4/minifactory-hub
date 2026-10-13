import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { can, canSeeCosts } from '@/lib/perm';
import { PageHeader, Card, Stat, Meter, Badge, Empty } from '@/components/ui';
import { Icon } from '@/components/shell';
import { dashboardData } from '@/lib/stats';
import { dmy, dmyHm, dur, money, num, pct } from '@/lib/format';

export const metadata = { title: 'Inicio' };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ sin_permiso?: string }> }) {
  const user = await requireUser(); const sp = await searchParams;
  const d = await dashboardData(); const costs = canSeeCosts(user); const now = Date.now();
  const alerts: Array<{ tone: 'red' | 'amber' | 'blue'; text: string; href: string }> = [
    ...d.lowMaterials.map((x) => ({ tone: 'amber' as const, text: `Stock bajo: ${x.m.type} ${x.m.colorName} (${Math.round(x.availableG)} g disponibles, mínimo ${x.minG} g)`, href: '/inventario' })),
    ...d.lowItems.map((x) => ({ tone: 'amber' as const, text: `Stock bajo: ${x.name} (${x.stock} ${x.unit})`, href: '/inventario?tab=otros' })),
    ...d.lowProducts.map((x) => ({ tone: 'amber' as const, text: `Producto por reponer: ${x.p} ${Object.values(x.v.attrs ?? {}).join(' ')} (${x.v.stock} u.)`, href: '/catalogo' })),
    ...d.maint.map((x) => ({ tone: 'red' as const, text: `Mantenimiento vencido: ${x.task} (${d.machines.find((m) => m.id === x.machineId)?.name})`, href: `/maquinas/${x.machineId}` })),
    ...d.stopped.map((m) => ({ tone: 'red' as const, text: `Máquina ${m.status.replace(/_/g, ' ')}: ${m.name}`, href: `/maquinas/${m.id}` })),
    ...d.unpaid.slice(0, 5).map((o) => ({ tone: 'amber' as const, text: `Pago pendiente ${o.number}: saldo ${money(o.total - o.paid)}`, href: `/pedidos/${o.id}` })),
    ...d.toShip.map((x) => ({ tone: 'blue' as const, text: `Venta por despachar ${x.number}${x.externalOrder ? ' · ' + x.externalOrder : ''}`, href: '/ventas' })),
    ...d.oldJobs.map((x) => ({ tone: 'amber' as const, text: `Reserva por caducar: ${x.j.number} lleva más de ${15} días en cola`, href: '/cola' })),
  ];
  return (
    <>
      <PageHeader title={`Hola, ${user.name.split(' ')[0]}`} subtitle={`Hoy ${dmy(new Date())}`} />
      {sp.sin_permiso && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm mb-4">Tu rol no tiene acceso a “{sp.sin_permiso}”. Pide al administrador que ajuste tus permisos.</div>}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5" aria-label="Acciones rápidas">
        {[{ h: '/pedidos/nuevo', l: 'Nuevo pedido', i: 'orders', m: 'pedidos' }, { h: '/presupuestos/nuevo', l: 'Nuevo presupuesto', i: 'quote', m: 'presupuestos' }, { h: '/ventas/nueva', l: 'Venta rápida', i: 'cart', m: 'ventas' }, { h: '/calculadora', l: 'Calculadora rápida', i: 'calc', m: 'presupuestos' }, { h: '/galeria?subir=1', l: 'Subir foto', i: 'camera', m: 'galeria' }, { h: '/inventario/escanear', l: 'Escanear QR', i: 'qr', m: 'inventario' }].filter((a) => can(user, a.m as any, 'V')).map((a) => (
          <Link key={a.h} href={a.h} className="card p-3.5 flex items-center gap-3 hover:border-brand-500 min-h-[64px]"><span className="h-9 w-9 rounded-lg bg-brand-50 dark:bg-brand-900/40 grid place-items-center text-brand-700 dark:text-brand-200"><Icon name={a.i} /></span><span className="text-sm font-medium">{a.l}</span></Link>))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-4">
          <Card title="Imprimiendo ahora">
            {d.printing.length === 0 ? <p className="text-sm muted">Ninguna máquina está imprimiendo. <Link href="/cola" className="underline">Ir a la cola</Link></p> : (
              <ul className="space-y-3">{d.printing.map(({ j, m }) => { const el = j.realStart ? (now - j.realStart.getTime()) / 3600_000 : 0; const p = j.estH > 0 ? Math.min(99, (el / j.estH) * 100) : 0; return (
                <li key={j.id}><div className="flex justify-between text-sm gap-2"><span className="font-medium truncate">{m} · {j.title}</span><span className="tabular muted shrink-0">{num(p, 0)}% · termina {dmyHm(j.plannedEnd)}</span></div><Meter value={p} max={100} /></li>); })}</ul>)}
          </Card>
          <div className="grid md:grid-cols-2 gap-4">
            <Card title="Pedidos que vencen hoy o mañana">{d.due.length === 0 ? <p className="text-sm muted">Nada urgente.</p> : <ul className="space-y-2 text-sm">{d.due.map((o) => <li key={o.id} className="flex justify-between gap-2"><Link className="underline truncate" href={`/pedidos/${o.id}`}>{o.number} · {o.customerName}</Link><Badge tone={o.dueDate! < d.today ? 'red' : 'amber'}>{dmy(o.dueDate)}</Badge></li>)}</ul>}</Card>
            <Card title="Presupuestos esperando respuesta > 3 días">{d.waiting.length === 0 ? <p className="text-sm muted">Todos al día.</p> : <ul className="space-y-2 text-sm">{d.waiting.map((q) => <li key={q.id} className="flex justify-between gap-2"><Link className="underline truncate" href={`/presupuestos/${q.id}`}>{q.number} · {q.customerName}</Link><span className="tabular muted">{money(q.total)}</span></li>)}</ul>}</Card>
          </div>
          <Card title="Indicadores del mes">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Ventas" value={money(d.ind.revenue)} sub={`${d.ind.ordersCount} pedidos · ${d.ind.salesCount} ventas rápidas`} />
              {costs && <Stat label="Margen bruto" value={money(d.ind.grossMargin)} sub={pct(d.ind.marginPct, 0)} tone={d.ind.marginPct != null && d.ind.marginPct < 25 ? 'warn' : 'good'} />}
              <Stat label="Pedidos entregados" value={d.ind.delivered} />
              <Stat label="Aprobación de presupuestos" value={d.ind.approvalRate != null ? pct(d.ind.approvalRate, 0) : '—'} sub={`${d.ind.quotesCount} enviados`} />
              <Stat label="Horas-máquina" value={`${num(d.ind.machineHours, 0)} h`} />
              <Stat label="Material consumido" value={`${num(d.ind.kgUsed, 1)} kg`} />
              <Stat label="Stock valorizado" value={money(d.val.total)} sub={`Material ${money(d.val.materials)} · Productos ${money(d.val.products)}`} />
            </div>
          </Card>
        </div>
        <Card title={`Alertas (${alerts.length})`}>
          {alerts.length === 0 ? <Empty title="Sin alertas" hint="Stock, mantenimiento y pagos están al día." /> : <ul className="space-y-2" data-testid="alerts">{alerts.map((a, i) => <li key={i}><Link href={a.href} className="flex items-start gap-2 text-sm hover:underline"><span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${a.tone === 'red' ? 'bg-red-500' : a.tone === 'amber' ? 'bg-amber-500' : 'bg-blue-500'}`} aria-hidden />{a.text}</Link></li>)}</ul>}
        </Card>
      </div>
    </>
  );
}
