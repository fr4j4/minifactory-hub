'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { estimateFromDims, estimateFromMesh, pickProfileId, type CostBreakdown, type FillKind, type Rates } from '@/lib/pricing';
import { fromCalcOpts, priceLine, toCalcOpts, toItemMaterial, type ItemOverrides } from '@/lib/item-price';
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
import { ConfidenceBadge, ExpertTools, Hint, PriceBand, WarningList, WhyPrice, atLeast, type CalcLevel } from './calc-bits';
import { profileDesc, profileName, tagName } from '@/lib/calc-presets';
import { useT } from '@/i18n/client';
import { tOr } from '@/i18n/translate';

export interface ItemState {
  uid: string; id?: string; kind: 'modelo' | 'placa' | 'manual' | 'producto'; description: string; qty: number; optional: boolean; groupName: string;
  materialId: string | null; color: string; machineId: string | null; processProfileId: string | null;
  mode: 'auto' | 'semi' | 'manual'; gramsTotal: number; hoursTotal: number; unitGrams: number; unitHours: number;
  origin: { grams?: string; hours?: string; runId?: string; engine?: string; note?: string; stale?: boolean; corrected?: boolean; file?: string };
  postMinutes: number; postSupplies: number; prepMinutes: number; shipping: number; finalUnit: number | null; sliceRunId: string | null; variantId: string | null;
  models: Array<{ modelFileId: string; fileVersionId?: string | null; qty: number; name: string }>; links: LinkRow[]; open: boolean;
  /* cálculo v2 */
  calcProfileId: string | null; plates: number; designMinutes: number; colorChanges: number; tags: string[]; overrides: ItemOverrides;
  filaments: Array<{ g: number; materialId: string }>; dims: { l: number; w: number; h: number; fill: FillKind };
}

/** Contexto comercial que afecta el precio de una línea (cliente, canal, urgencia, perfil del presupuesto). */
export interface CalcEnv { priceAdj?: number; urgency?: string; quoteProfileId?: string | null; customerProfileId?: string | null; channelId?: string | null }

let seq = 0;
export const uid = () => `i${Date.now().toString(36)}${seq++}`;
export function newItem(ctx: CalcContext, over: Partial<ItemState> = {}): ItemState {
  const m = ctx.machines.find((x) => x.tech === 'FDM' && !x.simulated) ?? ctx.machines[0];
  const mat = ctx.materials.find((x) => x.tech === 'fdm');
  return {
    uid: uid(), kind: 'manual', description: '', qty: 1, optional: false, groupName: '', materialId: mat?.id ?? null, color: mat?.colorName ?? '', machineId: m?.id ?? null,
    processProfileId: m?.defaultProcessProfileId ?? null, mode: 'manual', gramsTotal: 0, hoursTotal: 0, unitGrams: 0, unitHours: 0, origin: { grams: 'manual', hours: 'manual' },
    postMinutes: ctx.rates.engine === 'legacy' ? 0 : ctx.rates.postMinutes ?? 0, postSupplies: 0, prepMinutes: ctx.rates.prepMinutes, shipping: 0, finalUnit: null, sliceRunId: null, variantId: null, models: [], links: [], open: true,
    calcProfileId: null, plates: 1, designMinutes: 0, colorChanges: 0, tags: [], overrides: {}, filaments: [], dims: { l: 0, w: 0, h: 0, fill: 'normal' },
    ...over,
  };
}

export { toCalcOpts, fromCalcOpts };

export interface ComputedItem { bd: CostBreakdown; suggestedUnit: number; cost: number; rates: Rates; profileId: string | null }
/** Costos y precio sugerido de una línea, en el navegador (el servidor usa la misma función `priceLine` al guardar). */
export function computeItem(it: ItemState, ctx: CalcContext, env: CalcEnv = {}, variantInfo?: { price: number; avgCost: number }): ComputedItem {
  const qty = Math.max(1, it.qty);
  if (it.variantId && variantInfo) {
    const price = Math.round(variantInfo.price * (1 + (env.priceAdj ?? 0) / 100) / 10) * 10;
    const cost = variantInfo.avgCost * qty;
    return { bd: { material: 0, machine: 0, energy: 0, prep: 0, post: 0, failure: 0, cost, marginPct: 0, urgencyPct: 0, volumePct: 0, priceBeforeRound: price * qty, suggestedTotal: price * qty, suggestedUnit: price, shipping: it.shipping, hoursEffective: 0, gramsEffective: 0 }, suggestedUnit: price, cost, rates: ctx.rates, profileId: null };
  }
  const mat = ctx.materials.find((m) => m.id === it.materialId); const mach = ctx.machines.find((m) => m.id === it.machineId);
  const ch = env.channelId ? ctx.channels.find((c) => c.id === env.channelId) : undefined;
  const p = priceLine({
    qty, gramsTotal: it.gramsTotal, hoursTotal: it.hoursTotal, mode: it.mode, originKind: it.origin.grams, prepMinutes: it.prepMinutes, postMinutes: it.postMinutes, postSupplies: it.postSupplies,
    shipping: it.shipping, profileId: it.calcProfileId, opts: toCalcOpts(it),
  }, {
    rates: ctx.rates, profiles: ctx.calcProfiles, material: toItemMaterial(mat), machine: mach?.cost ?? null, materialById: (id) => toItemMaterial(ctx.materials.find((m) => m.id === id)) ?? undefined,
    urgency: env.urgency, priceAdjPct: env.priceAdj, quoteProfileId: env.quoteProfileId, customerProfileId: env.customerProfileId, channelProfileId: ch?.calcProfileId, channelFeePct: ch?.commissionPct,
  });
  return { bd: p.bd, suggestedUnit: p.suggestedUnit, cost: p.cost, rates: p.rates, profileId: p.profileId };
}

const ORIGIN_LABEL: Record<string, string> = { slicer: 'Laminador del sitio', file: 'Archivo externo', manual: 'Manual', estimate: 'Estimado desde la malla' };
void ORIGIN_LABEL;
const hm = (h: number) => ({ h: Math.floor(h), m: Math.round((h - Math.floor(h)) * 60) });
const OVERRIDE_FIELDS: Array<{ key: keyof ItemOverrides; label: string; step?: string }> = [
  { key: 'marginPct', label: 'margin' }, { key: 'wastePct', label: 'waste' }, { key: 'failRatePct', label: 'fail' }, { key: 'laborHour', label: 'labor' }, { key: 'supervisionMinPerHour', label: 'supervision' }, { key: 'payFeePct', label: 'payFee' },
];

export function LineEditor({ it, onChange, onRemove, onDuplicate, ctx, models, showCosts, canPrice, env, level, variantsById, readOnly, index, defaultFileVersion }: {
  it: ItemState; onChange: (p: Partial<ItemState>) => void; onRemove?: () => void; onDuplicate?: () => void; ctx: CalcContext; models: ModelBrief[];
  showCosts: boolean; canPrice: boolean; env: CalcEnv; level: CalcLevel; variantsById: Record<string, { price: number; avgCost: number; label: string; stock: number }>; readOnly?: boolean; index: number; defaultFileVersion?: string;
}) {
  const t = useT();
  const toast = useToast();
  const [library, setLibrary] = useState<ModelBrief[]>(models); const [pick, setPick] = useState(''); const [showUp, setShowUp] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [estOpen, setEstOpen] = useState(it.origin.grams === 'estimate');
  const runs = useRunPolling(runId ? [runId] : []); const run = runId ? runs[runId] : null;
  const vInfo = it.variantId ? variantsById[it.variantId] : undefined;
  const legacy = ctx.rates.engine === 'legacy';
  const { bd, suggestedUnit, cost, rates: rt, profileId } = useMemo(() => computeItem(it, ctx, env, vInfo), [it, ctx, env, vInfo]);
  const qty = Math.max(1, it.qty);
  const finalUnit = it.finalUnit ?? suggestedUnit;
  const netUnit = legacy && ctx.rates.taxMode === 'incluido' ? finalUnit / (1 + ctx.rates.taxPct / 100) : finalUnit;
  const margin = netUnit > 0 ? ((netUnit * qty - cost) / (netUnit * qty)) * 100 : null;
  const diff = suggestedUnit > 0 ? ((finalUnit - suggestedUnit) / suggestedUnit) * 100 : 0;
  const belowMin = margin != null && margin < rt.minMarginPct; const belowCost = margin != null && margin < 0;
  const mats = ctx.materials; const mach = ctx.machines.find((m) => m.id === it.machineId); const mat = mats.find((m) => m.id === it.materialId);
  const firstModel = it.models[0] ? library.find((m) => m.id === it.models[0].modelFileId) : null;
  const slicable = !!firstModel && !['gcode', 'gco', 'bgcode', 'png', 'jpg', 'jpeg', 'webp', 'pdf', 'svg', 'step', 'stp'].includes(firstModel.format);
  const dis = !!readOnly;
  const det = atLeast(level, 'detallado'); const exp = level === 'experto';
  const profiles = ctx.calcProfiles.filter((p) => !p.archived);
  const defaultProfileId = pickProfileId([], ctx.calcProfiles);
  const curProfile = ctx.calcProfiles.find((p) => p.id === profileId);
  const rounding = rt.rounding.mode === 'step' ? Math.max(1, rt.rounding.step) : 10;
  // «¿qué cambia si uso otro perfil?» (frente al perfil por defecto)
  const baseAlt = useMemo(() => (!legacy && det && profileId && defaultProfileId && profileId !== defaultProfileId ? computeItem({ ...it, calcProfileId: defaultProfileId }, ctx, { ...env, quoteProfileId: null, customerProfileId: null }, vInfo) : null), [legacy, det, profileId, defaultProfileId, it, ctx, env, vInfo]);

  // al terminar el laminado en el servidor, los valores pasan a la línea (con su origen)
  useEffect(() => {
    if (run?.status === 'done' && run.id !== it.origin.runId) {
      const g = run.filament.reduce((a, f) => a + f.g, 0); const h = (run.timeS ?? 0) / 3600;
      onChange({ gramsTotal: +g.toFixed(2), hoursTotal: +h.toFixed(3), sliceRunId: run.id, unitGrams: +(g / qty).toFixed(2), unitHours: +(h / qty).toFixed(3), origin: { grams: 'slicer', hours: 'slicer', runId: run.id, engine: `OrcaSlicer ${run.engineVersion}`, note: run.cached ? t('calculator.fromCache') : undefined } });
      toast.push(t('calculator.sliceAnd', { dur: dur(run.timeS), grams: grams(g) }));
    }
    if (run?.status === 'error') toast.push(run.error ?? t('calculator.slicingError'), 'err');
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
    if (!firstModel || !mach?.machineProfileId || !mat?.filamentProfileId || !it.processProfileId) { toast.push(t('calculator.chooseAModelAMachine'), 'err'); return; }
    onChange({ origin: { ...it.origin, stale: false } });
    const r = await sliceAction({ fileVersionId: firstModel.versionId, machineProfileId: mach.machineProfileId, processProfileId: it.processProfileId, filamentProfileId: mat.filamentProfileId, copies: qty, label: `${firstModel.name} ×${qty}` });
    if (r.ok) setRunId(r.data); else toast.push(r.error, 'err');
  };
  const useSliced = (b: ModelBrief) => {
    const s = b.sliced!; const g = s.totalG ?? 0; const h = (s.timeS ?? 0) / 3600;
    onChange({ gramsTotal: +g.toFixed(2), hoursTotal: +h.toFixed(3), unitGrams: +(g / qty).toFixed(2), unitHours: +(h / qty).toFixed(3), origin: { grams: 'file', hours: 'file', file: b.name, engine: s.slicer ?? undefined, note: s.filaments.length > 1 ? t('calc.colorsN', { n: s.filaments.length }) : undefined } });
  };
  const applyEstimate = (e: { grams: number; hours: number }) => {
    onChange({ unitGrams: +e.grams.toFixed(1), unitHours: +e.hours.toFixed(2), gramsTotal: +(e.grams * qty).toFixed(1), hoursTotal: +(e.hours * qty).toFixed(2), origin: { grams: 'estimate', hours: 'estimate' }, mode: 'manual' });
  };
  const estimate = () => {
    if (!firstModel?.volumeCm3 || !firstModel.areaCm2 || !mat) { toast.push(t('calculator.iNeedAnAnalyzedModel'), 'err'); return; }
    applyEstimate(estimateFromMesh({ volumeCm3: firstModel.volumeCm3, areaCm2: firstModel.areaCm2, infillPct: ctx.defaults.infillPct, density: mat.density, feedGph: mach?.feedGph ?? 25 }));
  };
  const estimateDims = () => {
    if (!mat || !(it.dims.l > 0 && it.dims.w > 0 && it.dims.h > 0)) { toast.push(t('calc.est.needDims'), 'err'); return; }
    applyEstimate(estimateFromDims({ lengthMm: it.dims.l, widthMm: it.dims.w, heightMm: it.dims.h, fill: it.dims.fill, density: mat.density, feedGph: mach?.feedGph ?? 25 }));
  };
  const setQty = (q: number) => {
    q = Math.max(1, Math.floor(q || 1));
    if (it.mode === 'manual') onChange({ qty: q, gramsTotal: +(it.unitGrams * q).toFixed(2), hoursTotal: +(it.unitHours * q).toFixed(3) });
    else onChange({ qty: q, origin: { ...it.origin, stale: it.mode === 'auto' && !!it.origin.runId } });
  };
  const manualGrams = (v: number) => onChange({ unitGrams: v, gramsTotal: +(v * qty).toFixed(2), origin: { ...it.origin, grams: it.origin.grams === 'manual' ? 'manual' : it.origin.grams, corrected: it.origin.grams !== 'manual' ? true : undefined } });
  const manualHours = (hh: number, mm: number) => { const v = hh + mm / 60; onChange({ unitHours: v, hoursTotal: +(v * qty).toFixed(3), origin: { ...it.origin, corrected: it.origin.hours !== 'manual' ? true : it.origin.corrected } }); };
  const setFilaments = (f: ItemState['filaments']) => { const sum = f.reduce((a, x) => a + (x.g || 0), 0); onChange(f.length ? { filaments: f, gramsTotal: +sum.toFixed(2), unitGrams: +(sum / qty).toFixed(2) } : { filaments: [] }); };
  const originBadge = (k?: string, corrected?: boolean) => k ? <Badge tone={k === 'manual' ? 'gray' : k === 'estimate' ? 'amber' : 'blue'}>{tOr(t, `calculator.origin.${k}`, k)}{corrected ? ` · ${t('calculator.manuallyCorrected')}` : ''}</Badge> : null;
  const num_ = 'input tabular';
  const unitH = hm(it.unitHours);
  const showModels = det || it.mode === 'auto' || it.mode === 'semi';
  const weightMode: 'auto' | 'semi' | 'manual' | 'estimate' = it.mode === 'manual' && (estOpen || it.origin.grams === 'estimate') ? 'estimate' : it.mode;
  const pickWeight = (k: typeof weightMode) => {
    if (k === 'estimate') { setEstOpen(true); onChange({ mode: 'manual' }); return; }
    setEstOpen(false);
    // «Lo sé» después de estimar: los valores pasan a ser tuyos (ya no son una estimación)
    onChange(k === 'manual' && it.origin.grams === 'estimate' ? { mode: 'manual', origin: { grams: 'manual', hours: 'manual' } } : { mode: k });
  };
  const itemInput = { qty, gramsTotal: it.gramsTotal, hoursTotal: it.hoursTotal, mode: it.mode, originKind: it.origin.grams, prepMinutes: it.prepMinutes, postMinutes: it.postMinutes, postSupplies: it.postSupplies, shipping: it.shipping, profileId: it.calcProfileId, opts: toCalcOpts(it) };
  const exEnv = {
    rates: ctx.rates, profiles: ctx.calcProfiles, material: toItemMaterial(mat), machine: mach?.cost ?? null, materialById: (id: string) => toItemMaterial(ctx.materials.find((m) => m.id === id)) ?? undefined,
    urgency: env.urgency, priceAdjPct: env.priceAdj, quoteProfileId: env.quoteProfileId, customerProfileId: env.customerProfileId, channelProfileId: env.channelId ? ctx.channels.find((c) => c.id === env.channelId)?.calcProfileId : null,
    channelFeePct: env.channelId ? ctx.channels.find((c) => c.id === env.channelId)?.commissionPct : null,
  };
  const expertEnv = useMemo(() => exEnv, [ctx, env, mat, mach]); // eslint-disable-line react-hooks/exhaustive-deps
  const scenario = (o: { profileId?: string | null; machineId?: string | null; materialId?: string | null; qty?: number }) => {
    const q = Math.max(1, o.qty ?? qty); const s = q / qty;
    const alt = computeItem({ ...it, calcProfileId: o.profileId !== undefined ? o.profileId : it.calcProfileId, machineId: o.machineId !== undefined ? o.machineId : it.machineId, materialId: o.materialId !== undefined ? o.materialId : it.materialId, qty: q, gramsTotal: it.gramsTotal * s, hoursTotal: it.hoursTotal * s, plates: Math.max(1, Math.ceil(it.plates * s)) }, ctx, env, vInfo);
    const total = alt.suggestedUnit * q;
    return { unit: alt.suggestedUnit, total, margin: total > 0 ? ((total - alt.cost) / total) * 100 : null, perHour: alt.bd.hoursEffective > 0 ? total / alt.bd.hoursEffective : 0, cost: alt.cost };
  };

  return (
    <div className={cn('card', it.optional && 'opacity-80 border-dashed')} data-testid="quote-line">
      <div className="flex items-center gap-2 p-3 border-b border-slate-200 dark:border-slate-700">
        <button type="button" className="btn-ghost btn-sm !px-2" onClick={() => onChange({ open: !it.open })} aria-expanded={it.open} aria-label={it.open ? t('calculator.collapseItem') : t('calculator.expandItem')}>{it.open ? '▾' : '▸'}</button>
        <div className="min-w-0 flex-1"><div className="font-medium truncate">{it.description || t('calculator.item', { index: index + 1 })}</div><div className="text-xs muted">{t('calculator.unitsShort', { n: qty })} · {it.variantId ? vInfo?.label : `${grams(it.gramsTotal)} · ${dur(it.hoursTotal * 3600)}`}{it.groupName && ` · ${it.groupName}`}</div></div>
        <div className="text-right"><div className="font-semibold tabular" data-testid="line-total">{money(finalUnit * qty)}</div>{it.finalUnit != null && it.finalUnit !== suggestedUnit && <div className="text-xs muted tabular line-through">{money(suggestedUnit * qty)}</div>}</div>
        {!dis && <div className="hidden sm:flex gap-1">{onDuplicate && <button className="btn-ghost btn-sm" onClick={onDuplicate} aria-label={t('calculator.duplicateItem')}>⧉</button>}{onRemove && <button className="btn-ghost btn-sm" onClick={onRemove} aria-label={t('calculator.removeItem')} data-testid="line-remove">✕</button>}</div>}
      </div>
      {it.open && (
        <div className="p-3 sm:p-4 grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3 space-y-4">
            <div className="grid sm:grid-cols-4 gap-3">
              <label className="block sm:col-span-3"><span className="label">{t('common.description')}</span><input className="input" value={it.description} disabled={dis} onChange={(e) => onChange({ description: e.target.value })} placeholder={t('calculator.eGCameraMount')} data-testid="line-desc" /></label>
              <label className="block"><span className="label">{t('common.quantity')}</span><input type="number" min={1} inputMode="numeric" className={num_} value={it.qty} disabled={dis} onChange={(e) => setQty(+e.target.value)} data-testid="line-qty" /></label>
            </div>
            {!it.variantId && (
              <>
                {showModels && (
                  <div>
                    <div className="label">{t('calculator.n3dModelsInThisItem')} {it.models.length > 1 && <span className="muted">{t('calculator.printedTogetherAndQuotedPer')}</span>}</div>
                    <ul className="space-y-1.5">{it.models.map((m, i) => (
                      <li key={m.modelFileId} className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 pr-2">
                        {library.find((x) => x.id === m.modelFileId)?.thumb ? <img src={`/api/files/v/${m.fileVersionId ?? library.find((x) => x.id === m.modelFileId)?.versionId}/thumb`} alt="" className="h-10 w-12 rounded object-cover" /> : <div className="h-10 w-12 rounded bg-slate-100 dark:bg-slate-800" />}
                        <Link href={`/archivos/${m.modelFileId}`} className="flex-1 min-w-0 text-sm truncate hover:underline" target="_blank">{m.name}</Link>
                        <label className="text-xs muted flex items-center gap-1">×<input type="number" min={1} className="input !w-16 !min-h-[34px]" value={m.qty} disabled={dis} aria-label={t('calculator.quantityOf', { m: m.name })} onChange={(e) => onChange({ models: it.models.map((x, k) => (k === i ? { ...x, qty: Math.max(1, +e.target.value || 1) } : x)) })} /></label>
                        {!dis && <button className="btn-ghost btn-sm" onClick={() => onChange({ models: it.models.filter((_, k) => k !== i) })} aria-label={t('calculator.remove', { m: m.name })}>✕</button>}
                      </li>))}</ul>
                    {!dis && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        <select className="input sm:!w-72" value={pick} onChange={(e) => { setPick(e.target.value); addModel(e.target.value); }} aria-label={t('calculator.addAModelFromThe')} data-testid="model-pick"><option value="">{t('calculator.addAModelFromThe2')}</option>{library.filter((m) => !it.models.some((x) => x.modelFileId === m.id)).map((m) => <option key={m.id} value={m.id}>{m.name} ({m.format.toUpperCase()})</option>)}</select>
                        <button type="button" className="btn-ghost" onClick={() => setShowUp((v) => !v)}>{t('calculator.uploadANewFile')}</button>
                      </div>
                    )}
                    {showUp && <Uploader className="mt-2" compact intent={{ intent: 'model', sync: true }} accept=".stl,.3mf,.obj,.ply,.amf,.glb,.step,.stp,.gcode" label={t('calculator.dropTheCustomerSFile')} onDone={(r) => { r.forEach((x) => x.ok && addModel(x.data.modelFileId)); setShowUp(false); }} />}
                  </div>
                )}
                <div className="grid sm:grid-cols-3 gap-3">
                  <label className="block"><span className="label">{t('common.material')}</span><select className="input" value={it.materialId ?? ''} disabled={dis} onChange={(e) => { const m = mats.find((x) => x.id === e.target.value); onChange({ materialId: e.target.value || null, color: m?.colorName ?? it.color, origin: { ...it.origin, stale: it.mode === 'auto' && !!it.origin.runId } }); }} data-testid="line-material">{mats.map((m) => <option key={m.id} value={m.id}>{m.label} · {money(m.costPerKg)}/kg</option>)}</select></label>
                  {(det || it.mode === 'auto') && <label className="block"><span className="label">{t('common.machine')}</span><select className="input" value={it.machineId ?? ''} disabled={dis} onChange={(e) => { const m = ctx.machines.find((x) => x.id === e.target.value); onChange({ machineId: e.target.value || null, processProfileId: m?.defaultProcessProfileId ?? it.processProfileId }); }} data-testid="line-machine">{ctx.machines.map((m) => <option key={m.id} value={m.id}>{m.name}{m.simulated ? ` ${t('calc.simulatedTag')}` : ''}</option>)}</select></label>}
                  {(det || it.mode === 'auto') && <label className="block"><span className="label">{t('calculator.processProfile')}</span><select className="input" value={it.processProfileId ?? ''} disabled={dis} onChange={(e) => onChange({ processProfileId: e.target.value || null })} data-testid="line-process"><option value="">—</option>{ctx.profiles.filter((p) => p.type === 'process').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
                  {det && !legacy && (
                    <label className="block"><span className="label">{t('calc.field.profile')}<Hint text={t('calc.help.profile')} /></span>
                      <select className="input" value={it.calcProfileId ?? ''} disabled={dis} onChange={(e) => onChange({ calcProfileId: e.target.value || null })} data-testid="line-profile">
                        <option value="">{t('calc.field.profileAuto', { name: curProfile?.name ?? '—' })}</option>
                        {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      {curProfile?.description && <span className="text-xs muted block mt-1">{profileDesc(t, curProfile)}</span>}
                    </label>
                  )}
                </div>
                <div>
                  <div className="label">{t('calc.weight.title')}</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3" role="radiogroup" aria-label={t('calculator.quoteMode')}>
                    {(['auto', 'semi', 'manual', 'estimate'] as const).map((k) => (
                      <button key={k} type="button" role="radio" aria-checked={weightMode === k} disabled={dis} onClick={() => pickWeight(k)} data-testid={`mode-${k}`}
                        className={cn('rounded-lg border p-2 text-left min-h-[56px] text-sm', weightMode === k ? 'border-[var(--panel)] bg-[var(--panel)] text-[var(--panel-ink)] dark:bg-slate-700 dark:border-slate-500' : 'border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800')}>
                        <span className="block font-medium">{t(`calc.weight.${k}`)}</span><span className={cn('block text-xs', weightMode === k ? 'opacity-80' : 'muted')}>{t(`calc.weight.${k}Desc`)}</span>
                      </button>))}
                  </div>
                  {it.mode === 'auto' && (
                    <div className="space-y-2">
                      <p className="text-xs muted">{t('calculator.uploadAnStl3mfObj')}</p>
                      <button type="button" className="btn-primary" onClick={doSlice} disabled={dis || !slicable || (!!runId && (!run || run.status === 'queued' || run.status === 'running'))} data-testid="line-slice">{runId && (!run || run.status === 'queued' || run.status === 'running') ? t('common.slicing') : (qty > 1 ? t('calculator.sliceCopies', { n: qty }) : t('calculator.slicePart'))}</button>
                      {!slicable && <span className="text-xs muted ml-2">{t('calculator.addAnStl3mfObj')}</span>}
                      {it.origin.stale && <p className="text-xs text-amber-700 dark:text-amber-300">{t('calculator.youChangedTheQuantityOr')}</p>}
                    </div>
                  )}
                  {it.mode === 'semi' && (
                    <div className="space-y-2">
                      <p className="text-xs muted">{t('calculator.chooseTheGCodeOr')}</p>
                      {library.filter((m) => m.hasSliced).length === 0 ? <p className="text-sm">{t('calculator.thereAreNoSlicedFiles')}</p> : (
                        <select className="input" aria-label={t('calculator.slicedFile')} data-testid="semi-pick" value="" disabled={dis} onChange={(e) => { const b = library.find((m) => m.id === e.target.value); if (b) { addModel(b.id); useSliced(b); } }}><option value="">{t('calculator.chooseASlicedFile')}</option>{library.filter((m) => m.hasSliced).map((m) => <option key={m.id} value={m.id}>{m.name} · {dur(m.sliced?.timeS)} · {grams(m.sliced?.totalG)}</option>)}</select>
                      )}
                      {firstModel?.sliced && it.origin.grams === 'file' && <ul className="text-xs muted">{firstModel.sliced.filaments.map((f, i) => <li key={i}>{t('files.colorN', { n: i + 1 })}{f.color ? ` (${f.color})` : ''}: {grams(f.g)}</li>)}{firstModel.sliced.notes.map((n) => <li key={n} className="text-amber-700 dark:text-amber-300">{tOr(t, n, n)}</li>)}</ul>}
                    </div>
                  )}
                  {it.mode === 'manual' && (
                    <div className="space-y-2">
                      {weightMode === 'estimate' && (
                        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 p-3 space-y-2" data-testid="estimator">
                          <p className="text-xs muted">{t('calc.est.help')}</p>
                          <div className="grid grid-cols-3 gap-2">
                            {([['l', 'length'], ['w', 'width'], ['h', 'height']] as const).map(([k, lbl]) => <label key={k} className="block"><span className="label">{t(`calc.est.${lbl}`)}</span><input type="number" min={0} inputMode="numeric" className={num_} value={it.dims[k] || ''} disabled={dis} onChange={(e) => onChange({ dims: { ...it.dims, [k]: +e.target.value || 0 } })} data-testid={`est-${k}`} /></label>)}
                          </div>
                          <div className="flex flex-wrap items-end gap-2">
                            <label className="block"><span className="label">{t('calc.est.fill')}</span><select className="input" value={it.dims.fill} disabled={dis} onChange={(e) => onChange({ dims: { ...it.dims, fill: e.target.value as FillKind } })} data-testid="est-fill">{(['hueca', 'normal', 'maciza'] as const).map((f) => <option key={f} value={f}>{t(`calc.est.${f}`)}</option>)}</select></label>
                            <button type="button" className="btn-primary btn-sm" disabled={dis} onClick={estimateDims} data-testid="est-apply">{t('calc.est.apply')}</button>
                            {!dis && firstModel?.volumeCm3 && <button type="button" className="btn-ghost btn-sm" onClick={estimate}>{t('calculator.estimateFromMesh', { volume: num(firstModel.volumeCm3, 1) })}</button>}
                          </div>
                        </div>
                      )}
                      <p className="text-xs muted">{t('calculator.manualHelp1')} <b>{t('calculator.perUnit')}</b>. {t('calculator.manualHelp2')}</p>
                      <div className="grid grid-cols-3 gap-3">
                        <label className="block"><span className="label">{t('calculator.gramsUnit')}</span><input type="number" min={0} step="0.1" inputMode="decimal" className={num_} value={it.unitGrams || ''} disabled={dis || it.filaments.length > 0} onChange={(e) => manualGrams(+e.target.value || 0)} data-testid="manual-grams" /></label>
                        <label className="block"><span className="label">{t('common.hours')}</span><input type="number" min={0} inputMode="numeric" className={num_} value={unitH.h || ''} disabled={dis} onChange={(e) => manualHours(+e.target.value || 0, unitH.m)} data-testid="manual-hours" /></label>
                        <label className="block"><span className="label">{t('calculator.minutes')}</span><input type="number" min={0} max={59} inputMode="numeric" className={num_} value={unitH.m || ''} disabled={dis} onChange={(e) => manualHours(unitH.h, +e.target.value || 0)} data-testid="manual-minutes" /></label>
                      </div>
                      {weightMode !== 'estimate' && !dis && firstModel?.volumeCm3 && <button type="button" className="btn-ghost btn-sm" onClick={estimate}>{t('calculator.estimateFromMesh', { volume: num(firstModel.volumeCm3, 1) })}</button>}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-2 text-xs" data-testid="line-origin">
                    <span className="muted">{t('calculator.source')}</span>{originBadge(it.origin.grams, it.origin.corrected)}
                    <span className="muted tabular">{t('common.total')} {grams(it.gramsTotal)} · {dur(it.hoursTotal * 3600)}</span>
                    {it.origin.engine && <span className="muted">· {it.origin.engine}{it.origin.note ? ` · ${it.origin.note}` : ''}</span>}
                    {it.origin.file && <span className="muted">· {it.origin.file}</span>}
                  </div>
                </div>
                {det && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <label className="block"><span className="label">{legacy ? t('calculator.preparationMin') : t('calc.field.prepPlate')}<Hint text={t('calc.help.prep')} /></span><input type="number" min={0} inputMode="numeric" className={num_} value={it.prepMinutes} disabled={dis} onChange={(e) => onChange({ prepMinutes: +e.target.value || 0 })} /></label>
                    <label className="block"><span className="label">{t('calculator.postProcessingMinUnit')}</span><input type="number" min={0} inputMode="numeric" className={num_} value={it.postMinutes || ''} disabled={dis} onChange={(e) => onChange({ postMinutes: +e.target.value || 0 })} data-testid="line-post" /></label>
                    <label className="block"><span className="label">{t('calculator.suppliesUnit')}</span><input type="number" min={0} inputMode="numeric" className={num_} value={it.postSupplies || ''} disabled={dis} onChange={(e) => onChange({ postSupplies: +e.target.value || 0 })} /></label>
                    <label className="block"><span className="label">{t('calculator.shipping')}</span><input type="number" min={0} inputMode="numeric" className={num_} value={it.shipping || ''} disabled={dis} onChange={(e) => onChange({ shipping: +e.target.value || 0 })} /></label>
                  </div>
                )}
                {det && !legacy && (rt.complexityTags ?? []).length > 0 && (
                  <fieldset><legend className="label">{t('calc.field.tags')}<Hint text={t('calc.help.tags')} /></legend>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">{(rt.complexityTags ?? []).map((tg) => <label key={tg.key} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={it.tags.includes(tg.key)} disabled={dis} onChange={(e) => onChange({ tags: e.target.checked ? [...it.tags, tg.key] : it.tags.filter((x) => x !== tg.key) })} data-testid={`tag-${tg.key}`} />{tagName(t, tg)}</label>)}</div>
                  </fieldset>
                )}
                {exp && !legacy && (
                  <div className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-700 p-3" data-testid="expert-fields">
                    <div className="grid grid-cols-3 gap-3">
                      <label className="block"><span className="label">{t('calc.field.plates')}<Hint text={t('calc.help.plates')} /></span><input type="number" min={1} className={num_} value={it.plates} disabled={dis} onChange={(e) => onChange({ plates: Math.max(1, Math.floor(+e.target.value || 1)) })} data-testid="line-plates" /></label>
                      <label className="block"><span className="label">{t('calc.field.design')}</span><input type="number" min={0} className={num_} value={it.designMinutes || ''} disabled={dis} onChange={(e) => onChange({ designMinutes: Math.max(0, +e.target.value || 0) })} data-testid="line-design" /></label>
                      <label className="block"><span className="label">{t('calc.field.colorChanges')}</span><input type="number" min={0} className={num_} value={it.colorChanges || ''} disabled={dis} onChange={(e) => onChange({ colorChanges: Math.max(0, +e.target.value || 0) })} /></label>
                    </div>
                    <div>
                      <div className="label">{t('calc.field.multicolor')}<Hint text={t('calc.help.multicolor')} /></div>
                      {it.filaments.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 mb-1.5">
                          <input type="number" min={0} step="0.1" className="input !w-24" aria-label={t('calc.field.gramsColor')} value={f.g || ''} disabled={dis} onChange={(e) => setFilaments(it.filaments.map((x, k) => (k === i ? { ...x, g: +e.target.value || 0 } : x)))} />
                          <select className="input" aria-label={t('common.material')} value={f.materialId} disabled={dis} onChange={(e) => setFilaments(it.filaments.map((x, k) => (k === i ? { ...x, materialId: e.target.value } : x)))}>{mats.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
                          {!dis && <button type="button" className="btn-ghost btn-sm" aria-label={t('calculator.removeItem')} onClick={() => setFilaments(it.filaments.filter((_, k) => k !== i))}>✕</button>}
                        </div>))}
                      {!dis && mats.length > 0 && <button type="button" className="btn-ghost btn-sm" onClick={() => setFilaments([...it.filaments, { g: 0, materialId: it.materialId ?? mats[0].id }])} data-testid="add-color">{t('calc.field.addColor')}</button>}
                    </div>
                    <div>
                      <div className="label">{t('calc.field.overrides')}<Hint text={t('calc.help.overrides')} /></div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {OVERRIDE_FIELDS.map((f) => (
                          <label key={f.key} className="block"><span className="label">{t(`calc.ovr.${f.label}` as never)}{it.overrides[f.key] != null && <button type="button" className="ml-2 underline text-xs" onClick={() => { const { [f.key]: _drop, ...rest } = it.overrides; onChange({ overrides: rest }); }}>{t('calc.ovr.remove')}</button>}</span>
                            <input type="number" min={0} step="0.1" className={cn(num_, it.overrides[f.key] != null && 'ring-2 ring-blue-400')} placeholder={String((rt as any)[f.key] ?? '')} value={it.overrides[f.key] ?? ''} disabled={dis} onChange={(e) => { const { [f.key]: _d, ...rest } = it.overrides; onChange({ overrides: e.target.value === '' ? rest : { ...rest, [f.key]: +e.target.value } }); }} data-testid={`ovr-${f.key}`} /></label>))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            {it.variantId && <p className="text-sm muted">{t('calculator.catalogNote', { label: vInfo?.label, stock: vInfo?.stock })}</p>}
            {det && (
              <details className="text-sm"><summary className="cursor-pointer font-medium">{t('calculator.itemReferencesAndOptions')}{it.links.length ? ` (${it.links.length} link${it.links.length > 1 ? 's' : ''})` : ''}</summary>
                <div className="mt-3 space-y-3">
                  <LinksEditor value={it.links} onChange={(v) => onChange({ links: v })} readOnly={dis} compact />
                  <div className="grid sm:grid-cols-2 gap-3">
                    <label className="block"><span className="label">{t('calculator.setKitOptional')}</span><input className="input" value={it.groupName} disabled={dis} onChange={(e) => onChange({ groupName: e.target.value })} placeholder={t('calculator.eGCosplayKit')} /></label>
                    <label className="flex items-center gap-2 text-sm pt-6"><input type="checkbox" checked={it.optional} disabled={dis} onChange={(e) => onChange({ optional: e.target.checked })} /> {t('calculator.optionalItemNotAddedTo')}</label>
                  </div>
                </div>
              </details>
            )}
          </div>
          <div className="lg:col-span-2">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 p-3 space-y-3 sticky top-20" data-testid="line-panel">
              <div className="flex items-baseline justify-between"><span className="label !mb-0">{t('common.suggestedPrice')}</span><span className="tabular text-lg font-semibold" data-testid="line-suggested">{money(suggestedUnit)}<span className="text-xs muted font-normal"> {t('calculator.unit')}</span></span></div>
              {!legacy && !it.variantId && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <ConfidenceBadge c={bd.confidence} />
                  {bd.range && <span className="tabular" data-testid="line-range">{t('calc.range', { min: money(bd.range.min), max: money(bd.range.max) })}</span>}
                </div>
              )}
              {!legacy && !it.variantId && <WarningList warnings={bd.warnings} showAll={det && showCosts} />}
              {showCosts && !legacy && !it.variantId && det && bd.band && canPrice && <PriceBand band={bd.band} value={finalUnit} step={rounding} disabled={dis} onChange={(v) => onChange({ finalUnit: v === suggestedUnit ? null : v })} />}
              <label className="block"><span className="label">{t('calculator.finalPricePerUnitYou')}</span>
                <div className="flex gap-2"><input type="number" min={0} inputMode="numeric" className={cn(num_, 'text-lg font-semibold', belowCost && 'ring-2 ring-red-500')} placeholder={String(suggestedUnit)} value={it.finalUnit ?? ''} disabled={dis || !canPrice} onChange={(e) => onChange({ finalUnit: e.target.value === '' ? null : Math.max(0, Math.round(+e.target.value)) })} data-testid="line-final" aria-describedby={`d${it.uid}`} />
                  {it.finalUnit != null && !dis && <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => onChange({ finalUnit: null })} data-testid="line-reset-price">{t('calculator.useSuggested')}</button>}</div>
              </label>
              <div id={`d${it.uid}`} className="flex flex-wrap gap-1.5 text-xs" data-testid="line-chips">
                {it.finalUnit != null && it.finalUnit !== suggestedUnit && <Badge tone={diff < 0 ? 'amber' : 'blue'}>{t('calc.vsSuggested', { pct: `${diff > 0 ? '+' : ''}${num(diff, 1)}%`, amt: money(finalUnit - suggestedUnit) })}</Badge>}
                {showCosts && margin != null && <Badge tone={belowCost ? 'red' : belowMin ? 'amber' : 'green'}>{t('common.margin')} {pct(margin, 0)}</Badge>}
                {belowCost && <Badge tone="red">{t('calculator.belowCost')}</Badge>}{!belowCost && belowMin && showCosts && <Badge tone="amber">{t('calculator.belowMinMargin', { pct: rt.minMarginPct })}</Badge>}
                {showCosts && !legacy && bd.warnings?.includes('belowBenchmark') && <Badge tone="amber">{t('calc.warn.belowBenchmark')}</Badge>}
              </div>
              {showCosts && baseAlt && curProfile && (
                <p className="text-xs muted" data-testid="profile-diff">{t('calc.profileDiff', { name: profileName(t, curProfile), base: profileName(t, ctx.calcProfiles.find((p) => p.id === defaultProfileId) ?? { id: '', name: '' }), amt: `${suggestedUnit >= baseAlt.suggestedUnit ? '+' : ''}${money(suggestedUnit - baseAlt.suggestedUnit)}`, pct: `${baseAlt.suggestedUnit ? num(((suggestedUnit - baseAlt.suggestedUnit) / baseAlt.suggestedUnit) * 100, 0) : 0}%` })}</p>
              )}
              <div className="flex items-baseline justify-between border-t border-slate-200 dark:border-slate-700 pt-2"><span className="text-sm">{t('calculator.itemTotal', { n: qty })}</span><span className="tabular font-semibold">{money(finalUnit * qty)}</span></div>
              {!it.variantId && <WhyPrice bd={bd} rt={rt} level={level} showCosts={showCosts} input={{ gramsTotal: it.gramsTotal, hoursTotal: it.hoursTotal, machine: mach?.cost ?? null }} />}
              {showCosts && !it.variantId && legacy && (
                <details className="text-xs"><summary className="cursor-pointer muted">{t('calculator.costBreakdown', { cost: money(cost) })}</summary>
                  <table className="w-full mt-2 tabular"><tbody>
                    {([[t('common.material'), bd.material], [t('calculator.machineDepreciationAndMaintenanc'), bd.machine], [t('calculator.energy'), bd.energy], [t('calculator.preparation'), bd.prep], [t('calculator.postProcessing'), bd.post], [t('calculator.failureRisk'), bd.failure]] as const).map(([l, v]) => <tr key={l}><td className="py-0.5">{l}</td><td className="text-right">{money(v)}</td></tr>)}
                    <tr className="border-t border-slate-300 dark:border-slate-600 font-medium"><td className="py-1">{t('common.cost')}</td><td className="text-right">{money(bd.cost)}</td></tr>
                    <tr><td className="muted">+ margen {bd.marginPct}%{bd.urgencyPct ? ` + urgencia ${bd.urgencyPct}%` : ''}{bd.volumePct ? ` ${bd.volumePct}% volumen` : ''}</td><td className="text-right muted">{money(bd.priceBeforeRound)}</td></tr>
                  </tbody></table>
                  <p className="muted mt-1">{t('calculator.effectiveNote', { grams: num(bd.gramsEffective, 1), waste: ctx.rates.wastePct, hours: num(bd.hoursEffective, 2) })}{mach ? ` ${t('calculator.onMachine', { name: mach.name })}` : ''}.</p>
                </details>
              )}
              {showCosts && !legacy && !it.variantId && det && bd.pricePerHour != null && bd.pricePerHour > 0 && <p className="text-xs muted tabular">{t('calc.perHour', { v: money(Math.round(bd.pricePerHour)) })}</p>}
            </div>
            {showCosts && exp && !legacy && !it.variantId && <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3"><ExpertTools bd={bd} unitFinal={finalUnit} x={{ item: itemInput, env: expertEnv, scenario, profiles: profiles.map((p) => ({ id: p.id, name: profileName(t, p) })), machines: ctx.machines.map((m) => ({ id: m.id, name: m.name })), materials: mats.map((m) => ({ id: m.id, label: m.label })), current: { profileId: profileId, machineId: it.machineId, materialId: it.materialId, qty } }} /></div>}
          </div>
        </div>
      )}
      {!dis && it.open && <div className="sm:hidden flex gap-2 p-3 pt-0">{onDuplicate && <button className="btn-ghost btn-sm flex-1" onClick={onDuplicate}>{t('calculator.duplicateItem')}</button>}{onRemove && <button className="btn-ghost btn-sm flex-1" onClick={onRemove}>{t('calculator.removeItem')}</button>}</div>}
    </div>
  );
}
