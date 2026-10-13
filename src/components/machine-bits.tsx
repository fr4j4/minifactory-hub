'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addIncidentAction, addPlanAction, completeMaintenanceAction, saveMachineAction, setMachineStatusAction } from '@/actions/production';
import { switchNozzleAction } from '@/actions/slicer';
import { NozzlePicker } from './nozzle-picker';
import { NozzleMismatch, ProcessOptions } from './process-options';
import { Modal, useAction } from './client';
import { machineHourly } from '@/lib/pricing';
import { money } from '@/lib/format';

export function MachineForm({ m, profiles, kwh }: { m?: any; profiles: Array<{ id: string; name: string; type: string; nozzle: string | null }>; kwh: number }) {
  const { run, pending } = useAction(); const router = useRouter();
  const [v, setV] = useState({ name: m?.name ?? '', brand: m?.brand ?? '', model: m?.model ?? '', tech: m?.tech ?? 'FDM', serial: m?.serial ?? '', volX: m?.volX ?? 220, volY: m?.volY ?? 220, volZ: m?.volZ ?? 250, nozzles: (m?.nozzles ?? ['0.4']) as string[], materialsOk: (m?.materialsOk ?? ['PLA']).join(', '), multicolorSlots: m?.multicolorSlots ?? 1, heatedBed: m?.heatedBed ?? true, enclosed: m?.enclosed ?? false, purchaseValue: m?.purchaseValue ?? 0, residualValue: m?.residualValue ?? 0, lifeHours: m?.lifeHours ?? 5000, watts: m?.watts ?? 150, maintCostHour: m?.maintCostHour ?? 0, feedGph: m?.feedGph ?? 25, simulated: m?.simulated ?? false, machineProfileId: m?.machineProfileId ?? '', defaultProcessProfileId: m?.defaultProcessProfileId ?? '' });
  const f = (k: string) => (e: React.ChangeEvent<any>) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? +e.target.value : e.target.value });
  const hr = machineHourly({ purchaseValue: v.purchaseValue, residualValue: v.residualValue, lifeHours: v.lifeHours, watts: v.watts, maintCostHour: v.maintCostHour }, kwh); const perHour = hr.dep + hr.maint + hr.energy;
  return (
    <form className="grid sm:grid-cols-3 gap-3" onSubmit={(e) => { e.preventDefault(); run(() => saveMachineAction({ id: m?.id, ...v, nozzles: v.nozzles, materialsOk: v.materialsOk.split(',').map((x: string) => x.trim()).filter(Boolean) }), { ok: 'Máquina guardada', onOk: (id) => { if (!m) router.push(`/maquinas/${id}`); } }); }}>
      <label className="block sm:col-span-2"><span className="label">Nombre *</span><input className="input" required value={v.name} onChange={f('name')} data-testid="machine-name" /></label><label className="block"><span className="label">Tecnología</span><select className="input" value={v.tech} onChange={f('tech')}><option>FDM</option><option>SLA</option><option>SLS</option></select></label>
      <label className="block"><span className="label">Marca</span><input className="input" value={v.brand} onChange={f('brand')} /></label><label className="block"><span className="label">Modelo</span><input className="input" value={v.model} onChange={f('model')} /></label><label className="block"><span className="label">N° de serie</span><input className="input" value={v.serial} onChange={f('serial')} /></label>
      <div className="sm:col-span-3 grid grid-cols-3 gap-3"><label className="block"><span className="label">Volumen X (mm)</span><input type="number" className="input" value={v.volX} onChange={f('volX')} data-testid="machine-volx" /></label><label className="block"><span className="label">Y (mm)</span><input type="number" className="input" value={v.volY} onChange={f('volY')} /></label><label className="block"><span className="label">Z (mm)</span><input type="number" className="input" value={v.volZ} onChange={f('volZ')} /></label></div>
      {v.tech === 'FDM' && <div className="sm:col-span-3"><NozzlePicker multi label="Boquillas que usas con esta máquina" value={v.nozzles} onChange={(n) => setV({ ...v, nozzles: n })} hint="Marca todas las que tienes (0,2 · 0,4 …). La que está puesta se cambia en la ficha de la máquina y define qué perfil de impresora y qué calidades se usan al laminar." testId="machine-nozzles" /></div>}<label className="block"><span className="label">Materiales compatibles</span><input className="input" value={v.materialsOk} onChange={f('materialsOk')} /></label><label className="block"><span className="label">Ranuras multicolor (AMS/MMU)</span><input type="number" min={1} className="input" value={v.multicolorSlots} onChange={f('multicolorSlots')} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.heatedBed} onChange={f('heatedBed')} /> Cama caliente</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.enclosed} onChange={f('enclosed')} /> Cámara cerrada</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.simulated} onChange={f('simulated')} /> Máquina simulada (sin equipo físico)</label>
      <div className="sm:col-span-3 grid grid-cols-2 sm:grid-cols-5 gap-3"><label className="block"><span className="label">Valor de compra ($)</span><input type="number" className="input" value={v.purchaseValue} onChange={f('purchaseValue')} /></label><label className="block"><span className="label">Valor residual ($)</span><input type="number" className="input" value={v.residualValue} onChange={f('residualValue')} /></label><label className="block"><span className="label">Vida útil (h)</span><input type="number" className="input" value={v.lifeHours} onChange={f('lifeHours')} /></label><label className="block"><span className="label">Consumo (W)</span><input type="number" className="input" value={v.watts} onChange={f('watts')} /></label><label className="block"><span className="label">Mantención ($/h)</span><input type="number" className="input" value={v.maintCostHour} onChange={f('maintCostHour')} /></label></div>
      <div className="sm:col-span-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 p-3 text-sm" data-testid="cost-hour">Costo por hora calculado: <b className="tabular">{money(Math.round(perHour))}</b> <span className="muted">(depreciación {money(Math.round(hr.dep))} + mantención {money(Math.round(hr.maint))} + energía {money(Math.round(hr.energy))})</span></div>
      <div className="sm:col-span-3 rounded-xl border border-[var(--line)] p-3 grid sm:grid-cols-2 gap-3">
        <p className="sm:col-span-2 text-xs muted"><b>Para laminar.</b> La ficha de arriba es tu equipo real; estos dos datos le dicen al laminador qué <b>tipo de impresora</b> es (tamaño de cama, aceleraciones, boquilla) y qué <b>calidad</b> usar por defecto. Lo más fácil es dejarlo a «Laminador → Configurar laminado».</p>
        <label className="block"><span className="label">Perfil de impresora (tipo de máquina)</span><select className="input" value={v.machineProfileId} onChange={f('machineProfileId')} data-testid="machine-profile"><option value="">— Sin perfil —</option>{profiles.filter((p) => p.type === 'machine').map((p) => <option key={p.id} value={p.id}>{p.name}{p.nozzle ? ` · boquilla ${p.nozzle}` : ''}</option>)}</select></label>
        <label className="block"><span className="label">Calidad por defecto (proceso)</span><select className="input" value={v.defaultProcessProfileId} onChange={f('defaultProcessProfileId')} data-testid="machine-process"><option value="">—</option><ProcessOptions profiles={profiles.filter((p) => p.type === 'process')} machineNozzle={profiles.find((p) => p.id === v.machineProfileId)?.nozzle ?? null} /></select><NozzleMismatch processNozzle={profiles.find((p) => p.id === v.defaultProcessProfileId)?.nozzle} machineNozzle={profiles.find((p) => p.id === v.machineProfileId)?.nozzle} /></label>
      </div>
      <label className="block"><span className="label">Caudal típico (g/h) para estimar sin laminar</span><input type="number" className="input" value={v.feedGph} onChange={f('feedGph')} /></label>
      <div className="sm:col-span-3 flex justify-end"><button className="btn-primary" disabled={pending} data-testid="machine-save">Guardar máquina</button></div>
    </form>
  );
}

export function StatusSelect({ id, status }: { id: string; status: string }) {
  const { run } = useAction();
  return <select className="input !w-auto" value={status} aria-label="Estado de la máquina" onChange={(e) => run(() => setMachineStatusAction(id, e.target.value), { ok: 'Estado actualizado' })}>{[['disponible', 'Disponible'], ['imprimiendo', 'Imprimiendo'], ['pausada', 'Pausada'], ['mantenimiento', 'En mantenimiento'], ['fuera_de_servicio', 'Fuera de servicio']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>;
}

export function PlanTools({ machineId, items, plans }: { machineId: string; items: Array<{ id: string; name: string }>; plans: Array<{ id: string; task: string; due: boolean }> }) {
  const { run, pending } = useAction(); const [add, setAdd] = useState(false); const [task, setTask] = useState(''); const [h, setH] = useState(0); const [d, setD] = useState(0);
  const [done, setDone] = useState<string | null>(null); const [cost, setCost] = useState(0); const [down, setDown] = useState(0); const [part, setPart] = useState(''); const [notes, setNotes] = useState('');
  return (<>
    <button className="btn-ghost btn-sm" onClick={() => setAdd(true)} data-testid="add-plan">+ Plan preventivo</button>
    <Modal open={add} onClose={() => setAdd(false)} title="Plan de mantenimiento preventivo"><div className="space-y-3"><input className="input" placeholder="Tarea (ej. Lubricar ejes)" value={task} onChange={(e) => setTask(e.target.value)} aria-label="Tarea" data-testid="plan-task" /><div className="grid grid-cols-2 gap-3"><label className="block"><span className="label">Cada (horas de impresión)</span><input type="number" className="input" value={h || ''} onChange={(e) => setH(+e.target.value || 0)} data-testid="plan-hours" /></label><label className="block"><span className="label">o cada (días)</span><input type="number" className="input" value={d || ''} onChange={(e) => setD(+e.target.value || 0)} /></label></div><div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setAdd(false)}>Cancelar</button><button className="btn-primary" disabled={pending} data-testid="plan-save" onClick={() => run(() => addPlanAction({ machineId, task, intervalHours: h || null, intervalDays: d || null }), { ok: 'Plan creado', onOk: () => setAdd(false) })}>Crear</button></div></div></Modal>
    {plans.map((p) => <span key={p.id} className="hidden" />)}
    <Modal open={!!done} onClose={() => setDone(null)} title="Registrar mantenimiento realizado"><div className="space-y-3"><div className="grid grid-cols-2 gap-3"><label className="block"><span className="label">Costo ($)</span><input type="number" className="input" value={cost || ''} onChange={(e) => setCost(+e.target.value || 0)} /></label><label className="block"><span className="label">Tiempo fuera de servicio (h)</span><input type="number" step="0.5" className="input" value={down || ''} onChange={(e) => setDown(+e.target.value || 0)} /></label></div><label className="block"><span className="label">Repuesto usado (descuenta inventario)</span><select className="input" value={part} onChange={(e) => setPart(e.target.value)}><option value="">— Ninguno —</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label><input className="input" placeholder="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Notas" /><div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setDone(null)}>Cancelar</button><button className="btn-primary" disabled={pending} data-testid="maint-confirm" onClick={() => run(() => completeMaintenanceAction({ machineId, planId: done!, cost, downtimeH: down, notes, parts: part ? [{ itemId: part, qty: 1, name: items.find((i) => i.id === part)?.name ?? '' }] : [] }), { ok: 'Mantenimiento registrado', onOk: () => setDone(null) })}>Registrar</button></div></div></Modal>
    <span id="done-plans" data-plans={JSON.stringify(plans.map((p) => p.id))} />
    <DonePlanButtons plans={plans} onPick={setDone} />
  </>);
}
function DonePlanButtons({ plans, onPick }: { plans: Array<{ id: string; task: string; due: boolean }>; onPick: (id: string) => void }) {
  return <div className="w-full mt-2 flex flex-wrap gap-2">{plans.map((p) => <button key={p.id} className={`btn-sm ${p.due ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onPick(p.id)} data-testid={`maint-done-${p.task}`}>{p.due ? '⚠ ' : ''}Hecho: {p.task}</button>)}</div>;
}

export function IncidentForm({ machineId }: { machineId: string }) {
  const { run, pending } = useAction(); const [kind, setKind] = useState('atasco'); const [txt, setTxt] = useState('');
  return <form className="flex flex-col sm:flex-row gap-2" onSubmit={(e) => { e.preventDefault(); run(() => addIncidentAction({ machineId, kind, description: txt }), { ok: 'Incidencia registrada', onOk: () => setTxt('') }); }}><select className="input sm:!w-44" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tipo"><option value="atasco">Atasco</option><option value="desnivel">Desnivel de cama</option><option value="capa_desplazada">Capa desplazada</option><option value="otro">Otro</option></select><input className="input" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Qué pasó" aria-label="Descripción" /><button className="btn-ghost shrink-0" disabled={pending || !txt.trim()}>Registrar</button></form>;
}

/** «Boquilla puesta»: cambia en un toque el perfil de impresora y la calidad por defecto que usa el laminador. */
export function ActiveNozzle({ machineId, nozzles, active, setups }: { machineId: string; nozzles: string[]; active: string | null; setups: Record<string, { machine: string; process: string | null }> }) {
  const { run, pending } = useAction();
  const all = [...new Set([...nozzles, ...(active ? [active] : [])])].sort((a, b) => Number(a) - Number(b));
  if (!all.length) return null;
  const cur = active ? setups[active] : null;
  return (
    <div className="card p-4" data-testid="active-nozzle">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div><div className="label !mb-1">Boquilla puesta</div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Boquilla puesta">{all.map((n) => <button key={n} type="button" role="radio" aria-checked={n === active} disabled={pending} onClick={() => n !== active && run(() => switchNozzleAction(machineId, n), { ok: `Boquilla ${n.replace('.', ',')} mm puesta: perfiles actualizados` })} data-testid={`set-nozzle-${n}`}
            className={`num min-h-[36px] px-3 rounded-xl border text-sm ${n === active ? 'bg-[var(--panel)] text-[var(--panel-ink)] border-transparent dark:bg-slate-700' : 'border-[var(--line)] hover:bg-slate-100 dark:hover:bg-slate-800'}`}>{n.replace('.', ',')} mm{setups[n] ? '' : ' ·'}</button>)}</div></div>
        <p className="text-xs muted flex-1 min-w-[220px]">{cur ? <>Se lamina con la impresora <b>{cur.machine}</b>{cur.process ? <> y la calidad <b>{cur.process}</b></> : ''}. Al cambiar de boquilla en el equipo, márcala aquí.</> : 'Esta máquina aún no tiene perfil de impresora para laminar: configúralo en Laminador → Configurar laminado.'}{all.some((n) => !setups[n]) && ' Las boquillas con «·» se configuran solas la primera vez que las eliges.'}</p>
      </div>
    </div>
  );
}
