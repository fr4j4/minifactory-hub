'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { CalcContext } from '@/lib/context';
import { compareAction } from '@/actions/slicer';
import { priceFromRun, useRunPolling } from './slice-panel';
import { dur, grams, money, num, cn } from '@/lib/format';
import { Icon } from '@/components/shell';
import { useToast } from './client';
import { GcodeViewer } from './gcode-viewer';
import { useT } from '@/i18n/client';
import { NozzleMismatch, ProcessOptions } from './process-options';

interface Combo { key: number; setupKey: string; processId: string; materialId: string }

/** Lamina el mismo archivo con varias combinaciones a la vez y muestra tiempo, gramos y precio lado a lado. */
export function Comparator({ ctx, files, initialFile }: { ctx: CalcContext; files: Array<{ id: string; name: string; versionId: string }>; initialFile?: string }) {
  const t = useT();
  const toast = useToast();
  const setups = ctx.setups; const setupOf = (k: string) => setups.find((x) => x.key === k); const nozzleOf = (k: string) => setupOf(k)?.nozzle ?? null;
  const procs = ctx.profiles.filter((p) => p.type === 'process'); const mats = ctx.materials.filter((m) => m.tech === 'fdm');
  const [fileId, setFileId] = useState(initialFile ?? files[0]?.id ?? ''); const [copies, setCopies] = useState(1);
  let k = 0;
  const mk = (): Combo => ({ key: k++, setupKey: setups[0]?.key ?? '', processId: setups[0]?.processProfileId ?? procs[0]?.id ?? '', materialId: mats[0]?.id ?? '' });
  const [combos, setCombos] = useState<Combo[]>(() => { const a = mk(); const b = { ...mk(), processId: procs.find((p) => /Fine|0,12/.test(p.name))?.id ?? procs[1]?.id ?? a.processId }; const c = { ...mk(), processId: procs.find((p) => /Draft/.test(p.name))?.id ?? procs[2]?.id ?? a.processId }; return [a, b, c]; });
  const [ids, setIds] = useState<string[]>([]); const [labels, setLabels] = useState<Record<string, Combo>>({}); const [busy, setBusy] = useState(false); const [view, setView] = useState<string | null>(null);
  const runs = useRunPolling(ids, () => setBusy(false));
  const file = files.find((f) => f.id === fileId);
  const go = async () => {
    if (!file) return; setBusy(true); setView(null);
    const payload = combos.map((c) => { return { label: String(c.key), machineProfileId: setupOf(c.setupKey)!.machineProfileId, processProfileId: c.processId, materialId: c.materialId }; });
    const r = await compareAction({ fileVersionId: file.versionId, copies, combos: payload });
    if (!r.ok) { toast.push(r.error, 'err'); setBusy(false); return; }
    setIds(r.data.ids); setLabels(Object.fromEntries(r.data.ids.map((id, i) => [id, combos[i]])));
  };
  const rows = ids.map((id) => ({ id, run: runs[id], c: labels[id] }));
  const best = (f: (r: any) => number) => { const v = rows.filter((r) => r.run?.status === 'done').map((r) => f(r)); return v.length > 1 ? Math.min(...v) : null; };
  const bestTime = best((r) => r.run.timeS), bestG = best((r) => r.run.filament.reduce((a: number, x: any) => a + x.g, 0));
  const sel = (arr: any[], v: string, on: (v: string) => void, label: string, tid: string) => <select className="input" value={v} onChange={(e) => on(e.target.value)} aria-label={label} data-testid={tid}>{arr.map((x) => <option key={x.id} value={x.id}>{x.name ?? x.label}</option>)}</select>;
  return (
    <div className="space-y-4" data-testid="comparator">
      <div className="card p-4 grid sm:grid-cols-3 gap-3">
        <label className="block sm:col-span-2"><span className="label">{t('slicer.fileToSlice')}</span><select className="input" value={fileId} onChange={(e) => setFileId(e.target.value)} data-testid="cmp-file">{files.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <label className="block"><span className="label">{t('slicer.copiesOnThePlate')}</span><input type="number" min={1} className="input" value={copies} onChange={(e) => setCopies(Math.max(1, +e.target.value || 1))} /></label>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full"><thead><tr><th className="th">#</th><th className="th">{t('common.machine')}</th><th className="th">{t('slicer.process')}</th><th className="th">{t('common.material')}</th><th className="th" /></tr></thead>
          <tbody>{combos.map((c, i) => (
            <tr key={c.key}><td className="td">{i + 1}</td>
              <td className="td min-w-[170px]">{sel(setups.map((x) => ({ id: x.key, name: x.label })), c.setupKey, (v) => setCombos(combos.map((x) => (x.key === c.key ? { ...x, setupKey: v, processId: setupOf(v)?.processProfileId ?? x.processId } : x))), t('slicer.machine', { i: i + 1 }), `cmp-machine-${i}`)}</td>
              <td className="td min-w-[200px]"><select className="input" value={c.processId} onChange={(e) => setCombos(combos.map((x) => (x.key === c.key ? { ...x, processId: e.target.value } : x)))} aria-label={t('slicer.process2', { i: i + 1 })} data-testid={`cmp-process-${i}`}><ProcessOptions profiles={procs} machineNozzle={nozzleOf(c.setupKey)} compatibleIds={ctx.setups.find((x) => x.key === c.setupKey)?.compatibleProcessIds} /></select><NozzleMismatch processNozzle={procs.find((p) => p.id === c.processId)?.nozzle} machineNozzle={nozzleOf(c.setupKey)} /></td>
              <td className="td min-w-[170px]">{sel(mats, c.materialId, (v) => setCombos(combos.map((x) => (x.key === c.key ? { ...x, materialId: v } : x))), t('slicer.material', { i: i + 1 }), `cmp-material-${i}`)}</td>
              <td className="td"><button className="btn-ghost btn-sm" onClick={() => setCombos(combos.filter((x) => x.key !== c.key))} disabled={combos.length <= 1} aria-label={t('slicer.removeCombination', { i: i + 1 })}><Icon name="x" className="h-4 w-4" /></button></td></tr>
          ))}</tbody></table>
        <div className="p-3 flex flex-wrap gap-2 border-t border-slate-200 dark:border-slate-700">
          <button className="btn-ghost" onClick={() => setCombos([...combos, { ...mk(), key: Date.now() }])} disabled={combos.length >= 8}>{t('slicer.addCombination')}</button>
          <button className="btn-primary" onClick={go} disabled={busy || !file} data-testid="cmp-go">{busy ? t('common.slicing') : t('slicer.sliceCombinations', { combos: combos.length })}</button>
        </div>
      </div>
      {rows.length > 0 && (
        <div className="card overflow-x-auto" data-testid="cmp-results">
          <table className="w-full"><thead><tr><th className="th">{t('slicer.combination')}</th><th className="th text-right">{t('common.time')}</th><th className="th text-right">{t('common.material')}</th><th className="th text-right">{t('common.layers')}</th><th className="th text-right">{t('slicer.slice')}</th><th className="th text-right">{t('common.suggestedPrice')}</th><th className="th" /></tr></thead>
            <tbody>{rows.map(({ id, run, c }, i) => {
              const m = setupOf(c?.setupKey ?? ''); const p = procs.find((x) => x.id === c?.processId); const ma = ctx.materials.find((x) => x.id === c?.materialId);
              const g = run?.filament?.reduce((a: number, x: any) => a + x.g, 0);
              const bd = run?.status === 'done' ? priceFromRun(ctx, run, { machineId: setupOf(c.setupKey)?.machineId, materialId: c.materialId, qty: copies }) : null;
              return (
                <tr key={id} data-testid="cmp-row"><td className="td"><div className="font-medium">{i + 1}. {m?.label}</div><div className="text-xs muted">{p?.name} · {ma?.label}</div></td>
                  {!run || run.status === 'queued' || run.status === 'running' ? <td className="td muted" colSpan={5}>{t('common.slicing')}</td> : run.status === 'error' ? <td className="td text-danger text-sm" colSpan={5}>{run.error}</td> : (
                    <>
                      <td className={cn('td text-right tabular', run.timeS === bestTime && 'font-semibold text-ok')}>{dur(run.timeS)}</td>
                      <td className={cn('td text-right tabular', g === bestG && 'font-semibold text-ok')}>{grams(g)}</td>
                      <td className="td text-right tabular">{run.layers}</td><td className="td text-right tabular muted">{run.cached ? t('slicer.cached2') : `${num((run.durationMs ?? 0) / 1000, 1)} s`}</td>
                      <td className="td text-right tabular font-semibold">{money(bd?.suggestedTotal)}</td>
                      <td className="td text-right whitespace-nowrap"><button className="btn-ghost btn-sm" onClick={() => setView(view === id ? null : id)}>{t('slicer.viewLayers')}</button> <Link className="btn-primary btn-sm" href={`/presupuestos/nuevo?file=${fileId}&run=${id}&machine=${setupOf(c.setupKey)?.machineId}&material=${c.materialId}&copies=${copies}`}>{t('slicer.use')}</Link></td>
                    </>
                  )}
                </tr>
              );
            })}</tbody></table>
          <p className="text-xs muted p-3">{t('slicer.theLowestTimeAndThe')}</p>
        </div>
      )}
      {view && <GcodeViewer src={`/api/runs/${view}/preview`} />}
    </div>
  );
}
