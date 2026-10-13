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
  const hour = new Date().getHours(); const hello = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
  const live = d.machines.map((m) => { const pj = d.printing.find((x) => x.j.machineId === m.id); const el = pj?.j.realStart ? (now - pj.j.realStart.getTime()) / 3600_000 : 0; const p = pj && pj.j.estH > 0 ? Math.min(99, (el / pj.j.estH) * 100) : 0; return { m, pj, p }; });
  const busy = live.filter((x) => x.pj).length;
  const actions = [{ h: '/pedidos/nuevo', l: 'Nuevo pedido', i: 'orders', m: 'pedidos', k: 'P' }, { h: '/presupuestos/nuevo', l: 'Presupuesto', i: 'quote', m: 'presupuestos', k: 'Q' }, { h: '/ventas/nueva', l: 'Venta rápida', i: 'cart', m: 'ventas', k: 'V' }, { h: '/calculadora', l: 'Calculadora', i: 'calc', m: 'presupuestos', k: 'C' }, { h: '/galeria?subir=1', l: 'Subir foto', i: 'camera', m: 'galeria', k: 'F' }, { h: '/inventario/escanear', l: 'Escanear QR', i: 'qr', m: 'inventario', k: 'E' }].filter((a) => can(user, a.m as any, 'V'));
  return (
    <>
      <PageHeader eyebrow={new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()).replace(/^./, (c) => c.toUpperCase())} title={<>{hello}, <span className="text-[var(--accent-ink)]">{user.name.split(' ')[0]}</span></>} subtitle={`${busy} de ${d.machines.length} máquinas imprimiendo · ${d.due.length} pedidos vencen hoy o mañana · ${alerts.length} alertas`} />
      {sp.sin_permiso && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm mb-4">Tu rol no tiene acceso a “{sp.sin_permiso}”. Pide al administrador que ajuste tus permisos.</div>}

      {/* taller en vivo: cada máquina como una placa con su pieza creciendo capa a capa */}
      <section aria-label="Taller en vivo" className="relative overflow-hidden rounded-3xl bg-[var(--panel)] text-[var(--panel-ink)] p-4 md:p-5 mb-5 ring-1 ring-black/5 dark:ring-white/[.07]">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[.5]" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.07) 1px, transparent 1.2px)', backgroundSize: '18px 18px' }} />
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-[var(--accent)] opacity-20 blur-3xl" />
        <div className="relative flex items-center justify-between mb-4"><h2 className="font-mono text-[11px] uppercase tracking-[.16em] text-white/70 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--accent)] animate-pulseDot" aria-hidden />Taller en vivo</h2><Link href="/cola" className="text-xs text-white/75 hover:text-white underline-offset-4 hover:underline">Ver la cola →</Link></div>
        {live.length === 0 ? <p className="relative text-sm text-white/70">Aún no hay máquinas. <Link href="/maquinas/nueva" className="underline">Agrega la primera</Link>.</p> : (
          <ul className="relative flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-1 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-2 xl:grid-cols-4 [scrollbar-width:none]">{live.map(({ m, pj, p }) => (
            <li key={m.id} className="snap-start shrink-0 w-[78%] sm:w-auto"><Link href={pj ? '/cola' : `/maquinas/${m.id}`} className="group flex gap-4 rounded-2xl bg-white/[.04] hover:bg-white/[.07] border border-white/10 p-3.5 transition-colors h-full">
              <div className="relative h-[68px] w-[52px] shrink-0 rounded-lg bg-black/30 border border-white/10 flex flex-col-reverse items-center gap-[2px] p-1.5 overflow-hidden" aria-hidden>
                {Array.from({ length: 10 }, (_, i) => <span key={i} className={i < Math.round(p / 10) ? 'bg-[var(--accent)]' : 'bg-white/10'} style={{ height: 3, width: `${92 - Math.abs(4.5 - i) * 7}%`, borderRadius: 2, opacity: i < Math.round(p / 10) ? 0.55 + i * 0.045 : 1 }} />)}
                {pj && <span className="absolute left-1/2 -translate-x-1/2 h-1.5 w-3 rounded-sm bg-white/80" style={{ bottom: `${8 + Math.round(p / 10) * 5}px` }} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium truncate">{m.name}</span><span className={`font-mono text-[10px] uppercase tracking-[.1em] ${pj ? 'text-[var(--accent)]' : m.status === 'disponible' ? 'text-emerald-400' : 'text-amber-300'}`}>{pj ? 'imprime' : m.status === 'disponible' ? 'libre' : m.status.replace(/_/g, ' ')}</span></div>
                {pj ? <><div className="text-xs text-white/70 truncate mt-0.5">{pj.j.title}</div><div className="flex items-baseline justify-between mt-1.5"><span className="num text-2xl font-medium">{num(p, 0)}<span className="text-sm text-white/60">%</span></span><span className="font-mono text-[10px] text-white/60">fin {dmyHm(pj.j.plannedEnd)}</span></div></>
                  : <div className="text-xs text-white/60 mt-1.5">{m.status === 'disponible' ? 'Lista para el próximo trabajo' : 'Revisa la máquina'}</div>}
              </div>
            </Link></li>))}</ul>)}
      </section>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-2.5 mb-6" aria-label="Acciones rápidas">
        {actions.map((a) => (
          <Link key={a.h} href={a.h} className="group card !rounded-2xl p-3 md:p-3.5 flex flex-col gap-3 min-h-[92px] justify-between hover:-translate-y-0.5 hover:border-[var(--accent)] transition-all">
            <span className="flex items-center justify-between"><span className="h-9 w-9 rounded-xl bg-slate-100 dark:bg-slate-800 grid place-items-center group-hover:bg-[var(--accent)] group-hover:text-[#17161a] transition-colors"><Icon name={a.i} className="h-[18px] w-[18px]" /></span><span className="hidden md:inline font-mono text-[10px] text-slate-500 dark:text-slate-500 group-hover:text-[var(--accent-ink)]" aria-hidden>↗</span></span>
            <span className="text-[13px] font-medium leading-tight">{a.l}</span>
          </Link>))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-4 min-w-0">
          <div className="grid md:grid-cols-2 gap-4">
            <Card title="Vencen hoy o mañana">{d.due.length === 0 ? <p className="text-sm muted">Nada urgente. Buen momento para producir stock.</p> : <ul className="divide-y divide-slate-100 dark:divide-slate-800 -my-1">{d.due.map((o) => <li key={o.id}><Link className="flex items-center justify-between gap-2 py-2 text-sm group" href={`/pedidos/${o.id}`}><span className="truncate min-w-0"><span className="num text-xs muted mr-2">{o.number}</span><span className="group-hover:text-[var(--accent-ink)]">{o.customerName}</span></span><Badge className="badge-led" tone={o.dueDate! < d.today ? 'red' : 'amber'}>{dmy(o.dueDate)}</Badge></Link></li>)}</ul>}</Card>
            <Card title="Presupuestos sin respuesta (> 3 días)">{d.waiting.length === 0 ? <p className="text-sm muted">Todos al día.</p> : <ul className="divide-y divide-slate-100 dark:divide-slate-800 -my-1">{d.waiting.map((q) => <li key={q.id}><Link className="flex items-center justify-between gap-2 py-2 text-sm group" href={`/presupuestos/${q.id}`}><span className="truncate min-w-0"><span className="num text-xs muted mr-2">{q.number}</span><span className="group-hover:text-[var(--accent-ink)]">{q.customerName}</span></span><span className="num">{money(q.total)}</span></Link></li>)}</ul>}</Card>
          </div>
          <Card title="Indicadores del mes">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              <Stat label="Ventas" value={money(d.ind.revenue)} sub={`${d.ind.ordersCount} pedidos · ${d.ind.salesCount} ventas rápidas`} />
              {costs && <Stat label="Margen bruto" value={money(d.ind.grossMargin)} sub={pct(d.ind.marginPct, 0)} tone={d.ind.marginPct != null && d.ind.marginPct < 25 ? 'warn' : 'good'} />}
              <Stat label="Entregados" value={d.ind.delivered} />
              <Stat label="Aprobación" value={d.ind.approvalRate != null ? pct(d.ind.approvalRate, 0) : '—'} sub={`${d.ind.quotesCount} presupuestos enviados`} />
              <Stat label="Horas-máquina" value={<>{num(d.ind.machineHours, 0)}<span className="text-sm muted ml-1">h</span></>} />
              <Stat label="Material usado" value={<>{num(d.ind.kgUsed, 1)}<span className="text-sm muted ml-1">kg</span></>} />
              <Stat label="Stock valorizado" value={money(d.val.total)} sub={`Material ${money(d.val.materials)} · Productos ${money(d.val.products)}`} />
            </div>
          </Card>
        </div>
        <Card title={<>Alertas <span className="num text-xs muted ml-1">{String(alerts.length).padStart(2, '0')}</span></>}>
          {alerts.length === 0 ? <Empty title="Sin alertas" hint="Stock, mantenimiento y pagos están al día." /> : <ul className="space-y-1.5 -mx-1" data-testid="alerts">{alerts.map((a, i) => <li key={i}><Link href={a.href} className={`flex items-start gap-2.5 text-sm rounded-xl px-2.5 py-2 border-l-[3px] hover:bg-slate-50 dark:hover:bg-slate-800/50 ${a.tone === 'red' ? 'border-red-500' : a.tone === 'amber' ? 'border-amber-500' : 'border-sky-500'}`}>{a.text}</Link></li>)}</ul>}
        </Card>
      </div>
    </>
  );
}
