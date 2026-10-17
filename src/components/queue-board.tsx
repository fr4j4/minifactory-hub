'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, GripVertical, Pause, Play, X } from 'lucide-react';
import { assignJobAction, cancelJobAction, createTestJobAction, finishJobAction, pauseJobAction, reorderJobAction, resumeJobAction, startJobAction } from '@/actions/production';
import { Modal, useAction } from './client';
import { Badge, StatusBadge, Swatch } from './ui';
import { PrinterPill } from './printer-live';
import { cn, dmyHm, dur, grams } from '@/lib/format';
import { FAIL_CAUSES } from '@/lib/production/fail-causes';
import { techFits } from '@/lib/production/tech';
import type { MessageKey } from '@/i18n/translate';
import { useT } from '@/i18n/client';
import { tOr } from '@/i18n/translate';

export interface QJob { id: string; number: string; title: string; kind: string; status: string; machineId: string | null; suggestedMachineId: string | null; materialId: string | null; spoolId: string | null; estG: number; estH: number; realG: number | null; plannedStart: string | null; plannedEnd: string | null; realStart: string | null; qty: number; orderId: string | null; orderNumber: string | null; reprint: boolean; position: number; customer: string | null }
export interface QMachine { id: string; name: string; status: string; tech: string }
export interface QMaterial { id: string; label: string; hex: string; tech: string }
export interface QSpool { id: string; code: string; materialId: string; remainingG: number }

const iconBtn = 'btn-ghost btn-sm !px-1.5';

export function QueueBoard({ jobs, machines, materials, spools, canEdit, canCreate, workStart, workEnd, nowIso }: { jobs: QJob[]; machines: QMachine[]; materials: QMaterial[]; spools: QSpool[]; canEdit: boolean; canCreate: boolean; workStart: number; workEnd: number; nowIso: string }) {
  const t = useT();
  const { run, pending } = useAction(); const [view, setView] = useState<'tablero' | 'gantt'>('tablero'); const [finish, setFinish] = useState<QJob | null>(null); const [newJob, setNewJob] = useState(false);
  const [drag, setDrag] = useState<string | null>(null); const [over, setOver] = useState<string | null>(null);
  const live = jobs.filter((j) => ['en_cola', 'imprimiendo', 'pausado'].includes(j.status));
  const queued = live.filter((j) => j.status === 'en_cola').sort((a, b) => a.position - b.position);
  const matOf = (id: string | null) => materials.find((m) => m.id === id);
  const machineOf = (id: string | null) => machines.find((m) => m.id === id);
  const overnight = (j: QJob) => { if (!j.plannedEnd) return false; const h = new Date(j.plannedEnd).getHours(); return h >= workEnd || h < workStart; };
  const now = new Date(nowIso).getTime();
  const dragged = drag ? jobs.find((j) => j.id === drag) : null;
  const busy = (machineId: string | null) => !!machineId && live.some((j) => j.machineId === machineId && j.status === 'imprimiendo');
  const end = () => { setDrag(null); setOver(null); };
  const reorder = (id: string, before: string | null) => run(() => reorderJobAction(id, before), { ok: t('queue.jobReordered') });
  const assign = (id: string, machineId: string | null) => run(() => assignJobAction(id, machineId), { ok: machineId ? t('queue.jobAssigned') : t('queue.jobUnassigned') });
  const dropOn = (action: (id: string) => unknown) => (e: React.DragEvent) => { e.preventDefault(); const id = drag; end(); if (id) action(id); };
  const allowDrop = (key: string) => (e: React.DragEvent) => { if (!drag || !canEdit) return; e.preventDefault(); if (over !== key) setOver(key); };

  // OJO: son funciones de renderizado, no componentes. Definirlos como componentes dentro de QueueBoard hace que React desmonte la tarjeta
  // que se está arrastrando en cuanto cambia `drag`, y el navegador cancela el arrastre.
  const meta = (j: QJob) => {
    const m = matOf(j.materialId);
    return (<>
      <div className="text-xs muted mt-1 flex flex-wrap gap-x-2 gap-y-0.5"><span>{j.number}</span><Badge>{tOr(t, `queue.kind.${j.kind}`, j.kind)}</Badge>{j.reprint && <Badge tone="amber">{t('queue.reprint')}</Badge>}{j.orderId && <Link className="underline" href={`/pedidos/${j.orderId}`}>{j.orderNumber}</Link>}</div>
      <div className="text-xs tabular mt-1.5 flex items-center gap-2">{m && <span><Swatch hex={m.hex} /> {m.label}</span>}<span>{grams(j.estG)}</span><span>{dur(j.estH * 3600)}</span></div>
    </>);
  };

  /** Trabajo en curso o pausado: vive dentro de su máquina. */
  const renderRunning = (j: QJob) => {
    const el = j.realStart ? (now - new Date(j.realStart).getTime()) / 3600_000 : 0; const p = j.status === 'imprimiendo' && j.estH > 0 ? Math.min(99, (el / j.estH) * 100) : 0;
    return (
      <li key={j.id} className={cn('rounded-lg border bg-[var(--card)] p-2.5 text-sm', j.status === 'imprimiendo' ? 'border-violet-400' : 'border-slate-200 dark:border-slate-700')} data-testid="job-card">
        <div className="flex items-start justify-between gap-2"><div className="font-medium leading-snug">{j.title}</div><StatusBadge status={j.status} /></div>
        {meta(j)}
        {j.status === 'imprimiendo' && <div className="mt-2"><div className="h-1.5 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden"><div className="h-full bg-violet-500" style={{ width: `${p}%` }} /></div><div className="text-xs muted mt-0.5">{Math.round(p)}% · {t('queue.endsAt', { date: dmyHm(j.plannedEnd) })}</div></div>}
        {canEdit && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {j.status === 'imprimiendo' && <><button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => pauseJobAction(j.id))}><Pause className="h-3.5 w-3.5" aria-hidden /> {t('queue.pause')}</button><button className="btn-primary btn-sm" onClick={() => setFinish(j)} data-testid="job-finish">{t('queue.finish')}</button></>}
            {j.status === 'pausado' && <><button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => resumeJobAction(j.id))}><Play className="h-3.5 w-3.5" aria-hidden /> {t('queue.resume')}</button><button className="btn-ghost btn-sm" onClick={() => setFinish(j)}>{t('queue.finish')}</button><button className="btn-ghost btn-sm text-danger" disabled={pending} onClick={() => run(() => cancelJobAction(j.id), { ok: t('queue.jobCancelled2') })} aria-label={t('queue.cancel', { job: j.number })}><X className="h-4 w-4" aria-hidden /></button></>}
          </div>)}
      </li>
    );
  };

  /** Trabajo en la cola global: se ordena arrastrando (o con subir/bajar) y se asigna arrastrando a una máquina (o con el selector). */
  const renderQueued = (j: QJob, i: number) => {
    const blocked = busy(j.machineId); // asignado a una máquina que ya está imprimiendo; sin asignar siempre se puede iniciar (elige una libre)
    return (
      <li key={j.id} draggable={canEdit} onDragStart={() => setDrag(j.id)} onDragEnd={end} onDragOver={allowDrop(`j:${j.id}`)} onDrop={dropOn((id) => id !== j.id && reorder(id, j.id))}
        className={cn('rounded-lg border bg-[var(--card)] p-2.5 text-sm', over === `j:${j.id}` && drag !== j.id ? 'border-brand-400 border-t-4' : 'border-slate-200 dark:border-slate-700', drag === j.id && 'opacity-50')} data-testid="job-card">
        <div className="flex items-start gap-2">
          {canEdit && <GripVertical className="h-4 w-4 mt-0.5 shrink-0 muted cursor-grab hidden sm:block" aria-hidden />}
          <span className="tabular text-xs muted mt-0.5 w-5 shrink-0">#{i + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2"><div className="font-medium leading-snug">{j.title}</div><StatusBadge status={j.status} /></div>
            {meta(j)}
            <div className="text-xs mt-1.5 flex flex-wrap items-center gap-1.5">
              {j.machineId ? <Badge tone="violet">{machineOf(j.machineId)?.name}</Badge>
                : j.suggestedMachineId ? <><span className="muted">{t('queue.suggested', { machine: machineOf(j.suggestedMachineId)?.name ?? '' })}</span>{canEdit && <button className="underline" disabled={pending} onClick={() => assign(j.id, j.suggestedMachineId)}>{t('queue.assignSuggested')}</button>}</>
                : <span className="muted">{t('queue.unassigned')}</span>}
            </div>
            {j.plannedEnd && <div className={cn('text-xs mt-1', overnight(j) ? 'text-warn font-medium' : 'muted')}>{overnight(j) ? t('queue.willFinishOutsideWorkingHours') : t('queue.ends')} {dmyHm(j.plannedEnd)}</div>}
          </div>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <button className="btn-primary btn-sm" disabled={pending || blocked} title={blocked ? t('queue.machineBusy') : undefined} onClick={() => run(() => startJobAction(j.id, j.machineId ? { machineId: j.machineId } : {}), { ok: t('queue.jobStarted2') })} data-testid="job-start"><Play className="h-3.5 w-3.5" aria-hidden /> {t('queue.start')}</button>
            <select className="input !min-h-[32px] !py-0.5 !w-auto max-w-[min(11rem,100%)] min-w-0 text-xs" aria-label={t('queue.assignTo', { job: j.number })} value={j.machineId ?? ''} onChange={(e) => assign(j.id, e.target.value || null)}><option value="">{t('queue.unassigned')}</option>{machines.filter((mm) => mm.id === j.machineId || techFits(matOf(j.materialId)?.tech, mm.tech)).map((mm) => <option key={mm.id} value={mm.id}>{mm.name}</option>)}</select>
            <span className="ml-auto inline-flex gap-0.5">
              <button className={iconBtn} disabled={pending || i === 0} aria-label={t('queue.moveUp', { job: j.number })} onClick={() => reorder(j.id, queued[i - 1].id)}><ChevronUp className="h-4 w-4" aria-hidden /></button>
              <button className={iconBtn} disabled={pending || i === queued.length - 1} aria-label={t('queue.moveDown', { job: j.number })} onClick={() => reorder(j.id, queued[i + 2]?.id ?? null)}><ChevronDown className="h-4 w-4" aria-hidden /></button>
              <button className={cn(iconBtn, 'text-danger')} disabled={pending} onClick={() => run(() => cancelJobAction(j.id), { ok: t('queue.jobCancelled2') })} aria-label={t('queue.cancel', { job: j.number })}><X className="h-4 w-4" aria-hidden /></button>
            </span>
          </div>)}
      </li>
    );
  };

  const dropZone = (key: string, label: string, onDrop: (id: string) => unknown) => drag ? (
    <div className={cn('rounded-lg border-2 border-dashed p-3 text-center text-xs muted', over === key ? 'border-brand-400 bg-brand-400/10' : 'border-slate-300 dark:border-slate-600')} onDragOver={allowDrop(key)} onDrop={dropOn(onDrop)}>{label}</div>
  ) : null;

  // Gantt: próximas 36 h
  const t0 = now - 2 * 3600_000; const span = 38 * 3600_000; const hours = Array.from({ length: 19 }, (_, i) => new Date(t0 + i * 2 * 3600_000));
  const pos = (tt: number) => Math.max(0, Math.min(100, ((tt - t0) / span) * 100));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-600 overflow-hidden" role="tablist">{(['tablero', 'gantt'] as const).map((v) => <button key={v} role="tab" aria-selected={view === v} className={cn('px-4 min-h-[44px] md:min-h-[36px] text-sm', view === v ? 'bg-[var(--panel)] text-[var(--panel-ink)] dark:bg-slate-700' : 'hover:bg-slate-100 dark:hover:bg-slate-800')} onClick={() => setView(v)} data-testid={`view-${v}`}>{v === 'tablero' ? t('queue.board') : t('queue.calendarGantt')}</button>)}</div>
        {canCreate && <button className="btn-ghost ml-auto" onClick={() => setNewJob(true)} data-testid="new-job">{t('queue.testJob')}</button>}
      </div>
      {view === 'tablero' ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start" data-testid="board" tabIndex={0}>
          <section className="rounded-xl bg-slate-100/70 dark:bg-slate-900/50 p-2.5" aria-label={t('queue.waitingQueue')}>
            <header className="px-1 pb-2 flex items-center justify-between"><h3 className="font-semibold text-sm">{t('queue.waitingQueue')}</h3><span className="text-xs muted tabular">{queued.length}</span></header>
            {dragged?.machineId && dropZone('unassign', t('queue.dropToUnassign'), (id) => assign(id, null))}
            <ul className="space-y-2 min-h-[60px]">{queued.map((j, i) => renderQueued(j, i))}{queued.length === 0 && <li className="text-xs muted text-center py-4">{t('queue.emptyQueue')}</li>}</ul>
            <div className="mt-2">{dropZone('end', t('queue.dropToEnd'), (id) => reorder(id, null))}</div>
          </section>
          <div className="space-y-3" aria-label={t('queue.machines')}>
            {machines.map((mm) => { const running = live.filter((j) => j.machineId === mm.id && j.status !== 'en_cola'); const next = queued.filter((j) => j.machineId === mm.id);
              return (
                <section key={mm.id} className={cn('rounded-xl bg-slate-100/70 dark:bg-slate-900/50 p-2.5', drag && 'ring-2 ring-brand-400/50', over === `m:${mm.id}` && '!ring-brand-400 bg-brand-400/10')} onDragOver={allowDrop(`m:${mm.id}`)} onDrop={dropOn((id) => assign(id, mm.id))} aria-label={mm.name}>
                  <header className="px-1 pb-2"><div className="flex items-center justify-between"><h3 className="font-semibold text-sm">{mm.name}{mm.tech !== 'FDM' && <Badge tone="violet" className="ml-1.5">{t('queue.resin')}</Badge>}</h3><StatusBadge status={mm.status} /></div><div className="mt-1 empty:hidden"><PrinterPill machineId={mm.id} /></div></header>
                  {over === `m:${mm.id}` && drag && <div className="text-xs text-center py-1 font-medium">{t('queue.dropToAssign', { machine: mm.name })}</div>}
                  <ul className="space-y-2">{running.map((j) => renderRunning(j))}{running.length === 0 && <li className="text-xs muted px-1">{t('queue.machineFree')}</li>}</ul>
                  {next.length > 0 && <div className="mt-2 px-1"><div className="text-[11px] uppercase tracking-wide muted mb-1">{t('queue.nextOnMachine')}</div><ol className="text-xs space-y-0.5">{next.map((j) => <li key={j.id} className="flex justify-between gap-2"><span className="truncate"><span className="tabular muted">#{queued.indexOf(j) + 1}</span> {j.title}</span><span className="tabular muted shrink-0">{dmyHm(j.plannedEnd)}</span></li>)}</ol></div>}
                </section>); })}
          </div>
        </div>
      ) : (
        <div className="card overflow-x-auto" data-testid="gantt"><div className="min-w-[760px] p-3">
          <div className="relative h-6 ml-32 text-[11px] muted">{hours.map((h, i) => <span key={i} className="absolute -translate-x-1/2 tabular" style={{ left: `${pos(h.getTime())}%` }}>{String(h.getHours()).padStart(2, '0')}{t('common.h')}</span>)}</div>
          {machines.map((m) => (
            <div key={m.id} className="flex items-center border-t border-slate-100 dark:border-slate-800 h-14"><div className="w-32 shrink-0 text-sm font-medium pr-2 truncate">{m.name}</div>
              <div className="relative flex-1 h-10 rounded bg-slate-50 dark:bg-slate-900/50">
                <div className="absolute inset-y-0 w-px bg-red-500 z-10" style={{ left: `${pos(now)}%` }} title={t('queue.now')} />
                {live.filter((j) => (j.machineId ?? j.suggestedMachineId) === m.id && j.plannedStart && j.plannedEnd).map((j) => { const l = pos(new Date(j.plannedStart!).getTime()); const r = pos(new Date(j.plannedEnd!).getTime()); const on = overnight(j); const proj = !j.machineId; return <div key={j.id} title={`${j.title} · ${dmyHm(j.plannedStart)} → ${dmyHm(j.plannedEnd)}${proj ? ` · ${t('queue.suggested', { machine: m.name })}` : ''}`} className={cn('absolute top-1 bottom-1 rounded px-1.5 text-[11px] leading-8 truncate text-white', j.status === 'imprimiendo' ? 'bg-violet-600' : 'bg-brand-600', on && 'ring-2 ring-amber-400', proj && 'border-2 border-dashed border-white/80 opacity-75')} style={{ left: `${l}%`, width: `${Math.max(1.5, r - l)}%` }}>{on ? '🌙 ' : ''}{j.number} {j.title}</div>; })}
              </div></div>))}
          <p className="text-xs muted mt-3">{t('queue.eachBarRunsFromThe')} {t('queue.projectedBar')}</p>
        </div></div>
      )}
      {finish && <FinishModal job={finish} materials={materials} spools={spools} onClose={() => setFinish(null)} />}
      <Modal open={newJob} onClose={() => setNewJob(false)} title={t('queue.testOrCalibrationJob')}><NewJob machines={machines} materials={materials} onClose={() => setNewJob(false)} /></Modal>
    </div>
  );
}

function FinishModal({ job, materials, spools, onClose }: { job: QJob; materials: QMaterial[]; spools: QSpool[]; onClose: () => void }) {
  const t = useT();
  const { run, pending } = useAction(); const [res, setRes] = useState<'exito' | 'falla_parcial' | 'falla_total'>('exito'); const [g, setG] = useState(String(Math.round(job.estG * 10) / 10)); const [h, setH] = useState(''); const [good, setGood] = useState(Math.floor(job.qty / 2)); const [cause, setCause] = useState(''); const [code, setCode] = useState(''); const [charge, setCharge] = useState<'taller' | 'pedido'>('taller'); const [reprint, setReprint] = useState(true); const [spool, setSpool] = useState(job.spoolId ?? '');
  const sp = spools.filter((x) => x.materialId === job.materialId);
  return (
    <Modal open onClose={onClose} title={t('queue.finish2', { job: job.number })}>
      <div className="space-y-3">
        <div role="radiogroup" aria-label={t('queue.result')} className="grid grid-cols-3 gap-2">{([['exito', t('queue.success')], ['falla_parcial', t('queue.partialFailure')], ['falla_total', t('queue.totalFailure')]] as const).map(([k, l]) => <button key={k} role="radio" aria-checked={res === k} className={cn('btn-ghost', res === k && (k === 'exito' ? '!bg-emerald-600 !text-white !border-emerald-600' : '!bg-red-600 !text-white !border-red-600'))} onClick={() => setRes(k)} data-testid={`res-${k}`}>{l}</button>)}</div>
        <div className="grid grid-cols-2 gap-3"><label className="block"><span className="label">{t('queue.actualGramsUsed')}</span><input type="number" step="0.1" className="input" value={g} onChange={(e) => setG(e.target.value)} data-testid="finish-grams" /></label><label className="block"><span className="label">{t('queue.actualHoursOptional')}</span><input type="number" step="0.01" className="input" value={h} onChange={(e) => setH(e.target.value)} placeholder={t('queue.calculatedSinceTheStart')} data-testid="finish-hours" /></label></div>
        {sp.length > 0 && <label className="block"><span className="label">{t('queue.spoolUsedItsWeightIs')}</span><select className="input" value={spool} onChange={(e) => setSpool(e.target.value)} data-testid="finish-spool"><option value="">{t('queue.chooseAutomatically')}</option>{sp.map((x) => <option key={x.id} value={x.id}>{x.code} · {Math.round(x.remainingG)} g</option>)}</select></label>}
        {res === 'falla_parcial' && <label className="block"><span className="label">{t('queue.goodUnits', { qty: job.qty })}</span><input type="number" min={0} max={job.qty} className="input" value={good} onChange={(e) => setGood(+e.target.value)} /></label>}
        {res !== 'exito' && <><label className="block"><span className="label">{t('queue.failCode')}</span><select className="input" value={code} onChange={(e) => setCode(e.target.value)} data-testid="finish-cause-code"><option value="">{t('queue.failCodeAuto')}</option>{FAIL_CAUSES.map((c) => <option key={c} value={c}>{t(`queue.failCodes.${c}` as MessageKey)}</option>)}</select></label><input className="input" placeholder={t('queue.causeOfTheFailureE')} value={cause} onChange={(e) => setCause(e.target.value)} aria-label={t('queue.cause')} data-testid="finish-cause" /><div className="flex gap-2 text-sm"><span className="muted self-center">{t('queue.whoAbsorbsTheCost')}</span>{(['taller', 'pedido'] as const).map((k) => <button key={k} className={cn('btn-ghost btn-sm', charge === k && '!bg-[var(--panel)] !text-[var(--panel-ink)] dark:!bg-slate-700')} onClick={() => setCharge(k)}>{k === 'taller' ? t('queue.theWorkshop') : t('queue.chargedToTheOrder')}</button>)}</div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reprint} onChange={(e) => setReprint(e.target.checked)} /> {t('queue.createALinkedReprintIn')}</label></>}
        <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button><button className="btn-primary" disabled={pending || (res !== 'exito' && !cause.trim() && !code)} data-testid="finish-confirm" onClick={() => run(() => finishJobAction(job.id, { result: res, realG: g ? +g : undefined, realH: h ? +h : undefined, qtyGood: res === 'falla_parcial' ? good : undefined, failCause: cause || undefined, failCode: res !== 'exito' && code ? code as any : undefined, failCharge: res !== 'exito' ? charge : undefined, reprint, spoolId: spool || undefined }), { ok: res === 'exito' ? t('queue.jobFinishedMaterialDeducted2') : t('queue.failureRecorded2'), onOk: onClose })}>{t('common.confirm')}</button></div>
      </div>
    </Modal>
  );
}

function NewJob({ machines, materials, onClose }: { machines: QMachine[]; materials: QMaterial[]; onClose: () => void }) {
  const t = useT();
  const { run, pending } = useAction(); const [tt, setT] = useState(''); const [m, setM] = useState(''); const [mat, setMat] = useState(materials[0]?.id ?? ''); const [g, setG] = useState(20); const [h, setH] = useState(1);
  return (<div className="space-y-3"><input className="input" placeholder={t('queue.titleEGFlowCalibration')} value={tt} onChange={(e) => setT(e.target.value)} aria-label={t('queue.title')} /><div className="grid grid-cols-2 gap-3"><select className="input" value={m} onChange={(e) => setM(e.target.value)} aria-label={t('common.machine')}><option value="">{t('queue.unassigned')}</option>{machines.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select><select className="input" value={mat} onChange={(e) => setMat(e.target.value)} aria-label={t('common.material')}>{materials.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select><label className="block"><span className="label">{t('queue.grams')}</span><input type="number" className="input" value={g} onChange={(e) => setG(+e.target.value)} /></label><label className="block"><span className="label">{t('common.hours')}</span><input type="number" step="0.1" className="input" value={h} onChange={(e) => setH(+e.target.value)} /></label></div><div className="flex justify-end gap-2"><button className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button><button className="btn-primary" disabled={pending} onClick={() => run(() => createTestJobAction({ title: tt, machineId: m || null, materialId: mat, grams: g, hours: h }), { ok: t('queue.jobCreated2'), onOk: onClose })}>{t('queue.create')}</button></div></div>);
}
