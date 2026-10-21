'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { priceLine, toItemMaterial } from '@/lib/item-price';
import type { CalcContext } from '@/lib/context';
import { dur, grams, money, num, cn } from '@/lib/format';
import { enqueueFromRunAction } from '@/actions/production';
import { setAutoOrientAction } from '@/actions/files';
import { ensureQualityAction, resolveFilamentAction, sliceAction } from '@/actions/slicer';
import { useLinger, useToast } from './client';
import { GcodeViewer } from './gcode-viewer';
import { SliceErrorHelp } from './slice-error-help';
import { AdvisorPanel } from './advisor-panel';
import { useT } from '@/i18n/client';
import { FilamentPicker } from './filament-picker';
import { NozzleMismatch, ProcessOptions } from './process-options';
import { Icon } from '@/components/shell';

export interface RunInfo { id: string; status: 'queued' | 'running' | 'done' | 'error' | 'cancelado'; error: string | null; timeS: number | null; filament: Array<{ g: number; mm: number; cm3: number }>; layers: number | null; plates: number | null; durationMs: number | null; engineVersion: string | null; label: string | null; copies: number; cached: boolean; progress?: { pct: number; message: string } | null; hasGcode: boolean; has3mf: boolean; profileVersions: Record<string, [string, number]>; platesInfo?: Array<{ index: number; timeS: number | null; layers: number | null; filament: Array<{ g: number; mm: number }> }> }

export function useRunPolling(ids: string[], onDone?: () => void) {
  const [runs, setRuns] = useState<Record<string, RunInfo>>({});
  const idsKey = ids.join(',');
  useEffect(() => {
    if (!ids.length) return; let stop = false; let es: EventSource | null = null; let timer: ReturnType<typeof setTimeout> | null = null;
    const finished = (r: RunInfo | null | undefined) => !!r && (r.status === 'done' || r.status === 'error' || r.status === 'cancelado');
    // respaldo: sondeo cada 700 ms (si el navegador no soporta SSE o la conexión se cae)
    const poll = async () => {
      const res = await Promise.all(ids.map((id) => fetch(`/api/runs/${id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
      if (stop) return; const next: Record<string, RunInfo> = {}; res.forEach((r, i) => { if (r) next[ids[i]] = r; }); setRuns(next);
      if (res.every(finished)) { onDone?.(); return; }
      timer = setTimeout(poll, 700);
    };
    if (typeof EventSource === 'undefined') { poll(); return () => { stop = true; if (timer) clearTimeout(timer); }; }
    const seen: Record<string, RunInfo> = {}; let ended = false;
    es = new EventSource(`/api/runs/stream?ids=${ids.join(',')}`);
    es.addEventListener('run', (e) => { const r = JSON.parse((e as MessageEvent).data) as RunInfo; seen[r.id] = r; if (!stop) setRuns({ ...seen }); });
    es.addEventListener('end', () => { ended = true; es?.close(); if (!stop) onDone?.(); });
    es.onerror = () => { es?.close(); if (!ended && !stop) poll(); };
    return () => { stop = true; es?.close(); if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);
  return runs;
}

/** Calcula el precio sugerido con los gramos y horas del laminador. */
export function priceFromRun(ctx: CalcContext, run: Pick<RunInfo, 'timeS' | 'filament'>, o: { machineId?: string | null; materialId?: string | null; qty?: number }) {
  const m = ctx.machines.find((x) => x.id === o.machineId); const mat = ctx.materials.find((x) => x.id === o.materialId);
  const g = run.filament.reduce((a, f) => a + f.g, 0); const h = (run.timeS ?? 0) / 3600;
  return priceLine({ qty: o.qty ?? 1, gramsTotal: g, hoursTotal: h, mode: 'auto', originKind: 'slicer' }, { rates: ctx.rates, profiles: ctx.calcProfiles, material: toItemMaterial(mat), machine: m?.cost ?? null }).bd;
}

/** Panel de laminado en el servidor (OrcaSlicer): elige máquina, proceso y material; entrega tiempo, gramos y precio. */
export function SlicePanel({ fileVersionId, ctx, canSlice = true, defaultMachineId, fileId, fileName, ai, defaultOrient, amsColors }: { amsColors?: string[]; defaultOrient?: boolean; fileVersionId: string; ctx: CalcContext; canSlice?: boolean; defaultMachineId?: string | null; fileId: string; fileName: string; ai?: { advisor: boolean; diagnose: boolean; canEdit: boolean; canCreate: boolean } }) {
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
  const [advisorOpen, setAdvisorOpen] = useState(false); const advisorShown = useLinger(advisorOpen); const [copies, setCopies] = useState(1); const [orient, setOrient] = useState(!!defaultOrient); const [extraMats, setExtraMats] = useState<string[]>(() => (amsColors ?? []).slice(1).map(() => '')); const [runId, setRunId] = useState<string | null>(null); const [showLayers, setShowLayers] = useState(false); const [layerPlate, setLayerPlate] = useState(0);
  useEffect(() => { if (machine?.defaultProcessProfileId) setProcessId(machine.defaultProcessProfileId); }, [setupKey]); // eslint-disable-line
  const runs = useRunPolling(runId ? [runId] : []);
  const run = runId ? runs[runId] : null;
  const busy = !!runId && (!run || run.status === 'queued' || run.status === 'running');
  const material = ctx.materials.find((m) => m.id === materialId);
  const [qBusy, setQBusy] = useState<string | null>(null);
  const pickQuality = async (key: string) => {
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
    const r = await sliceAction({ fileVersionId, machineProfileId: machine.machineProfileId, processProfileId: processId, materialId: material.id, filamentProfileId: filamentId || null, copies, orient, extra: extraMats.length ? extraMats.map((id) => ({ materialId: id || materialId })) : undefined, label: `${fileName} · ${machine.name}`, force });
    if (!r.ok) toast.push(r.error, 'err'); else setRunId(r.data);
  };
  const bd = run?.status === 'done' ? priceFromRun(ctx, run, { machineId, materialId, qty: copies }) : null;
  return (
    <div className="space-y-4" data-testid="slice-panel">
      {setups.length === 0 && <div className="rounded-xl box-warn p-3 text-sm" data-testid="slice-needs-setup">
        {setups.length === 0 ? t('slicer.noMachineHasItsPrinter') : t('slicer.noInventoryMaterialHasA')} <Link href="/laminador/configurar" className="underline font-medium">{t('slicer.setItUpInA')}</Link></div>}
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block"><span className="label">{t('common.machine')}</span><select className="input" value={setupKey} onChange={(e) => setSetupKey(e.target.value)} data-testid="slice-machine">{setups.map((x) => <option key={x.key} value={x.key}>{x.label}{ctx.machines.find((m) => m.id === x.machineId)?.simulated && !/simulad/i.test(x.label) ? ` (${t('machines.simulated').toLowerCase()})` : ''}</option>)}</select>{machine?.nozzle && <span className="text-xs muted" data-testid="slice-nozzle">{t('nozzle.nozzleSet', { n: machine.nozzle })}</span>}</label>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-2" role="group" aria-label={t('slicer.qualityIntent')} data-testid="quality-chips">
          <span className="label !mb-0">{t('slicer.qualityIntent')}</span>
          {ctx.presets.map((pr) => <button key={pr.key} type="button" className="btn-ghost btn-sm" disabled={!machine?.machineProfileId || !!qBusy} onClick={() => pickQuality(pr.key)} data-testid={`quality-${pr.key}`}>{pr.label ?? t(`nozzle.tpl.${pr.key}` as 'nozzle.tpl.borrador')}</button>)}
        </div>
        <label className="block"><span className="label">{t('slicer.processProfile')}</span><select className="input" value={processId} onChange={(e) => setProcessId(e.target.value)} data-testid="slice-process"><ProcessOptions profiles={procs} machineNozzle={machine?.nozzle ?? null} compatibleIds={setup?.compatibleProcessIds} /></select><NozzleMismatch processNozzle={procs.find((p) => p.id === processId)?.nozzle} machineNozzle={machine?.nozzle} /></label>
        <div className="block"><span className="label">{t('slicer.materialFilamentProfile')}</span><FilamentPicker materials={ctx.materials} value={materialId} hint={{ hex: amsColors?.[0] }} showCost={false} ariaLabel={t('slicer.materialFilamentProfile')} testId="slice-material" onChange={(id) => setMaterialId(id)} /></div>
        <label className="block"><span className="label">{t('slicer.filamentLabel')}</span><select className="input" value={filamentId} onChange={(e) => setFilamentId(e.target.value)} data-testid="slice-filament"><option value="">{t('slicer.filamentAuto')}</option>{filProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>{fil && <span className="muted text-xs" data-testid="slice-filament-hint">{fil.name} · {t(`slicer.filamentSource_${fil.source}` as 'slicer.filamentSource_auto')}</span>}</label>
        <label className="block"><span className="label">{t('slicer.copiesOnThePlate')}</span><input type="number" min={1} max={200} className="input" value={copies} onChange={(e) => setCopies(Math.max(1, +e.target.value || 1))} data-testid="slice-copies" /></label>
      </div>
      {extraMats.length > 0 && <fieldset className="rounded-xl border border-[var(--line)] p-3 space-y-2" data-testid="slice-extra-extruders"><legend className="label px-1">{t('slicer.multicolorTitle', { n: extraMats.length + 1 })}</legend><p className="muted text-xs">{t('slicer.multicolorHint')}</p>
        {extraMats.map((v, k) => <div key={k} className="block"><span className="label"><span className="inline-block h-3 w-3 rounded-full align-middle mr-1.5 border border-[var(--line)]" style={{ background: amsColors?.[k + 1] }} />{t('slicer.extruderN', { n: k + 2 })}</span><FilamentPicker materials={ctx.materials} value={v} emptyLabel={t('slicer.sameAsFirst')} hint={{ hex: amsColors?.[k + 1] }} showCost={false} ariaLabel={t('slicer.extruderN', { n: k + 2 })} testId={`slice-extruder-${k + 2}`} onChange={(id) => setExtraMats(extraMats.map((x, i) => (i === k ? id : x)))} /></div>)}</fieldset>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={orient} onChange={(e) => { setOrient(e.target.checked); void setAutoOrientAction(fileId, e.target.checked); }} data-testid="slice-orient" />{t('slicer.autoOrient')}<span className="muted text-xs">{t('slicer.autoOrientHint')}</span></label>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" onClick={() => go()} disabled={!canSlice || busy || !machine} data-testid="slice-go">{busy ? t('common.slicing') : t('slicer.sliceOnTheServer')}</button>
        {(ai?.advisor || ai?.diagnose) && canSlice && machine?.machineProfileId && fil && processId && <button className="btn-ghost" onClick={() => setAdvisorOpen(true)} disabled={busy} data-testid="advisor-open"><Icon name="sparkles" className="h-4 w-4" />{t('advisor.open')}</button>}
        {run?.status === 'done' && <button className="btn-ghost" onClick={() => go(true)} disabled={busy}>{t('slicer.sliceAgainBypassCache')}</button>}
        <span className="text-xs muted">{t('slicer.engineOrcaslicerTheSameFile')}</span>
      </div>
      {busy && <div className="flex items-center gap-2 text-sm muted" role="status"><span className="inline-block h-3 w-3 rounded-full bg-[var(--accent)] animate-pulse" /> {run?.status === 'running' ? t('slicer.slicingWithOrcaslicer') : t('slicer.inTheSlicingQueue')}{run?.status === 'running' && run.progress && <><span className="tabular" data-testid="slice-progress-pct">{run.progress.pct}%</span><progress className="h-1.5 w-32" max={100} value={run.progress.pct} aria-label={t('slicer.progress')} /><span className="text-xs truncate">{run.progress.message}</span></>}</div>}
      {run?.status === 'error' && <div className="rounded-lg box-danger dark:border-red-800 p-3 text-sm text-red-800 dark:text-red-200" role="alert" data-testid="slice-error">{run.error}<SliceErrorHelp runId={run.id} /></div>}
      {run?.status === 'done' && bd && (
        <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 p-4 space-y-3" data-testid="slice-result">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><div className="label">{t('common.time')}</div><div className="text-xl font-semibold tabular" data-testid="res-time">{dur(run.timeS)}</div></div>
            <div><div className="label">{t('common.material')}</div><div className="text-xl font-semibold tabular" data-testid="res-grams">{grams(run.filament.reduce((a, f) => a + f.g, 0))}</div></div>
            <div><div className="label">{t('common.layers')}</div><div className="text-xl font-semibold tabular">{run.layers ?? '—'}</div></div>
            <div><div className="label">{t('common.suggestedPrice')}</div><div className="text-xl font-semibold tabular" data-testid="res-price">{money(bd.suggestedTotal)}</div><div className="text-xs muted">{copies > 1 ? `${money(bd.suggestedUnit)} ${t('calculator.unit')}` : t('slicer.accordingToCurrentRates')}</div></div>
          </div>
          {(run.platesInfo ?? []).length > 1 && <div className="space-y-2" data-testid="plates-table">
            <div className="label">{t('slicer.platesOfTheProject')}</div>
            <table className="w-full text-sm">
              <tbody>{run.platesInfo!.map((p) => <tr key={p.index} className="border-t border-black/5 dark:border-white/10" data-testid={`plate-row-${p.index}`}>
                <td className="py-1.5 font-medium">{t('slicer.plateN', { n: p.index })}</td>
                <td className="py-1.5 tabular">{dur(p.timeS)}</td>
                <td className="py-1.5 tabular">{p.layers ?? '—'} {t('common.layers').toLowerCase()}</td>
                <td className="py-1.5 tabular">{grams(p.filament.reduce((a, f) => a + f.g, 0))}</td>
                <td className="py-1.5 text-right"><span className="inline-flex flex-wrap justify-end gap-2">
                  {run.hasGcode && <a className="btn-ghost btn-sm" href={`/api/runs/${run.id}/gcode?plate=${p.index}`} data-testid={`dl-gcode-${p.index}`}><Icon name="download" className="h-4 w-4" />{t('slicer.downloadPlateGCode')}</a>}
                  {run.hasGcode && <button className="btn-ghost btn-sm" onClick={() => { setLayerPlate(p.index); setShowLayers(true); }}><Icon name="eye" className="h-4 w-4" />{t('slicer.viewPlateLayers')}</button>}
                </span></td>
              </tr>)}</tbody>
            </table>
          </div>}
          {run.filament.length > 1 && <ul className="text-sm">{run.filament.map((f, i) => <li key={i}>{t('slicer.filamentN', { n: i + 1 })}: <b>{grams(f.g)}</b> · {num(f.mm / 1000, 2)} m</li>)}</ul>}
          <p className="text-xs muted">{t('slicer.sourceLabel')} <b>{t('slicer.serverSlicer')}</b> · OrcaSlicer {run.engineVersion} · {run.cached ? t('slicer.resultFromCache') : t('slicer.slicedInS', { seconds: num((run.durationMs ?? 0) / 1000, 1) })} · {t('slicer.plates', { count: run.plates ?? 1 })}{copies > 1 ? t('slicer.copiesOnTheSamePlate', { copies }) : ''}</p>
          <p className="text-xs muted">{t('slicer.profiles2')} {Object.values(run.profileVersions ?? {}).map(([n, v]) => `${n} v${v}`).join(' · ')}</p>
          <div className="flex flex-wrap gap-2">
            {run.hasGcode && <a className="btn-ghost btn-sm" href={`/api/runs/${run.id}/gcode`} data-testid="dl-gcode"><Icon name="download" className="h-4 w-4" />{t('slicer.gCode')}</a>}
            {run.status === 'done' && <button className="btn-ghost btn-sm" onClick={async () => { const r = await enqueueFromRunAction(run.id, machine?.id ?? null, materialId || null); if (r.ok) toast.push(t('slicer.queued'), 'ok'); else toast.push(r.error, 'err'); }} data-testid="enqueue-run">{t('slicer.addToQueue')}</button>}
            {run.has3mf && <a className="btn-ghost btn-sm" href={`/api/runs/${run.id}/threemf`}><Icon name="download" className="h-4 w-4" />{t('slicer.sliced3mf')}</a>}
            {run.hasGcode && <button className="btn-ghost btn-sm" onClick={() => { setLayerPlate(0); setShowLayers((v) => !v); }} data-testid="show-layers"><Icon name="eye" className="h-4 w-4" />{showLayers ? t('slicer.hideLayers') : t('slicer.viewGCodeLayers')}</button>}
            <Link className="btn-primary btn-sm" href={`/presupuestos/nuevo?file=${fileId}&run=${run.id}&machine=${machineId}&material=${materialId}&copies=${copies}`} data-testid="use-in-quote">{t('slicer.useInAQuote')}</Link>
          </div>
        </div>
      )}
      {advisorShown && ai && machine?.machineProfileId && fil && <AdvisorPanel open={advisorOpen} target={{ fileVersionId, machineProfileId: machine.machineProfileId, processProfileId: processId, filamentProfileId: fil.id, copies }} features={ai} canEdit={ai.canEdit} canCreate={ai.canCreate} onClose={() => setAdvisorOpen(false)} />}
      {showLayers && run?.status === 'done' && <GcodeViewer src={`/api/runs/${run.id}/preview${layerPlate ? `?plate=${layerPlate}` : ''}`} />}
    </div>
  );
}
