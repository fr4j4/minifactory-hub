import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can, canSeeCosts } from '@/lib/perm';
import { PageHeader, Card, Table, Badge, StatusBadge, Meter, Stat } from '@/components/ui';
import { IncidentForm, MachineForm, PlanTools, StatusSelect, DeleteMachineButton } from '@/components/machine-bits';
import { getSettings } from '@/lib/settings';
import { machineHourly } from '@/lib/pricing';
import { dmy, dmyHm, money, num, pct } from '@/lib/format';
import { PrinterPanel } from '@/components/printer-live';
import { liveRows, storedStatus } from '@/lib/bambu/manager';
import { modelFromCode } from '@/lib/bambu/models';
import { sendableRuns } from '@/lib/services/printers';
import { getT } from '@/i18n/server';

export async function generateMetadata() { return { title: (await getT())('meta.machine') }; }
export default async function MachinePage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const user = await pagePerm('maquinas', 'V'); const { id } = await params; const db = await getDb(); const st = await getSettings();
  const [m] = await db.select().from(s.machines).where(eq(s.machines.id, id)); if (!m) notFound();
  const plans = await db.select().from(s.maintenancePlans).where(and(eq(s.maintenancePlans.machineId, id), isNull(s.maintenancePlans.deletedAt)));
  const logs = await db.select().from(s.maintenanceLogs).where(eq(s.maintenanceLogs.machineId, id)).orderBy(desc(s.maintenanceLogs.createdAt)).limit(12);
  const inc = await db.select().from(s.incidents).where(eq(s.incidents.machineId, id)).orderBy(desc(s.incidents.createdAt)).limit(12);
  const jobs = await db.select().from(s.printJobs).where(eq(s.printJobs.machineId, id)).orderBy(desc(s.printJobs.createdAt)).limit(10);
  const spools = await db.select({ sp: s.spools, m: s.materials }).from(s.spools).innerJoin(s.materials, eq(s.materials.id, s.spools.materialId)).where(eq(s.spools.machineId, id));
  const profs = await db.select().from(s.slicerProfiles).where(isNull(s.slicerProfiles.deletedAt)); const items = await db.select().from(s.inventoryItems).where(and(eq(s.inventoryItems.category, 'repuesto'), isNull(s.inventoryItems.deletedAt)));
  const [link] = await db.select().from(s.printerLinks).where(and(eq(s.printerLinks.machineId, id), isNull(s.printerLinks.deletedAt)));
  let printer: React.ReactNode = null;
  if (link) {
    const md = modelFromCode(link.model, link.serial);
    const live = liveRows().find((r) => r.id === link.id) ?? { id: link.id, machineId: id, name: link.name ?? m.name, model: link.model, modelName: md?.name ?? null, mode: (link.mode === 'cloud' ? 'cloud' : 'lan') as 'lan' | 'cloud', online: false, error: link.enabled ? link.lastError : t('machines.connectionPaused'), status: storedStatus(link) };
    const allSpools = await db.select({ sp: s.spools, m: s.materials }).from(s.spools).innerJoin(s.materials, eq(s.materials.id, s.spools.materialId)).where(and(isNull(s.spools.deletedAt)));
    const runs = (await sendableRuns()).map((r) => ({ id: r.id, label: r.label, timeS: r.timeS, grams: (r.filament ?? []).reduce((a: number, f: any) => a + (f.g ?? 0), 0), createdAt: r.createdAt.toISOString(), machine: (r.profileVersions as any)?.machine?.[0] ?? null }));
    const queued = await db.select().from(s.printJobs).where(and(eq(s.printJobs.machineId, id), eq(s.printJobs.status, 'en_cola'))).orderBy(asc(s.printJobs.position));
    printer = <PrinterPanel initial={live} cameraKind={link.mode === 'cloud' ? 'cloud' : md?.camera ?? 'jpeg-tls'} canControl={can(user, 'maquinas', 'E')} canAssign={can(user, 'inventario', 'E')} canSend={can(user, 'cola', 'E')}
      spools={allSpools.filter(({ sp }) => !['agotada', 'descartada'].includes(sp.status)).map(({ sp, m: mm }) => ({ id: sp.id, code: sp.code, type: mm.type, colorName: mm.colorName, hex: mm.hex, remainingG: sp.remainingG, slot: sp.slot, machineId: sp.machineId }))}
      runs={runs} jobs={queued.map((j) => ({ id: j.id, label: `${j.number} · ${j.title ?? ''}` }))} />;
  }
  const hr = machineHourly({ purchaseValue: m.purchaseValue, residualValue: m.residualValue, lifeHours: m.lifeHours, watts: m.watts, maintCostHour: m.maintCostHour }, st.rates.kwh); const done = m.jobsOk + m.jobsFailed;
  const planRows = plans.map((p) => { const remH = p.intervalHours != null ? p.intervalHours - (m.hoursTotal - p.lastDoneHours) : null; const remD = p.intervalDays != null && p.lastDoneAt ? p.intervalDays - (Date.now() - new Date(p.lastDoneAt).getTime()) / 86400_000 : null; const due = (remH != null && remH <= 0) || (remD != null && remD <= 0); return { p, remH, remD, due }; });
  return (
    <>
      <PageHeader back={{ href: '/maquinas', label: t('nav.machines') }} title={<span>{m.name} <StatusBadge status={m.status} /></span>} subtitle={`${m.brand ?? ''} ${m.model ?? ''} · ${m.tech} · ${m.volX}×${m.volY}×${m.volZ} mm`} actions={<div className="flex items-center gap-2">{can(user, 'maquinas', 'E') && <StatusSelect id={m.id} status={m.status} />}{can(user, 'maquinas', 'X') && <DeleteMachineButton machineId={m.id} machineName={m.name} redirectTo="/maquinas" />}</div>} />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4"><Stat label={t('machines.totalHours')} value={`${num(m.hoursTotal, 0)} h`} /><Stat label={t('machines.successfulFailedJobs')} value={`${m.jobsOk} / ${m.jobsFailed}`} /><Stat label={t('machines.successRate')} value={done ? pct((m.jobsOk / done) * 100, 0) : '—'} />{canSeeCosts(user) && <Stat label={t('machines.costPerHour')} value={money(Math.round(hr.dep + hr.maint + hr.energy))} />}<Stat label={t('machines.actualEstimatedFactor')} value={`${num(m.timeFactor, 2)}×`} sub={t('machines.medianOfTheLast20')} /></div>
      {printer && <div className="mb-4">{printer}</div>}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-4">
          <Card title={t('machines.preventiveMaintenance')} actions={can(user, 'maquinas', 'E') ? <PlanTools machineId={m.id} items={items.map((i) => ({ id: i.id, name: i.name }))} plans={planRows.map((r) => ({ id: r.p.id, task: r.p.task, due: r.due }))} /> : undefined}>
            {planRows.length === 0 ? <p className="text-sm muted">{t('machines.noPlansEGLubricate')}</p> : <ul className="space-y-3" data-testid="plans">{planRows.map(({ p, remH, remD, due }) => <li key={p.id}><div className="flex justify-between text-sm gap-2"><span className="font-medium">{p.task}</span><span className={due ? 'text-red-600 dark:text-red-400 font-medium' : 'muted'}>{due ? t('machines.overdue') : remH != null ? t('machines.inHours', { hours: num(remH, 0) }) : t('machines.inDays', { days: num(remD ?? 0, 0) })}</span></div><Meter value={p.intervalHours != null ? Math.max(0, p.intervalHours - (remH ?? 0)) : Math.max(0, (p.intervalDays ?? 0) - (remD ?? 0))} max={p.intervalHours ?? p.intervalDays ?? 1} tone={due ? 'bad' : 'ok'} /><div className="text-xs muted mt-0.5">{t('machines.every')} {p.intervalHours != null ? `${p.intervalHours} h` : t('machines.days', { days: p.intervalDays })}</div></li>)}</ul>}
          </Card>
          <Card title={t('machines.maintenanceHistory')} pad={false}><Table><tbody>{logs.map((l) => <tr key={l.id}><td className="td tabular text-xs">{dmy(l.doneAt)}</td><td className="td">{l.task}</td><td className="td tabular text-xs">{t('machines.atHours', { hours: num(l.atHours, 0) })}</td><td className="td text-xs">{(l.parts ?? []).map((p) => p.name).join(', ')}</td><td className="td text-right tabular">{l.cost ? money(l.cost) : ''}</td></tr>)}{logs.length === 0 && <tr><td className="td muted">{t('machines.noMaintenanceRecordedYet')}</td></tr>}</tbody></Table></Card>
          <Card title={t('machines.incidentLog')}>{can(user, 'maquinas', 'E') && <IncidentForm machineId={m.id} />}<ul className="mt-3 space-y-1.5 text-sm">{inc.map((i) => <li key={i.id}><span className="muted tabular text-xs">{dmyHm(i.createdAt)}</span> · <Badge>{i.kind}</Badge> {i.description}</li>)}</ul></Card>
          <Card title={t('machines.latestJobs')} pad={false}><Table><tbody>{jobs.map((j) => <tr key={j.id}><td className="td font-medium">{j.number}</td><td className="td">{j.title}</td><td className="td"><StatusBadge status={j.status} /></td><td className="td text-right tabular text-xs">{j.realH ? `${num(j.realH, 1)} h` : `${num(j.estH, 1)} h est.`}</td></tr>)}</tbody></Table></Card>
        </div>
        <div className="space-y-4">
          {spools.length > 0 && <Card title={t('machines.loadedMaterial')}>{spools.map(({ sp, m: mm }) => <Link key={sp.id} href={`/inventario/bobinas/${sp.id}`} className="flex justify-between text-sm py-1 hover:underline"><span>{sp.code} · {mm.type} {mm.colorName}</span><span className="tabular">{Math.round(sp.remainingG)} g</span></Link>)}</Card>}
          {can(user, 'maquinas', 'E') && <Card title={t('machines.specifications')}><MachineForm m={m} profiles={profs.map((p) => ({ id: p.id, name: p.name, type: p.type }))} kwh={st.rates.kwh} /></Card>}
        </div>
      </div>
    </>
  );
}
