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

export const metadata = { title: 'Máquinas' };
export default async function MachinesPage() {
  const user = await pagePerm('maquinas', 'V'); const db = await getDb();
  const ms = await db.select().from(s.machines).where(isNull(s.machines.deletedAt)).orderBy(asc(s.machines.name)); const due = await maintenanceDue(); const live = liveByMachine();
  return (
    <>
      <PageHeader title="Máquinas y mantenimiento" subtitle="Ficha técnica, costos horarios, estado en vivo y planes preventivos." actions={<><Link href="/maquinas/conectores" className="btn-ghost" data-testid="connectors">📡 Conectar impresoras</Link>{can(user, 'maquinas', 'C') && <Link href="/maquinas/nueva" className="btn-primary" data-testid="new-machine">+ Nueva máquina</Link>}</>} />
      {ms.length === 0 ? <Card><Empty title="Sin máquinas" hint="Registra tus impresoras para calcular costos por hora y planificar la cola." /></Card> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="machine-grid">{ms.map((m) => { const done = m.jobsOk + m.jobsFailed; const d = due.filter((x) => x.machineId === m.id); return (
          <Link key={m.id} href={`/maquinas/${m.id}`} className="card p-4 hover:border-brand-500 block"><div className="flex items-start justify-between gap-2"><div><div className="font-semibold">{m.name}</div><div className="text-xs muted">{m.brand} {m.model} · {m.tech} · {m.volX}×{m.volY}×{m.volZ} mm</div></div><StatusBadge status={m.status} /></div>
            {live[m.id] && <div className="mt-2"><PrinterPill machineId={m.id} initial={live[m.id]} /></div>}
            <dl className="grid grid-cols-3 gap-2 mt-3 text-sm tabular"><div><dt className="text-xs muted">Horas</dt><dd>{num(m.hoursTotal, 0)} h</dd></div><div><dt className="text-xs muted">Éxito</dt><dd>{done ? `${Math.round((m.jobsOk / done) * 100)}%` : '—'}</dd></div><div><dt className="text-xs muted">Factor tiempo</dt><dd>{num(m.timeFactor, 2)}×</dd></div></dl>
            <div className="flex flex-wrap gap-1 mt-3">{m.tech === 'FDM' && (m.nozzles ?? []).length > 0 && <Badge>Boquilla{(m.nozzles ?? []).length > 1 ? 's' : ''} {(m.nozzles ?? []).map((n) => n.replace('.', ',')).join(' · ')}</Badge>}{m.simulated && <Badge tone="violet">Simulada</Badge>}{live[m.id] && <Badge tone="green">Conectada</Badge>}{m.multicolorSlots > 1 && <Badge>{m.multicolorSlots} colores</Badge>}{m.enclosed && <Badge>Cerrada</Badge>}{d.length > 0 && <Badge tone="red">{d.length} mantención vencida</Badge>}</div></Link>); })}</div>)}
    </>
  );
}
