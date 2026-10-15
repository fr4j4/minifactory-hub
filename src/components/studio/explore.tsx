'use client';
import { useMemo, useState } from 'react';
import { exploreAction } from '@/actions/slicer';
import type { CalcContext } from '@/lib/context';
import { useLocale, useT } from '@/i18n/client';
import { bestOf, grid, paretoFront, sweep, type Criterion, type Point, type Variant } from '@/lib/slicer/explore';
import { layerChoices } from '@/lib/slicer/nozzle';
import { labelOf, PARAMS } from '@/lib/slicer/schema';
import { dur, grams, money } from '@/lib/format';
import { Modal, useToast } from '../client';
import { priceFromRun, useRunPolling } from '../slice-panel';

const PROCESS_PARAMS = PARAMS.filter((p) => p.type === 'process' && p.kind !== 'bool');

/** Explorar: barrido de uno o dos parámetros, resultados lado a lado, gráfico tiempo vs. material con frontera de Pareto y «usar esta». */
export function Explore({ open, onClose, base, ctx, machineId, materialId, nozzle, onUse }: {
  open: boolean; onClose: () => void; base: { fileVersionId: string; machineProfileId: string; processProfileId: string; materialId: string; copies: number };
  ctx: CalcContext; machineId?: string; materialId: string; nozzle: string | null; onUse: (o: Record<string, string>) => void;
}) {
  const t = useT(); const toast = useToast(); const lang = useLocale() === 'en' ? 'en' : 'es';
  const [k1, setK1] = useState('layer_height'); const [v1, setV1] = useState(''); const [k2, setK2] = useState(''); const [v2, setV2] = useState('');
  const [ids, setIds] = useState<string[]>([]); const [variants, setVariants] = useState<Variant[]>([]); const [busy, setBusy] = useState(false);
  const runs = useRunPolling(ids, () => setBusy(false));
  const preset = (p: 'quality' | 'material' | 'strength') => {
    if (p === 'quality') { setK1('layer_height'); setV1(layerChoices(nozzle ?? '0.4').slice(0, 5).join(', ')); setK2(''); }
    if (p === 'material') { setK1('sparse_infill_density'); setV1('5%, 10%, 15%, 25%'); setK2(''); }
    if (p === 'strength') { setK1('wall_loops'); setV1('2, 3, 4'); setK2('sparse_infill_density'); setV2('15%, 30%'); }
  };
  const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
  const built = useMemo(() => (k2 && v2.trim() ? grid({ key: k1, values: list(v1) }, { key: k2, values: list(v2) }) : sweep(k1, list(v1))), [k1, v1, k2, v2]);
  const run = async () => {
    setBusy(true); const r = await exploreAction({ ...base, variants: built });
    if (!r.ok) { setBusy(false); toast.push(r.error, 'err'); return; }
    setVariants(built); setIds(r.data.ids);
  };
  const rows = ids.map((id, i) => { const r = runs[id]; const done = r?.status === 'done'; const g = done ? r.filament.reduce((a, f) => a + f.g, 0) : 0; const bd = done ? priceFromRun(ctx, r, { machineId, materialId, qty: base.copies }) : null; return { id, v: variants[i], r, done, g, price: bd?.suggestedTotal }; });
  const pts: Point[] = rows.filter((x) => x.done).map((x) => ({ id: x.id, timeS: x.r!.timeS ?? 0, grams: x.g, price: x.price }));
  const front = new Set(paretoFront(pts)); const best = (['fastest', 'cheapest', 'balanced'] as Criterion[]).map((c) => [c, bestOf(pts, c)] as const);
  const W = 360, H = 200, pad = 28; const tx = (v: number) => { const mn = Math.min(...pts.map((p) => p.timeS)), mx = Math.max(...pts.map((p) => p.timeS)); return pad + ((v - mn) / ((mx - mn) || 1)) * (W - 2 * pad); };
  const gy = (v: number) => { const mn = Math.min(...pts.map((p) => p.grams)), mx = Math.max(...pts.map((p) => p.grams)); return H - pad - ((v - mn) / ((mx - mn) || 1)) * (H - 2 * pad); };
  return (
    <Modal open={open} onClose={onClose} title={t('studio.exploreTitle')}>
      <div className="space-y-3 min-w-[min(92vw,720px)]" data-testid="explore">
        <p className="muted text-xs">{t('studio.exploreHint')}</p>
        <div className="flex flex-wrap gap-2">{(['quality', 'material', 'strength'] as const).map((p) => <button key={p} className="btn-ghost btn-sm" onClick={() => preset(p)} data-testid={`preset-${p}`}>{t(`studio.preset_${p}` as 'studio.preset_quality')}</button>)}</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block"><span className="label">{t('studio.exploreParam')}</span><select className="input" value={k1} onChange={(e) => setK1(e.target.value)} data-testid="explore-k1">{PROCESS_PARAMS.map((p) => <option key={p.key} value={p.key}>{labelOf(p, lang)}</option>)}</select></label>
          <label className="block"><span className="label">{t('studio.exploreValues')}</span><input className="input" value={v1} onChange={(e) => setV1(e.target.value)} data-testid="explore-v1" /></label>
          <label className="block"><span className="label">{t('studio.exploreParam2')}</span><select className="input" value={k2} onChange={(e) => setK2(e.target.value)}><option value="">—</option>{PROCESS_PARAMS.filter((p) => p.key !== k1).map((p) => <option key={p.key} value={p.key}>{labelOf(p, lang)}</option>)}</select></label>
          <label className="block"><span className="label">{t('studio.exploreValues')}</span><input className="input" value={v2} disabled={!k2} onChange={(e) => setV2(e.target.value)} /></label>
        </div>
        <div className="flex items-center gap-3"><button className="btn-primary" disabled={busy || built.length < 2} onClick={run} data-testid="explore-run">{busy ? t('studio.exploreRunning') : t('studio.exploreRun')}</button><span className="muted text-xs">{built.length} / 12</span></div>
        {rows.length > 0 && (
          <div className="space-y-3">
            <div className="overflow-x-auto"><table className="w-full text-sm" data-testid="explore-table"><thead><tr><th className="th">{t('studio.colVariant')}</th><th className="th text-right">{t('studio.colTime')}</th><th className="th text-right">{t('studio.colGrams')}</th><th className="th text-right">{t('studio.colPrice')}</th><th className="th" /></tr></thead>
              <tbody>{rows.map((x) => <tr key={x.id} className={front.has(x.id) ? 'bg-emerald-50/60 dark:bg-emerald-950/20' : ''}>
                <td className="td">{x.v?.label}{best.filter(([, id]) => id === x.id).map(([c]) => <span key={c} className="badge border-emerald-400 ml-1.5 text-[10px]">{t(`studio.best_${c}` as 'studio.best_fastest')}</span>)}</td>
                <td className="td text-right tabular">{x.done ? dur(x.r!.timeS) : x.r?.status === 'error' ? '✕' : '…'}</td><td className="td text-right tabular">{x.done ? grams(x.g) : ''}</td><td className="td text-right tabular">{x.price != null ? money(x.price) : ''}</td>
                <td className="td text-right">{x.done && <button className="btn-ghost btn-sm" onClick={() => { onUse(x.v.overrides); onClose(); }} data-testid="explore-use">{t('studio.useThis')}</button>}</td></tr>)}</tbody></table></div>
            {pts.length >= 2 && <figure><svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-md" role="img" aria-label={t('studio.scatter')} data-testid="explore-scatter"><rect x="0" y="0" width={W} height={H} fill="none" stroke="currentColor" opacity=".15" />
              {pts.filter((p) => front.has(p.id)).sort((a, b) => a.timeS - b.timeS).map((p, i, a) => i > 0 ? <line key={p.id} x1={tx(a[i - 1].timeS)} y1={gy(a[i - 1].grams)} x2={tx(p.timeS)} y2={gy(p.grams)} stroke="#2bb673" strokeWidth="1.5" strokeDasharray="4 3" /> : null)}
              {pts.map((p) => <circle key={p.id} cx={tx(p.timeS)} cy={gy(p.grams)} r={front.has(p.id) ? 6 : 4} fill={front.has(p.id) ? '#2bb673' : '#8b8780'}><title>{`${rows.find((r) => r.id === p.id)?.v.label}: ${dur(p.timeS)} · ${grams(p.grams)}`}</title></circle>)}
              <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="currentColor" opacity=".6">{t('studio.colTime')} →</text><text x="8" y={H / 2} fontSize="10" fill="currentColor" opacity=".6" transform={`rotate(-90 8 ${H / 2})`} textAnchor="middle">{t('studio.colGrams')} →</text></svg><figcaption className="muted text-xs">{t('studio.pareto')}</figcaption></figure>}
          </div>)}
      </div>
    </Modal>
  );
}
