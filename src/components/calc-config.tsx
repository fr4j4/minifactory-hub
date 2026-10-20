'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { AppSettings } from '@/lib/settings';
import type { CalcContext } from '@/lib/context';
import { breakEvenRate, coherenceChecks, completeness, fixedMonthly, fixedPerHour, hoursPerMachineMonth, type CalcProfile, type Rates } from '@/lib/pricing';
import { DEFAULT_RATES } from '@/lib/calc-defaults';
import { SHOP_PRESETS, DEFAULT_COMPLEXITY_TAGS, type ShopPreset } from '@/lib/calc-presets';
import { toItemMaterial } from '@/lib/item-price';
import { cn, money, num, pct } from '@/lib/format';
import { saveSettingsAction } from '@/actions/settings';
import { useAction } from './client';
import { Badge, Card } from './ui';
import { CheckField, NumField, SelectField, pathGet, pathSet } from './calc-fields';
import { ProfilesManager, samplePrice } from './calc-profiles';
import { BenchmarksEditor, QuoteCalibrator, RatesHistory, RealVsCalc } from './calc-calibration';
import { CalcWizard } from './calc-wizard';
import { useT } from '@/i18n/client';

type Mode = 'estandar' | 'avanzado';
const MODE_KEY = 'mf.calcCfgMode';
const TABS = ['base', 'fixed', 'time', 'risk', 'profiles', 'refs', 'history'] as const;
type Tab = (typeof TABS)[number];
const CASES = [{ key: 'small', qty: 1, g: 20, h: 1.5 }, { key: 'medium', qty: 1, g: 80, h: 6 }, { key: 'series', qty: 20, g: 300, h: 14 }] as const;
export type HistoryRow = { id: string; at: Date | string; who: string; before: any; after: any };

export function CalcConfig({ st, ctx, canEdit, draftCount, usage, history }: { st: AppSettings; ctx: CalcContext; canEdit: boolean; draftCount: number; usage: Record<string, { customers: number; channels: number }>; history: HistoryRow[] }) {
  const t = useT(); const { run, pending } = useAction();
  const [mode, setMode] = useState<Mode>('estandar'); const [tab, setTab] = useState<Tab>('base'); const [wiz, setWiz] = useState(false);
  const [r, setR] = useState<Rates>(st.rates); const [profiles, setProfiles] = useState<CalcProfile[]>(st.calcProfiles);
  const [valid, setValid] = useState(st.quoteValidDays); const [resv, setResv] = useState(st.reservationDays); const [dep, setDep] = useState(st.minDepositPct);
  useEffect(() => { try { const m = localStorage.getItem(MODE_KEY); if (m === 'estandar' || m === 'avanzado') setMode(m); } catch { /* ignorar */ } }, []);
  // si las tarifas cambian en el servidor (restaurar, asistente), el borrador se reinicia
  const stamp = JSON.stringify([st.rates, st.calcProfiles]);
  useEffect(() => { setR(st.rates); setProfiles(st.calcProfiles); }, [stamp]); // eslint-disable-line react-hooks/exhaustive-deps
  const changeMode = (m: Mode) => { setMode(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* ignorar */ } };


  const n = (path: string, label: string, o: { unit?: string; hint?: string; testid?: string; max?: number; step?: number } = {}) => (
    <NumField key={path} label={label} unit={o.unit} hint={o.hint} max={o.max} step={o.step} value={Number(pathGet(r, path) ?? 0)} def={pathGet(DEFAULT_RATES, path)} disabled={!canEdit}
      onChange={(v) => setR((x) => pathSet(x, path, v))} testid={o.testid ?? `cfg-${path}`} />
  );
  // las tarifas del borrador no traen el número de máquinas: se toma del contexto, como al cotizar de verdad
  const rt: Rates = { ...r, machineCount: ctx.rates.machineCount };
  const machine = ctx.machines.find((m) => m.tech === 'FDM' && !m.simulated) ?? ctx.machines[0]; const material = ctx.materials.find((m) => m.tech === 'fdm') ?? ctx.materials[0];
  const sample = (x: Rates, c: { qty: number; g: number; h: number }) => (machine && material ? samplePrice(x, profiles, machine.cost, toItemMaterial(material), c) : null);
  const preview = CASES.map((c) => ({ c, p: sample(rt, c) }));
  const medium = preview[1].p;
  const be = breakEvenRate(rt);
  const checks = useMemo(() => coherenceChecks(rt, medium ? { pricePerHour: medium.perHour } : undefined), [rt, medium?.perHour]); // eslint-disable-line react-hooks/exhaustive-deps
  const errors: string[] = [];
  const pc = (v: number | undefined, name: string) => { if (v != null && (v < 0 || v > 100)) errors.push(t('calc.cfg.errRange', { name })); };
  pc(r.marginPct, t('calc.param.marginPct')); pc(r.minMarginPct, t('calc.param.minMarginPct')); pc(r.wastePct, t('calc.param.wastePct')); pc(r.failRatePct, t('calc.param.failRatePct')); pc(r.payFeePct, t('calc.param.payFeePct')); pc(r.channelFeePct, t('calc.param.channelFeePct')); pc(r.volumeMinMarginPct, t('calc.param.volumeMinMarginPct'));
  if (r.marginPct >= 95) errors.push(t('calc.cfg.errMargin'));
  const tiers = [...r.volumeTiers].map((x) => x.minQty); if (tiers.some((q, i) => i > 0 && q <= tiers[i - 1])) errors.push(t('calc.cfg.errTiers'));
  if (r.laborHour < 0 || r.kwh < 0 || r.minPrice < 0) errors.push(t('calc.cfg.errNegative'));
  const status = completeness(rt, { machines: ctx.machines.map((m) => ({ purchaseValue: m.cost.purchaseValue, watts: m.cost.watts })), materials: ctx.materials.map((m) => ({ costPerKg: m.costPerKg })), hasProfile: profiles.length > 0 });
  const dirty = stamp !== JSON.stringify([r, profiles]) || valid !== st.quoteValidDays || resv !== st.reservationDays || dep !== st.minDepositPct;
  const save = () => run(() => saveSettingsAction({ rates: r, calcProfiles: profiles, quoteValidDays: valid, reservationDays: resv, minDepositPct: dep }), { ok: t('calc.cfg.saved') });
  const fixedList = r.fixedCosts ?? []; const fixedSum = fixedMonthly(r);
  const applyPreset = (p: ShopPreset) => { const pr = SHOP_PRESETS[p] as Partial<Rates>; setR((x) => ({ ...x, ...pr, productive: { ...x.productive!, ...(pr.productive ?? {}) } as Rates['productive'] })); };
  const guessPreset = (): ShopPreset => { const h = r.productive?.hoursPerDay ?? 8; return h >= 14 ? 'produccion' : h <= 6 ? 'hobby' : 'taller'; };
  const std = mode === 'estandar';

  /* ── secciones ── */
  const standard = (
    <div className="grid sm:grid-cols-2 gap-4" data-testid="cfg-standard">
      <SelectField label={t('calc.cfg.shopType')} hint={t('calc.wiz.presetHelp')} value={guessPreset()} onChange={(v) => applyPreset(v as ShopPreset)} disabled={!canEdit} options={(['hobby', 'taller', 'produccion'] as const).map((p) => [p, t(`calc.preset.${p}` as never)])} testid="cfg-preset" />
      {n('kwh', t('calc.cfg.kwh'), { unit: '$/kWh', testid: 'rate-kwh' })}
      {n('laborHour', t('calc.cfg.laborHour'), { unit: '$/h', hint: t('calc.help.labor'), testid: 'rate-labor' })}
      <div><NumField label={t('calc.cfg.fixedMonth')} hint={t('calc.help.fixed')} unit={t('calc.cfg.perMonth')} value={fixedSum} def={0} disabled={!canEdit || fixedList.length > 1} testid="cfg-fixed" onChange={(v) => setR((x) => ({ ...x, fixedCosts: v > 0 ? [{ label: t('calc.cfg.fixedGeneric'), amount: v }] : [] }))} />{fixedList.length > 1 && <p className="text-xs muted mt-1">{t('calc.cfg.fixedDetail')}</p>}</div>
      {n('targetIncomeMonth', t('calc.cfg.income'), { unit: t('calc.cfg.perMonth'), hint: t('calc.help.income') })}
      <div className="grid grid-cols-2 gap-3">{n('productive.hoursPerDay', t('calc.cfg.hoursPerDay'), { unit: 'h' })}{n('productive.daysPerMonth', t('calc.cfg.daysPerMonth'), { unit: t('calc.cfg.days') })}</div>
      <div className="sm:col-span-2">
        <label className="block"><span className="label">{t('calc.cfg.margin')}: <b data-testid="cfg-margin-value">{num(r.marginPct, 0)}%</b></span>
          <input type="range" min={5} max={80} step={1} className="w-full" value={r.marginPct} disabled={!canEdit} onChange={(e) => setR({ ...r, marginPct: +e.target.value })} aria-valuetext={`${r.marginPct}%`} data-testid="cfg-margin" /></label>
        <p className="text-xs muted">{t('calc.cfg.marginExample', { price: money(Math.round(1000 / (1 - Math.min(0.95, r.marginPct / 100)))) })}</p>
      </div>
      {n('floors.perOrder', t('calc.cfg.minOrder'), { unit: '$', hint: t('calc.help.minOrder') })}
      {n('minPrice', t('calc.cfg.minPiece'), { unit: '$', hint: t('calc.help.minPiece'), testid: 'rate-min' })}
      <SelectField label={t('settings.rounding')} value={r.rounding.mode} disabled={!canEdit} onChange={(v) => setR({ ...r, rounding: { ...r.rounding, mode: v as Rates['rounding']['mode'] } })} options={[['none', t('settings.noRounding')], ['step', t('settings.toMultiplesOf')], ['ending990', t('settings.endingIn990')]]} testid="cfg-rounding" />
      {r.rounding.mode === 'step' && n('rounding.step', t('settings.roundTo'), { unit: '$' })}
      <div className="sm:col-span-2"><CheckField label={t('calc.cfg.taxDefault', { pct: r.taxPct })} hint={t('calc.help.tax')} checked={!!r.taxDefault} disabled={!canEdit} onChange={(v) => setR({ ...r, taxDefault: v })} testid="cfg-taxdefault" /></div>
    </div>
  );

  const advanced = (
    <div className="space-y-4" data-testid="cfg-advanced">
      <div role="tablist" aria-label={t('calc.cfg.advTabs')} className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-700">
        {TABS.map((k) => <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`cfg-tab-${k}`} className={cn('px-3 py-2 text-sm min-h-[44px] md:min-h-[36px] -mb-px border-b-2', tab === k ? 'border-[var(--panel)] font-medium' : 'border-transparent muted hover:text-inherit')}>{t(`calc.cfg.tab_${k}` as never)}</button>)}
      </div>
      {tab === 'base' && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            {n('kwh', t('calc.cfg.kwh'), { unit: '$/kWh', testid: 'rate-kwh' })}
            {n('laborHour', t('calc.cfg.laborHour'), { unit: '$/h', hint: t('calc.help.labor'), testid: 'rate-labor' })}
            {n('marginPct', t('calc.param.marginPct'), { unit: '%', hint: t('calc.help.margin'), testid: 'rate-margin' })}
            {n('minMarginPct', t('calc.param.minMarginPct'), { unit: '%', hint: t('calc.help.minMargin') })}
            {n('volumeMinMarginPct', t('calc.param.volumeMinMarginPct'), { unit: '%', hint: t('calc.help.volMin') })}
          </div>
          <fieldset className="space-y-2"><legend className="label">{t('calc.cfg.floors')}<span className="text-xs muted font-normal"> — {t('calc.help.floors')}</span></legend>
            <div className="grid sm:grid-cols-4 gap-4">
              <div><CheckField label={t('calc.cfg.hourAuto')} hint={t('calc.help.hourAuto')} checked={!!r.floors?.perHourAuto} disabled={!canEdit} onChange={(v) => setR((x) => pathSet(x, 'floors.perHourAuto', v))} testid="cfg-hourauto" />{r.floors?.perHourAuto && <p className="text-xs muted tabular">{money(Math.round(be))}/h</p>}</div>
              {!r.floors?.perHourAuto && n('floors.perHour', t('calc.cfg.floorHour'), { unit: '$/h' })}
              {n('floors.perGram', t('calc.param.floors_perGram'), { unit: '$/g' })}
              {n('floors.perOrder', t('calc.param.floors_perOrder'), { unit: '$' })}
              {n('minPrice', t('calc.cfg.minPiece'), { unit: '$', testid: 'rate-min' })}
            </div></fieldset>
          <div className="grid sm:grid-cols-4 gap-4">
            <SelectField label={t('settings.rounding')} value={r.rounding.mode} disabled={!canEdit} onChange={(v) => setR({ ...r, rounding: { ...r.rounding, mode: v as Rates['rounding']['mode'] } })} options={[['none', t('settings.noRounding')], ['step', t('settings.toMultiplesOf')], ['ending990', t('settings.endingIn990')]]} testid="cfg-rounding" />
            {r.rounding.mode === 'step' && n('rounding.step', t('settings.roundTo'), { unit: '$' })}
            {n('payFeePct', t('calc.param.payFeePct'), { unit: '%', hint: t('calc.help.payFee') })}
            {n('channelFeePct', t('calc.param.channelFeePct'), { unit: '%', hint: t('calc.help.channelFee') })}
            {n('taxPct', t('settings.vat'), { unit: '%' })}
            <CheckField label={t('calc.cfg.taxDefault', { pct: r.taxPct })} hint={t('calc.help.tax')} checked={!!r.taxDefault} disabled={!canEdit} onChange={(v) => setR({ ...r, taxDefault: v })} testid="cfg-taxdefault" />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div><h3 className="text-sm font-medium mb-1.5">{t('settings.rushSurcharges')}</h3>{r.urgency.map((u, i) => <div key={u.key} className="grid grid-cols-3 gap-2 mb-1.5"><input className="input col-span-2" value={u.label} disabled={!canEdit} onChange={(e) => setR({ ...r, urgency: r.urgency.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} aria-label={t('common.name')} /><input type="number" className="input" value={u.pct} disabled={!canEdit} onChange={(e) => setR({ ...r, urgency: r.urgency.map((x, k) => (k === i ? { ...x, pct: +e.target.value } : x)) })} aria-label="%" /></div>)}</div>
            <div><h3 className="text-sm font-medium mb-1.5">{t('settings.volumeDiscountFromNUnits')}</h3>{r.volumeTiers.map((tt, i) => <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 mb-1.5"><input type="number" className="input" value={tt.minQty} disabled={!canEdit} onChange={(e) => setR({ ...r, volumeTiers: r.volumeTiers.map((x, k) => (k === i ? { ...x, minQty: +e.target.value } : x)) })} aria-label={t('settings.fromUnits')} /><input type="number" className="input" value={tt.pct} disabled={!canEdit} onChange={(e) => setR({ ...r, volumeTiers: r.volumeTiers.map((x, k) => (k === i ? { ...x, pct: +e.target.value } : x)) })} aria-label="%" /><button type="button" className="btn-ghost btn-sm" disabled={!canEdit} aria-label={t('common.deleteLabel')} onClick={() => setR({ ...r, volumeTiers: r.volumeTiers.filter((_, k) => k !== i) })}>✕</button></div>)}
              {canEdit && <button type="button" className="btn-ghost btn-sm" onClick={() => setR({ ...r, volumeTiers: [...r.volumeTiers, { minQty: (r.volumeTiers.at(-1)?.minQty ?? 5) * 2, pct: -5 }] })}>{t('calc.cfg.addTier')}</button>}</div>
          </div>
        </div>
      )}
      {tab === 'fixed' && (
        <div className="space-y-4">
          <div><h3 className="text-sm font-medium mb-1.5">{t('calc.cfg.fixedList')}<span className="text-xs muted font-normal"> — {t('calc.help.fixed')}</span></h3>
            {fixedList.map((f, i) => <div key={i} className="grid grid-cols-[1fr_9rem_auto] gap-2 mb-1.5 max-w-xl"><input className="input" value={f.label} disabled={!canEdit} aria-label={t('common.name')} onChange={(e) => setR({ ...r, fixedCosts: fixedList.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} /><input type="number" min={0} className="input" value={f.amount} disabled={!canEdit} aria-label={t('calc.cfg.amountMonth')} data-testid={`fixed-amount-${i}`} onChange={(e) => setR({ ...r, fixedCosts: fixedList.map((x, k) => (k === i ? { ...x, amount: +e.target.value || 0 } : x)) })} /><button type="button" className="btn-ghost btn-sm" disabled={!canEdit} aria-label={t('common.deleteLabel')} onClick={() => setR({ ...r, fixedCosts: fixedList.filter((_, k) => k !== i) })}>✕</button></div>)}
            {canEdit && <button type="button" className="btn-ghost btn-sm" data-testid="fixed-add" onClick={() => setR({ ...r, fixedCosts: [...fixedList, { label: '', amount: 0 }] })}>{t('calc.cfg.addFixed')}</button>}
            <p className="text-sm mt-2 tabular">{t('calc.cfg.fixedTotal', { v: money(fixedSum) })}</p></div>
          <div className="grid sm:grid-cols-3 gap-4">
            {n('targetIncomeMonth', t('calc.cfg.income'), { unit: t('calc.cfg.perMonth'), hint: t('calc.help.income') })}
            {n('productive.hoursPerDay', t('calc.cfg.hoursPerDay'), { unit: 'h' })}
            {n('productive.daysPerMonth', t('calc.cfg.daysPerMonth'), { unit: t('calc.cfg.days') })}
            {n('productive.utilizationPct', t('calc.cfg.utilization'), { unit: '%', hint: t('calc.help.utilization'), max: 100 })}
            {n('capitalPct', t('calc.cfg.capital'), { unit: t('calc.cfg.perYear'), hint: t('calc.help.capital'), max: 100 })}
            {n('powerFactor', t('calc.param.powerFactor'), { hint: t('calc.help.power'), max: 1, step: 0.05 })}
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-sm space-y-1 tabular" data-testid="breakeven">
            <div>{t('calc.cfg.machinesCount', { n: ctx.rates.machineCount ?? 1, hours: num(hoursPerMachineMonth(rt) * (ctx.rates.machineCount ?? 1), 0) })}</div>
            <div>{t('calc.cfg.fixedPerHour', { v: money(Math.round(fixedPerHour(rt))) })}</div>
            <div className="font-medium">{t('calc.cfg.breakEven', { v: money(Math.round(breakEvenRate(rt))) })}</div>
            {medium && <div>{t('calc.cfg.nowCharges', { v: money(Math.round(medium.perHour)) })}</div>}
          </div>
        </div>
      )}
      {tab === 'time' && (
        <div className="grid sm:grid-cols-3 gap-4">
          {n('prepMinutes', t('calc.cfg.prepMin'), { unit: 'min', hint: t('calc.help.prep') })}
          {n('supervisionMinPerHour', t('calc.cfg.superMin'), { unit: 'min/h', hint: t('calc.help.super') })}
          {n('postMinutes', t('calc.cfg.postMin'), { unit: 'min', hint: t('calc.help.post') })}
          {n('setupHoursPerPlate', t('calc.param.setupHoursPerPlate'), { unit: 'h', hint: t('calc.help.setup') })}
          {n('colorChangeMin', t('calc.cfg.colorChange'), { unit: 'min', hint: t('calc.help.colorChange') })}
          {n('packPerUnit', t('calc.param.packPerUnit'), { unit: '$', hint: t('calc.help.pack') })}
        </div>
      )}
      {tab === 'risk' && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            {n('wastePct', t('calc.param.wastePct'), { unit: '%', hint: t('calc.help.waste') })}
            {n('failRatePct', t('calc.param.failRatePct'), { unit: '%', hint: t('calc.help.fail') })}
            {n('failShrinkK', t('calc.cfg.shrinkK'), { hint: t('calc.help.shrink') })}
            <SelectField label={t('calc.param.costBasis')} hint={t('calc.help.basis')} value={r.costBasis ?? 'promedio'} disabled={!canEdit} onChange={(v) => setR({ ...r, costBasis: v as Rates['costBasis'] })} options={[['promedio', t('calc.cfg.basis_promedio')], ['reposicion', t('calc.cfg.basis_reposicion')], ['max', t('calc.cfg.basis_max')]]} testid="cfg-basis" />
            <CheckField label={t('calc.param.useTimeFactor')} hint={t('calc.help.timeFactor')} checked={r.useTimeFactor !== false} disabled={!canEdit} onChange={(v) => setR({ ...r, useTimeFactor: v })} testid="cfg-timefactor" />
            {n('estimateErrorPct', t('calc.cfg.estError'), { unit: '%', hint: t('calc.help.estError'), max: 90 })}
            {n('bandHighPct', t('calc.cfg.bandHigh'), { unit: '%', hint: t('calc.help.bandHigh') })}
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div><h3 className="text-sm font-medium mb-1.5">{t('calc.cfg.riskMaterial')}<span className="text-xs muted font-normal"> — {t('calc.help.riskMaterial')}</span></h3>
              {Object.entries(r.riskByMaterial ?? {}).map(([k, v]) => <div key={k} className="grid grid-cols-[1fr_6rem_auto] gap-2 mb-1.5 max-w-sm"><span className="self-center text-sm">{k}</span><input type="number" min={0} step="0.1" className="input" value={v} disabled={!canEdit} aria-label={k} onChange={(e) => setR({ ...r, riskByMaterial: { ...r.riskByMaterial, [k]: +e.target.value || 1 } })} /><button type="button" className="btn-ghost btn-sm" disabled={!canEdit} aria-label={t('common.deleteLabel')} onClick={() => { const { [k]: _d, ...rest } = r.riskByMaterial ?? {}; setR({ ...r, riskByMaterial: rest }); }}>✕</button></div>)}
              {canEdit && <RiskAdder types={[...new Set(ctx.materials.map((m) => m.type))].filter((x) => !(x in (r.riskByMaterial ?? {})))} onAdd={(k) => setR({ ...r, riskByMaterial: { ...r.riskByMaterial, [k]: 1.2 } })} />}</div>
            <div><h3 className="text-sm font-medium mb-1.5">{t('calc.cfg.tags')}<span className="text-xs muted font-normal"> — {t('calc.help.tags')}</span></h3>
              {(r.complexityTags ?? []).map((tg, i) => <div key={tg.key} className="grid grid-cols-[1fr_6rem_auto] gap-2 mb-1.5 max-w-md"><input className="input" value={tg.label} disabled={!canEdit} aria-label={t('common.name')} onChange={(e) => setR({ ...r, complexityTags: (r.complexityTags ?? []).map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} /><input type="number" min={0} step="0.1" className="input" value={tg.factor} disabled={!canEdit} aria-label={t('calc.cfg.factor')} onChange={(e) => setR({ ...r, complexityTags: (r.complexityTags ?? []).map((x, k) => (k === i ? { ...x, factor: +e.target.value || 1 } : x)) })} /><button type="button" className="btn-ghost btn-sm" disabled={!canEdit} aria-label={t('common.deleteLabel')} onClick={() => setR({ ...r, complexityTags: (r.complexityTags ?? []).filter((_, k) => k !== i) })}>✕</button></div>)}
              {canEdit && <div className="flex gap-2 flex-wrap"><button type="button" className="btn-ghost btn-sm" onClick={() => setR({ ...r, complexityTags: [...(r.complexityTags ?? []), { key: `t${Date.now().toString(36)}`, label: '', factor: 1.2 }] })}>{t('calc.cfg.addTag')}</button>{(r.complexityTags ?? []).length === 0 && <button type="button" className="btn-ghost btn-sm" data-testid="tags-suggest" onClick={() => setR({ ...r, complexityTags: DEFAULT_COMPLEXITY_TAGS.map((x) => ({ ...x })) })}>{t('calc.cfg.suggestTags')}</button>}</div>}</div>
          </div>
        </div>
      )}
      {tab === 'profiles' && <ProfilesManager profiles={profiles} setProfiles={setProfiles} base={rt} usage={usage} canEdit={canEdit} sample={(x) => { const p = sample(x, CASES[1]); return p ? { unit: p.unit, margin: p.margin } : null; }} />}
      {tab === 'refs' && (
        <div className="space-y-6">
          <BenchmarksEditor benchmarks={r.benchmarks ?? []} onChange={(b) => setR({ ...r, benchmarks: b })} canEdit={canEdit} />
          <QuoteCalibrator canEdit={canEdit} onAddBenchmarks={(b) => setR({ ...r, benchmarks: [...(r.benchmarks ?? []), ...b] })} onApplyFloors={(f) => setR({ ...r, floors: { ...(r.floors ?? { perHour: 0, perHourAuto: true, perGram: 0, perOrder: 0 }), perGram: f.perGram, perHour: f.perHour, perHourAuto: false } })} />
          <RealVsCalc r={r} setR={setR} canEdit={canEdit} />
        </div>
      )}
      {tab === 'history' && <RatesHistory rows={history} canEdit={canEdit} />}
    </div>
  );

  return (
    <div className="space-y-4" data-testid="calc-config">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-600 overflow-hidden" role="radiogroup" aria-label={t('calc.cfg.modeLabel')}>
          {(['estandar', 'avanzado'] as const).map((m) => <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => changeMode(m)} data-testid={`cfg-mode-${m}`} className={cn('px-3 min-h-[44px] md:min-h-[34px] text-sm', mode === m ? 'bg-[var(--panel)] text-[var(--panel-ink)] dark:bg-slate-700' : 'hover:bg-slate-100 dark:hover:bg-slate-800')}>{t(`calc.cfg.mode_${m}` as never)}</button>)}
        </div>
        {canEdit && <button type="button" className="btn-ghost btn-sm" onClick={() => setWiz(true)} data-testid="open-wizard">{t('calc.wiz.open')}</button>}
        <Badge tone={status.status === 'lista' ? 'green' : status.status === 'casi' ? 'amber' : 'red'}>{t(`calc.status.${status.status}`)}</Badge>
        {!st.calcSetup.done && canEdit && <span className="text-xs muted">{t('calc.cfg.notSetup')}</span>}
      </div>
      {status.status !== 'lista' && (
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-0.5 text-sm" data-testid="cfg-checklist">{status.items.filter((i) => !i.ok).map((i) => <li key={i.key} className="flex items-center gap-2"><span aria-hidden="true">{i.critical ? '✕' : '○'}</span>{t(`calc.check.${i.key}`)}{(i.key === 'machine' || i.key === 'material') && <Link className="underline text-xs" href={i.key === 'machine' ? '/maquinas' : '/inventario'}>{t('calc.warn.fix')}</Link>}</li>)}</ul>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4 min-w-0">
          {std ? standard : advanced}
          <div className="grid sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
            <NumField label={t('settings.quoteValidityDays')} value={valid} onChange={setValid} disabled={!canEdit} testid="cfg-valid" />
            <NumField label={t('settings.reservationExpiryDays')} value={resv} onChange={setResv} disabled={!canEdit} testid="cfg-resv" />
            <NumField label={t('settings.suggestedDeposit')} value={dep} onChange={setDep} unit="%" disabled={!canEdit} testid="cfg-dep" />
          </div>
        </div>
        <aside className="space-y-3 lg:sticky lg:top-20 self-start" aria-label={t('calc.cfg.previewTitle')} data-testid="cfg-preview">
          <Card title={t('calc.cfg.previewTitle')}>
            {!machine || !material ? <p className="text-sm muted">{t('calc.cfg.previewEmpty')}</p> : (
              <table className="w-full text-xs tabular"><thead><tr className="muted text-left"><th>{t('calc.cfg.previewCase')}</th><th className="text-right">{t('calc.netPrice')}</th><th className="text-right">$/h</th><th className="text-right">{t('common.margin')}</th></tr></thead>
                <tbody>{preview.map(({ c, p }) => p && <tr key={c.key}><td className="py-0.5">{t(`calc.cfg.case_${c.key}` as never)}<div className="muted">{c.qty > 1 ? `${c.qty} × ` : ''}{c.g / c.qty} g · {num(c.h / c.qty, 1)} h</div></td><td className="text-right" data-testid={`prev-${c.key}`}>{money(p.total)}</td><td className="text-right">{money(Math.round(p.perHour))}</td><td className="text-right">{p.margin != null ? pct(p.margin, 0) : '—'}</td></tr>)}</tbody></table>)}
            <p className="text-xs muted mt-2">{t('calc.cfg.previewNote', { name: machine?.name ?? '—' })}</p>
            <div className="mt-2 text-sm tabular" data-testid="preview-breakeven">{t('calc.cfg.breakEven', { v: money(Math.round(be)) })}</div>
          </Card>
          {(checks.length > 0 || errors.length > 0) && (
            <div className="rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3 text-xs space-y-1" role="status" data-testid="cfg-warnings">
              {errors.map((e) => <p key={e} className="font-medium text-red-700 dark:text-red-300">✕ {e}</p>)}
              {checks.map((c) => <p key={c.key}>⚠ {t(`calc.coh.${c.key}` as never, c.params as never)}</p>)}
            </div>)}
          {canEdit && (
            <div className="space-y-2">
              <p className="text-xs muted" data-testid="cfg-impact">{t('calc.cfg.impact', { n: draftCount })}</p>
              <button type="button" className="btn-primary w-full" onClick={save} disabled={pending || errors.length > 0 || !dirty} data-testid="rates-save">{t('settings.saveRates')}</button>
            </div>)}
        </aside>
      </div>
      <CalcWizard open={wiz} onClose={() => setWiz(false)} st={st} ctx={ctx} />
    </div>
  );
}

function RiskAdder({ types, onAdd }: { types: string[]; onAdd: (k: string) => void }) {
  const t = useT(); const [v, setV] = useState('');
  return (
    <div className="flex gap-2 max-w-sm"><input className="input" list="risk-types" value={v} onChange={(e) => setV(e.target.value)} placeholder={t('calc.cfg.materialType')} aria-label={t('calc.cfg.materialType')} /><datalist id="risk-types">{types.map((x) => <option key={x} value={x} />)}</datalist>
      <button type="button" className="btn-ghost btn-sm" disabled={!v.trim()} onClick={() => { onAdd(v.trim()); setV(''); }}>{t('calc.cfg.addRisk')}</button></div>
  );
}
