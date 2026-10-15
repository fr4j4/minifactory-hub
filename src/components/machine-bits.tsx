'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addIncidentAction, addPlanAction, completeMaintenanceAction, machineDeleteInfoAction, removeMachineAction, saveMachineAction, setMachineStatusAction } from '@/actions/production';
import { switchNozzleAction } from '@/actions/slicer';
import { NozzlePicker } from './nozzle-picker';
import { MaterialTypesPicker } from './material-types-picker';
import { NozzleMismatch, ProcessOptions } from './process-options';
import { Modal, useAction } from './client';
import { machineHourly } from '@/lib/pricing';
import { money } from '@/lib/format';
import { useT } from '@/i18n/client';
import { Rich } from '@/i18n/rich';

export function MachineForm({ m, profiles, kwh, materialTypes }: { m?: any; materialTypes?: string[]; profiles: Array<{ id: string; name: string; type: string; nozzle: string | null }>; kwh: number }) {
  const t = useT();
  const { run, pending } = useAction(); const router = useRouter();
  const [v, setV] = useState({ name: m?.name ?? '', brand: m?.brand ?? '', model: m?.model ?? '', tech: m?.tech ?? 'FDM', serial: m?.serial ?? '', volX: m?.volX ?? 220, volY: m?.volY ?? 220, volZ: m?.volZ ?? 250, nozzles: (m?.nozzles ?? ['0.4']) as string[], materialsOk: (m?.materialsOk ?? ['PLA']) as string[], multicolorSlots: m?.multicolorSlots ?? 1, heatedBed: m?.heatedBed ?? true, enclosed: m?.enclosed ?? false, purchaseValue: m?.purchaseValue ?? 0, residualValue: m?.residualValue ?? 0, lifeHours: m?.lifeHours ?? 5000, watts: m?.watts ?? 150, maintCostHour: m?.maintCostHour ?? 0, feedGph: m?.feedGph ?? 25, simulated: m?.simulated ?? false, machineProfileId: m?.machineProfileId ?? '', defaultProcessProfileId: m?.defaultProcessProfileId ?? '' });
  const f = (k: string) => (e: React.ChangeEvent<any>) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? +e.target.value : e.target.value });
  const hr = machineHourly({ purchaseValue: v.purchaseValue, residualValue: v.residualValue, lifeHours: v.lifeHours, watts: v.watts, maintCostHour: v.maintCostHour }, kwh); const perHour = hr.dep + hr.maint + hr.energy;
  return (
    <form className="grid sm:grid-cols-3 gap-3" onSubmit={(e) => { e.preventDefault(); run(() => saveMachineAction({ id: m?.id, ...v, nozzles: v.nozzles, materialsOk: v.materialsOk }), { ok: t('machines.machineSaved2'), onOk: (id) => { if (!m) router.push(`/maquinas/${id}`); } }); }}>
      <label className="block sm:col-span-2"><span className="label">{t('common.name2')}</span><input className="input" required value={v.name} onChange={f('name')} data-testid="machine-name" /></label><label className="block"><span className="label">{t('machines.technology')}</span><select className="input" value={v.tech} onChange={f('tech')}><option>FDM</option><option>SLA</option><option>SLS</option></select></label>
      <label className="block"><span className="label">{t('machines.brand')}</span><input className="input" value={v.brand} onChange={f('brand')} /></label><label className="block"><span className="label">{t('machines.model')}</span><input className="input" value={v.model} onChange={f('model')} /></label><label className="block"><span className="label">{t('machines.serialNo')}</span><input className="input" value={v.serial} onChange={f('serial')} /></label>
      <div className="sm:col-span-3 grid grid-cols-3 gap-3"><label className="block"><span className="label">{t('machines.buildVolumeXMm')}</span><input type="number" className="input" value={v.volX} onChange={f('volX')} data-testid="machine-volx" /></label><label className="block"><span className="label">{t('machines.yMm')}</span><input type="number" className="input" value={v.volY} onChange={f('volY')} /></label><label className="block"><span className="label">{t('machines.zMm')}</span><input type="number" className="input" value={v.volZ} onChange={f('volZ')} /></label></div>
      {v.tech === 'FDM' && <div className="sm:col-span-3"><NozzlePicker multi label={t('nozzle.machineNozzles')} value={v.nozzles} onChange={(n) => setV({ ...v, nozzles: n })} hint={t('nozzle.machineNozzlesHint')} testId="machine-nozzles" /></div>}<div className="sm:col-span-2"><MaterialTypesPicker value={v.materialsOk} onChange={(x) => setV({ ...v, materialsOk: x })} options={materialTypes} testId="machine-materials" /></div><label className="block"><span className="label">{t('machines.multicolorSlotsAmsMmu')}</span><input type="number" min={1} className="input" value={v.multicolorSlots} onChange={f('multicolorSlots')} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.heatedBed} onChange={f('heatedBed')} /> {t('machines.heatedBed')}</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.enclosed} onChange={f('enclosed')} /> {t('machines.enclosedChamber')}</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.simulated} onChange={f('simulated')} /> {t('machines.simulatedMachineNoPhysicalDevice')}</label>
      <div className="sm:col-span-3 grid grid-cols-2 sm:grid-cols-5 gap-3"><label className="block"><span className="label">{t('machines.purchaseValue')}</span><input type="number" className="input" value={v.purchaseValue} onChange={f('purchaseValue')} /></label><label className="block"><span className="label">{t('machines.residualValue')}</span><input type="number" className="input" value={v.residualValue} onChange={f('residualValue')} /></label><label className="block"><span className="label">{t('machines.serviceLifeH')}</span><input type="number" className="input" value={v.lifeHours} onChange={f('lifeHours')} /></label><label className="block"><span className="label">{t('machines.powerDrawW')}</span><input type="number" className="input" value={v.watts} onChange={f('watts')} /></label><label className="block"><span className="label">{t('machines.maintenanceH')}</span><input type="number" className="input" value={v.maintCostHour} onChange={f('maintCostHour')} /></label></div>
      <div className="sm:col-span-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 p-3 text-sm" data-testid="cost-hour">{t('machines.calculatedCostPerHour')} <b className="tabular">{money(Math.round(perHour))}</b> <span className="muted">({t('machines.hourlyBreakdown', { dep: money(Math.round(hr.dep)), maint: money(Math.round(hr.maint)), energy: money(Math.round(hr.energy)) })})</span></div>
      <div className="sm:col-span-3 rounded-xl border border-[var(--line)] p-3 grid sm:grid-cols-2 gap-3">
        <p className="sm:col-span-2 text-xs muted">{t('nozzle.forSlicingNote')}</p>
        <label className="block"><span className="label">{t('nozzle.printerProfileLabel')}</span><select className="input" value={v.machineProfileId} onChange={f('machineProfileId')} data-testid="machine-profile"><option value="">{t('machines.noProfile')}</option>{profiles.filter((p) => p.type === 'machine').map((p) => <option key={p.id} value={p.id}>{p.name}{p.nozzle ? ` · ${t('nozzle.nozzleMm', { n: p.nozzle })}` : ''}</option>)}</select></label>
        <label className="block"><span className="label">{t('nozzle.defaultQualityLabel')}</span><select className="input" value={v.defaultProcessProfileId} onChange={f('defaultProcessProfileId')} data-testid="machine-process"><option value="">—</option><ProcessOptions profiles={profiles.filter((p) => p.type === 'process')} machineNozzle={profiles.find((p) => p.id === v.machineProfileId)?.nozzle ?? null} /></select><NozzleMismatch processNozzle={profiles.find((p) => p.id === v.defaultProcessProfileId)?.nozzle} machineNozzle={profiles.find((p) => p.id === v.machineProfileId)?.nozzle} /></label>
      </div>
      <label className="block"><span className="label">{t('machines.typicalFlowRateGH')}</span><input type="number" className="input" value={v.feedGph} onChange={f('feedGph')} /></label>
      <div className="sm:col-span-3 flex justify-end"><button className="btn-primary" disabled={pending} data-testid="machine-save">{t('machines.saveMachine')}</button></div>
    </form>
  );
}

export function StatusSelect({ id, status }: { id: string; status: string }) {
  const t = useT();
  const { run } = useAction();
  return <select className="input !w-auto" value={status} aria-label={t('machines.machineStatus')} onChange={(e) => run(() => setMachineStatusAction(id, e.target.value), { ok: t('machines.statusUpdated2') })}>{[['disponible', t('machines.available')], ['imprimiendo', t('machines.printing')], ['pausada', t('machines.paused')], ['mantenimiento', t('machines.underMaintenance')], ['fuera_de_servicio', t('machines.outOfService')]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>;
}

export function PlanTools({ machineId, items, plans }: { machineId: string; items: Array<{ id: string; name: string }>; plans: Array<{ id: string; task: string; due: boolean }> }) {
  const t = useT();
  const { run, pending } = useAction(); const [add, setAdd] = useState(false); const [task, setTask] = useState(''); const [h, setH] = useState(0); const [d, setD] = useState(0);
  const [done, setDone] = useState<string | null>(null); const [cost, setCost] = useState(0); const [down, setDown] = useState(0); const [part, setPart] = useState(''); const [notes, setNotes] = useState('');
  return (<>
    <button className="btn-ghost btn-sm" onClick={() => setAdd(true)} data-testid="add-plan">{t('machines.preventivePlan')}</button>
    <Modal open={add} onClose={() => setAdd(false)} title={t('machines.preventiveMaintenancePlan')}><div className="space-y-3"><input className="input" placeholder={t('machines.taskEGLubricateAxes')} value={task} onChange={(e) => setTask(e.target.value)} aria-label={t('machines.task')} data-testid="plan-task" /><div className="grid grid-cols-2 gap-3"><label className="block"><span className="label">{t('machines.everyPrintHours')}</span><input type="number" className="input" value={h || ''} onChange={(e) => setH(+e.target.value || 0)} data-testid="plan-hours" /></label><label className="block"><span className="label">{t('machines.orEveryDays')}</span><input type="number" className="input" value={d || ''} onChange={(e) => setD(+e.target.value || 0)} /></label></div><div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setAdd(false)}>{t('common.cancel')}</button><button className="btn-primary" disabled={pending} data-testid="plan-save" onClick={() => run(() => addPlanAction({ machineId, task, intervalHours: h || null, intervalDays: d || null }), { ok: t('machines.planCreated2'), onOk: () => setAdd(false) })}>{t('machines.create')}</button></div></div></Modal>
    {plans.map((p) => <span key={p.id} className="hidden" />)}
    <Modal open={!!done} onClose={() => setDone(null)} title={t('machines.recordMaintenancePerformed')}><div className="space-y-3"><div className="grid grid-cols-2 gap-3"><label className="block"><span className="label">{t('machines.cost')}</span><input type="number" className="input" value={cost || ''} onChange={(e) => setCost(+e.target.value || 0)} /></label><label className="block"><span className="label">{t('machines.downtimeH')}</span><input type="number" step="0.5" className="input" value={down || ''} onChange={(e) => setDown(+e.target.value || 0)} /></label></div><label className="block"><span className="label">{t('machines.sparePartUsedDeductedFrom')}</span><select className="input" value={part} onChange={(e) => setPart(e.target.value)}><option value="">{t('common.none')}</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label><input className="input" placeholder={t('common.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} aria-label={t('common.notes')} /><div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setDone(null)}>{t('common.cancel')}</button><button className="btn-primary" disabled={pending} data-testid="maint-confirm" onClick={() => run(() => completeMaintenanceAction({ machineId, planId: done!, cost, downtimeH: down, notes, parts: part ? [{ itemId: part, qty: 1, name: items.find((i) => i.id === part)?.name ?? '' }] : [] }), { ok: t('machines.maintenanceRecorded2'), onOk: () => setDone(null) })}>{t('common.register')}</button></div></div></Modal>
    <span id="done-plans" data-plans={JSON.stringify(plans.map((p) => p.id))} />
    <DonePlanButtons plans={plans} onPick={setDone} />
  </>);
}
function DonePlanButtons({ plans, onPick }: { plans: Array<{ id: string; task: string; due: boolean }>; onPick: (id: string) => void }) {
  const t = useT();
  return <div className="w-full mt-2 flex flex-wrap gap-2">{plans.map((p) => <button key={p.id} className={`btn-sm ${p.due ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onPick(p.id)} data-testid={`maint-done-${p.task}`}>{p.due ? '⚠ ' : ''}{t('machines.doneTask', { task: p.task })}</button>)}</div>;
}

export function IncidentForm({ machineId }: { machineId: string }) {
  const t = useT();
  const { run, pending } = useAction(); const [kind, setKind] = useState('atasco'); const [txt, setTxt] = useState('');
  return <form className="flex flex-col sm:flex-row gap-2" onSubmit={(e) => { e.preventDefault(); run(() => addIncidentAction({ machineId, kind, description: txt }), { ok: t('machines.incidentRecorded2'), onOk: () => setTxt('') }); }}><select className="input sm:!w-44" value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t('common.typeLabel')}><option value="atasco">{t('machines.jam')}</option><option value="desnivel">{t('machines.unevenBed')}</option><option value="capa_desplazada">{t('machines.layerShift')}</option><option value="otro">{t('machines.other')}</option></select><input className="input" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder={t('machines.whatHappened')} aria-label={t('common.description')} /><button className="btn-ghost shrink-0" disabled={pending || !txt.trim()}>{t('common.register')}</button></form>;
}

/**
 * Elimina (soft-delete) una máquina, sea registrada manualmente, por LAN o por Bambu Cloud.
 * Antes de confirmar, consulta si tiene una impresora vinculada o trabajos activos en la cola,
 * y ajusta el mensaje: si hay vínculo se avisa que se desconectará solo; si hay trabajos activos
 * se bloquea hasta que se resuelvan (no se puede perder una impresión en curso).
 */
export function DeleteMachineButton({ machineId, machineName, className, onDone, redirectTo }: { machineId: string; machineName: string; className?: string; onDone?: () => void; redirectTo?: string }) {
  const t = useT(); const { run, pending } = useAction(); const router = useRouter();
  const [info, setInfo] = useState<{ canDelete: boolean; activeJobCount: number; link: { mode: string; serial: string } | null } | null>(null);
  const [open, setOpen] = useState(false); const [loading, setLoading] = useState(false);
  const check = async () => {
    setLoading(true); const r = await machineDeleteInfoAction(machineId); setLoading(false);
    if (!r.ok) return; setInfo(r.data); setOpen(true);
  };
  const confirm = () => {
    run(() => removeMachineAction(machineId), { ok: t('machines.machineDeleted'), onOk: () => { setOpen(false); onDone?.(); if (redirectTo) router.push(redirectTo); } });
  };
  return (<span onClick={(e) => e.preventDefault()}>
    <button type="button" className={className ?? 'btn-ghost btn-sm text-danger'} disabled={loading} onClick={check} data-testid="delete-machine">{loading ? t('machines.checking') : t('common.deleteLabel')}</button>
    <Modal open={open} onClose={() => setOpen(false)} title={t('machines.deleteTitle', { name: machineName })}>
      <div className="space-y-3 text-sm">
        {!info ? null : !info.canDelete ? (
          <p role="alert" className="text-warn"><Rich text={t('machines.deleteBlocked', { count: info.activeJobCount })} /></p>
        ) : (<>
          <p><Rich text={t('machines.deleteInfo')} /></p>
          {info.link && <p className="text-warn"><Rich text={t('machines.deleteLinked', { via: info.link.mode === 'cloud' ? 'Bambu Cloud' : 'LAN', serial: info.link.serial })} />{info.link.mode === 'cloud' && ` ${t('machines.deleteCloudNote')}`}</p>}
        </>)}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
          {info?.canDelete && <button className="btn-danger" disabled={pending} data-testid="delete-machine-confirm" onClick={confirm}>{pending ? t('machines.deleting') : t('machines.deleteMachine')}</button>}
        </div>
      </div>
    </Modal>
  </span>);
}

/** «Boquilla puesta»: cambia en un toque el perfil de impresora y la calidad por defecto que usa el laminador. */
export function ActiveNozzle({ machineId, nozzles, active, setups }: { machineId: string; nozzles: string[]; active: string | null; setups: Record<string, { machine: string; process: string | null }> }) {
  const t = useT(); const { run, pending } = useAction();
  const all = [...new Set([...nozzles, ...(active ? [active] : [])])].sort((a, b) => Number(a) - Number(b));
  if (!all.length) return null;
  const cur = active ? setups[active] : null;
  return (
    <div className="card p-4" data-testid="active-nozzle">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div><div className="label !mb-1">{t('nozzle.nozzleSetLabel')}</div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('nozzle.nozzleSetLabel')}>{all.map((n) => <button key={n} type="button" role="radio" aria-checked={n === active} disabled={pending} onClick={() => n !== active && run(() => switchNozzleAction(machineId, n), { ok: t('nozzle.nozzleSwitched', { n: n.replace('.', ',') }) })} data-testid={`set-nozzle-${n}`}
            className={`num min-h-[36px] px-3 rounded-xl border text-sm ${n === active ? 'bg-[var(--panel)] text-[var(--panel-ink)] border-transparent dark:bg-slate-700' : 'border-[var(--line)] hover:bg-slate-100 dark:hover:bg-slate-800'}`}>{t('nozzle.mm', { n: n.replace('.', ',') })}{setups[n] ? '' : ' ·'}</button>)}</div></div>
        <p className="text-xs muted flex-1 min-w-[220px]">{cur ? <>{t('nozzle.slicesWithPrinter')} <b>{cur.machine}</b>{cur.process ? <> {t('nozzle.andQuality')} <b>{cur.process}</b></> : ''}. {t('nozzle.markWhenChanging')}</> : t('nozzle.noPrinterProfileYet')}{all.some((n) => !setups[n]) && ` ${t('nozzle.dotNozzlesAutoSetup')}`}</p>
      </div>
    </div>
  );
}
