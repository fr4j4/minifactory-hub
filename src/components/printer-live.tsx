'use client';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import type { LiveRow } from '@/lib/bambu/manager';
import type { Tray } from '@/lib/bambu/state';
import { assignTraySpoolAction, printerCommandAction, sendToPrinterAction } from '@/actions/printers';
import { cn, dur, grams, num } from '@/lib/format';
import { ConfirmButton, Modal, useAction } from './client';
import { useLocale, useT } from '@/i18n/client';
import type { MessageKey, TFn } from '@/i18n/translate';
import { LOCALE_TAG } from '@/i18n/config';
import { Icon } from '@/components/shell';

/* ── un solo EventSource compartido por todos los componentes en vivo ─────────────────────────── */
type Feed = { rows: Record<string, LiveRow>; ok: boolean };
let feed: Feed = { rows: {}, ok: false }; let es: EventSource | null = null; const subs = new Set<() => void>(); let closeT: ReturnType<typeof setTimeout> | null = null;
const emit = () => { for (const f of subs) f(); };
function subscribe(cb: () => void) {
  subs.add(cb); if (closeT) { clearTimeout(closeT); closeT = null; }
  if (!es && typeof window !== 'undefined') {
    es = new EventSource('/api/printers/events');
    es.addEventListener('snapshot', (e) => { const list = JSON.parse((e as MessageEvent).data) as LiveRow[]; feed = { rows: Object.fromEntries(list.map((r) => [r.id, r])), ok: true }; emit(); });
    es.addEventListener('update', (e) => { const r = JSON.parse((e as MessageEvent).data) as LiveRow; feed = { rows: { ...feed.rows, [r.id]: r }, ok: true }; emit(); });
    es.onerror = () => { feed = { ...feed, ok: false }; emit(); };
  }
  return () => { subs.delete(cb); if (!subs.size) closeT = setTimeout(() => { es?.close(); es = null; feed = { rows: {}, ok: false }; }, 3000); };
}
export function usePrinters() { return useSyncExternalStore(subscribe, () => feed, () => feed); }
export function usePrinter(id: string, initial?: LiveRow | null) { const f = usePrinters(); return f.rows[id] ?? initial ?? null; }
export function usePrinterByMachine(machineId: string, initial?: LiveRow | null) { const f = usePrinters(); return Object.values(f.rows).find((r) => r.machineId === machineId) ?? initial ?? null; }

const TONE: Record<string, string> = {
  RUNNING: 'text-[var(--accent-ink)] bg-brand-50 border-brand-200 dark:bg-brand-950/60 dark:border-brand-900', PREPARE: 'text-[var(--accent-ink)] bg-brand-50 border-brand-200 dark:bg-brand-950/60 dark:border-brand-900',
  PAUSE: 'text-amber-900 bg-amber-50 border-amber-200 dark:text-amber-200 dark:bg-amber-950/50 dark:border-amber-900', FINISH: 'text-emerald-800 bg-emerald-50 border-emerald-200 dark:text-emerald-200 dark:bg-emerald-950/50 dark:border-emerald-900',
  FAILED: 'text-red-800 bg-red-50 border-red-200 dark:text-red-200 dark:bg-red-950/50 dark:border-red-900', IDLE: 'text-slate-700 bg-slate-100/70 border-slate-200 dark:text-slate-200 dark:bg-slate-800/60 dark:border-slate-700',
  OFFLINE: 'text-slate-600 bg-transparent border-dashed border-slate-300 dark:text-slate-400 dark:border-slate-600',
};
export function PrinterStateBadge({ r }: { r: LiveRow }) {
  const t = useT();
  const st = r.online ? r.status.state : 'OFFLINE';
  return <span className={cn('badge badge-led', TONE[st] ?? TONE.IDLE, (st === 'RUNNING' || st === 'PREPARE') && 'before:animate-pulseDot')} data-testid="printer-state">{r.online ? t(r.status.stateLabel) : t('machines.offline2')}</span>;
}

/** Bobina dibujada con el color del filamento; el anillo muestra lo que queda. */
export function SpoolGlyph({ color, remain, active, size = 44 }: { color: string | null; remain: number | null; active?: boolean; size?: number }) {
  const r = 18, c = 2 * Math.PI * r, p = remain == null ? 1 : Math.max(0, Math.min(100, remain)) / 100;
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden className={cn(active && 'drop-shadow-[0_0_6px_rgba(255,91,31,.6)]')}>
      <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeOpacity=".15" strokeWidth="1.5" />
      <circle cx="24" cy="24" r={r} fill="none" stroke={color ?? 'transparent'} strokeOpacity=".22" strokeWidth="7" />
      {color && <circle cx="24" cy="24" r={r} fill="none" stroke={color} strokeWidth="7" strokeDasharray={`${c * p} ${c}`} transform="rotate(-90 24 24)" strokeLinecap="butt" strokeDashoffset={remain == null ? 0 : 0} style={remain == null ? { strokeDasharray: '3 3' } : undefined} />}
      <circle cx="24" cy="24" r="8.5" fill="var(--card)" stroke="currentColor" strokeOpacity=".25" />
      <circle cx="24" cy="24" r="2.5" fill="currentColor" fillOpacity=".35" />
      {!color && <path d="M14 34 34 14" stroke="currentColor" strokeOpacity=".35" strokeWidth="1.5" />}
    </svg>
  );
}

/** Estado compacto: para el inicio, la cola y la lista de máquinas. */
export function PrinterPill({ machineId, initial, dark }: { machineId: string; initial?: LiveRow | null; dark?: boolean }) {
  const t = useT();
  const r = usePrinterByMachine(machineId, initial); if (!r) return null; const s = r.status; const live = r.online && (s.state === 'RUNNING' || s.state === 'PAUSE' || s.state === 'PREPARE');
  return (
    <span className={cn('inline-flex items-center gap-2 font-mono text-[11px]', dark ? 'text-white/75' : 'muted')} data-testid="printer-pill">
      <span className={cn('h-1.5 w-1.5 rounded-full', r.online ? (live ? 'bg-[var(--accent)] animate-pulseDot' : 'bg-emerald-500') : 'bg-slate-400')} aria-hidden />
      {r.online ? (live ? `${num(s.progress ?? 0, 0)}% · ${t('machines.layerOf', { layer: s.layer ?? 0, total: s.totalLayers ?? '?' })} · ${s.remainingMin != null ? dur(s.remainingMin * 60) : '—'}` : t(s.stateLabel)) : t('machines.offline')}
    </span>
  );
}

function Temp({ label, t: tt, target }: { label: string; t: number | null; target?: number | null }) {
  const t = useT();
  const hot = target != null && target > 0;
  return <div className="rounded-xl border border-[var(--line)] p-2.5"><div className="eyebrow !text-[10px]">{label}</div><div className="num text-lg leading-tight mt-1">{tt != null ? num(tt, 0) : '—'}<span className="text-xs muted">°C</span>{hot && <span className="text-xs text-[var(--accent-ink)] ml-1">→ {num(target!, 0)}°</span>}</div></div>;
}

export function CameraView({ id, kind, offline }: { id: string; kind: string; offline: boolean }) {
  const t = useT();
  const [mode, setMode] = useState<'foto' | 'vivo'>('foto'); const [n, setN] = useState(0); const [err, setErr] = useState<string | null>(null); const [loaded, setLoaded] = useState(false);
  const cloud = kind === 'cloud';
  useEffect(() => { if (mode !== 'foto' || offline || err) return; const tt = setInterval(() => setN((x) => x + 1), cloud ? 60_000 : 5000); return () => clearInterval(tt); }, [mode, offline, err, cloud]);
  const src = mode === 'vivo' ? `/api/printers/${id}/camera?stream=1` : `/api/printers/${id}/camera?t=${n}`;
  const retry = () => { setErr(null); setLoaded(false); setN((x) => x + 1); };
  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#0d0c0b] aspect-[4/3] border border-[var(--line)]" data-testid="camera">
      {kind === 'none' ? <p className="absolute inset-0 grid place-items-center text-sm text-white/60 p-4 text-center">{t('machines.thisModelHasNoCamera')}</p>
        : offline ? <p className="absolute inset-0 grid place-items-center text-sm text-white/60 p-4 text-center">{t('machines.thePrinterIsDisconnected')}</p>
        : err ? <div className="absolute inset-0 grid place-items-center p-5 text-center"><div><p className="text-sm text-white/80 max-w-xs" data-testid="camera-error">{err}</p><button className="btn-ghost btn-sm mt-3 !bg-transparent !text-white !border-white/30" onClick={retry}>{t('machines.retry')}</button></div></div>
        : <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={mode} src={src} alt={cloud ? t('machines.previewOfTheJobS') : t('machines.printerCamera')} className={cn('h-full w-full transition-opacity', cloud ? 'object-contain p-6' : 'object-cover', loaded ? 'opacity-100' : 'opacity-0')} onLoad={() => setLoaded(true)}
            onError={async () => { try { const r = await fetch(`/api/printers/${id}/camera?t=e${n}`); setErr(r.ok ? t('machines.theCameraDisconnected2') : await r.text()); } catch { setErr(t('machines.couldNotOpenTheCamera2')); } }} />
          {!loaded && <div className="absolute inset-0 grid place-items-center"><span className="font-mono text-[11px] uppercase tracking-[.14em] text-white/60 animate-pulseDot">{cloud ? t('machines.loadingPreview') : t('machines.connectingCamera')}</span></div>}
          {cloud && loaded && <div className="absolute inset-x-0 bottom-0 bg-black/55 backdrop-blur px-3 py-2 text-[11px] text-white/80" data-testid="cloud-cover-note">{t('machines.platePreviewBambuCloudDoes')}</div>}
        </>}
      {kind !== 'none' && !cloud && !offline && <div className="absolute top-2 right-2 flex rounded-full bg-black/55 backdrop-blur p-0.5 text-[11px]" role="radiogroup" aria-label={t('machines.cameraMode')}>
        {(['foto', 'vivo'] as const).map((m) => <button key={m} role="radio" aria-checked={mode === m} onClick={() => { setMode(m); setErr(null); setLoaded(false); }} className={cn('px-2.5 min-h-[28px] rounded-full capitalize', mode === m ? 'bg-white text-[#17161a]' : 'text-white/80')} data-testid={`cam-${m}`}>{m === 'vivo' ? t('machines.live') : t('machines.photo')}</button>)}
      </div>}
    </div>
  );
}

export interface SpoolOpt { id: string; code: string; type: string; colorName: string; hex: string; remainingG: number; slot: string | null; machineId: string | null }
export interface RunOpt { id: string; label: string | null; timeS: number | null; grams: number; createdAt: string; machine: string | null }

/** Texto de la etapa de impresión que informa la impresora. */
const stageText = (t: TFn, stage: string | null) => (stage == null ? '' : stage.startsWith('stage:') ? t('machines.stageUnknown', { n: stage.slice(6) }) : t(stage as MessageKey));
const slotLabel = (tt: Tray, t: TFn) => (tt.ams === 255 ? t('machines.external') : `AMS ${tt.ams + 1}·${tt.index + 1}`);
function hexDist(a: string, b: string) { const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const [x, y] = [p(a), p(b)]; return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); }

function TrayCard({ t: tt, linkId, spools, machineId, canAssign }: { t: Tray; linkId: string; spools: SpoolOpt[]; machineId: string; canAssign: boolean }) {
  const t = useT();
  const { run, pending } = useAction(); const label = slotLabel(tt, t);
  const assigned = spools.find((s) => s.machineId === machineId && s.slot === label);
  const matches = useMemo(() => tt.empty ? [] : spools.filter((s) => s.type.toUpperCase() === (tt.type ?? '').toUpperCase()).sort((a, b) => (tt.color ? hexDist(a.hex, tt.color) - hexDist(b.hex, tt.color) : 0)), [spools, tt]);
  return (
    <li className={cn('rounded-2xl border p-3 flex gap-3 items-start transition-colors', tt.active ? 'border-[var(--accent)] bg-brand-50/40 dark:bg-brand-950/30' : 'border-[var(--line)]')} data-testid="ams-tray">
      <span className="text-slate-500 shrink-0"><SpoolGlyph color={tt.empty ? null : tt.color} remain={tt.remain} active={tt.active} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2"><span className="eyebrow !text-[10px]">{label}</span>{tt.active && <span className="font-mono text-[10px] uppercase tracking-[.1em] text-[var(--accent-ink)]">{t('machines.inUse')}</span>}</div>
        {tt.empty ? <div className="text-sm muted mt-0.5">{t('machines.empty')}</div> : <>
          <div className="text-sm font-medium truncate mt-0.5">{tt.type}{tt.brand && tt.brand !== tt.type ? <span className="muted font-normal"> · {tt.brand}</span> : null}</div>
          <div className="num text-xs muted">{tt.remain != null ? `${t('machines.remainingPct', { pct: num(tt.remain, 0) })}` : t('machines.remainingUnknown')}{tt.color ? ` · ${tt.color.toUpperCase()}` : ''}</div>
          {canAssign ? <select className="input !min-h-[34px] !py-1 !text-xs mt-2" aria-label={t('machines.inventorySpoolIn', { label })} value={assigned?.id ?? ''} disabled={pending} data-testid="tray-spool"
            onChange={(e) => run(() => assignTraySpoolAction(linkId, label, e.target.value || null), { ok: e.target.value ? t('machines.spoolLinkedToTheTray2') : t('machines.trayWithoutAnInventorySpool2') })}>
            <option value="">{t('machines.linkAnInventorySpool')}</option>
            {matches.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.type} {s.colorName} · {grams(s.remainingG)}</option>)}
            {assigned && !matches.some((m) => m.id === assigned.id) && <option value={assigned.id}>{assigned.code}</option>}
          </select> : assigned && <div className="text-xs mt-1">{t('machines.inventory')} <b>{assigned.code}</b></div>}
          {!canAssign || matches.length ? null : <div className="text-[11px] muted mt-1">{t('machines.noSpoolsOfType', { type: tt.type })}</div>}
        </>}
      </div>
    </li>
  );
}

function SendDialog({ r, runs, jobs, open, onClose }: { r: LiveRow; runs: RunOpt[]; jobs: Array<{ id: string; label: string }>; open: boolean; onClose: () => void }) {
  const t = useT();
  const { run, pending } = useAction(); const trays = r.status.ams.flatMap((u) => u.trays).filter((tt) => !tt.empty);
  const [runId, setRunId] = useState(runs[0]?.id ?? ''); const [useAms, setUseAms] = useState(trays.length > 0); const [slot, setSlot] = useState(trays.find((tt) => tt.active)?.slot ?? trays[0]?.slot ?? '0');
  const [timelapse, setTimelapse] = useState(false); const [level, setLevel] = useState(true); const [jobId, setJobId] = useState('');
  return (
    <Modal open={open} onClose={onClose} title={t('machines.sendTo', { name: r.name })}>
      <div className="space-y-3">
        {runs.length === 0 ? <p className="text-sm muted">{t('machines.thereAreNoSlicedFiles')}</p> : <>
          <label className="block"><span className="label">{t('machines.slicedFile3mf')}</span><select className="input" value={runId} onChange={(e) => setRunId(e.target.value)} data-testid="send-run">{runs.map((x) => <option key={x.id} value={x.id}>{x.label ?? t('machines.slice')} · {x.timeS ? dur(x.timeS) : '—'} · {grams(x.grams)}{x.machine ? ` · ${x.machine}` : ''}</option>)}</select></label>
          {trays.length > 0 && <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={useAms} onChange={(e) => setUseAms(e.target.checked)} /> {t('machines.useTheAms')}</label>
            {useAms && <select className="input" aria-label={t('machines.amsTray')} value={slot} onChange={(e) => setSlot(e.target.value)} data-testid="send-slot">{trays.map((tt) => <option key={tt.slot} value={tt.slot}>{slotLabel(tt, t)} · {tt.type}{tt.remain != null ? ` · ${tt.remain}%` : ''}</option>)}</select>}
          </div>}
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={level} onChange={(e) => setLevel(e.target.checked)} /> {t('machines.levelTheBed')}</label><label className="flex items-center gap-2"><input type="checkbox" checked={timelapse} onChange={(e) => setTimelapse(e.target.checked)} /> {t('machines.timelapse')}</label></div>
          {jobs.length > 0 && <label className="block"><span className="label">{t('machines.alsoStartTheQueueJob')}</span><select className="input" value={jobId} onChange={(e) => setJobId(e.target.value)} data-testid="send-job"><option value="">{t('common.none')}</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}</select></label>}
          <p className="text-xs muted">{t('machines.beforeSendingItChecksThat')}</p>
        </>}
        <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary" disabled={pending || !runId} data-testid="send-confirm" onClick={() => run(() => sendToPrinterAction({ linkId: r.id, runId, useAms, amsSlot: Number(slot), timelapse, bedLeveling: level, jobId: jobId || null }), { ok: t('machines.fileSentThePrinterIs2'), onOk: onClose })}>{pending ? t('machines.sending') : t('machines.print')}</button></div>
      </div>
    </Modal>
  );
}

/** Panel completo de una impresora conectada (ficha de la máquina). */
export function PrinterPanel({ initial, cameraKind, canControl, canAssign, canSend, spools, runs, jobs }: { initial: LiveRow; cameraKind: string; canControl: boolean; canAssign: boolean; canSend: boolean; spools: SpoolOpt[]; runs: RunOpt[]; jobs: Array<{ id: string; label: string }> }) {
  const t = useT(); const locale = useLocale();
  const r = usePrinter(initial.id, initial)!; const s = r.status; const { run, pending } = useAction(); const [send, setSend] = useState(false);
  // el estado de la máquina (encabezado, cola) lo cambia el servidor al recibir la transición: se refresca la página
  const router = useRouter(); const prevState = useRef(s.state);
  useEffect(() => { if (prevState.current !== s.state) { prevState.current = s.state; const tt = setTimeout(() => router.refresh(), 600); return () => clearTimeout(tt); } }, [s.state, router]);
  const cloud = r.mode === 'cloud'; canControl = canControl && !cloud; canSend = canSend && !cloud;
  const busy = s.state === 'RUNNING' || s.state === 'PAUSE' || s.state === 'PREPARE'; const cmd = (c: Parameters<typeof printerCommandAction>[1], arg?: number, ok?: string) => run(() => printerCommandAction(r.id, c, arg), { ok, refresh: false });
  // la bobina externa solo se muestra si tiene filamento o si no hay AMS
  const trays = [...s.ams.flatMap((u) => u.trays), ...(s.external && (!s.external.empty || !s.ams.length) ? [s.external] : [])];
  const p = Math.max(0, Math.min(100, s.progress ?? 0));
  return (
    <section className="card overflow-hidden" data-testid="printer-panel">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5 pb-3 border-b border-[var(--line)]">
        <div className="flex items-center gap-2.5 min-w-0"><span className="h-3 w-[3px] rounded-full bg-[var(--accent)]" aria-hidden /><h2 className="text-[13px] font-semibold tracking-tight truncate">{t('machines.live2')} {r.modelName ? t('machines.bambuLab', { model: r.modelName }) : t('common.bambuLab')}</h2><PrinterStateBadge r={r} />{cloud && <span className="font-mono text-[10px] uppercase tracking-[.1em] rounded-full border border-sky-300 dark:border-sky-800 text-sky-800 dark:text-sky-300 px-2 py-0.5" data-testid="mode-cloud"><Icon name="cloud" className="inline h-3 w-3 mr-1 -mt-px" />{t('machines.cloudReadOnly')}</span>}</div>
        <div className="flex items-center gap-1.5">
          {canSend && <button className="btn-primary btn-sm" disabled={!r.online || busy} onClick={() => setSend(true)} data-testid="send-open">{t('machines.sendToPrint')}</button>}
          {canControl && busy && (s.state === 'PAUSE' ? <button className="btn-ghost btn-sm" disabled={pending} onClick={() => cmd('resume', undefined, t('machines.resuming2'))} data-testid="cmd-resume"><Icon name="play" className="h-4 w-4" />{t('machines.resume')}</button> : <button className="btn-ghost btn-sm" disabled={pending} onClick={() => cmd('pause', undefined, t('machines.pauseSent2'))} data-testid="cmd-pause"><Icon name="pause" className="h-4 w-4" />{t('machines.pause')}</button>)}
          {canControl && busy && <ConfirmButton className="btn-ghost btn-sm text-danger" message={t('machines.stopThePrintItCannot')} onConfirm={() => cmd('stop', undefined, t('machines.printStopped2'))}><Icon name="stop" className="h-4 w-4" />{t('machines.stop')}</ConfirmButton>}
        </div>
      </header>
      {cloud && <p className="mx-4 mt-3 text-xs muted" data-testid="cloud-readonly">{t('machines.connectedThroughBambuCloudYou')}</p>}
      {!r.online && r.error && <div role="alert" className="mx-4 mt-3 rounded-xl box-warn p-3 text-sm" data-testid="printer-error">{r.error}</div>}
      <div className="grid gap-4 p-4 lg:grid-cols-[1.15fr_1fr]">
        <CameraView id={r.id} kind={cameraKind} offline={!r.online} />
        <div className="space-y-3 min-w-0">
          <div>
            <div className="flex items-end justify-between gap-3"><div className="min-w-0"><div className="eyebrow !text-[10px]">{busy ? t('machines.printing') : t('machines.lastJob')}</div><div className="font-medium truncate" data-testid="printer-task">{s.task ?? s.file ?? '—'}</div></div><div className="num text-4xl leading-none" data-testid="printer-progress">{num(p, 0)}<span className="text-lg muted">%</span></div></div>
            <div className="mt-2.5 relative h-3 rounded-[3px] overflow-hidden text-slate-200 dark:text-slate-800" role="progressbar" aria-label={t('machines.printProgress')} aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}><div className="absolute inset-0 layers" /><div className="absolute inset-y-0 left-0 layers text-[var(--accent)] transition-[width] duration-700" style={{ width: `${p}%` }} /></div>
            <div className="flex justify-between mt-1.5 num text-xs muted"><span>{t('machines.layerOf', { layer: s.layer ?? 0, total: s.totalLayers ?? '—' })}</span><span>{s.remainingMin != null && busy ? t('machines.remaining', { time: dur(s.remainingMin * 60) }) : stageText(t, s.stage)}</span></div>
            {busy && s.stage && <div className="text-xs mt-1 text-[var(--accent-ink)]">{stageText(t, s.stage)}</div>}
          </div>
          <div className="grid grid-cols-3 gap-2"><Temp label={t('machines.nozzle')} t={s.nozzle.temp} target={s.nozzle.target} /><Temp label={t('machines.bed')} t={s.bed.temp} target={s.bed.target} /><Temp label={t('machines.camera')} t={s.chamber} /></div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {canControl ? <label className="flex items-center gap-2"><span className="eyebrow !text-[10px]">{t('machines.speed')}</span><select className="input !w-auto !min-h-[34px] !py-1" value={s.speed.level ?? 2} disabled={!r.online || pending} onChange={(e) => cmd('speed', Number(e.target.value), t('machines.speedChanged2'))} data-testid="cmd-speed"><option value={1}>{t('machines.silent')}</option><option value={2}>{t('machines.standard')}</option><option value={3}>{t('machines.sport')}</option><option value={4}>{t('machines.ludicrous')}</option></select></label> : <span className="muted">{t('machines.speed2')} {s.speed.label ? t(s.speed.label) : '—'}</span>}
            {canControl && <button className="btn-ghost btn-sm" disabled={!r.online || pending} onClick={() => cmd(s.light === 'on' ? 'light_off' : 'light_on')} aria-pressed={s.light === 'on'} data-testid="cmd-light"><Icon name="light" className="h-4 w-4" />{t('machines.light')} {s.light === 'on' ? t('machines.lightOn') : t('machines.lightOff')}</button>}
            <span className="num text-xs muted ml-auto">{t('machines.fansLine', { part: s.fans.part ?? 0, aux: s.fans.aux ?? 0 })} · {s.wifi ?? ''}</span>
          </div>
          {(s.hms.length > 0 || s.errorCode) && <ul className="space-y-1.5" data-testid="printer-hms">
            {s.errorCode && <li className="rounded-xl border-l-[3px] border-red-500 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm">{t('machines.printError')} <span className="num">{s.errorCode}</span></li>}
            {s.hms.map((h) => <li key={h.code} className={cn('rounded-xl border-l-[3px] px-3 py-2 text-sm flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/40', h.severity === 'fatal' || h.severity === 'serio' ? 'border-red-500' : 'border-amber-500')}><span>HMS <span className="num">{h.code}</span> · {t(`machines.severity.${h.severity === 'común' ? 'comun' : h.severity}` as 'machines.severity.fatal')}</span><a className="text-xs underline" href={h.url} target="_blank" rel="noopener noreferrer">{t('machines.whatDoesItMean')}</a></li>)}
          </ul>}
        </div>
      </div>
      <div className="px-4 pb-4">
        <div className="eyebrow mb-2">{t('machines.loadedFilament')}{s.ams.length ? ` · ${t('machines.amsHumidity', { values: s.ams.map((u) => u.humidity ?? '—').join(', ') })}` : ''}</div>
        {trays.length === 0 ? <p className="text-sm muted">{t('machines.thePrinterDidNotReport')}</p> : <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{trays.map((tt) => <TrayCard key={tt.slot} t={tt} linkId={r.id} spools={spools} machineId={r.machineId} canAssign={canAssign} />)}</ul>}
      </div>
      <footer className="px-4 py-2.5 border-t border-[var(--line)] flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-[.1em] muted"><span>{t('machines.firmware')} {s.firmware ?? '—'}</span><span>{t('machines.nozzle')} {s.nozzle.diameter ?? '—'} mm</span><span>{t('machines.updated')} {new Date(s.updatedAt).toLocaleTimeString(LOCALE_TAG[locale])}</span></footer>
      {send && <SendDialog r={r} runs={runs} jobs={jobs} open={send} onClose={() => setSend(false)} />}
    </section>
  );
}
