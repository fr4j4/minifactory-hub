import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { can, canSeeCosts } from '@/lib/perm';
import { PageHeader, Card, Stat, Meter, Badge, Empty } from '@/components/ui';
import { Icon } from '@/components/shell';
import { dashboardData } from '@/lib/stats';
import { getSettings } from '@/lib/settings';
import { quoteBoard } from '@/lib/services/quote-board';
import { SETUP_LINKS, needsSetup } from '@/lib/setup';
import { liveByMachine } from '@/lib/bambu/manager';
import { PrinterPill } from '@/components/printer-live';
import { dmy, dmyHm, dur, money, num, pct } from '@/lib/format';
import { getLocale, getT } from '@/i18n/server';
import { LOCALE_TAG } from '@/i18n/config';
import { tOr } from '@/i18n/translate';

export async function generateMetadata() { return { title: (await getT())('meta.home') }; }

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ sin_permiso?: string }> }) {
  const t = await getT(); const locale = await getLocale();
  const user = await requireUser(); const sp = await searchParams;
  // Solo Inicio redirige al asistente: las pantallas que enlaza la lista de puesta en marcha (Abrir) deben poder abrirse.
  if (user.role === 'admin' && (await needsSetup())) redirect('/bienvenida');
  const d = await dashboardData(); const costs = canSeeCosts(user); const now = Date.now();
  const setupSkipped = user.role === 'admin' ? Object.entries((await getSettings()).setup.steps).filter(([, v]) => v === 'omitido').map(([k]) => k) : [];
  const qb = can(user, 'presupuestos', 'V') ? await quoteBoard() : null;
  const alerts: Array<{ tone: 'red' | 'amber' | 'blue'; text: string; href: string }> = [
    ...(qb && qb.noReply > 0 ? [{ tone: 'blue' as const, text: t('home.quotesToFollowUp', { n: qb.noReply }), href: '/presupuestos?st=enviado' }] : []),
    ...(qb && qb.dueSoon > 0 ? [{ tone: 'amber' as const, text: t('home.quotesExpiringSoon', { n: qb.dueSoon }), href: '/presupuestos?st=enviado' }] : []),
    ...setupSkipped.map((k) => ({ tone: 'blue' as const, text: `${t('setup.checklistTitle')}: ${t(`setup.${k}` as 'setup.fiscal')}`, href: (SETUP_LINKS as Record<string, string>)[k] ?? '/configuracion' })),
    ...d.lowMaterials.map((x) => ({ tone: 'amber' as const, text: t('home.lowStockGAvailableMinimum', { type: x.m.type, color: x.m.colorName, grams: Math.round(x.availableG), min: x.minG }), href: '/inventario' })),
    ...d.lowItems.map((x) => ({ tone: 'amber' as const, text: t('home.lowStock', { name: x.name, stock: x.stock, unit: x.unit }), href: '/inventario?tab=otros' })),
    ...d.lowProducts.map((x) => ({ tone: 'amber' as const, text: t('home.productToRestockUnits', { name: x.p, variant: Object.values(x.v.attrs ?? {}).join(' '), units: x.v.stock }), href: '/catalogo' })),
    ...d.maint.map((x) => ({ tone: 'red' as const, text: t('home.maintenanceOverdue', { task: x.task, machine: d.machines.find((m) => m.id === x.machineId)?.name }), href: `/maquinas/${x.machineId}` })),
    ...d.stopped.map((m) => ({ tone: 'red' as const, text: t('home.machine', { status: tOr(t, `status.${m.status}`, m.status.replace(/_/g, ' ')).toLowerCase(), name: m.name }), href: `/maquinas/${m.id}` })),
    ...d.unpaid.slice(0, 5).map((o) => ({ tone: 'amber' as const, text: t('home.pendingPaymentBalance', { number: o.number, balance: money(o.total - o.paid) }), href: `/pedidos/${o.id}` })),
    ...d.toShip.map((x) => ({ tone: 'blue' as const, text: `${t('home.saleToShip', { number: x.number })}${x.externalOrder ? ' · ' + x.externalOrder : ''}`, href: '/ventas' })),
    ...d.oldJobs.map((x) => ({ tone: 'amber' as const, text: t('home.reservationAboutToExpireHas', { job: x.j.number, days: 15 }), href: '/cola' })),
  ];
  const hour = Number(dmyHm(new Date()).slice(11, 13)); const hello = hour < 12 ? t('home.goodMorning') : hour < 20 ? t('home.goodAfternoon') : t('home.goodEvening');
  const conn = liveByMachine();
  // si la máquina está conectada, el avance es el real que informa la impresora; si no, se estima con el tiempo transcurrido
  const live = d.machines.map((m) => { const pj = d.printing.find((x) => x.j.machineId === m.id); const c = conn[m.id]; const cs = c?.online ? c.status : null; const cBusy = !!cs && ['RUNNING', 'PAUSE', 'PREPARE'].includes(cs.state);
    const el = pj?.j.realStart ? (now - pj.j.realStart.getTime()) / 3600_000 : 0; const p = cBusy ? cs!.progress ?? 0 : pj && pj.j.estH > 0 ? Math.min(99, (el / pj.j.estH) * 100) : 0;
    return { m, pj: pj ?? (cBusy ? { j: { id: c!.id, title: cs!.task ?? cs!.file ?? t('home.printing'), plannedEnd: cs!.remainingMin != null ? new Date(now + cs!.remainingMin * 60_000) : null, machineId: m.id } as any, m: m.name } : undefined), p, c }; });
  const busy = live.filter((x) => x.pj).length;
  const actions = ([{ h: '/pedidos/nuevo', l: t('home.newOrder'), i: 'orders', m: 'pedidos', k: 'P' }, { h: '/presupuestos/nuevo', l: t('common.quote'), i: 'quote', m: 'presupuestos', k: 'Q' }, { h: '/ventas/nueva', l: t('common.quickSale'), i: 'cart', m: 'ventas', k: 'V' }, { h: '/calculadora', l: t('home.calculator'), i: 'calc', m: 'presupuestos', k: 'C' }, { h: '/galeria?subir=1', l: t('home.uploadPhoto'), i: 'camera', m: 'galeria', k: 'F' }, { h: '/inventario/escanear', l: t('home.scanQr'), i: 'qr', m: 'inventario', k: 'E' }] as const).filter((a) => can(user, a.m as any, 'V'));
  return (
    <>
      <PageHeader eyebrow={new Intl.DateTimeFormat(LOCALE_TAG[locale], { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()).replace(/^./, (c) => c.toUpperCase())} title={<>{hello}, <span className="text-[var(--accent-ink)]">{user.name.split(' ')[0]}</span></>} subtitle={t('home.ofMachinesPrintingOrdersDue', { busy, machines: d.machines.length, due: d.due.length, alerts: alerts.length })} />
      {sp.sin_permiso && <div role="alert" className="rounded-xl box-warn p-3 text-sm mb-4">{t('home.noAccess', { module: sp.sin_permiso })}</div>}

      {/* taller en vivo: cada máquina como una placa con su pieza creciendo capa a capa */}
      <section aria-label={t('home.liveWorkshop')} className="relative overflow-hidden rounded-3xl bg-[var(--panel)] text-[var(--panel-ink)] p-4 md:p-5 mb-5 ring-1 ring-black/5 dark:ring-white/[.07]">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[.5]" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.07) 1px, transparent 1.2px)', backgroundSize: '18px 18px' }} />
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-[var(--accent)] opacity-20 blur-3xl" />
        <div className="relative flex items-center justify-between mb-4"><h2 className="font-mono text-[11px] uppercase tracking-[.16em] text-white/70 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--accent)] animate-pulseDot" aria-hidden />{t('home.liveWorkshop')}</h2><Link href="/cola" className="text-xs text-white/75 hover:text-white underline-offset-4 hover:underline">{t('home.viewTheQueue')}</Link></div>
        {live.length === 0 ? <p className="relative text-sm text-white/70">{t('home.noMachines')} <Link href="/maquinas/nueva" className="underline">{t('home.addTheFirstOne')}</Link>.</p> : (
          <ul className="relative flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-1 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-2 xl:grid-cols-4 [scrollbar-width:none]">{live.map(({ m, pj, p, c }) => (
            <li key={m.id} className="snap-start shrink-0 w-[78%] sm:w-auto"><Link href={pj ? '/cola' : `/maquinas/${m.id}`} className="group flex gap-4 rounded-2xl bg-white/[.04] hover:bg-white/[.07] border border-white/10 p-3.5 transition-colors h-full">
              <div className="relative h-[68px] w-[52px] shrink-0 rounded-lg bg-black/30 border border-white/10 flex flex-col-reverse items-center gap-[2px] p-1.5 overflow-hidden" aria-hidden>
                {Array.from({ length: 10 }, (_, i) => <span key={i} className={i < Math.round(p / 10) ? 'bg-[var(--accent)]' : 'bg-white/10'} style={{ height: 3, width: `${92 - Math.abs(4.5 - i) * 7}%`, borderRadius: 2, opacity: i < Math.round(p / 10) ? 0.55 + i * 0.045 : 1 }} />)}
                {pj && <span className="absolute left-1/2 -translate-x-1/2 h-1.5 w-3 rounded-sm bg-white/80" style={{ bottom: `${8 + Math.round(p / 10) * 5}px` }} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium truncate">{m.name}</span><span className={`font-mono text-[10px] uppercase tracking-[.1em] ${pj ? 'text-[var(--accent)]' : m.status === 'disponible' ? 'text-emerald-400' : 'text-amber-300'}`}>{pj ? t('home.printsNow') : m.status === 'disponible' ? t('home.free') : tOr(t, `status.${m.status}`, m.status).toLowerCase()}</span></div>
                {pj ? <><div className="text-xs text-white/70 truncate mt-0.5">{pj.j.title}</div><div className="flex items-baseline justify-between mt-1.5"><span className="num text-2xl font-medium">{num(p, 0)}<span className="text-sm text-white/60">%</span></span><span className="font-mono text-[10px] text-white/60">{t('home.ends')} {dmyHm(pj.j.plannedEnd)}</span></div>{c && <div className="mt-1"><PrinterPill machineId={m.id} initial={c} dark /></div>}</>
                  : <div className="text-xs text-white/60 mt-1.5">{c ? <PrinterPill machineId={m.id} initial={c} dark /> : m.status === 'disponible' ? t('home.readyForTheNextJob') : t('home.checkTheMachine')}</div>}
              </div>
            </Link></li>))}</ul>)}
      </section>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-2.5 mb-6" aria-label={t('home.quickActions')}>
        {actions.map((a) => (
          <Link key={a.h} href={a.h} className="group card !rounded-2xl p-3 md:p-3.5 flex flex-col gap-3 min-h-[92px] justify-between hover:-translate-y-0.5 hover:border-[var(--accent)] transition-all">
            <span className="flex items-center justify-between"><span className="h-9 w-9 rounded-xl bg-slate-100 dark:bg-slate-800 grid place-items-center group-hover:bg-[var(--accent)] group-hover:text-[#17161a] transition-colors"><Icon name={a.i} className="h-[18px] w-[18px]" /></span><span className="hidden md:inline font-mono text-[10px] text-slate-500 dark:text-slate-500 group-hover:text-[var(--accent-ink)]"><Icon name="arrow-up-right" className="h-3.5 w-3.5" /></span></span>
            <span className="text-[13px] font-medium leading-tight">{a.l}</span>
          </Link>))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-4 min-w-0">
          <div className="grid md:grid-cols-2 gap-4">
            <Card title={t('home.dueTodayOrTomorrow')}>{d.due.length === 0 ? <p className="text-sm muted">{t('home.nothingUrgentAGoodTime')}</p> : <ul className="divide-y divide-slate-100 dark:divide-slate-800 -my-1">{d.due.map((o) => <li key={o.id}><Link className="flex items-center justify-between gap-2 py-2 text-sm group" href={`/pedidos/${o.id}`}><span className="truncate min-w-0"><span className="num text-xs muted mr-2">{o.number}</span><span className="group-hover:text-[var(--accent-ink)]">{o.customerName}</span></span><Badge className="badge-led" tone={o.dueDate! < d.today ? 'red' : 'amber'}>{dmy(o.dueDate)}</Badge></Link></li>)}</ul>}</Card>
            <Card title={t('home.quotesWithoutAReply3')}>{d.waiting.length === 0 ? <p className="text-sm muted">{t('home.allCaughtUp')}</p> : <ul className="divide-y divide-slate-100 dark:divide-slate-800 -my-1">{d.waiting.map((q) => <li key={q.id}><Link className="flex items-center justify-between gap-2 py-2 text-sm group" href={`/presupuestos/${q.id}`}><span className="truncate min-w-0"><span className="num text-xs muted mr-2">{q.number}</span><span className="group-hover:text-[var(--accent-ink)]">{q.customerName}</span></span><span className="num">{money(q.total)}</span></Link></li>)}</ul>}</Card>
          </div>
          <Card title={t('home.thisMonthSFigures')}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              <Stat label={t('common.sales')} value={money(d.ind.revenue)} sub={t('home.ordersQuickSales', { orders: d.ind.ordersCount, sales: d.ind.salesCount })} />
              {costs && <Stat label={t('home.grossMargin')} value={money(d.ind.grossMargin)} sub={pct(d.ind.marginPct, 0)} tone={d.ind.marginPct != null && d.ind.marginPct < 25 ? 'warn' : 'good'} />}
              <Stat label={t('home.delivered')} value={d.ind.delivered} />
              <Stat label={t('home.approvalRate')} value={d.ind.approvalRate != null ? pct(d.ind.approvalRate, 0) : '—'} sub={t('home.quotesSent', { count: d.ind.quotesCount })} />
              <Stat label={t('home.machineHours')} value={<>{num(d.ind.machineHours, 0)}<span className="text-sm muted ml-1">{t('common.h')}</span></>} />
              <Stat label={t('home.materialUsed')} value={<>{num(d.ind.kgUsed, 1)}<span className="text-sm muted ml-1">kg</span></>} />
              <Stat label={t('common.stockValue')} value={money(d.val.total)} sub={t('home.materialProducts', { materials: money(d.val.materials), products: money(d.val.products) })} />
            </div>
          </Card>
        </div>
        <Card title={<>{t('home.alerts')} <span className="num text-xs muted ml-1">{String(alerts.length).padStart(2, '0')}</span></>}>
          {alerts.length === 0 ? <Empty title={t('home.noAlerts')} hint={t('home.stockMaintenanceAndPaymentsAre')} /> : <div className="space-y-3" data-testid="alerts">{(['red', 'amber', 'blue'] as const).map((tone) => { const list = alerts.filter((a) => a.tone === tone); if (!list.length) return null; return (
            <section key={tone} aria-label={t(`home.alertGroup_${tone}` as 'home.alertGroup_red')}>
              <h3 className="eyebrow mb-1">{t(`home.alertGroup_${tone}` as 'home.alertGroup_red')} · {list.length}</h3>
              <ul className="space-y-1.5 -mx-1">{list.slice(0, 5).map((a, i) => <li key={i}><Link href={a.href} className={`flex items-start gap-2.5 text-sm rounded-xl px-2.5 py-2 border-l-[3px] hover:bg-slate-50 dark:hover:bg-slate-800/50 ${tone === 'red' ? 'border-red-500' : tone === 'amber' ? 'border-amber-500' : 'border-sky-500'}`}>{a.text}</Link></li>)}</ul>
              {list.length > 5 && <p className="text-xs muted mt-1 px-1">{t('home.alertMore', { n: list.length - 5 })}</p>}
            </section>); })}</div>}
        </Card>
      </div>
    </>
  );
}
