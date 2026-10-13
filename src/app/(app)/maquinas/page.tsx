import Link from 'next/link';
import { asc, eq, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can } from '@/lib/perm';
import { PageHeader, Card, StatusBadge, Badge, Empty } from '@/components/ui';
import { maintenanceDue } from '@/lib/services/production';
import { num } from '@/lib/format';
import { PrinterPill } from '@/components/printer-live';
import { liveByMachine } from '@/lib/bambu/manager';
import { getT } from '@/i18n/server';
import { DeleteMachineButton } from '@/components/machine-bits';

export async function generateMetadata() { return { title: (await getT())('meta.machines') }; }
export default async function MachinesPage() {
  const t = await getT();
  const user = await pagePerm('maquinas', 'V'); const db = await getDb();
  const ms = await db.select().from(s.machines).where(isNull(s.machines.deletedAt)).orderBy(asc(s.machines.name)); const due = await maintenanceDue(); const live = liveByMachine();
  return (
    <>
      <PageHeader title={t('machines.machinesMaintenance')} subtitle={t('machines.specificationsHourlyCostsLiveSta')} actions={<><Link href="/maquinas/conectores" className="btn-ghost" data-testid="connectors">{t('machines.connectPrinters2')}</Link>{can(user, 'maquinas', 'C') && <Link href="/maquinas/nueva" className="btn-primary" data-testid="new-machine">{t('machines.newMachine2')}</Link>}</>} />
      {ms.length === 0 ? <Card><Empty title={t('machines.noMachines')} hint={t('machines.registerYourPrintersToCalculate')} /></Card> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="machine-grid">{ms.map((m) => { const done = m.jobsOk + m.jobsFailed; const d = due.filter((x) => x.machineId === m.id); return (
          <div key={m.id} className="card p-4 hover:border-brand-500 relative group">
            <Link href={`/maquinas/${m.id}`} className="block"><div className="flex items-start justify-between gap-2"><div><div className="font-semibold">{m.name}</div><div className="text-xs muted">{m.brand} {m.model} · {m.tech} · {m.volX}×{m.volY}×{m.volZ} mm</div></div><StatusBadge status={m.status} /></div>
            {live[m.id] && <div className="mt-2"><PrinterPill machineId={m.id} initial={live[m.id]} /></div>}
            <dl className="grid grid-cols-3 gap-2 mt-3 text-sm tabular"><div><dt className="text-xs muted">{t('common.hours')}</dt><dd>{num(m.hoursTotal, 0)} {t('common.h')}</dd></div><div><dt className="text-xs muted">{t('machines.success')}</dt><dd>{done ? `${Math.round((m.jobsOk / done) * 100)}%` : '—'}</dd></div><div><dt className="text-xs muted">{t('machines.timeFactor')}</dt><dd>{num(m.timeFactor, 2)}×</dd></div></dl>
            <div className="flex flex-wrap gap-1 mt-3">{m.simulated && <Badge tone="violet">{t('machines.simulated')}</Badge>}{live[m.id] && <Badge tone="green">{t('machines.connected')}</Badge>}{m.multicolorSlots > 1 && <Badge>{m.multicolorSlots} {t('machines.colors')}</Badge>}{m.enclosed && <Badge>{t('machines.closed')}</Badge>}{d.length > 0 && <Badge tone="red">{d.length} {t('machines.maintenanceOverdue')}</Badge>}</div></Link>
            {can(user, 'maquinas', 'X') && <div className="mt-2 flex justify-end"><DeleteMachineButton machineId={m.id} machineName={m.name} className="btn-ghost btn-sm text-red-600 dark:text-red-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity" /></div>}
          </div>); })}</div>)}
    </>
  );
}
