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
import { useT } from '@/i18n/client';
import { tOr } from '@/i18n/translate';
import { NozzleMismatch, ProcessOptions } from './process-options';

export { uid, newItem, type ItemState } from '@/lib/item-state';
import type { ItemState } from '@/lib/item-state';

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

const hm = (h: number) => ({ h: Math.floor(h), m: Math.round((h - Math.floor(h)) * 60) });

export function LineEditor({ it, onChange, onRemove, onDuplicate, ctx, models, showCosts, canPrice, priceAdj, variantsById, readOnly, index, defaultFileVersion }: {
  it: ItemState; onChange: (p: Partial<ItemState>) => void; onRemove?: () => void; onDuplicate?: () => void; ctx: CalcContext; models: ModelBrief[];
  showCosts: boolean; canPrice: boolean; priceAdj: number; variantsById: Record<string, { price: number; avgCost: number; label: string; stock: number }>; readOnly?: boolean; index: number; defaultFileVersion?: string;
}) {
  const t = useT();
  const toast = useToast();
  const [library, setLibrary] = useState<ModelBrief[]>(models); const [pick, setPick] = useState(''); const [showUp, setShowUp] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const runs = useRunPolling(runId ? [runId] : []); const run = runId ? runs[runId] : null;
  const vInfo = it.variantId ? variantsById[it.variantId] : undefined;
  const { bd, suggestedUnit, cost } = useMemo(() => computeItem(it, ctx, priceAdj, vInfo), [it, ctx, priceAdj, vInfo]);
  const qty = Math.max(1, it.qty);
  const finalUnit = it.finalUnit ?? suggestedUnit; const netUnit = finalUnit;
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
      onChange({ gramsTotal: +g.toFixed(2), hoursTotal: +h.toFixed(3), sliceRunId: run.id, unitGrams: +(g / qty).toFixed(2), unitHours: +(h / qty).toFixed(3), origin: { grams: 'slicer', hours: 'slicer', runId: run.id, engine: t('calculator.orcaslicer', { version: run.engineVersion }), note: run.cached ? t('calculator.fromCache') : undefined } });
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
    const missing = !firstModel ? 'calculator.missingModel' : !mach?.machineProfileId ? 'calculator.missingMachineProfile' : !it.processProfileId ? 'calculator.missingProcess' : !mat ? 'calculator.missingFilamentProfile' : null;
    if (missing || !firstModel || !mach?.machineProfileId || !mat || !it.processProfileId) { toast.push(tOr(t, missing ?? 'calculator.chooseAModelAMachine', t('calculator.chooseAModelAMachine'), { name: mat?.label ?? '' }), 'err'); return; }
    onChange({ origin: { ...it.origin, stale: false } });
    const r = await sliceAction({ fileVersionId: firstModel.versionId, machineProfileId: mach.machineProfileId, processProfileId: it.processProfileId, materialId: mat.id, copies: qty, label: `${firstModel.name} ×${qty}` });
    if (r.ok) setRunId(r.data); else toast.push(r.error, 'err');
  };
  const useSliced = (b: ModelBrief) => {
    const s = b.sliced!; const g = s.totalG ?? 0; const h = (s.timeS ?? 0) / 3600;
    onChange({ gramsTotal: +g.toFixed(2), hoursTotal: +h.toFixed(3), unitGrams: +(g / qty).toFixed(2), unitHours: +(h / qty).toFixed(3), origin: { grams: 'file', hours: 'file', file: b.name, engine: s.slicer ?? undefined, note: s.filaments.length > 1 ? `${s.filaments.length} colores` : undefined } });
  };
  const estimate = () => {
    if (!firstModel?.volumeCm3 || !firstModel.areaCm2 || !mat) { toast.push(t('calculator.iNeedAnAnalyzedModel'), 'err'); return; }
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
  const originBadge = (k?: string, corrected?: boolean) => k ? <Badge tone={k === 'manual' ? 'gray' : k === 'estimate' ? 'amber' : 'blue'}>{tOr(t, `calculator.origin.${k}`, k)}{corrected ? ` · ${t('calculator.manuallyCorrected')}` : ''}</Badge> : null;
  const num_ = 'input tabular';
  const unitH = hm(it.unitHours);

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
                <div>
                  <div className="label">{t('calculator.n3dModelsInThisItem')} {it.models.length > 1 && <span className="muted">{t('calculator.printedTogetherAndQuotedPer')}</span>}</div>
                  {it.models.map((m) => { const b = library.find((x) => x.id === m.modelFileId); return b && (b.commercial === 'no' || b.commercial === 'requiere_membresia') ? <p key={m.modelFileId} role="alert" className="text-xs rounded-lg box-warn px-2.5 py-1.5 mb-1.5" data-testid="license-warning">{t('files.sourceWarnQuote', { license: b.licenseCode ?? '—', use: t(`files.commercial_${b.commercial}` as 'files.commercial_no').toLowerCase() })} — {m.name}</p> : null; })}
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
                <div className="grid sm:grid-cols-3 gap-3">
                  <label className="block"><span className="label">{t('common.material')}</span><select className="input" value={it.materialId ?? ''} disabled={dis} onChange={(e) => { const m = mats.find((x) => x.id === e.target.value); onChange({ materialId: e.target.value || null, color: m?.colorName ?? it.color, origin: { ...it.origin, stale: it.mode === 'auto' && !!it.origin.runId } }); }} data-testid="line-material">{mats.map((m) => <option key={m.id} value={m.id}>{m.label} · {money(m.costPerKg)}/kg{m.tech === 'fdm' && !m.filamentProfileId ? ` · ${t('calculator.noSlicerProfile')}` : ''}</option>)}</select></label>
                  <label className="block"><span className="label">{t('common.machine')}</span><select className="input" value={it.machineId ?? ''} disabled={dis} onChange={(e) => { const m = ctx.machines.find((x) => x.id === e.target.value); onChange({ machineId: e.target.value || null, processProfileId: m?.defaultProcessProfileId ?? it.processProfileId }); }} data-testid="line-machine">{ctx.machines.map((m) => <option key={m.id} value={m.id}>{m.name}{m.simulated ? ' (simulada)' : ''}</option>)}</select></label>
                  <label className="block"><span className="label">{t('calculator.processProfile')}</span><select className="input" value={it.processProfileId ?? ''} disabled={dis} onChange={(e) => onChange({ processProfileId: e.target.value || null })} data-testid="line-process"><option value="">—</option><ProcessOptions profiles={ctx.profiles.filter((p) => p.type === 'process')} machineNozzle={ctx.machines.find((x) => x.id === it.machineId)?.nozzle ?? null} compatibleIds={(ctx.setups.find((x) => x.machineId === it.machineId && x.active) ?? ctx.setups.find((x) => x.machineId === it.machineId))?.compatibleProcessIds} /></select><NozzleMismatch processNozzle={ctx.profiles.find((p) => p.id === it.processProfileId)?.nozzle} machineNozzle={ctx.machines.find((x) => x.id === it.machineId)?.nozzle} /></label>
                </div>
                <div>
                  <div className="label">{t('calculator.howTimeAndGramsAre')}</div>
                  <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-600 overflow-hidden mb-3" role="radiogroup" aria-label={t('calculator.quoteMode')}>
                    {([['auto', t('calculator.automatic')], ['semi', t('calculator.semiAutomatic')], ['manual', t('calculator.manual')]] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={it.mode === k} disabled={dis} onClick={() => onChange({ mode: k })} className={cn('px-3 min-h-[44px] md:min-h-[36px] text-sm', it.mode === k ? 'bg-[var(--panel)] text-[var(--panel-ink)] dark:bg-slate-700' : 'hover:bg-slate-100 dark:hover:bg-slate-800')} data-testid={`mode-${k}`}>{l}</button>)}
                  </div>
                  {it.mode === 'auto' && (
                    <div className="space-y-2">
                      <p className="text-xs muted">{t('calculator.uploadAnStl3mfObj')}</p>
                      <button type="button" className="btn-primary" onClick={doSlice} disabled={dis || !slicable || (!!runId && (!run || run.status === 'queued' || run.status === 'running'))} data-testid="line-slice">{runId && (!run || run.status === 'queued' || run.status === 'running') ? t('common.slicing') : (qty > 1 ? t('calculator.sliceCopies', { n: qty }) : t('calculator.slicePart'))}</button>
                      {!slicable && <span className="text-xs muted ml-2">{t('calculator.addAnStl3mfObj')}</span>}
                      {it.origin.stale && <p className="text-xs text-warn">{t('calculator.youChangedTheQuantityOr')}</p>}
                    </div>
                  )}
                  {it.mode === 'semi' && (
                    <div className="space-y-2">
                      <p className="text-xs muted">{t('calculator.chooseTheGCodeOr')}</p>
                      {library.filter((m) => m.hasSliced).length === 0 ? <p className="text-sm">{t('calculator.thereAreNoSlicedFiles')}</p> : (
                        <select className="input" aria-label={t('calculator.slicedFile')} data-testid="semi-pick" value="" disabled={dis} onChange={(e) => { const b = library.find((m) => m.id === e.target.value); if (b) { addModel(b.id); useSliced(b); } }}><option value="">{t('calculator.chooseASlicedFile')}</option>{library.filter((m) => m.hasSliced).map((m) => <option key={m.id} value={m.id}>{m.name} · {dur(m.sliced?.timeS)} · {grams(m.sliced?.totalG)}</option>)}</select>
                      )}
                      {firstModel?.sliced && it.origin.grams === 'file' && <ul className="text-xs muted">{firstModel.sliced.filaments.map((f, i) => <li key={i}>{t('files.colorN', { n: i + 1 })}{f.color ? ` (${f.color})` : ''}: {grams(f.g)}</li>)}{firstModel.sliced.notes.map((n) => <li key={n} className="text-warn">{tOr(t, n, n)}</li>)}</ul>}
                    </div>
                  )}
                  {it.mode === 'manual' && (
                    <div className="space-y-2">
                      <p className="text-xs muted">{t('calculator.manualHelp1')} <b>{t('calculator.perUnit')}</b>. {t('calculator.manualHelp2')}</p>
                      <div className="grid grid-cols-3 gap-3">
                        <label className="block"><span className="label">{t('calculator.gramsUnit')}</span><input type="number" min={0} step="0.1" inputMode="decimal" className={num_} value={it.unitGrams || ''} disabled={dis} onChange={(e) => manualGrams(+e.target.value || 0)} data-testid="manual-grams" /></label>
                        <label className="block"><span className="label">{t('common.hours')}</span><input type="number" min={0} inputMode="numeric" className={num_} value={unitH.h || ''} disabled={dis} onChange={(e) => manualHours(+e.target.value || 0, unitH.m)} data-testid="manual-hours" /></label>
                        <label className="block"><span className="label">{t('calculator.minutes')}</span><input type="number" min={0} max={59} inputMode="numeric" className={num_} value={unitH.m || ''} disabled={dis} onChange={(e) => manualHours(unitH.h, +e.target.value || 0)} data-testid="manual-minutes" /></label>
                      </div>
                      {!dis && firstModel?.volumeCm3 && <button type="button" className="btn-ghost btn-sm" onClick={estimate}>{t('calculator.estimateFromMesh', { volume: num(firstModel.volumeCm3, 1) })}</button>}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-2 text-xs" data-testid="line-origin">
                    <span className="muted">{t('calculator.source')}</span>{originBadge(it.origin.grams, it.origin.corrected)}
                    <span className="muted tabular">{t('common.total')} {grams(it.gramsTotal)} · {dur(it.hoursTotal * 3600)} {mach && mach.cost && it.mode !== 'manual' ? '' : ''}</span>
                    {it.origin.engine && <span className="muted">· {it.origin.engine}{it.origin.note ? ` · ${it.origin.note}` : ''}</span>}
                    {it.origin.file && <span className="muted">· {it.origin.file}</span>}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <label className="block"><span className="label">{t('calculator.preparationMin')}</span><input type="number" min={0} inputMode="numeric" className={num_} value={it.prepMinutes} disabled={dis} onChange={(e) => onChange({ prepMinutes: +e.target.value || 0 })} /></label>
                  <label className="block"><span className="label">{t('calculator.postProcessingMinUnit')}</span><input type="number" min={0} inputMode="numeric" className={num_} value={it.postMinutes || ''} disabled={dis} onChange={(e) => onChange({ postMinutes: +e.target.value || 0 })} data-testid="line-post" /></label>
                  <label className="block"><span className="label">{t('calculator.suppliesUnit')}</span><input type="number" min={0} inputMode="numeric" className={num_} value={it.postSupplies || ''} disabled={dis} onChange={(e) => onChange({ postSupplies: +e.target.value || 0 })} /></label>
                  <label className="block"><span className="label">{t('calculator.shipping')}</span><input type="number" min={0} inputMode="numeric" className={num_} value={it.shipping || ''} disabled={dis} onChange={(e) => onChange({ shipping: +e.target.value || 0 })} /></label>
                </div>
              </>
            )}
            {it.variantId && <p className="text-sm muted">{t('calculator.catalogNote', { label: vInfo?.label, stock: vInfo?.stock })}</p>}
            <details className="text-sm"><summary className="cursor-pointer font-medium">{t('calculator.itemReferencesAndOptions')}{it.links.length ? ` (${it.links.length} link${it.links.length > 1 ? 's' : ''})` : ''}</summary>
              <div className="mt-3 space-y-3">
                <LinksEditor value={it.links} onChange={(v) => onChange({ links: v })} readOnly={dis} compact />
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="block"><span className="label">{t('calculator.setKitOptional')}</span><input className="input" value={it.groupName} disabled={dis} onChange={(e) => onChange({ groupName: e.target.value })} placeholder={t('calculator.eGCosplayKit')} /></label>
                  <label className="flex items-center gap-2 text-sm pt-6"><input type="checkbox" checked={it.optional} disabled={dis} onChange={(e) => onChange({ optional: e.target.checked })} /> {t('calculator.optionalItemNotAddedTo')}</label>
                </div>
              </div>
            </details>
          </div>
          <div className="lg:col-span-2">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 p-3 space-y-3 sticky top-20">
              <div className="flex items-baseline justify-between"><span className="label !mb-0">{t('common.suggestedPrice')}</span><span className="tabular text-lg font-semibold" data-testid="line-suggested">{money(suggestedUnit)}<span className="text-xs muted font-normal"> {t('calculator.unit')}</span></span></div>
              <label className="block"><span className="label">{t('calculator.finalPricePerUnitYou')}</span>
                <div className="flex gap-2"><input type="number" min={0} inputMode="numeric" className={cn(num_, 'text-lg font-semibold', belowCost && 'ring-2 ring-red-500')} placeholder={String(suggestedUnit)} value={it.finalUnit ?? ''} disabled={dis || !canPrice} onChange={(e) => onChange({ finalUnit: e.target.value === '' ? null : Math.max(0, Math.round(+e.target.value)) })} data-testid="line-final" aria-describedby={`d${it.uid}`} />
                  {it.finalUnit != null && !dis && <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => onChange({ finalUnit: null })} data-testid="line-reset-price">{t('calculator.useSuggested')}</button>}</div>
              </label>
              <div id={`d${it.uid}`} className="flex flex-wrap gap-1.5 text-xs" data-testid="line-chips">
                {it.finalUnit != null && it.finalUnit !== suggestedUnit && <Badge tone={diff < 0 ? 'amber' : 'blue'}>{diff > 0 ? '+' : ''}{num(diff, 1)}% vs sugerido ({money(finalUnit - suggestedUnit)}/u)</Badge>}
                {showCosts && margin != null && <Badge tone={belowCost ? 'red' : belowMin ? 'amber' : 'green'}>{t('common.margin')} {pct(margin, 0)}</Badge>}
                {belowCost && <Badge tone="red">{t('calculator.belowCost')}</Badge>}{!belowCost && belowMin && showCosts && <Badge tone="amber">{t('calculator.belowMinMargin', { pct: ctx.rates.minMarginPct })}</Badge>}
              </div>
              <div className="flex items-baseline justify-between border-t border-slate-200 dark:border-slate-700 pt-2"><span className="text-sm">{t('calculator.itemTotal', { n: qty })}</span><span className="tabular font-semibold">{money(finalUnit * qty)}</span></div>
              {showCosts && !it.variantId && (
                <details className="text-xs"><summary className="cursor-pointer muted">{t('calculator.costBreakdown', { cost: money(cost) })}</summary>
                  <table className="w-full mt-2 tabular"><tbody>
                    {([[t('common.material'), bd.material], [t('calculator.machineDepreciationAndMaintenanc'), bd.machine], [t('calculator.energy'), bd.energy], [t('calculator.preparation'), bd.prep], [t('calculator.postProcessing'), bd.post], [t('calculator.failureRisk'), bd.failure]] as const).map(([l, v]) => <tr key={l}><td className="py-0.5">{l}</td><td className="text-right">{money(v)}</td></tr>)}
                    <tr className="border-t border-slate-300 dark:border-slate-600 font-medium"><td className="py-1">{t('common.cost')}</td><td className="text-right">{money(bd.cost)}</td></tr>
                    {bd.warnings && bd.warnings.length > 0 && <tr><td colSpan={2} className="text-warn text-xs" data-testid="line-warnings">{t('calculator.incompleteData')}: {bd.warnings.map((w) => t(`calculator.warn_${w}` as 'calculator.warn_noMachine')).join(' · ')}</td></tr>}
                    <tr><td className="muted">+ margen {bd.marginPct}%{bd.urgencyPct ? ` + urgencia ${bd.urgencyPct}%` : ''}{bd.volumePct ? ` ${bd.volumePct}% volumen` : ''}</td><td className="text-right muted">{money(bd.priceBeforeRound)}</td></tr>
                  </tbody></table>
                  <p className="muted mt-1">{t('calculator.effectiveNote', { grams: num(bd.gramsEffective, 1), waste: ctx.rates.wastePct, hours: num(bd.hoursEffective, 2) })}{mach ? ` ${t('calculator.onMachine', { name: mach.name })}` : ''}.</p>
                </details>
              )}
            </div>
          </div>
        </div>
      )}
      {!dis && it.open && <div className="sm:hidden flex gap-2 p-3 pt-0">{onDuplicate && <button className="btn-ghost btn-sm flex-1" onClick={onDuplicate}>{t('calculator.duplicateItem')}</button>}{onRemove && <button className="btn-ghost btn-sm flex-1" onClick={onRemove}>{t('calculator.removeItem')}</button>}</div>}
    </div>
  );
}
