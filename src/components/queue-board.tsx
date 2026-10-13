'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { cancelJobAction, createTestJobAction, finishJobAction, moveJobAction, pauseJobAction, resumeJobAction, startJobAction } from '@/actions/production';
import { Modal, useAction } from './client';
import { Badge, StatusBadge, Swatch } from './ui';
import { PrinterPill } from './printer-live';
import { cn, dmyHm, dur, grams } from '@/lib/format';
import { useT } from '@/i18n/client';
import { tOr } from '@/i18n/translate';

export interface QJob { id: string; number: string; title: string; kind: string; status: string; machineId: string | null; materialId: string | null; spoolId: string | null; estG: number; estH: number; realG: number | null; plannedStart: string | null; plannedEnd: string | null; realStart: string | null; qty: number; orderId: string | null; orderNumber: string | null; reprint: boolean; position: number; customer: string | null }
export interface QMachine { id: string; name: string; status: string; tech: string }
export interface QMaterial { id: string; label: string; hex: string }
export interface QSpool { id: string; code: string; materialId: string; remainingG: number }


export function QueueBoard({ jobs, machines, materials, spools, canEdit, canCreate, workStart, workEnd, nowIso }: { jobs: QJob[]; machines: QMachine[]; materials: QMaterial[]; spools: QSpool[]; canEdit: boolean; canCreate: boolean; workStart: number; workEnd: number; nowIso: string }) {
  const t = useT();
  const { run, pending } = useAction(); const [view, setView] = useState<'tablero' | 'gantt'>('tablero'); const [finish, setFinish] = useState<QJob | null>(null); const [newJob, setNewJob] = useState(false); const [drag, setDrag] = useState<string | null>(null);
  const live = jobs.filter((j) => ['en_cola', 'imprimiendo', 'pausado'].includes(j.status));
  const cols = [{ id: null as string | null, name: t('queue.noMachine') }, ...machines.map((m) => ({ id: m.id as string | null, name: m.name }))];
  const matOf = (id: string | null) => materials.find((m) => m.id === id);
  const overnight = (j: QJob) => { if (!j.plannedEnd) return false; const h = new Date(j.plannedEnd).getHours(); return h >= workEnd || h < workStart; };
  const now = new Date(nowIso).getTime();
  const drop = (machineId: string | null, pos: number) => { if (!drag || !machineId) return; const id = drag; setDrag(null); run(() => moveJobAction(id, machineId, pos), { ok: t('queue.jobMoved') }); };
  const Card = ({ j }: { j: QJob }) => {
    const m = matOf(j.materialId); const el = j.realStart ? (now - new Date(j.realStart).getTime()) / 3600_000 : 0; const p = j.status === 'imprimiendo' && j.estH > 0 ? Math.min(99, (el / j.estH) * 100) : 0;
    return (
      <li draggable={canEdit && j.status !== 'imprimiendo'} onDragStart={() => setDrag(j.id)} onDragEnd={() => setDrag(null)} className={cn('rounded-lg border bg-[var(--card)] p-2.5 text-sm', j.status === 'imprimiendo' ? 'border-violet-400' : 'border-slate-200 dark:border-slate-700', canEdit && j.status !== 'imprimiendo' && 'cursor-grab')} data-testid="job-card">
        <div className="flex items-start justify-between gap-2"><div className="font-medium leading-snug">{j.title}</div><StatusBadge status={j.status} /></div>
        <div className="text-xs muted mt-1 flex flex-wrap gap-x-2 gap-y-0.5"><span>{j.number}</span><Badge>{tOr(t, `queue.kind.${j.kind}`, j.kind)}</Badge>{j.reprint && <Badge tone="amber">{t('queue.reprint')}</Badge>}{j.orderId && <Link className="underline" href={`/pedidos/${j.orderId}`}>{j.orderNumber}</Link>}</div>
        <div className="text-xs tabular mt-1.5 flex items-center gap-2">{m && <span><Swatch hex={m.hex} /> {m.label}</span>}<span>{grams(j.estG)}</span><span>{dur(j.estH * 3600)}</span></div>
        {j.status === 'imprimiendo' && <div className="mt-2"><div className="h-1.5 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden"><div className="h-full bg-violet-500" style={{ width: `${p}%` }} /></div><div className="text-xs muted mt-0.5">{Math.round(p)}% · {t('queue.endsAt', { date: dmyHm(j.plannedEnd) })}</div></div>}
        {j.status === 'en_cola' && j.plannedEnd && <div className={cn('text-xs mt-1', overnight(j) ? 'text-amber-700 dark:text-amber-300 font-medium' : 'muted')}>{overnight(j) ? t('queue.willFinishOutsideWorkingHours') : t('queue.ends')}{dmyHm(j.plannedEnd)}</div>}
        {canEdit && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {j.status === 'en_cola' && <button className="btn-primary btn-sm" disabled={pending || !j.machineId} onClick={() => run(() => startJobAction(j.id), { ok: t('queue.jobStarted2') })} data-testid="job-start">{t('queue.start')}</button>}
            {j.status === 'imprimiendo' && <><button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => pauseJobAction(j.id))}>{t('queue.pause')}</button><button className="btn-primary btn-sm" onClick={() => setFinish(j)} data-testid="job-finish">{t('queue.finish')}</button></>}
            {j.status === 'pausado' && <><button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => resumeJobAction(j.id))}>{t('queue.resume')}</button><button className="btn-ghost btn-sm" onClick={() => setFinish(j)}>{t('queue.finish')}</button></>}
            {j.status === 'en_cola' && <select className="input !min-h-[32px] !py-0.5 !w-auto text-xs" aria-label={t('queue.moveToAnotherMachine', { job: j.number })} value={j.machineId ?? ''} onChange={(e) => e.target.value && run(() => moveJobAction(j.id, e.target.value, 999), { ok: t('queue.jobMoved3') })}><option value="">{t('queue.assign')}</option>{machines.map((mm) => <option key={mm.id} value={mm.id}>{mm.name}</option>)}</select>}
            {j.status !== 'imprimiendo' && <button className="btn-ghost btn-sm text-red-600 dark:text-red-400" disabled={pending} onClick={() => run(() => cancelJobAction(j.id), { ok: t('queue.jobCancelled2') })} aria-label={t('queue.cancel', { job: j.number })}>✕</button>}
          </div>)}
      </li>
    );
  };
  // Gantt: próximas 36 h
  const t0 = now - 2 * 3600_000; const span = 38 * 3600_000; const hours = Array.from({ length: 19 }, (_, i) => new Date(t0 + i * 2 * 3600_000));
  const pos = (tt: number) => Math.max(0, Math.min(100, ((tt - t0) / span) * 100));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-600 overflow-hidden" role="tablist">{(['tablero', 'gantt'] as const).map((v) => <button key={v} role="tab" aria-selected={view === v} className={cn('px-4 min-h-[44px] md:min-h-[36px] text-sm', view === v ? 'bg-[var(--panel)] text-[var(--panel-ink)] dark:bg-slate-700' : 'hover:bg-slate-100 dark:hover:bg-slate-800')} onClick={() => setView(v)} data-testid={`view-${v}`}>{v === 'tablero' ? t('queue.boardByMachine') : t('queue.calendarGantt')}</button>)}</div>
        {canCreate && <button className="btn-ghost ml-auto" onClick={() => setNewJob(true)} data-testid="new-job">{t('queue.testJob')}</button>}
      </div>
      {view === 'tablero' ? (
        <div className="flex md:grid gap-3 overflow-x-auto pb-2 snap-x md:overflow-visible" style={{ gridTemplateColumns: `repeat(${Math.min(cols.length, 4)}, minmax(0, 1fr))` }} data-testid="board">
          {cols.map((c) => { const list = live.filter((j) => (j.machineId ?? null) === c.id).sort((a, b) => a.position - b.position); if (c.id === null && list.length === 0) return null; const mach = machines.find((m) => m.id === c.id);
            return (
              <section key={c.id ?? 'none'} className={cn('rounded-xl bg-slate-100/70 dark:bg-slate-900/50 p-2.5 min-w-[270px] md:min-w-0 snap-start', drag && c.id && 'ring-2 ring-brand-400/50')} onDragOver={(e) => c.id && e.preventDefault()} onDrop={() => drop(c.id, list.length + 1)} aria-label={t('queue.queue', { machine: c.name })}>
                <header className="px-1 pb-2"><div className="flex items-center justify-between"><h3 className="font-semibold text-sm">{c.name}</h3>{mach && <StatusBadge status={mach.status} />}</div>{c.id && <div className="mt-1 empty:hidden"><PrinterPill machineId={c.id} /></div>}</header>
                <ul className="space-y-2 min-h-[60px]">{list.map((j) => <Card key={j.id} j={j} />)}{list.length === 0 && <li className="text-xs muted text-center py-4">{t('queue.noJobsDragOneHere')}</li>}</ul>
              </section>); })}
        </div>
      ) : (
        <div className="card overflow-x-auto" data-testid="gantt"><div className="min-w-[760px] p-3">
          <div className="relative h-6 ml-32 text-[11px] muted">{hours.map((h, i) => <span key={i} className="absolute -translate-x-1/2 tabular" style={{ left: `${pos(h.getTime())}%` }}>{String(h.getHours()).padStart(2, '0')}{t('common.h')}</span>)}</div>
          {machines.map((m) => (
            <div key={m.id} className="flex items-center border-t border-slate-100 dark:border-slate-800 h-14"><div className="w-32 shrink-0 text-sm font-medium pr-2 truncate">{m.name}</div>
              <div className="relative flex-1 h-10 rounded bg-slate-50 dark:bg-slate-900/50">
                <div className="absolute inset-y-0 w-px bg-red-500 z-10" style={{ left: `${pos(now)}%` }} title={t('queue.now')} />
                {live.filter((j) => j.machineId === m.id && j.plannedStart && j.plannedEnd).map((j) => { const l = pos(new Date(j.plannedStart!).getTime()); const r = pos(new Date(j.plannedEnd!).getTime()); const on = overnight(j); return <div key={j.id} title={`${j.title} · ${dmyHm(j.plannedStart)} → ${dmyHm(j.plannedEnd)}`} className={cn('absolute top-1 bottom-1 rounded px-1.5 text-[11px] leading-8 truncate text-white', j.status === 'imprimiendo' ? 'bg-violet-600' : 'bg-brand-600', on && 'ring-2 ring-amber-400')} style={{ left: `${l}%`, width: `${Math.max(1.5, r - l)}%` }}>{on ? '🌙 ' : ''}{j.number} {j.title}</div>; })}
              </div></div>))}
          <p className="text-xs muted mt-3">{t('queue.eachBarRunsFromThe')}</p>
        </div></div>
      )}
      {finish && <FinishModal job={finish} materials={materials} spools={spools} onClose={() => setFinish(null)} />}
      <Modal open={newJob} onClose={() => setNewJob(false)} title={t('queue.testOrCalibrationJob')}><NewJob machines={machines} materials={materials} onClose={() => setNewJob(false)} /></Modal>
    </div>
  );
}

function FinishModal({ job, materials, spools, onClose }: { job: QJob; materials: QMaterial[]; spools: QSpool[]; onClose: () => void }) {
  const t = useT();
  const { run, pending } = useAction(); const [res, setRes] = useState<'exito' | 'falla_parcial' | 'falla_total'>('exito'); const [g, setG] = useState(String(Math.round(job.estG * 10) / 10)); const [h, setH] = useState(''); const [good, setGood] = useState(Math.floor(job.qty / 2)); const [cause, setCause] = useState(''); const [charge, setCharge] = useState<'taller' | 'pedido'>('taller'); const [reprint, setReprint] = useState(true); const [spool, setSpool] = useState(job.spoolId ?? '');
  const sp = spools.filter((x) => x.materialId === job.materialId);
  return (
    <Modal open onClose={onClose} title={t('queue.finish2', { job: job.number })}>
      <div className="space-y-3">
        <div role="radiogroup" aria-label={t('queue.result')} className="grid grid-cols-3 gap-2">{([['exito', t('queue.success')], ['falla_parcial', t('queue.partialFailure')], ['falla_total', t('queue.totalFailure')]] as const).map(([k, l]) => <button key={k} role="radio" aria-checked={res === k} className={cn('btn-ghost', res === k && (k === 'exito' ? '!bg-emerald-600 !text-white !border-emerald-600' : '!bg-red-600 !text-white !border-red-600'))} onClick={() => setRes(k)} data-testid={`res-${k}`}>{l}</button>)}</div>
        <div className="grid grid-cols-2 gap-3"><label className="block"><span className="label">{t('queue.actualGramsUsed')}</span><input type="number" step="0.1" className="input" value={g} onChange={(e) => setG(e.target.value)} data-testid="finish-grams" /></label><label className="block"><span className="label">{t('queue.actualHoursOptional')}</span><input type="number" step="0.01" className="input" value={h} onChange={(e) => setH(e.target.value)} placeholder={t('queue.calculatedSinceTheStart')} data-testid="finish-hours" /></label></div>
        {sp.length > 0 && <label className="block"><span className="label">{t('queue.spoolUsedItsWeightIs')}</span><select className="input" value={spool} onChange={(e) => setSpool(e.target.value)} data-testid="finish-spool"><option value="">{t('queue.chooseAutomatically')}</option>{sp.map((x) => <option key={x.id} value={x.id}>{x.code} · {Math.round(x.remainingG)} g</option>)}</select></label>}
        {res === 'falla_parcial' && <label className="block"><span className="label">{t('queue.goodUnits', { qty: job.qty })}</span><input type="number" min={0} max={job.qty} className="input" value={good} onChange={(e) => setGood(+e.target.value)} /></label>}
        {res !== 'exito' && <><input className="input" placeholder={t('queue.causeOfTheFailureE')} value={cause} onChange={(e) => setCause(e.target.value)} aria-label={t('queue.cause')} data-testid="finish-cause" /><div className="flex gap-2 text-sm"><span className="muted self-center">{t('queue.whoAbsorbsTheCost')}</span>{(['taller', 'pedido'] as const).map((k) => <button key={k} className={cn('btn-ghost btn-sm', charge === k && '!bg-[var(--panel)] !text-[var(--panel-ink)] dark:!bg-slate-700')} onClick={() => setCharge(k)}>{k === 'taller' ? t('queue.theWorkshop') : t('queue.chargedToTheOrder')}</button>)}</div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reprint} onChange={(e) => setReprint(e.target.checked)} /> {t('queue.createALinkedReprintIn')}</label></>}
        <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button><button className="btn-primary" disabled={pending || (res !== 'exito' && !cause.trim())} data-testid="finish-confirm" onClick={() => run(() => finishJobAction(job.id, { result: res, realG: g ? +g : undefined, realH: h ? +h : undefined, qtyGood: res === 'falla_parcial' ? good : undefined, failCause: cause || undefined, failCharge: res !== 'exito' ? charge : undefined, reprint, spoolId: spool || undefined }), { ok: res === 'exito' ? t('queue.jobFinishedMaterialDeducted2') : t('queue.failureRecorded2'), onOk: onClose })}>{t('common.confirm')}</button></div>
      </div>
    </Modal>
  );
}

function NewJob({ machines, materials, onClose }: { machines: QMachine[]; materials: QMaterial[]; onClose: () => void }) {
  const t = useT();
  const { run, pending } = useAction(); const [tt, setT] = useState(''); const [m, setM] = useState(machines[0]?.id ?? ''); const [mat, setMat] = useState(materials[0]?.id ?? ''); const [g, setG] = useState(20); const [h, setH] = useState(1);
  return (<div className="space-y-3"><input className="input" placeholder={t('queue.titleEGFlowCalibration')} value={tt} onChange={(e) => setT(e.target.value)} aria-label={t('queue.title')} /><div className="grid grid-cols-2 gap-3"><select className="input" value={m} onChange={(e) => setM(e.target.value)} aria-label={t('common.machine')}>{machines.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select><select className="input" value={mat} onChange={(e) => setMat(e.target.value)} aria-label={t('common.material')}>{materials.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select><label className="block"><span className="label">{t('queue.grams')}</span><input type="number" className="input" value={g} onChange={(e) => setG(+e.target.value)} /></label><label className="block"><span className="label">{t('common.hours')}</span><input type="number" step="0.1" className="input" value={h} onChange={(e) => setH(+e.target.value)} /></label></div><div className="flex justify-end gap-2"><button className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button><button className="btn-primary" disabled={pending} onClick={() => run(() => createTestJobAction({ title: tt, machineId: m, materialId: mat, grams: g, hours: h }), { ok: t('queue.jobCreated2'), onOk: onClose })}>{t('queue.create')}</button></div></div>);
}
