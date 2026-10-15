'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CalcContext } from '@/lib/context';
import { cancelRunAction, ensureQualityAction, saveOverridesAsProfileAction, sliceAction, studioBaseAction } from '@/actions/slicer';
import { useT } from '@/i18n/client';
import { dur, grams, money } from '@/lib/format';
import { GcodeViewer } from '../gcode-viewer';
import { useToast } from '../client';
import { priceFromRun, useRunPolling } from '../slice-panel';
import { SliceErrorHelp } from '../slice-error-help';
import { ProcessOptions } from '../process-options';
import { ParamPanel, type Ov } from './param-panel';
import { Explore } from './explore';
import { AdvisorPanel } from '../advisor-panel';
import type { ParamType } from '@/lib/slicer/schema';

const EMPTY: Ov = { machine: {}, process: {}, filament: {} };
const DEBOUNCE_MS = 700;
const Delta = ({ v, unit, inv = true }: { v: number | null; unit: string; inv?: boolean }) => v == null || Math.abs(v) < 1e-9 ? null : <span className={`text-xs ml-1.5 ${(v < 0) === inv ? 'text-ok' : 'text-amber-600 dark:text-amber-400'}`}>{v > 0 ? '+' : '−'}{unit.replace('#', String(Math.abs(Math.round(v * 10) / 10)))}</span>;

/** Estudio de laminado: elige máquina, calidad y material, ajusta parámetros de sesión y re-lamina casi en vivo (con cancelación) comparando contra la base. */
export function Studio({ fileVersionId, fileId, fileName, ctx, defaultMachineId, canSlice, canSaveProfile, ai }: { ai?: { advisor: boolean; diagnose: boolean; canEdit: boolean; canCreate: boolean }; fileVersionId: string; fileId: string; fileName: string; ctx: CalcContext; defaultMachineId?: string | null; canSlice: boolean; canSaveProfile: boolean }) {
  const t = useT(); const toast = useToast(); const router = useRouter();
  const setups = ctx.setups; const first = setups.find((x) => x.machineId === defaultMachineId && x.active) ?? setups.find((x) => x.machineId === defaultMachineId) ?? setups[0];
  const [setupKey, setSetupKey] = useState(first?.key ?? ''); const setup = setups.find((x) => x.key === setupKey);
  const procs = ctx.profiles.filter((p) => p.type === 'process'); const mats = ctx.materials.filter((m) => m.tech === 'fdm');
  const [processId, setProcessId] = useState(setup?.processProfileId ?? procs[0]?.id ?? ''); const [materialId, setMaterialId] = useState(mats[0]?.id ?? ''); const [copies, setCopies] = useState(1);
  const [ov, setOv] = useState<Ov>(EMPTY); const [base, setBase] = useState<Ov>(EMPTY); const [baseRunId, setBaseRunId] = useState<string | null>(null);
  const [filId, setFilId] = useState<string | null>(null); const [runId, setRunId] = useState<string | null>(null); const [lastGood, setLastGood] = useState<string | null>(null); const [stale, setStale] = useState(false); const [auto, setAuto] = useState(true); const [exploring, setExploring] = useState(false);
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const inflight = useRef<string | null>(null); const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const machine = setup ? ctx.machines.find((m) => m.id === setup.machineId) : undefined; const material = ctx.materials.find((m) => m.id === materialId);
  const runs = useRunPolling([runId, baseRunId].filter(Boolean) as string[]);
  const run = runId ? runs[runId] : null; const baseRun = baseRunId ? runs[baseRunId] : null;
  const nOv = (Object.values(ov) as Array<Record<string, string>>).reduce((a, o) => a + Object.keys(o).length, 0);
  const busy = !!run && (run.status === 'queued' || run.status === 'running');

  const launch = useCallback(async (overrides: Ov, asBase = false) => {
    if (!setup?.machineProfileId || !processId || !material) return;
    if (!asBase && inflight.current) { void cancelRunAction(inflight.current); }
    const r = await sliceAction({ fileVersionId, machineProfileId: setup.machineProfileId, processProfileId: processId, materialId: material.id, copies, label: `${fileName} · ${asBase ? 'base' : 'estudio'}`, overrides: { process: overrides.process, filament: overrides.filament, machine: overrides.machine } });
    if (!r.ok) { toast.push(r.error, 'err'); return; }
    if (asBase) setBaseRunId(r.data); else { inflight.current = r.data; setRunId(r.data); setStale(false); }
  }, [setup?.machineProfileId, processId, material, fileVersionId, copies, fileName, toast]);

  // base: valores efectivos del perfil + una corrida sin ajustes para comparar
  useEffect(() => {
    setOv(EMPTY); setStale(false); setBase(EMPTY);
    if (!setup?.machineProfileId || !processId || !material) return;
    let off = false;
    (async () => {
      const { resolveFilamentAction } = await import('@/actions/slicer');
      const f = await resolveFilamentAction({ materialId: material.id, machineProfileId: setup.machineProfileId });
      if (off || !f.ok) return;
      setFilId(f.data.profileId);
      const b = await studioBaseAction({ machineProfileId: setup.machineProfileId!, processProfileId: processId, filamentProfileId: f.data.profileId });
      if (!off && b.ok) setBase(b.data);
    })();
    if (canSlice) { void launch(EMPTY, true); void launch(EMPTY); }
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupKey, processId, materialId, copies]);

  // laminado casi en vivo: debounce tras el último cambio
  const change = (type: ParamType, key: string, value: string | null) => {
    setOv((o) => { const n = { ...o, [type]: { ...o[type] } }; if (value == null) delete n[type][key]; else n[type][key] = value; if (auto && canSlice) { setStale(true); clearTimeout(timer.current); timer.current = setTimeout(() => void launch(n), DEBOUNCE_MS); } else setStale(true); return n; });
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { if (run?.status === 'done') setLastGood(run.id); }, [run?.status, run?.id]);
  const shown = run?.status === 'done' ? run : lastGood ? runs[lastGood] ?? null : null;

  const bd = shown?.status === 'done' ? priceFromRun(ctx, shown, { machineId: machine?.id, materialId, qty: copies }) : null;
  const bb = baseRun?.status === 'done' ? priceFromRun(ctx, baseRun, { machineId: machine?.id, materialId, qty: copies }) : null;
  const totalG = (r: { filament: Array<{ g: number }> } | null | undefined) => r?.filament.reduce((a, f) => a + f.g, 0) ?? 0;
  const dT = shown && baseRun?.status === 'done' && shown.id !== baseRun.id ? (shown.timeS ?? 0) - (baseRun.timeS ?? 0) : null;
  const dG = shown && baseRun?.status === 'done' && shown.id !== baseRun.id ? totalG(shown) - totalG(baseRun) : null;
  const dP = bd && bb && shown && shown.id !== baseRun?.id ? bd.suggestedTotal - bb.suggestedTotal : null;

  const pickQuality = async (key: 'borrador' | 'estandar' | 'fino' | 'resistente') => { if (!setup?.machineProfileId) return; const r = await ensureQualityAction({ machineProfileId: setup.machineProfileId, key }); if (!r.ok) { toast.push(r.error, 'err'); return; } setProcessId(r.data.id); router.refresh(); };
  const save = async (asNew: boolean) => {
    const out: string[] = [];
    for (const type of ['process', 'filament', 'machine'] as const) {
      if (!Object.keys(ov[type]).length) continue;
      const id = type === 'process' ? processId : type === 'machine' ? setup?.machineProfileId : filId; if (!id) continue;
      const r = await saveOverridesAsProfileAction({ type, baseProfileId: id, overrides: ov[type], asNewVersion: !asNew });
      if (!r.ok) { toast.push(r.error, 'err'); return; } out.push(r.data);
    }
    toast.push(t('studio.saved')); router.refresh(); setOv(EMPTY);
  };

  const noSetup = setups.length === 0 || mats.length === 0;
  const qLinks = useMemo(() => (['borrador', 'estandar', 'fino', 'resistente'] as const), []);
  return (
    <div className="grid xl:grid-cols-[minmax(0,1fr)_420px] gap-4" data-testid="studio">
      <div className="space-y-3 min-w-0">
        {noSetup && <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-900 p-3 text-sm">{t('slicer.noMachineHasItsPrinter')} <Link href="/laminador/configurar" className="underline font-medium">{t('slicer.setItUpInA')}</Link></div>}
        <div className="card p-3 grid sm:grid-cols-4 gap-3">
          <label className="block"><span className="label">{t('common.machine')}</span><select className="input" value={setupKey} onChange={(e) => { setSetupKey(e.target.value); const s2 = setups.find((x) => x.key === e.target.value); if (s2?.processProfileId) setProcessId(s2.processProfileId); }} data-testid="studio-machine">{setups.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></label>
          <label className="block"><span className="label">{t('slicer.processProfile')}</span><select className="input" value={processId} onChange={(e) => setProcessId(e.target.value)} data-testid="studio-process"><ProcessOptions profiles={procs} machineNozzle={setup?.nozzle ?? null} compatibleIds={setup?.compatibleProcessIds} /></select></label>
          <label className="block"><span className="label">{t('common.material')}</span><select className="input" value={materialId} onChange={(e) => setMaterialId(e.target.value)} data-testid="studio-material">{mats.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
          <label className="block"><span className="label">{t('slicer.copiesOnThePlate')}</span><input type="number" min={1} max={200} className="input" value={copies} onChange={(e) => setCopies(Math.max(1, +e.target.value || 1))} data-testid="studio-copies" /></label>
          <div className="sm:col-span-4 flex flex-wrap items-center gap-2" role="group" aria-label={t('slicer.qualityIntent')}><span className="label !mb-0">{t('slicer.qualityIntent')}</span>{qLinks.map((k) => <button key={k} type="button" className="btn-ghost btn-sm" onClick={() => pickQuality(k)} data-testid={`studio-q-${k}`}>{t(`nozzle.tpl.${k}` as 'nozzle.tpl.borrador')}</button>)}</div>
        </div>
        <div className="card p-3" data-testid="result-bar" aria-live="polite">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div><div className="label">{t('common.time')}</div><div className={`text-xl font-semibold tabular ${stale || busy ? 'opacity-50' : ''}`} data-testid="res-time">{shown ? dur(shown.timeS) : '—'}<Delta v={dT == null ? null : dT / 60} unit={`# min`} /></div></div>
            <div><div className="label">{t('common.material')}</div><div className={`text-xl font-semibold tabular ${stale || busy ? 'opacity-50' : ''}`} data-testid="res-grams">{shown ? grams(totalG(shown)) : '—'}<Delta v={dG} unit="# g" /></div></div>
            <div><div className="label">{t('common.layers')}</div><div className={`text-xl font-semibold tabular ${stale || busy ? 'opacity-50' : ''}`}>{shown?.layers ?? '—'}</div></div>
            <div><div className="label">{t('common.suggestedPrice')}</div><div className={`text-xl font-semibold tabular ${stale || busy ? 'opacity-50' : ''}`} data-testid="res-price">{bd ? money(bd.suggestedTotal) : '—'}<Delta v={dP} unit="$#" /></div></div>
            <div className="ml-auto text-sm flex items-center gap-2" data-testid="studio-status">
              {busy ? <><span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--accent)] animate-pulse" aria-hidden />{t('studio.slicing')}<button className="btn-ghost btn-sm" onClick={() => runId && cancelRunAction(runId)} data-testid="studio-cancel">{t('common.cancel')}</button></>
                : run?.status === 'error' ? <span className="text-red-600">{t('studio.error')}</span> : stale ? <><span className="badge border-amber-400 text-warn">{t('studio.outdated')}</span><button className="btn-primary btn-sm" disabled={!canSlice} onClick={() => launch(ov)} data-testid="studio-reslice">{t('studio.reslice')}</button></>
                : shown ? <span className="badge border-emerald-400 text-ok">{t('studio.sliced')}</span> : null}
            </div>
          </div>
          {run?.status === 'error' && <div role="alert" className="mt-2 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/40 p-2.5 text-sm text-red-800 dark:text-red-200" data-testid="studio-error">{run.error}<SliceErrorHelp runId={run.id} /></div>}
          <label className="flex items-center gap-2 text-xs mt-2"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} data-testid="studio-auto" />{t('studio.autoSlice')}</label>
        </div>
        {shown?.status === 'done' ? <div className={stale ? 'opacity-60' : ''}><GcodeViewer src={`/api/runs/${shown.id}/preview`} /></div> : <div className="card grid place-items-center text-sm muted" style={{ height: 320 }} role="status">{busy ? t('studio.slicing') : t('studio.noResult')}</div>}
        <div className="flex flex-wrap gap-2">
          {shown?.status === 'done' && <Link className="btn-primary" href={`/presupuestos/nuevo?file=${fileId}&run=${shown.id}&machine=${machine?.id ?? ''}&material=${materialId}&copies=${copies}`} data-testid="studio-use-in-quote">{t('slicer.useInAQuote')}</Link>}
          {shown?.status === 'done' && <a className="btn-ghost" href={`/api/runs/${shown.id}/gcode`}>{t('slicer.gCode')}</a>}
          {ai && (ai.advisor || ai.diagnose) && canSlice && setup?.machineProfileId && filId && processId && <button className="btn-ghost" onClick={() => setAdvisorOpen(true)} data-testid="advisor-open">✦ {t('advisor.open')}</button>}
          {setup?.machineProfileId && canSlice && <button className="btn-ghost" onClick={() => setExploring(true)} data-testid="studio-explore">{t('studio.explore')}</button>}
        </div>
      </div>
      <aside className="card p-3 self-start xl:sticky xl:top-3 max-h-[calc(100vh-24px)] overflow-y-auto" aria-label={t('studio.settings')}>
        <div className="flex items-center justify-between gap-2 mb-2"><h2 className="text-sm font-semibold">{t('studio.settings')}</h2>{nOv > 0 && <button className="btn-ghost btn-sm" onClick={() => { setOv(EMPTY); if (canSlice) void launch(EMPTY); }} data-testid="studio-discard">{t('studio.discard')}</button>}</div>
        <ParamPanel base={base} overrides={ov} onChange={change} disabled={noSetup} />
        {nOv > 0 && canSaveProfile && <div className="border-t border-[var(--line)] mt-3 pt-3 flex flex-wrap gap-2" data-testid="studio-save"><button className="btn-ghost btn-sm" onClick={() => save(true)} data-testid="studio-save-new">{t('studio.saveAsProfile')}</button><button className="btn-ghost btn-sm" onClick={() => save(false)}>{t('studio.updateBase')}</button></div>}
      </aside>
      {advisorOpen && ai && setup?.machineProfileId && filId && <AdvisorPanel target={{ fileVersionId, machineProfileId: setup.machineProfileId, processProfileId: processId, filamentProfileId: filId, copies }} features={{ advisor: ai.advisor, diagnose: ai.diagnose }} canEdit={ai.canEdit} canCreate={ai.canCreate} onClose={() => setAdvisorOpen(false)} />}
      {exploring && setup?.machineProfileId && <Explore open onClose={() => setExploring(false)} ctx={ctx} machineId={machine?.id} materialId={materialId} nozzle={setup.nozzle ?? null} base={{ fileVersionId, machineProfileId: setup.machineProfileId, processProfileId: processId, materialId, copies }} onUse={(o) => { const n = { ...EMPTY, process: o }; setOv(n); setStale(true); if (canSlice) void launch(n); }} />}
    </div>
  );
}
