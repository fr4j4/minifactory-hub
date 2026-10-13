'use client';
import { useState } from 'react';
import { calibrationAction, restoreRatesAction, setMachineTimeFactorAction } from '@/actions/calc';
import type { CalibrationData } from '@/lib/services/calibration';
import type { Benchmark, Rates } from '@/lib/pricing';
import { dmyHm, money, num } from '@/lib/format';
import { useAction, useToast } from './client';
import { NumField } from './calc-fields';
import { useT } from '@/i18n/client';

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };

/** Referencias de mercado propias (precio por gramo, por hora o de una pieza concreta). */
export function BenchmarksEditor({ benchmarks, onChange, canEdit }: { benchmarks: Benchmark[]; onChange: (b: Benchmark[]) => void; canEdit: boolean }) {
  const t = useT();
  const upd = (id: string, patch: Partial<Benchmark>) => onChange(benchmarks.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  return (
    <div className="space-y-2" data-testid="benchmarks">
      <p className="text-xs muted">{t('calc.bm.help')}</p>
      {benchmarks.length > 0 && (
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="muted text-left text-xs"><th>{t('common.name')}</th><th>{t('calc.bm.perGram')}</th><th>{t('calc.bm.perHour')}</th><th>{t('calc.bm.material')}</th><th /></tr></thead>
          <tbody>{benchmarks.map((b) => (
            <tr key={b.id}>
              <td className="pr-2"><input className="input" value={b.name} disabled={!canEdit} aria-label={t('common.name')} onChange={(e) => upd(b.id, { name: e.target.value })} /></td>
              <td className="pr-2"><input type="number" min={0} className="input !w-28" value={b.perGram ?? ''} disabled={!canEdit} aria-label={t('calc.bm.perGram')} onChange={(e) => upd(b.id, { perGram: e.target.value === '' ? undefined : +e.target.value })} /></td>
              <td className="pr-2"><input type="number" min={0} className="input !w-28" value={b.perHour ?? ''} disabled={!canEdit} aria-label={t('calc.bm.perHour')} onChange={(e) => upd(b.id, { perHour: e.target.value === '' ? undefined : +e.target.value })} /></td>
              <td className="pr-2"><input className="input !w-28" value={b.material ?? ''} disabled={!canEdit} aria-label={t('calc.bm.material')} onChange={(e) => upd(b.id, { material: e.target.value || undefined })} /></td>
              <td>{canEdit && <button type="button" className="btn-ghost btn-sm" aria-label={t('common.deleteLabel')} onClick={() => onChange(benchmarks.filter((x) => x.id !== b.id))}>✕</button>}</td>
            </tr>))}</tbody></table></div>
      )}
      {canEdit && <button type="button" className="btn-ghost btn-sm" data-testid="bm-add" onClick={() => onChange([...benchmarks, { id: `b${Date.now().toString(36)}`, name: t('calc.bm.newName'), date: new Date().toISOString().slice(0, 10) }])}>{t('calc.bm.add')}</button>}
    </div>
  );
}

/** Asistente de calibración: 3–5 cotizaciones reales → $/g y $/h implícitos y pisos sugeridos. */
export function QuoteCalibrator({ onAddBenchmarks, onApplyFloors, canEdit }: { onAddBenchmarks: (b: Benchmark[]) => void; onApplyFloors: (f: { perGram: number; perHour: number }) => void; canEdit: boolean }) {
  const t = useT();
  const [rows, setRows] = useState([{ g: 0, h: 0, price: 0 }, { g: 0, h: 0, price: 0 }, { g: 0, h: 0, price: 0 }]);
  const valid = rows.filter((r) => r.g > 0 && r.h > 0 && r.price > 0);
  const perG = valid.map((r) => r.price / r.g), perH = valid.map((r) => r.price / r.h);
  const ready = valid.length >= 3;
  const medG = Math.round(median(perG)), medH = Math.round(median(perH)); const lowG = Math.round(Math.min(...perG) * 0.9), lowH = Math.round(Math.min(...perH) * 0.9);
  return (
    <div className="space-y-2" data-testid="quote-calibrator">
      <h4 className="font-medium text-sm">{t('calc.cal.title')}</h4><p className="text-xs muted">{t('calc.cal.help')}</p>
      <div className="grid grid-cols-3 gap-2 max-w-md text-xs muted"><span>{t('calc.cal.grams')}</span><span>{t('calc.cal.hours')}</span><span>{t('calc.cal.price')}</span></div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-3 gap-2 max-w-md">{(['g', 'h', 'price'] as const).map((k) => <input key={k} type="number" min={0} step="any" className="input" aria-label={`${t(`calc.cal.${k === 'g' ? 'grams' : k === 'h' ? 'hours' : 'price'}`)} ${i + 1}`} value={r[k] || ''} disabled={!canEdit} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, [k]: +e.target.value || 0 } : x)))} data-testid={`cal-${k}-${i}`} />)}</div>))}
      {rows.length < 5 && canEdit && <button type="button" className="btn-ghost btn-sm" onClick={() => setRows([...rows, { g: 0, h: 0, price: 0 }])}>{t('calc.cal.addRow')}</button>}
      {ready ? (
        <div className="rounded-lg border border-slate-300 dark:border-slate-600 p-2 text-sm space-y-2" data-testid="cal-result">
          <p>{t('calc.cal.result', { perG: money(medG), perH: money(medH), n: valid.length })}</p>
          <p className="text-xs muted">{t('calc.cal.suggest', { perG: money(lowG), perH: money(lowH) })}</p>
          {canEdit && <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost btn-sm" data-testid="cal-add-bm" onClick={() => onAddBenchmarks([{ id: `b${Date.now().toString(36)}`, name: t('calc.cal.bmName'), perGram: medG, perHour: medH, date: new Date().toISOString().slice(0, 10), source: 'calibracion' }])}>{t('calc.cal.addBm')}</button>
            <button type="button" className="btn-primary btn-sm" data-testid="cal-apply" onClick={() => onApplyFloors({ perGram: lowG, perHour: lowH })}>{t('calc.cal.applyFloors')}</button></div>}
        </div>
      ) : <p className="text-xs muted">{t('calc.cal.needMore')}</p>}
    </div>
  );
}

/** «Tus números reales vs la calculadora»: nunca aplica cambios sin confirmación. */
export function RealVsCalc({ r, setR, canEdit }: { r: Rates; setR: (r: Rates) => void; canEdit: boolean }) {
  const t = useT(); const { run, pending } = useAction(); const toast = useToast();
  const [data, setData] = useState<CalibrationData | null>(null);
  const load = async () => { const res = await calibrationAction(); if (res.ok) setData(res.data); else toast.push(res.error, 'err'); };
  return (
    <div className="space-y-2" data-testid="real-vs-calc">
      <h4 className="font-medium text-sm">{t('calc.real.title')}</h4><p className="text-xs muted">{t('calc.real.help')}</p>
      <button type="button" className="btn-ghost btn-sm" onClick={load} disabled={pending} data-testid="real-load">{t('calc.real.load')}</button>
      {data && (
        data.samples === 0 ? <p className="text-sm" data-testid="real-empty">{t('calc.real.empty')}</p> : (
          <table className="w-full text-sm tabular" data-testid="real-table"><thead><tr className="muted text-left text-xs"><th>{t('calc.real.param')}</th><th>{t('calc.real.current')}</th><th>{t('calc.real.measured')}</th><th>{t('calc.real.samples')}</th><th /></tr></thead>
            <tbody>
              <tr><td>{t('calc.param.wastePct')}</td><td>{num(data.waste.current, 1)}%</td><td>{data.waste.measured != null ? `${num(data.waste.measured, 1)}%` : '—'}</td><td>{data.waste.samples}</td><td>{canEdit && data.waste.measured != null && <button type="button" className="btn-ghost btn-sm" onClick={() => setR({ ...r, wastePct: +data.waste.measured!.toFixed(1) })}>{t('calc.real.use')}</button>}</td></tr>
              <tr><td>{t('calc.param.failRatePct')}</td><td>{num(data.fail.current, 1)}%</td><td>{data.fail.measured != null ? `${num(data.fail.measured, 1)}%` : '—'}</td><td>{data.fail.samples}</td><td>{canEdit && data.fail.measured != null && <button type="button" className="btn-ghost btn-sm" onClick={() => setR({ ...r, failRatePct: +data.fail.measured!.toFixed(1) })}>{t('calc.real.use')}</button>}</td></tr>
              {data.machines.map((m) => <tr key={m.id}><td>{t('calc.real.timeFactor', { name: m.name })}</td><td>×{num(m.currentFactor, 2)}</td><td>{m.measuredFactor != null ? `×${num(m.measuredFactor, 2)}` : '—'}</td><td>{m.samples}</td><td>{canEdit && m.measuredFactor != null && <button type="button" className="btn-ghost btn-sm" onClick={() => run(() => setMachineTimeFactorAction(m.id, +m.measuredFactor!.toFixed(2)), { ok: t('calc.real.applied'), onOk: () => load() })}>{t('calc.real.use')}</button>}</td></tr>)}
            </tbody></table>)
      )}
      {data && data.samples > 0 && <p className="text-xs muted">{t('calc.real.note')}</p>}
    </div>
  );
}

const CHANGE_KEYS = (a: any, b: any) => Object.keys({ ...(a ?? {}), ...(b ?? {}) }).filter((k) => JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k]));
/** Historial de cambios de tarifas con «Restaurar». */
export function RatesHistory({ rows, canEdit }: { rows: Array<{ id: string; at: Date | string; who: string; before: any; after: any }>; canEdit: boolean }) {
  const t = useT(); const { run, pending } = useAction();
  if (!rows.length) return <p className="text-sm muted" data-testid="history-empty">{t('calc.hist.empty')}</p>;
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm" data-testid="rates-history">{rows.map((h) => {
      const keys = CHANGE_KEYS(h.before, h.after);
      return (
        <li key={h.id} className="py-2 flex flex-wrap items-center gap-2">
          <span className="tabular text-xs muted">{dmyHm(h.at)}</span><span className="font-medium">{h.who}</span>
          <span className="flex-1 min-w-0 truncate text-xs muted">{keys.length ? keys.join(', ') : t('calc.hist.noChanges')}</span>
          {canEdit && h.before && <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => { if (window.confirm(t('calc.hist.confirm'))) run(() => restoreRatesAction(h.id), { ok: t('calc.hist.restored') }); }}>{t('calc.hist.restore')}</button>}
        </li>);
    })}</ul>
  );
}

/** Pequeño bloque de «dato + valor de referencia» usado en el panel de tarifa de equilibrio. */
export function Stat2({ label, value }: { label: string; value: string }) { return <div><div className="text-[11px] muted">{label}</div><div className="font-semibold tabular">{value}</div></div>; }
void NumField;
