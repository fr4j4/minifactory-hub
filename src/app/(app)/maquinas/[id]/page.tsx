import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can, canSeeCosts } from '@/lib/perm';
import { PageHeader, Card, Table, Badge, StatusBadge, Meter, Stat } from '@/components/ui';
import { IncidentForm, MachineForm, PlanTools, StatusSelect } from '@/components/machine-bits';
import { getSettings } from '@/lib/settings';
import { machineHourly } from '@/lib/pricing';
import { dmy, dmyHm, money, num, pct } from '@/lib/format';

export const metadata = { title: 'Máquina' };
export default async function MachinePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pagePerm('maquinas', 'V'); const { id } = await params; const db = await getDb(); const st = await getSettings();
  const [m] = await db.select().from(s.machines).where(eq(s.machines.id, id)); if (!m) notFound();
  const plans = await db.select().from(s.maintenancePlans).where(and(eq(s.maintenancePlans.machineId, id), isNull(s.maintenancePlans.deletedAt)));
  const logs = await db.select().from(s.maintenanceLogs).where(eq(s.maintenanceLogs.machineId, id)).orderBy(desc(s.maintenanceLogs.createdAt)).limit(12);
  const inc = await db.select().from(s.incidents).where(eq(s.incidents.machineId, id)).orderBy(desc(s.incidents.createdAt)).limit(12);
  const jobs = await db.select().from(s.printJobs).where(eq(s.printJobs.machineId, id)).orderBy(desc(s.printJobs.createdAt)).limit(10);
  const spools = await db.select({ sp: s.spools, m: s.materials }).from(s.spools).innerJoin(s.materials, eq(s.materials.id, s.spools.materialId)).where(eq(s.spools.machineId, id));
  const profs = await db.select().from(s.slicerProfiles).where(isNull(s.slicerProfiles.deletedAt)); const items = await db.select().from(s.inventoryItems).where(and(eq(s.inventoryItems.category, 'repuesto'), isNull(s.inventoryItems.deletedAt)));
  const hr = machineHourly({ purchaseValue: m.purchaseValue, residualValue: m.residualValue, lifeHours: m.lifeHours, watts: m.watts, maintCostHour: m.maintCostHour }, st.rates.kwh); const done = m.jobsOk + m.jobsFailed;
  const planRows = plans.map((p) => { const remH = p.intervalHours != null ? p.intervalHours - (m.hoursTotal - p.lastDoneHours) : null; const remD = p.intervalDays != null && p.lastDoneAt ? p.intervalDays - (Date.now() - new Date(p.lastDoneAt).getTime()) / 86400_000 : null; const due = (remH != null && remH <= 0) || (remD != null && remD <= 0); return { p, remH, remD, due }; });
  return (
    <>
      <PageHeader back={{ href: '/maquinas', label: 'Máquinas' }} title={<span>{m.name} <StatusBadge status={m.status} /></span>} subtitle={`${m.brand ?? ''} ${m.model ?? ''} · ${m.tech} · ${m.volX}×${m.volY}×${m.volZ} mm`} actions={can(user, 'maquinas', 'E') ? <StatusSelect id={m.id} status={m.status} /> : undefined} />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4"><Stat label="Horas totales" value={`${num(m.hoursTotal, 0)} h`} /><Stat label="Trabajos OK / fallidos" value={`${m.jobsOk} / ${m.jobsFailed}`} /><Stat label="Tasa de éxito" value={done ? pct((m.jobsOk / done) * 100, 0) : '—'} />{canSeeCosts(user) && <Stat label="Costo por hora" value={money(Math.round(hr.dep + hr.maint + hr.energy))} />}<Stat label="Factor real/estimado" value={`${num(m.timeFactor, 2)}×`} sub="mediana de los últimos 20 trabajos" /></div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-4">
          <Card title="Mantenimiento preventivo" actions={can(user, 'maquinas', 'E') ? <PlanTools machineId={m.id} items={items.map((i) => ({ id: i.id, name: i.name }))} plans={planRows.map((r) => ({ id: r.p.id, task: r.p.task, due: r.due }))} /> : undefined}>
            {planRows.length === 0 ? <p className="text-sm muted">Sin planes. Ej.: lubricar ejes cada 200 h, cambiar boquilla cada 500 h.</p> : <ul className="space-y-3" data-testid="plans">{planRows.map(({ p, remH, remD, due }) => <li key={p.id}><div className="flex justify-between text-sm gap-2"><span className="font-medium">{p.task}</span><span className={due ? 'text-red-600 font-medium' : 'muted'}>{due ? 'Vencido' : remH != null ? `en ${num(remH, 0)} h` : `en ${num(remD ?? 0, 0)} días`}</span></div><Meter value={p.intervalHours != null ? Math.max(0, p.intervalHours - (remH ?? 0)) : Math.max(0, (p.intervalDays ?? 0) - (remD ?? 0))} max={p.intervalHours ?? p.intervalDays ?? 1} tone={due ? 'bad' : 'ok'} /><div className="text-xs muted mt-0.5">Cada {p.intervalHours != null ? `${p.intervalHours} h` : `${p.intervalDays} días`}</div></li>)}</ul>}
          </Card>
          <Card title="Historial de mantenimiento" pad={false}><Table><tbody>{logs.map((l) => <tr key={l.id}><td className="td tabular text-xs">{dmy(l.doneAt)}</td><td className="td">{l.task}</td><td className="td tabular text-xs">a las {num(l.atHours, 0)} h</td><td className="td text-xs">{(l.parts ?? []).map((p) => p.name).join(', ')}</td><td className="td text-right tabular">{l.cost ? money(l.cost) : ''}</td></tr>)}{logs.length === 0 && <tr><td className="td muted">Aún no se registra mantenimiento.</td></tr>}</tbody></Table></Card>
          <Card title="Bitácora de incidencias">{can(user, 'maquinas', 'E') && <IncidentForm machineId={m.id} />}<ul className="mt-3 space-y-1.5 text-sm">{inc.map((i) => <li key={i.id}><span className="muted tabular text-xs">{dmyHm(i.createdAt)}</span> · <Badge>{i.kind}</Badge> {i.description}</li>)}</ul></Card>
          <Card title="Últimos trabajos" pad={false}><Table><tbody>{jobs.map((j) => <tr key={j.id}><td className="td font-medium">{j.number}</td><td className="td">{j.title}</td><td className="td"><StatusBadge status={j.status} /></td><td className="td text-right tabular text-xs">{j.realH ? `${num(j.realH, 1)} h` : `${num(j.estH, 1)} h est.`}</td></tr>)}</tbody></Table></Card>
        </div>
        <div className="space-y-4">
          {spools.length > 0 && <Card title="Material cargado">{spools.map(({ sp, m: mm }) => <Link key={sp.id} href={`/inventario/bobinas/${sp.id}`} className="flex justify-between text-sm py-1 hover:underline"><span>{sp.code} · {mm.type} {mm.colorName}</span><span className="tabular">{Math.round(sp.remainingG)} g</span></Link>)}</Card>}
          {can(user, 'maquinas', 'E') && <Card title="Ficha técnica"><MachineForm m={m} profiles={profs.map((p) => ({ id: p.id, name: p.name, type: p.type }))} kwh={st.rates.kwh} /></Card>}
        </div>
      </div>
    </>
  );
}
