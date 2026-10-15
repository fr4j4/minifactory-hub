'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { calcLine } from '@/lib/pricing';
import type { CalcContext } from '@/lib/context';
import { dur, grams, money, num, cn } from '@/lib/format';
import { ensureQualityAction, resolveFilamentAction, sliceAction } from '@/actions/slicer';
import { useToast } from './client';
import { GcodeViewer } from './gcode-viewer';
import { SliceErrorHelp } from './slice-error-help';
import { AdvisorPanel } from './advisor-panel';
import { useT } from '@/i18n/client';
import { NozzleMismatch, ProcessOptions } from './process-options';

export interface RunInfo { id: string; status: 'queued' | 'running' | 'done' | 'error' | 'cancelado'; error: string | null; timeS: number | null; filament: Array<{ g: number; mm: number; cm3: number }>; layers: number | null; plates: number | null; durationMs: number | null; engineVersion: string | null; label: string | null; copies: number; cached: boolean; progress?: { pct: number; message: string } | null; hasGcode: boolean; has3mf: boolean; profileVersions: Record<string, [string, number]> }

export function useRunPolling(ids: string[], onDone?: () => void) {
  const [runs, setRuns] = useState<Record<string, RunInfo>>({});
  const idsKey = ids.join(',');
  useEffect(() => {
    if (!ids.length) return; let stop = false;
    const tick = async () => {
      const res = await Promise.all(ids.map((id) => fetch(`/api/runs/${id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
      if (stop) return; const next: Record<string, RunInfo> = {}; res.forEach((r, i) => { if (r) next[ids[i]] = r; }); setRuns(next);
      if (res.every((r) => r && (r.status === 'done' || r.status === 'error' || r.status === 'cancelado'))) { onDone?.(); return; }
      setTimeout(tick, 700);
    };
    tick(); return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);
  return runs;
}

/** Calcula el precio sugerido con los gramos y horas del laminador. */
export function priceFromRun(ctx: CalcContext, run: Pick<RunInfo, 'timeS' | 'filament'>, o: { machineId?: string | null; materialId?: string | null; qty?: number }) {
  const m = ctx.machines.find((x) => x.id === o.machineId); const mat = ctx.materials.find((x) => x.id === o.materialId);
  const g = run.filament.reduce((a, f) => a + f.g, 0); const h = (run.timeS ?? 0) / 3600;
  const bd = calcLine({ qty: o.qty ?? 1, gramsTotal: g, hoursTotal: h, costPerKg: mat?.costPerKg ?? 0, machine: m?.cost ?? null, applyTimeFactor: true }, ctx.rates);
  return bd;
}

/** Panel de laminado en el servidor (OrcaSlicer): elige máquina, proceso y material; entrega tiempo, gramos y precio. */
export function SlicePanel({ fileVersionId, ctx, canSlice = true, defaultMachineId, fileId, fileName, ai }: { fileVersionId: string; ctx: CalcContext; canSlice?: boolean; defaultMachineId?: string | null; fileId: string; fileName: string; ai?: { advisor: boolean; diagnose: boolean; canEdit: boolean; canCreate: boolean } }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const setups = ctx.setups;
  const first = setups.find((x) => x.machineId === defaultMachineId && x.active) ?? setups.find((x) => x.machineId === defaultMachineId) ?? setups[0];
  const [setupKey, setSetupKey] = useState(first?.key ?? '');
  const setup = setups.find((x) => x.key === setupKey);
  const machineId = setup?.machineId ?? '';
  const machine = ctx.machines.find((m) => m.id === machineId) ? { ...ctx.machines.find((m) => m.id === machineId)!, nozzle: setup?.nozzle ?? null, machineProfileId: setup?.machineProfileId ?? null, defaultProcessProfileId: setup?.processProfileId ?? null } : undefined;
  const procs = ctx.profiles.filter((p) => p.type === 'process');
  const mats = ctx.materials.filter((m) => m.tech === 'fdm');
  const filProfiles = ctx.profiles.filter((p) => p.type === 'filament');
  const [processId, setProcessId] = useState(machine?.defaultProcessProfileId ?? procs[0]?.id ?? '');
  const [materialId, setMaterialId] = useState(mats[0]?.id ?? '');
  const [advisorOpen, setAdvisorOpen] = useState(false); const [copies, setCopies] = useState(1); const [orient, setOrient] = useState(false); const [runId, setRunId] = useState<string | null>(null); const [showLayers, setShowLayers] = useState(false);
  useEffect(() => { if (machine?.defaultProcessProfileId) setProcessId(machine.defaultProcessProfileId); }, [setupKey]); // eslint-disable-line
  const runs = useRunPolling(runId ? [runId] : []);
  const run = runId ? runs[runId] : null;
  const busy = !!runId && (!run || run.status === 'queued' || run.status === 'running');
  const material = ctx.materials.find((m) => m.id === materialId);
  const [qBusy, setQBusy] = useState<string | null>(null);
  const pickQuality = async (key: 'borrador' | 'estandar' | 'fino' | 'resistente') => {
    if (!machine?.machineProfileId) return; setQBusy(key);
    const r = await ensureQualityAction({ machineProfileId: machine.machineProfileId, key }); setQBusy(null);
    if (!r.ok) { toast.push(r.error, 'err'); return; }
    setProcessId(r.data.id); router.refresh();
  };
  const [filamentId, setFilamentId] = useState(''); // '' = automático
  const [fil, setFil] = useState<{ id: string; name: string; source: string } | null>(null);
  useEffect(() => {
    let off = false; setFil(null);
    if (!materialId || !machine?.machineProfileId) return;
    resolveFilamentAction({ materialId, machineProfileId: machine.machineProfileId, filamentProfileId: filamentId || null }).then((r) => { if (!off && r.ok) setFil({ id: r.data.profileId, name: r.data.name, source: r.data.source }); });
    return () => { off = true; };
  }, [materialId, filamentId, machine?.machineProfileId]);
  const go = async (force = false) => {
    if (!machine?.machineProfileId || !material || !processId) { toast.push(t('slicer.chooseMachineProcessAndMaterial'), 'err'); return; }
    setShowLayers(false); setRunId(null);
    const r = await sliceAction({ fileVersionId, machineProfileId: machine.machineProfileId, processProfileId: processId, materialId: material.id, filamentProfileId: filamentId || null, copies, orient, label: `${fileName} · ${machine.name}`, force });
    if (!r.ok) toast.push(r.error, 'err'); else setRunId(r.data);
  };
  const bd = run?.status === 'done' ? priceFromRun(ctx, run, { machineId, materialId, qty: copies }) : null;
  return (
    <div className="space-y-4" data-testid="slice-panel">
      {setups.length === 0 && <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-900 p-3 text-sm" data-testid="slice-needs-setup">
        {setups.length === 0 ? t('slicer.noMachineHasItsPrinter') : t('slicer.noInventoryMaterialHasA')} <Link href="/laminador/configurar" className="underline font-medium">{t('slicer.setItUpInA')}</Link></div>}
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block"><span className="label">{t('common.machine')}</span><select className="input" value={setupKey} onChange={(e) => setSetupKey(e.target.value)} data-testid="slice-machine">{setups.map((x) => <option key={x.key} value={x.key}>{x.label}{ctx.machines.find((m) => m.id === x.machineId)?.simulated ? ' (simulada)' : ''}</option>)}</select>{machine?.nozzle && <span className="text-xs muted" data-testid="slice-nozzle">{t('nozzle.nozzleSet', { n: machine.nozzle })}</span>}</label>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-2" role="group" aria-label={t('slicer.qualityIntent')} data-testid="quality-chips">
          <span className="label !mb-0">{t('slicer.qualityIntent')}</span>
          {(['borrador', 'estandar', 'fino', 'resistente'] as const).map((k) => <button key={k} type="button" className="btn-ghost btn-sm" disabled={!machine?.machineProfileId || !!qBusy} onClick={() => pickQuality(k)} data-testid={`quality-${k}`}>{t(`nozzle.tpl.${k}` as 'nozzle.tpl.borrador')}</button>)}
        </div>
        <label className="block"><span className="label">{t('slicer.processProfile')}</span><select className="input" value={processId} onChange={(e) => setProcessId(e.target.value)} data-testid="slice-process"><ProcessOptions profiles={procs} machineNozzle={machine?.nozzle ?? null} compatibleIds={setup?.compatibleProcessIds} /></select><NozzleMismatch processNozzle={procs.find((p) => p.id === processId)?.nozzle} machineNozzle={machine?.nozzle} /></label>
        <label className="block"><span className="label">{t('slicer.materialFilamentProfile')}</span><select className="input" value={materialId} onChange={(e) => setMaterialId(e.target.value)} data-testid="slice-material">{mats.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
        <label className="block"><span className="label">{t('slicer.filamentLabel')}</span><select className="input" value={filamentId} onChange={(e) => setFilamentId(e.target.value)} data-testid="slice-filament"><option value="">{t('slicer.filamentAuto')}</option>{filProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>{fil && <span className="muted text-xs" data-testid="slice-filament-hint">{fil.name} · {t(`slicer.filamentSource_${fil.source}` as 'slicer.filamentSource_auto')}</span>}</label>
        <label className="block"><span className="label">{t('slicer.copiesOnThePlate')}</span><input type="number" min={1} max={200} className="input" value={copies} onChange={(e) => setCopies(Math.max(1, +e.target.value || 1))} data-testid="slice-copies" /></label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={orient} onChange={(e) => setOrient(e.target.checked)} data-testid="slice-orient" />{t('slicer.autoOrient')}<span className="muted text-xs">{t('slicer.autoOrientHint')}</span></label>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" onClick={() => go()} disabled={!canSlice || busy || !machine} data-testid="slice-go">{busy ? t('common.slicing') : t('slicer.sliceOnTheServer')}</button>
        {(ai?.advisor || ai?.diagnose) && canSlice && machine?.machineProfileId && fil && processId && <button className="btn-ghost" onClick={() => setAdvisorOpen(true)} disabled={busy} data-testid="advisor-open">✦ {t('advisor.open')}</button>}
        {run?.status === 'done' && <button className="btn-ghost" onClick={() => go(true)} disabled={busy}>{t('slicer.sliceAgainBypassCache')}</button>}
        <span className="text-xs muted">{t('slicer.engineOrcaslicerTheSameFile')}</span>
      </div>
      {busy && <div className="flex items-center gap-2 text-sm muted" role="status"><span className="inline-block h-3 w-3 rounded-full bg-brand-600 animate-pulse" /> {run?.status === 'running' ? t('slicer.slicingWithOrcaslicer') : t('slicer.inTheSlicingQueue')}{run?.status === 'running' && run.progress && <><span className="tabular" data-testid="slice-progress-pct">{run.progress.pct}%</span><progress className="h-1.5 w-32" max={100} value={run.progress.pct} aria-label={t('slicer.progress')} /><span className="text-xs truncate">{run.progress.message}</span></>}</div>}
      {run?.status === 'error' && <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-800 p-3 text-sm text-red-800 dark:text-red-200" role="alert" data-testid="slice-error">{run.error}<SliceErrorHelp runId={run.id} /></div>}
      {run?.status === 'done' && bd && (
        <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 p-4 space-y-3" data-testid="slice-result">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><div className="label">{t('common.time')}</div><div className="text-xl font-semibold tabular" data-testid="res-time">{dur(run.timeS)}</div></div>
            <div><div className="label">{t('common.material')}</div><div className="text-xl font-semibold tabular" data-testid="res-grams">{grams(run.filament.reduce((a, f) => a + f.g, 0))}</div></div>
            <div><div className="label">{t('common.layers')}</div><div className="text-xl font-semibold tabular">{run.layers ?? '—'}</div></div>
            <div><div className="label">{t('common.suggestedPrice')}</div><div className="text-xl font-semibold tabular" data-testid="res-price">{money(bd.suggestedTotal)}</div><div className="text-xs muted">{copies > 1 ? `${money(bd.suggestedUnit)} c/u` : t('slicer.accordingToCurrentRates')}</div></div>
          </div>
          {run.filament.length > 1 && <ul className="text-sm">{run.filament.map((f, i) => <li key={i}>{t('slicer.filamentN', { n: i + 1 })}: <b>{grams(f.g)}</b> · {num(f.mm / 1000, 2)} m</li>)}</ul>}
          <p className="text-xs muted">{t('slicer.sourceLabel')} <b>{t('slicer.serverSlicer')}</b> · OrcaSlicer {run.engineVersion} · {run.cached ? t('slicer.resultFromCache') : t('slicer.slicedInS', { seconds: num((run.durationMs ?? 0) / 1000, 1) })} · {run.plates ?? 1} placa(s){copies > 1 ? t('slicer.copiesOnTheSamePlate', { copies }) : ''}</p>
          <p className="text-xs muted">{t('slicer.profiles2')} {Object.values(run.profileVersions ?? {}).map(([n, v]) => `${n} v${v}`).join(' · ')}</p>
          <div className="flex flex-wrap gap-2">
            {run.hasGcode && <a className="btn-ghost btn-sm" href={`/api/runs/${run.id}/gcode`} data-testid="dl-gcode">{t('slicer.gCode')}</a>}
            {run.has3mf && <a className="btn-ghost btn-sm" href={`/api/runs/${run.id}/threemf`}>{t('slicer.sliced3mf')}</a>}
            {run.hasGcode && <button className="btn-ghost btn-sm" onClick={() => setShowLayers((v) => !v)} data-testid="show-layers">{showLayers ? t('slicer.hideLayers') : t('slicer.viewGCodeLayers')}</button>}
            <Link className="btn-primary btn-sm" href={`/presupuestos/nuevo?file=${fileId}&run=${run.id}&machine=${machineId}&material=${materialId}&copies=${copies}`} data-testid="use-in-quote">{t('slicer.useInAQuote')}</Link>
          </div>
        </div>
      )}
      {advisorOpen && ai && machine?.machineProfileId && fil && <AdvisorPanel target={{ fileVersionId, machineProfileId: machine.machineProfileId, processProfileId: processId, filamentProfileId: fil.id, copies }} features={ai} canEdit={ai.canEdit} canCreate={ai.canCreate} onClose={() => setAdvisorOpen(false)} />}
      {showLayers && run?.status === 'done' && <GcodeViewer src={`/api/runs/${run.id}/preview`} />}
    </div>
  );
}
