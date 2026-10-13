'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addIncidentAction, addPlanAction, completeMaintenanceAction, machineDeleteInfoAction, removeMachineAction, saveMachineAction, setMachineStatusAction } from '@/actions/production';
import { Modal, useAction } from './client';
import { machineHourly } from '@/lib/pricing';
import { money } from '@/lib/format';

export function MachineForm({ m, profiles, kwh }: { m?: any; profiles: Array<{ id: string; name: string; type: string }>; kwh: number }) {
  const { run, pending } = useAction(); const router = useRouter();
  const [v, setV] = useState({ name: m?.name ?? '', brand: m?.brand ?? '', model: m?.model ?? '', tech: m?.tech ?? 'FDM', serial: m?.serial ?? '', volX: m?.volX ?? 220, volY: m?.volY ?? 220, volZ: m?.volZ ?? 250, nozzles: (m?.nozzles ?? ['0.4']).join(', '), materialsOk: (m?.materialsOk ?? ['PLA']).join(', '), multicolorSlots: m?.multicolorSlots ?? 1, heatedBed: m?.heatedBed ?? true, enclosed: m?.enclosed ?? false, purchaseValue: m?.purchaseValue ?? 0, residualValue: m?.residualValue ?? 0, lifeHours: m?.lifeHours ?? 5000, watts: m?.watts ?? 150, maintCostHour: m?.maintCostHour ?? 0, feedGph: m?.feedGph ?? 25, simulated: m?.simulated ?? false, machineProfileId: m?.machineProfileId ?? '', defaultProcessProfileId: m?.defaultProcessProfileId ?? '' });
  const f = (k: string) => (e: React.ChangeEvent<any>) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? +e.target.value : e.target.value });
  const hr = machineHourly({ purchaseValue: v.purchaseValue, residualValue: v.residualValue, lifeHours: v.lifeHours, watts: v.watts, maintCostHour: v.maintCostHour }, kwh); const perHour = hr.dep + hr.maint + hr.energy;
  return (
    <form className="grid sm:grid-cols-3 gap-3" onSubmit={(e) => { e.preventDefault(); run(() => saveMachineAction({ id: m?.id, ...v, nozzles: v.nozzles.split(',').map((x: string) => x.trim()).filter(Boolean), materialsOk: v.materialsOk.split(',').map((x: string) => x.trim()).filter(Boolean) }), { ok: 'Máquina guardada', onOk: (id) => { if (!m) router.push(`/maquinas/${id}`); } }); }}>
      <label className="block sm:col-span-2"><span className="label">Nombre *</span><input className="input" required value={v.name} onChange={f('name')} data-testid="machine-name" /></label><label className="block"><span className="label">Tecnología</span><select className="input" value={v.tech} onChange={f('tech')}><option>FDM</option><option>SLA</option><option>SLS</option></select></label>
      <label className="block"><span className="label">Marca</span><input className="input" value={v.brand} onChange={f('brand')} /></label><label className="block"><span className="label">Modelo</span><input className="input" value={v.model} onChange={f('model')} /></label><label className="block"><span className="label">N° de serie</span><input className="input" value={v.serial} onChange={f('serial')} /></label>
      <div className="sm:col-span-3 grid grid-cols-3 gap-3"><label className="block"><span className="label">Volumen X (mm)</span><input type="number" className="input" value={v.volX} onChange={f('volX')} data-testid="machine-volx" /></label><label className="block"><span className="label">Y (mm)</span><input type="number" className="input" value={v.volY} onChange={f('volY')} /></label><label className="block"><span className="label">Z (mm)</span><input type="number" className="input" value={v.volZ} onChange={f('volZ')} /></label></div>
      <label className="block"><span className="label">Boquillas</span><input className="input" value={v.nozzles} onChange={f('nozzles')} /></label><label className="block"><span className="label">Materiales compatibles</span><input className="input" value={v.materialsOk} onChange={f('materialsOk')} /></label><label className="block"><span className="label">Ranuras multicolor (AMS/MMU)</span><input type="number" min={1} className="input" value={v.multicolorSlots} onChange={f('multicolorSlots')} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.heatedBed} onChange={f('heatedBed')} /> Cama caliente</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.enclosed} onChange={f('enclosed')} /> Cámara cerrada</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.simulated} onChange={f('simulated')} /> Máquina simulada (sin equipo físico)</label>
      <div className="sm:col-span-3 grid grid-cols-2 sm:grid-cols-5 gap-3"><label className="block"><span className="label">Valor de compra ($)</span><input type="number" className="input" value={v.purchaseValue} onChange={f('purchaseValue')} /></label><label className="block"><span className="label">Valor residual ($)</span><input type="number" className="input" value={v.residualValue} onChange={f('residualValue')} /></label><label className="block"><span className="label">Vida útil (h)</span><input type="number" className="input" value={v.lifeHours} onChange={f('lifeHours')} /></label><label className="block"><span className="label">Consumo (W)</span><input type="number" className="input" value={v.watts} onChange={f('watts')} /></label><label className="block"><span className="label">Mantención ($/h)</span><input type="number" className="input" value={v.maintCostHour} onChange={f('maintCostHour')} /></label></div>
      <div className="sm:col-span-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 p-3 text-sm" data-testid="cost-hour">Costo por hora calculado: <b className="tabular">{money(Math.round(perHour))}</b> <span className="muted">(depreciación {money(Math.round(hr.dep))} + mantención {money(Math.round(hr.maint))} + energía {money(Math.round(hr.energy))})</span></div>
      <label className="block"><span className="label">Perfil de máquina (laminador)</span><select className="input" value={v.machineProfileId} onChange={f('machineProfileId')}><option value="">— Sin perfil —</option>{profiles.filter((p) => p.type === 'machine').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="block"><span className="label">Proceso por defecto</span><select className="input" value={v.defaultProcessProfileId} onChange={f('defaultProcessProfileId')}><option value="">—</option>{profiles.filter((p) => p.type === 'process').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
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

/**
 * Elimina (soft-delete) una máquina, sea registrada manualmente, por LAN o por Bambu Cloud.
 * Antes de confirmar, consulta si tiene una impresora vinculada o trabajos activos en la cola,
 * y ajusta el mensaje: si hay vínculo se avisa que se desconectará solo; si hay trabajos activos
 * se bloquea hasta que se resuelvan (no se puede perder una impresión en curso).
 */
export function DeleteMachineButton({ machineId, machineName, className, onDone, redirectTo }: { machineId: string; machineName: string; className?: string; onDone?: () => void; redirectTo?: string }) {
  const { run, pending } = useAction(); const router = useRouter();
  const [info, setInfo] = useState<{ canDelete: boolean; activeJobCount: number; link: { mode: string; serial: string } | null } | null>(null);
  const [open, setOpen] = useState(false); const [loading, setLoading] = useState(false);
  const check = async () => {
    setLoading(true); const r = await machineDeleteInfoAction(machineId); setLoading(false);
    if (!r.ok) return; setInfo(r.data); setOpen(true);
  };
  const confirm = () => {
    run(() => removeMachineAction(machineId), { ok: 'Máquina eliminada', onOk: () => { setOpen(false); onDone?.(); if (redirectTo) router.push(redirectTo); } });
  };
  return (<span onClick={(e) => e.preventDefault()}>
    <button type="button" className={className ?? 'btn-ghost btn-sm text-red-600 dark:text-red-400'} disabled={loading} onClick={check} data-testid="delete-machine">{loading ? 'Revisando…' : 'Eliminar'}</button>
    <Modal open={open} onClose={() => setOpen(false)} title={`Eliminar «${machineName}»`}>
      <div className="space-y-3 text-sm">
        {!info ? null : !info.canDelete ? (
          <p role="alert" className="text-amber-800 dark:text-amber-300">Esta máquina tiene <b>{info.activeJobCount}</b> trabajo(s) activo(s) en la cola (en cola, imprimiendo o pausado). Termina, cancela o reasigna esos trabajos en <b>Cola</b> antes de poder eliminarla.</p>
        ) : (<>
          <p>Se oculta la máquina de las listas. Su historial (trabajos terminados, mantenciones, incidencias) <b>se conserva</b> y sigue disponible para reportes.</p>
          {info.link && <p className="text-amber-800 dark:text-amber-300">Tiene una impresora conectada por <b>{info.link.mode === 'cloud' ? 'Bambu Cloud' : 'LAN'}</b> ({info.link.serial}): se desconectará automáticamente. {info.link.mode === 'cloud' && 'La cuenta de Bambu Cloud no se cierra; solo se quita el vínculo con esta máquina.'}</p>}
        </>)}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
          {info?.canDelete && <button className="btn-danger" disabled={pending} data-testid="delete-machine-confirm" onClick={confirm}>{pending ? 'Eliminando…' : 'Eliminar máquina'}</button>}
        </div>
      </div>
    </Modal>
  </span>);
}
