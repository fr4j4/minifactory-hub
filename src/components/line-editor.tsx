'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { calcLine, estimateFromMesh, type CostBreakdown } from '@/lib/pricing';
import type { CalcContext } from '@/lib/context';
import { cn, dur, grams, money, num, pct } from '@/lib/format';
import { modelBriefAction, type ModelBrief } from '@/actions/quotes';
import { sliceAction } from '@/actions/slicer';
import { LinksEditor } from './links-editor';
import type { LinkRow } from '@/actions/links';
import { useRunPolling } from './slice-panel';
import { Uploader } from './uploader';
import { Badge, Swatch } from './ui';
import { useToast } from './client';

export interface ItemState {
  uid: string; id?: string; kind: 'modelo' | 'placa' | 'manual' | 'producto'; description: string; qty: number; optional: boolean; groupName: string;
  materialId: string | null; color: string; machineId: string | null; processProfileId: string | null;
  mode: 'auto' | 'semi' | 'manual'; gramsTotal: number; hoursTotal: number; unitGrams: number; unitHours: number;
  origin: { grams?: string; hours?: string; runId?: string; engine?: string; note?: string; stale?: boolean; corrected?: boolean; file?: string };
  postMinutes: number; postSupplies: number; prepMinutes: number; shipping: number; finalUnit: number | null; sliceRunId: string | null; variantId: string | null;
  models: Array<{ modelFileId: string; fileVersionId?: string | null; qty: number; name: string }>; links: LinkRow[]; open: boolean;
}

let seq = 0;
export const uid = () => `i${Date.now().toString(36)}${seq++}`;
export function newItem(ctx: CalcContext, over: Partial<ItemState> = {}): ItemState {
  const m = ctx.machines.find((x) => x.tech === 'FDM' && !x.simulated) ?? ctx.machines[0];
  const mat = ctx.materials.find((x) => x.tech === 'fdm');
  return {
    uid: uid(), kind: 'manual', description: '', qty: 1, optional: false, groupName: '', materialId: mat?.id ?? null, color: mat?.colorName ?? '', machineId: m?.id ?? null,
    processProfileId: m?.defaultProcessProfileId ?? null, mode: 'manual', gramsTotal: 0, hoursTotal: 0, unitGrams: 0, unitHours: 0, origin: { grams: 'manual', hours: 'manual' },
    postMinutes: 0, postSupplies: 0, prepMinutes: ctx.rates.prepMinutes, shipping: 0, finalUnit: null, sliceRunId: null, variantId: null, models: [], links: [], open: true, ...over,
  };
}

/** Costos y precio sugerido de una línea, en el navegador (el servidor recalcula con los mismos datos al guardar). */
export function computeItem(it: ItemState, ctx: CalcContext, priceAdj = 0, variantInfo?: { price: number; avgCost: number }): { bd: CostBreakdown; suggestedUnit: number; cost: number } {
  const qty = Math.max(1, it.qty);
  if (it.variantId && variantInfo) {
    const price = Math.round(variantInfo.price * (1 + priceAdj / 100) / 10) * 10;
    const cost = variantInfo.avgCost * qty;
    return { bd: { material: 0, machine: 0, energy: 0, prep: 0, post: 0, failure: 0, cost, marginPct: 0, urgencyPct: 0, volumePct: 0, priceBeforeRound: price * qty, suggestedTotal: price * qty, suggestedUnit: price, shipping: it.shipping, hoursEffective: 0, gramsEffective: 0 }, suggestedUnit: price, cost };
  }
  const mat = ctx.materials.find((m) => m.id === it.materialId); const mach = ctx.machines.find((m) => m.id === it.machineId);
  const bd = calcLine({ qty, gramsTotal: it.gramsTotal, hoursTotal: it.hoursTotal, costPerKg: mat?.costPerKg ?? 0, machine: mach?.cost ?? null, prepMinutes: it.prepMinutes, postMinutesPerUnit: it.postMinutes, postSuppliesPerUnit: it.postSupplies, shipping: it.shipping, applyTimeFactor: it.mode !== 'manual' }, ctx.rates);
  const unit = priceAdj ? Math.round(bd.suggestedUnit * (1 + priceAdj / 100) / 10) * 10 : bd.suggestedUnit;
  return { bd, suggestedUnit: unit, cost: bd.cost };
}

const ORIGIN_LABEL: Record<string, string> = { slicer: 'Laminador del sitio', file: 'Archivo externo', manual: 'Manual', estimate: 'Estimado desde la malla' };
const hm = (h: number) => ({ h: Math.floor(h), m: Math.round((h - Math.floor(h)) * 60) });

export function LineEditor({ it, onChange, onRemove, onDuplicate, ctx, models, showCosts, canPrice, priceAdj, variantsById, readOnly, index, defaultFileVersion }: {
  it: ItemState; onChange: (p: Partial<ItemState>) => void; onRemove?: () => void; onDuplicate?: () => void; ctx: CalcContext; models: ModelBrief[];
  showCosts: boolean; canPrice: boolean; priceAdj: number; variantsById: Record<string, { price: number; avgCost: number; label: string; stock: number }>; readOnly?: boolean; index: number; defaultFileVersion?: string;
}) {
  const toast = useToast();
  const [library, setLibrary] = useState<ModelBrief[]>(models); const [pick, setPick] = useState(''); const [showUp, setShowUp] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const runs = useRunPolling(runId ? [runId] : []); const run = runId ? runs[runId] : null;
  const vInfo = it.variantId ? variantsById[it.variantId] : undefined;
  const { bd, suggestedUnit, cost } = useMemo(() => computeItem(it, ctx, priceAdj, vInfo), [it, ctx, priceAdj, vInfo]);
  const qty = Math.max(1, it.qty);
  const finalUnit = it.finalUnit ?? suggestedUnit; const netUnit = ctx.rates.taxMode === 'incluido' ? finalUnit / (1 + ctx.rates.taxPct / 100) : finalUnit;
  const margin = netUnit > 0 ? ((netUnit * qty - (cost - (it.shipping ?? 0))) / (netUnit * qty)) * 100 : null;
  const diff = suggestedUnit > 0 ? ((finalUnit - suggestedUnit) / suggestedUnit) * 100 : 0;
  const belowMin = margin != null && margin < ctx.rates.minMarginPct; const belowCost = margin != null && margin < 0;
  const mats = ctx.materials; const mach = ctx.machines.find((m) => m.id === it.machineId); const mat = mats.find((m) => m.id === it.materialId);
  const firstModel = it.models[0] ? library.find((m) => m.id === it.models[0].modelFileId) : null;
  const slicable = !!firstModel && !['gcode', 'gco', 'bgcode', 'png', 'jpg', 'jpeg', 'webp', 'pdf', 'svg', 'step', 'stp'].includes(firstModel.format);
  const dis = !!readOnly;

  // al terminar el laminado en el servidor, los valores pasan a la línea (con su origen)
  useEffect(() => {
    if (run?.status === 'done' && run.id !== it.origin.runId) {
      const g = run.filament.reduce((a, f) => a + f.g, 0); const h = (run.timeS ?? 0) / 3600;
      onChange({ gramsTotal: +g.toFixed(2), hoursTotal: +h.toFixed(3), sliceRunId: run.id, unitGrams: +(g / qty).toFixed(2), unitHours: +(h / qty).toFixed(3), origin: { grams: 'slicer', hours: 'slicer', runId: run.id, engine: `OrcaSlicer ${run.engineVersion}`, note: run.cached ? 'desde caché' : undefined } });
      toast.push(`Laminado: ${dur(run.timeS)} y ${grams(g)}`);
    }
    if (run?.status === 'error') toast.push(run.error ?? 'Error de laminado', 'err');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.status]);

  const addModel = async (id: string) => {
    if (!id || it.models.some((m) => m.modelFileId === id)) return;
    let b = library.find((m) => m.id === id);
    if (!b) { const r = await modelBriefAction(id); if (!r.ok) { toast.push(r.error, 'err'); return; } b = r.data; setLibrary((l) => [...l, b!]); }
    const patch: Partial<ItemState> = { models: [...it.models, { modelFileId: b.id, fileVersionId: b.versionId, qty: 1, name: b.name }], kind: 'modelo' };
    if (!it.description) patch.description = b.name;
    onChange(patch); setPick('');
  };
  const doSlice = async () => {
    if (!firstModel || !mach?.machineProfileId || !mat?.filamentProfileId || !it.processProfileId) { toast.push('Elige modelo, máquina con perfil, proceso y material', 'err'); return; }
    onChange({ origin: { ...it.origin, stale: false } });
    const r = await sliceAction({ fileVersionId: firstModel.versionId, machineProfileId: mach.machineProfileId, processProfileId: it.processProfileId, filamentProfileId: mat.filamentProfileId, copies: qty, label: `${firstModel.name} ×${qty}` });
    if (r.ok) setRunId(r.data); else toast.push(r.error, 'err');
  };
  const useSliced = (b: ModelBrief) => {
    const s = b.sliced!; const g = s.totalG ?? 0; const h = (s.timeS ?? 0) / 3600;
    onChange({ gramsTotal: +g.toFixed(2), hoursTotal: +h.toFixed(3), unitGrams: +(g / qty).toFixed(2), unitHours: +(h / qty).toFixed(3), origin: { grams: 'file', hours: 'file', file: b.name, engine: s.slicer ?? undefined, note: s.filaments.length > 1 ? `${s.filaments.length} colores` : undefined } });
  };
  const estimate = () => {
    if (!firstModel?.volumeCm3 || !firstModel.areaCm2 || !mat) { toast.push('Necesito un modelo analizado y un material para estimar', 'err'); return; }
    const e = estimateFromMesh({ volumeCm3: firstModel.volumeCm3, areaCm2: firstModel.areaCm2, infillPct: ctx.defaults.infillPct, density: mat.density, feedGph: mach?.feedGph ?? 25 });
    onChange({ unitGrams: +e.grams.toFixed(1), unitHours: +e.hours.toFixed(2), gramsTotal: +(e.grams * qty).toFixed(1), hoursTotal: +(e.hours * qty).toFixed(2), origin: { grams: 'estimate', hours: 'estimate' }, mode: 'manual' });
  };
  const setQty = (q: number) => {
    q = Math.max(1, Math.floor(q || 1));
    if (it.mode === 'manual') onChange({ qty: q, gramsTotal: +(it.unitGrams * q).toFixed(2), hoursTotal: +(it.unitHours * q).toFixed(3) });
    else onChange({ qty: q, origin: { ...it.origin, stale: it.mode === 'auto' && !!it.origin.runId } });
  };
  const manualGrams = (v: number) => onChange({ unitGrams: v, gramsTotal: +(v * qty).toFixed(2), origin: { ...it.origin, grams: it.origin.grams === 'manual' ? 'manual' : it.origin.grams, corrected: it.origin.grams !== 'manual' ? true : undefined } });
  const manualHours = (hh: number, mm: number) => { const v = hh + mm / 60; onChange({ unitHours: v, hoursTotal: +(v * qty).toFixed(3), origin: { ...it.origin, corrected: it.origin.hours !== 'manual' ? true : it.origin.corrected } }); };
  const originBadge = (k?: string, corrected?: boolean) => k ? <Badge tone={k === 'manual' ? 'gray' : k === 'estimate' ? 'amber' : 'blue'}>{ORIGIN_LABEL[k]}{corrected ? ' · corregido a mano' : ''}</Badge> : null;
  const num_ = 'input tabular';
  const unitH = hm(it.unitHours);

  return (
    <div className={cn('card', it.optional && 'opacity-80 border-dashed')} data-testid="quote-line">
      <div className="flex items-center gap-2 p-3 border-b border-slate-200 dark:border-slate-700">
        <button type="button" className="btn-ghost btn-sm !px-2" onClick={() => onChange({ open: !it.open })} aria-expanded={it.open} aria-label={it.open ? 'Contraer línea' : 'Expandir línea'}>{it.open ? '▾' : '▸'}</button>
        <div className="min-w-0 flex-1"><div className="font-medium truncate">{it.description || `Línea ${index + 1}`}</div><div className="text-xs muted">{qty} u. · {it.variantId ? vInfo?.label : `${grams(it.gramsTotal)} · ${dur(it.hoursTotal * 3600)}`}{it.groupName && ` · ${it.groupName}`}</div></div>
        <div className="text-right"><div className="font-semibold tabular" data-testid="line-total">{money(finalUnit * qty)}</div>{it.finalUnit != null && it.finalUnit !== suggestedUnit && <div className="text-xs muted tabular line-through">{money(suggestedUnit * qty)}</div>}</div>
        {!dis && <div className="hidden sm:flex gap-1">{onDuplicate && <button className="btn-ghost btn-sm" onClick={onDuplicate} aria-label="Duplicar línea">⧉</button>}{onRemove && <button className="btn-ghost btn-sm" onClick={onRemove} aria-label="Quitar línea" data-testid="line-remove">✕</button>}</div>}
      </div>
      {it.open && (
        <div className="p-3 sm:p-4 grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3 space-y-4">
            <div className="grid sm:grid-cols-4 gap-3">
              <label className="block sm:col-span-3"><span className="label">Descripción</span><input className="input" value={it.description} disabled={dis} onChange={(e) => onChange({ description: e.target.value })} placeholder="Ej. Soporte para cámara" data-testid="line-desc" /></label>
              <label className="block"><span className="label">Cantidad</span><input type="number" min={1} inputMode="numeric" className={num_} value={it.qty} disabled={dis} onChange={(e) => setQty(+e.target.value)} data-testid="line-qty" /></label>
            </div>
            {!it.variantId && (
              <>
                <div>
                  <div className="label">Modelos 3D de esta línea {it.models.length > 1 && <span className="muted">(se imprimen juntos y se cotizan por placa)</span>}</div>
                  <ul className="space-y-1.5">{it.models.map((m, i) => (
                    <li key={m.modelFileId} className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 pr-2">
                      {library.find((x) => x.id === m.modelFileId)?.thumb ? <img src={`/api/files/v/${m.fileVersionId ?? library.find((x) => x.id === m.modelFileId)?.versionId}/thumb`} alt="" className="h-10 w-12 rounded object-cover" /> : <div className="h-10 w-12 rounded bg-slate-100 dark:bg-slate-800" />}
                      <Link href={`/archivos/${m.modelFileId}`} className="flex-1 min-w-0 text-sm truncate hover:underline" target="_blank">{m.name}</Link>
                      <label className="text-xs muted flex items-center gap-1">×<input type="number" min={1} className="input !w-16 !min-h-[34px]" value={m.qty} disabled={dis} aria-label={`Cantidad de ${m.name}`} onChange={(e) => onChange({ models: it.models.map((x, k) => (k === i ? { ...x, qty: Math.max(1, +e.target.value || 1) } : x)) })} /></label>
                      {!dis && <button className="btn-ghost btn-sm" onClick={() => onChange({ models: it.models.filter((_, k) => k !== i) })} aria-label={`Quitar ${m.name}`}>✕</button>}
                    </li>))}</ul>
                  {!dis && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      <select className="input sm:!w-72" value={pick} onChange={(e) => { setPick(e.target.value); addModel(e.target.value); }} aria-label="Agregar modelo de la biblioteca" data-testid="model-pick"><option value="">+ Agregar modelo de la biblioteca…</option>{library.filter((m) => !it.models.some((x) => x.modelFileId === m.id)).map((m) => <option key={m.id} value={m.id}>{m.name} ({m.format.toUpperCase()})</option>)}</select>
                      <button type="button" className="btn-ghost" onClick={() => setShowUp((v) => !v)}>⬆ Subir archivo nuevo</button>
                    </div>
                  )}
                  {showUp && <Uploader className="mt-2" compact intent={{ intent: 'model', sync: true }} accept=".stl,.3mf,.obj,.ply,.amf,.glb,.step,.stp,.gcode" label="Suelta el archivo del cliente" onDone={(r) => { r.forEach((x) => x.ok && addModel(x.data.modelFileId)); setShowUp(false); }} />}
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <label className="block"><span className="label">Material</span><select className="input" value={it.materialId ?? ''} disabled={dis} onChange={(e) => { const m = mats.find((x) => x.id === e.target.value); onChange({ materialId: e.target.value || null, color: m?.colorName ?? it.color, origin: { ...it.origin, stale: it.mode === 'auto' && !!it.origin.runId } }); }} data-testid="line-material">{mats.map((m) => <option key={m.id} value={m.id}>{m.label} · {money(m.costPerKg)}/kg</option>)}</select></label>
                  <label className="block"><span className="label">Máquina</span><select className="input" value={it.machineId ?? ''} disabled={dis} onChange={(e) => { const m = ctx.machines.find((x) => x.id === e.target.value); onChange({ machineId: e.target.value || null, processProfileId: m?.defaultProcessProfileId ?? it.processProfileId }); }} data-testid="line-machine">{ctx.machines.map((m) => <option key={m.id} value={m.id}>{m.name}{m.simulated ? ' (simulada)' : ''}</option>)}</select></label>
                  <label className="block"><span className="label">Perfil de proceso</span><select className="input" value={it.processProfileId ?? ''} disabled={dis} onChange={(e) => onChange({ processProfileId: e.target.value || null })} data-testid="line-process"><option value="">—</option>{ctx.profiles.filter((p) => p.type === 'process').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
                </div>
                <div>
                  <div className="label">Cómo se obtienen el tiempo y los gramos</div>
                  <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-600 overflow-hidden mb-3" role="radiogroup" aria-label="Modo de cotización">
                    {([['auto', 'Automático'], ['semi', 'Semiautomático'], ['manual', 'Manual']] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={it.mode === k} disabled={dis} onClick={() => onChange({ mode: k })} className={cn('px-3 min-h-[44px] md:min-h-[36px] text-sm', it.mode === k ? 'bg-brand-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800')} data-testid={`mode-${k}`}>{l}</button>)}
                  </div>
                  {it.mode === 'auto' && (
                    <div className="space-y-2">
                      <p className="text-xs muted">Sube STL/3MF/OBJ y el sitio lo lamina con OrcaSlicer usando el perfil de máquina, proceso y material elegidos.</p>
                      <button type="button" className="btn-primary" onClick={doSlice} disabled={dis || !slicable || (!!runId && (!run || run.status === 'queued' || run.status === 'running'))} data-testid="line-slice">{runId && (!run || run.status === 'queued' || run.status === 'running') ? 'Laminando…' : `Laminar ${qty > 1 ? `${qty} copias` : 'pieza'}`}</button>
                      {!slicable && <span className="text-xs muted ml-2">Agrega un modelo STL/3MF/OBJ para laminar.</span>}
                      {it.origin.stale && <p className="text-xs text-amber-700 dark:text-amber-300">Cambiaste cantidad o material después de laminar: vuelve a laminar para actualizar tiempo y gramos.</p>}
                    </div>
                  )}
                  {it.mode === 'semi' && (
                    <div className="space-y-2">
                      <p className="text-xs muted">Elige el G-code o 3MF que laminaste en tu PC: se leen tiempo, gramos y colores del archivo.</p>
                      {library.filter((m) => m.hasSliced).length === 0 ? <p className="text-sm">No hay archivos laminados en la biblioteca. Sube un G-code o 3MF laminado con “Subir archivo nuevo”.</p> : (
                        <select className="input" aria-label="Archivo laminado" data-testid="semi-pick" value="" disabled={dis} onChange={(e) => { const b = library.find((m) => m.id === e.target.value); if (b) { addModel(b.id); useSliced(b); } }}><option value="">Elegir archivo laminado…</option>{library.filter((m) => m.hasSliced).map((m) => <option key={m.id} value={m.id}>{m.name} · {dur(m.sliced?.timeS)} · {grams(m.sliced?.totalG)}</option>)}</select>
                      )}
                      {firstModel?.sliced && it.origin.grams === 'file' && <ul className="text-xs muted">{firstModel.sliced.filaments.map((f, i) => <li key={i}>Color {i + 1}{f.color ? ` (${f.color})` : ''}: {grams(f.g)}</li>)}{firstModel.sliced.notes.map((n) => <li key={n} className="text-amber-700 dark:text-amber-300">{n}</li>)}</ul>}
                    </div>
                  )}
                  {it.mode === 'manual' && (
                    <div className="space-y-2">
                      <p className="text-xs muted">Escribe lo que viste en tu laminador, <b>por unidad</b>. Se multiplica por la cantidad.</p>
                      <div className="grid grid-cols-3 gap-3">
                        <label className="block"><span className="label">Gramos / unidad</span><input type="number" min={0} step="0.1" inputMode="decimal" className={num_} value={it.unitGrams || ''} disabled={dis} onChange={(e) => manualGrams(+e.target.value || 0)} data-testid="manual-grams" /></label>
                        <label className="block"><span className="label">Horas</span><input type="number" min={0} inputMode="numeric" className={num_} value={unitH.h || ''} disabled={dis} onChange={(e) => manualHours(+e.target.value || 0, unitH.m)} data-testid="manual-hours" /></label>
                        <label className="block"><span className="label">Minutos</span><input type="number" min={0} max={59} inputMode="numeric" className={num_} value={unitH.m || ''} disabled={dis} onChange={(e) => manualHours(unitH.h, +e.target.value || 0)} data-testid="manual-minutes" /></label>
                      </div>
                      {!dis && firstModel?.volumeCm3 && <button type="button" className="btn-ghost btn-sm" onClick={estimate}>Estimar desde la malla (volumen {num(firstModel.volumeCm3, 1)} cm³)</button>}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-2 text-xs" data-testid="line-origin">
                    <span className="muted">Origen:</span>{originBadge(it.origin.grams, it.origin.corrected)}
                    <span className="muted tabular">Total {grams(it.gramsTotal)} · {dur(it.hoursTotal * 3600)} {mach && mach.cost && it.mode !== 'manual' ? '' : ''}</span>
                    {it.origin.engine && <span className="muted">· {it.origin.engine}{it.origin.note ? ` · ${it.origin.note}` : ''}</span>}
                    {it.origin.file && <span className="muted">· {it.origin.file}</span>}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <label className="block"><span className="label">Preparación (min)</span><input type="number" min={0} inputMode="numeric" className={num_} value={it.prepMinutes} disabled={dis} onChange={(e) => onChange({ prepMinutes: +e.target.value || 0 })} /></label>
                  <label className="block"><span className="label">Post-proceso (min/u)</span><input type="number" min={0} inputMode="numeric" className={num_} value={it.postMinutes || ''} disabled={dis} onChange={(e) => onChange({ postMinutes: +e.target.value || 0 })} data-testid="line-post" /></label>
                  <label className="block"><span className="label">Insumos ($/u)</span><input type="number" min={0} inputMode="numeric" className={num_} value={it.postSupplies || ''} disabled={dis} onChange={(e) => onChange({ postSupplies: +e.target.value || 0 })} /></label>
                  <label className="block"><span className="label">Envío ($)</span><input type="number" min={0} inputMode="numeric" className={num_} value={it.shipping || ''} disabled={dis} onChange={(e) => onChange({ shipping: +e.target.value || 0 })} /></label>
                </div>
              </>
            )}
            {it.variantId && <p className="text-sm muted">Producto del catálogo: {vInfo?.label} · stock disponible {vInfo?.stock}. El precio de lista es una sugerencia; puedes cambiarlo abajo.</p>}
            <details className="text-sm"><summary className="cursor-pointer font-medium">Referencias y opciones de la línea{it.links.length ? ` (${it.links.length} link${it.links.length > 1 ? 's' : ''})` : ''}</summary>
              <div className="mt-3 space-y-3">
                <LinksEditor value={it.links} onChange={(v) => onChange({ links: v })} readOnly={dis} compact />
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="block"><span className="label">Conjunto / kit (opcional)</span><input className="input" value={it.groupName} disabled={dis} onChange={(e) => onChange({ groupName: e.target.value })} placeholder="Ej. Kit de cosplay" /></label>
                  <label className="flex items-center gap-2 text-sm pt-6"><input type="checkbox" checked={it.optional} disabled={dis} onChange={(e) => onChange({ optional: e.target.checked })} /> Línea opcional (no suma al total)</label>
                </div>
              </div>
            </details>
          </div>
          <div className="lg:col-span-2">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 p-3 space-y-3 sticky top-20">
              <div className="flex items-baseline justify-between"><span className="label !mb-0">Precio sugerido</span><span className="tabular text-lg font-semibold" data-testid="line-suggested">{money(suggestedUnit)}<span className="text-xs muted font-normal"> /u</span></span></div>
              <label className="block"><span className="label">Precio final por unidad (lo decides tú)</span>
                <div className="flex gap-2"><input type="number" min={0} inputMode="numeric" className={cn(num_, 'text-lg font-semibold', belowCost && 'ring-2 ring-red-500')} placeholder={String(suggestedUnit)} value={it.finalUnit ?? ''} disabled={dis || !canPrice} onChange={(e) => onChange({ finalUnit: e.target.value === '' ? null : Math.max(0, Math.round(+e.target.value)) })} data-testid="line-final" aria-describedby={`d${it.uid}`} />
                  {it.finalUnit != null && !dis && <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => onChange({ finalUnit: null })} data-testid="line-reset-price">Usar sugerido</button>}</div>
              </label>
              <div id={`d${it.uid}`} className="flex flex-wrap gap-1.5 text-xs" data-testid="line-chips">
                {it.finalUnit != null && it.finalUnit !== suggestedUnit && <Badge tone={diff < 0 ? 'amber' : 'blue'}>{diff > 0 ? '+' : ''}{num(diff, 1)}% vs sugerido ({money(finalUnit - suggestedUnit)}/u)</Badge>}
                {showCosts && margin != null && <Badge tone={belowCost ? 'red' : belowMin ? 'amber' : 'green'}>Margen {pct(margin, 0)}</Badge>}
                {belowCost && <Badge tone="red">Bajo el costo</Badge>}{!belowCost && belowMin && showCosts && <Badge tone="amber">Bajo el margen mínimo ({ctx.rates.minMarginPct}%)</Badge>}
              </div>
              <div className="flex items-baseline justify-between border-t border-slate-200 dark:border-slate-700 pt-2"><span className="text-sm">Total línea ({qty} u.)</span><span className="tabular font-semibold">{money(finalUnit * qty)}</span></div>
              {showCosts && !it.variantId && (
                <details className="text-xs"><summary className="cursor-pointer muted">Desglose de costos ({money(cost)})</summary>
                  <table className="w-full mt-2 tabular"><tbody>
                    {([['Material', bd.material], ['Máquina (depreciación y mantención)', bd.machine], ['Energía', bd.energy], ['Preparación', bd.prep], ['Post-proceso', bd.post], ['Riesgo de falla', bd.failure]] as const).map(([l, v]) => <tr key={l}><td className="py-0.5">{l}</td><td className="text-right">{money(v)}</td></tr>)}
                    <tr className="border-t border-slate-300 dark:border-slate-600 font-medium"><td className="py-1">Costo</td><td className="text-right">{money(bd.cost)}</td></tr>
                    <tr><td className="muted">+ margen {bd.marginPct}%{bd.urgencyPct ? ` + urgencia ${bd.urgencyPct}%` : ''}{bd.volumePct ? ` ${bd.volumePct}% volumen` : ''}</td><td className="text-right muted">{money(bd.priceBeforeRound)}</td></tr>
                  </tbody></table>
                  <p className="muted mt-1">Con {num(bd.gramsEffective, 1)} g (incluye {ctx.rates.wastePct}% de desperdicio) y {num(bd.hoursEffective, 2)} h de máquina{mach ? ` en ${mach.name}` : ''}.</p>
                </details>
              )}
            </div>
          </div>
        </div>
      )}
      {!dis && it.open && <div className="sm:hidden flex gap-2 p-3 pt-0">{onDuplicate && <button className="btn-ghost btn-sm flex-1" onClick={onDuplicate}>Duplicar línea</button>}{onRemove && <button className="btn-ghost btn-sm flex-1" onClick={onRemove}>Quitar línea</button>}</div>}
    </div>
  );
}
