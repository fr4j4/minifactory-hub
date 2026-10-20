'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AppSettings } from '@/lib/settings';
import type { CalcContext } from '@/lib/context';
import { breakEvenRate, completeness, hoursPerMachineMonth, normRates, RECOMMENDED_V2, resolveRates, type Rates } from '@/lib/pricing';
import { SHOP_PRESETS, type ShopPreset } from '@/lib/calc-presets';
import { money, num, pct } from '@/lib/format';
import { saveCalcBasicsAction } from '@/actions/calc';
import { saveSettingsAction } from '@/actions/settings';
import { toItemMaterial } from '@/lib/item-price';
import { Modal, useToast } from './client';
import { Badge } from './ui';
import { NumField, SelectField, pathGet, pathSet } from './calc-fields';
import { samplePrice } from './calc-profiles';
import { useT } from '@/i18n/client';

const STEPS = ['shop', 'costs', 'time', 'assets', 'margin', 'done'] as const;

/** Asistente de puesta en marcha: 5 pasos saltables; los valores precargados se marcan «sugerido» hasta que se confirman. */
export function CalcWizard({ open, onClose, st, ctx }: { open: boolean; onClose: () => void; st: AppSettings; ctx: CalcContext }) {
  const t = useT(); const toast = useToast(); const router = useRouter();
  const [step, setStep] = useState(0);
  const [w, setW] = useState<Rates>(() => resolveRates(normRates(st.rates), RECOMMENDED_V2, SHOP_PRESETS.taller));
  const [preset, setPreset] = useState<ShopPreset>('taller');
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [machines, setMachines] = useState(ctx.machines.filter((m) => !m.simulated).map((m) => ({ id: m.id, name: m.name, purchaseValue: m.cost.purchaseValue, residualValue: m.cost.residualValue, lifeHours: m.cost.lifeHours, watts: m.cost.watts })));
  const [materials, setMaterials] = useState(ctx.materials.filter((m) => m.tech === 'fdm').map((m) => ({ id: m.id, label: m.label, costPerKg: m.costPerKg })));
  const [busy, setBusy] = useState(false);
  const fixedList = w.fixedCosts ?? []; const fixedSum = fixedList.reduce((a, f) => a + f.amount, 0);
  const rt: Rates = { ...w, machineCount: Math.max(1, machines.length) };
  const set = (path: string, v: unknown) => { setW((x) => pathSet(x, path, v)); setTouched((s) => new Set(s).add(path)); };
  const sug = (path: string) => (!touched.has(path) ? <Badge tone="blue">{t('calc.wiz.suggested')}</Badge> : null);
  const applyPreset = (p: ShopPreset) => {
    setPreset(p); const pr = SHOP_PRESETS[p] as Partial<Rates>;
    setW((x) => ({ ...x, ...pr, productive: { ...x.productive!, ...(pr.productive ?? {}) } as Rates['productive'] })); setTouched(new Set());
  };
  const be = breakEvenRate(rt);
  const sample = useMemo(() => {
    const m = machines[0]; const mat = ctx.materials.find((x) => x.tech === 'fdm'); if (!m) return null;
    const cm = ctx.machines.find((x) => x.id === m.id)!;
    const costMat = materials.find((x) => x.id === mat?.id)?.costPerKg ?? mat?.costPerKg ?? 0;
    return samplePrice(rt, ctx.calcProfiles, { ...cm.cost, purchaseValue: m.purchaseValue, residualValue: m.residualValue, lifeHours: m.lifeHours, watts: m.watts }, toItemMaterial(mat ? { costPerKg: costMat, type: mat.type } : null), { qty: 1, g: 50, h: 4 });
  }, [rt, machines, materials, ctx]);
  const status = completeness(rt, { machines, materials, hasProfile: true });

  const finish = async () => {
    setBusy(true);
    try {
      const b = await saveCalcBasicsAction({ machines: machines.map(({ id, purchaseValue, residualValue, lifeHours, watts }) => ({ id, purchaseValue, residualValue, lifeHours, watts })), materials: materials.map(({ id, costPerKg }) => ({ id, costPerKg })) });
      if (!b.ok) { toast.push(b.error, 'err'); return; }
      const s = await saveSettingsAction({ rates: w, calcSetup: { done: true, preset } });
      if (!s.ok) { toast.push(s.error, 'err'); return; }
      toast.push(t('calc.wiz.saved')); onClose(); router.refresh();
    } finally { setBusy(false); }
  };
  const num_ = (path: string, label: string, o: { unit?: string; hint?: string; testid?: string } = {}) => (
    <div><NumField label={label} unit={o.unit} hint={o.hint} value={Number(pathGet(w, path) ?? 0)} onChange={(v) => set(path, v)} testid={o.testid} /><div className="mt-0.5">{sug(path)}</div></div>
  );
  const cur = STEPS[step];
  return (
    <Modal open={open} onClose={onClose} title={t('calc.wiz.title')} wide>
      <div className="space-y-4" data-testid="calc-wizard">
        <ol className="flex flex-wrap gap-2 text-xs" aria-label={t('calc.wiz.progress')}>{STEPS.map((s, i) => <li key={s}><button type="button" onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined} className={`rounded-full border px-2.5 py-1 min-h-[32px] ${i === step ? 'bg-[var(--panel)] text-[var(--panel-ink)] border-[var(--panel)]' : 'border-slate-300 dark:border-slate-600'}`}>{i + 1}. {t(`calc.wiz.s_${s}` as never)}</button></li>)}</ol>
        <p className="text-sm muted">{t(`calc.wiz.h_${cur}` as never)}</p>
        {cur === 'shop' && (
          <div className="grid sm:grid-cols-3 gap-3">
            <SelectField label={t('calc.wiz.preset')} hint={t('calc.wiz.presetHelp')} value={preset} onChange={(v) => applyPreset(v as ShopPreset)} options={(['hobby', 'taller', 'produccion'] as const).map((p) => [p, t(`calc.preset.${p}` as never)])} testid="wiz-preset" />
            {num_('productive.hoursPerDay', t('calc.cfg.hoursPerDay'), { unit: 'h', testid: 'wiz-hours' })}
            {num_('productive.daysPerMonth', t('calc.cfg.daysPerMonth'), { unit: t('calc.cfg.days'), testid: 'wiz-days' })}
            <p className="sm:col-span-3 text-xs muted">{t('calc.wiz.machinesInfo', { n: machines.length, hours: num(hoursPerMachineMonth(rt) * Math.max(1, machines.length), 0) })}</p>
          </div>)}
        {cur === 'costs' && (
          <div className="grid sm:grid-cols-2 gap-3">
            <div><NumField label={t('calc.cfg.fixedMonth')} hint={t('calc.help.fixed')} unit="$" value={fixedSum} disabled={fixedList.length > 1} onChange={(v) => { setW((x) => ({ ...x, fixedCosts: [{ label: t('calc.cfg.fixedGeneric'), amount: v }] })); }} testid="wiz-fixed" />{fixedList.length > 1 && <p className="text-xs muted mt-1">{t('calc.cfg.fixedDetail')}</p>}</div>
            {num_('targetIncomeMonth', t('calc.cfg.income'), { unit: '$', hint: t('calc.help.income'), testid: 'wiz-income' })}
          </div>)}
        {cur === 'time' && (
          <div className="grid sm:grid-cols-2 gap-3">
            {num_('laborHour', t('calc.cfg.laborHour'), { unit: '$/h', hint: t('calc.help.labor'), testid: 'wiz-labor' })}
            {num_('prepMinutes', t('calc.cfg.prepMin'), { unit: 'min', hint: t('calc.help.prep') })}
            {num_('postMinutes', t('calc.cfg.postMin'), { unit: 'min', hint: t('calc.help.post') })}
            {num_('supervisionMinPerHour', t('calc.cfg.superMin'), { unit: 'min/h', hint: t('calc.help.super') })}
          </div>)}
        {cur === 'assets' && (
          <div className="space-y-4">
            {machines.length === 0 ? <p className="text-sm">{t('calc.wiz.noMachines')}</p> : (
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="muted text-left text-xs"><th>{t('common.machine')}</th><th>{t('calc.wiz.purchase')}</th><th>{t('calc.wiz.residual')}</th><th>{t('calc.wiz.life')}</th><th>{t('calc.wiz.watts')}</th></tr></thead>
                <tbody>{machines.map((m, i) => <tr key={m.id}><td className="pr-2 font-medium">{m.name}</td>
                  {(['purchaseValue', 'residualValue', 'lifeHours', 'watts'] as const).map((k) => <td key={k} className="pr-2"><input type="number" min={0} className="input !w-28" aria-label={`${m.name} ${t(`calc.wiz.${k}` as never)}`} value={m[k] || ''} onChange={(e) => setMachines(machines.map((x, j) => (j === i ? { ...x, [k]: +e.target.value || 0 } : x)))} data-testid={`wiz-m-${k}-${i}`} /></td>)}</tr>)}</tbody></table></div>)}
            {materials.length > 0 && (
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="muted text-left text-xs"><th>{t('common.material')}</th><th>{t('calc.wiz.costKg')}</th></tr></thead>
                <tbody>{materials.map((m, i) => <tr key={m.id}><td className="pr-2">{m.label}</td><td><input type="number" min={0} className="input !w-32" aria-label={`${m.label} ${t('calc.wiz.costKg')}`} value={m.costPerKg || ''} onChange={(e) => setMaterials(materials.map((x, j) => (j === i ? { ...x, costPerKg: +e.target.value || 0 } : x)))} data-testid={`wiz-mat-${i}`} /></td></tr>)}</tbody></table></div>)}
            <p className="text-xs muted">{t('calc.wiz.netCostsNote')}</p>
          </div>)}
        {cur === 'margin' && (
          <div className="space-y-3">
            <label className="block"><span className="label">{t('calc.cfg.margin')}: <b>{num(w.marginPct, 0)}%</b></span>
              <input type="range" min={10} max={70} step={1} className="w-full" value={w.marginPct} onChange={(e) => set('marginPct', +e.target.value)} aria-valuetext={`${w.marginPct}%`} data-testid="wiz-margin" /></label>
            <p className="text-xs muted">{t('calc.cfg.marginExample', { price: money(Math.round(1000 / (1 - Math.min(0.95, w.marginPct / 100)))) })}</p>
            {sample && <p className="text-sm rounded-lg border border-slate-300 dark:border-slate-600 p-2" data-testid="wiz-example">{t('calc.wiz.example', { cost: money(Math.round(sample.bd.cost)), price: money(sample.total), perHour: money(Math.round(sample.perHour)) })}</p>}
          </div>)}
        {cur === 'done' && (
          <div className="space-y-2 text-sm" data-testid="wiz-summary">
            <p>{t('calc.wiz.breakEven', { rate: money(Math.round(be)) })}</p>
            {sample && <p>{t('calc.wiz.example', { cost: money(Math.round(sample.bd.cost)), price: money(sample.total), perHour: money(Math.round(sample.perHour)) })}</p>}
            <p>{t('calc.wiz.statusIs')} <Badge tone={status.status === 'lista' ? 'green' : status.status === 'casi' ? 'amber' : 'red'}>{t(`calc.status.${status.status}`)}</Badge></p>
            <p className="text-xs muted">{t('calc.wiz.neverBlocks')} {pct(w.marginPct, 0)}</p>
          </div>)}
        <div className="flex flex-wrap justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
          <button type="button" className="btn-ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>{t('calc.wiz.back')}</button>
          <div className="flex gap-2">
            {cur !== 'done' && <button type="button" className="btn-ghost" onClick={() => setStep(step + 1)} data-testid="wiz-skip">{t('calc.wiz.skip')}</button>}
            {cur !== 'done' && <button type="button" className="btn-primary" onClick={() => setStep(step + 1)} data-testid="wiz-next">{t('calc.wiz.next')}</button>}
            {cur === 'done' && <button type="button" className="btn-primary" onClick={finish} disabled={busy} data-testid="wiz-finish">{busy ? t('common.saving') : t('calc.wiz.finish')}</button>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
