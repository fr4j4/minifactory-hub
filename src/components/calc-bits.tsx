'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { breakEvenRate, fixedPerHour, hourFloor, inversePrice, machineRate, quantityTable, sensitivity, type Confidence, type CostBreakdown, type PriceWarning, type Rates } from '@/lib/pricing';
import { buildLine, type ItemPriceInput } from '@/lib/item-price';
import { cn, money, num, pct } from '@/lib/format';
import { useT } from '@/i18n/client';
import { Badge } from './ui';
import { CopyButton } from './client';

/* ───────── nivel de la interfaz (Básico / Detallado / Experto) ───────── */
export type CalcLevel = 'basico' | 'detallado' | 'experto';
export const LEVELS: CalcLevel[] = ['basico', 'detallado', 'experto'];
const LEVEL_KEY = 'mf.calcLevel';
const EVT = 'mf-calc-level';
const levelRank = (l: CalcLevel) => LEVELS.indexOf(l);
export const atLeast = (l: CalcLevel, min: CalcLevel) => levelRank(l) >= levelRank(min);

/** El nivel solo cambia lo que se ve, nunca el precio. Se recuerda en este dispositivo. */
export function useCalcLevel(def: CalcLevel = 'basico'): [CalcLevel, (l: CalcLevel) => void] {
  const [lv, setLv] = useState<CalcLevel>(def);
  useEffect(() => {
    const read = () => { try { const v = localStorage.getItem(LEVEL_KEY); if (v === 'basico' || v === 'detallado' || v === 'experto') setLv(v); } catch { /* sin almacenamiento */ } };
    read(); window.addEventListener(EVT, read); window.addEventListener('storage', read);
    return () => { window.removeEventListener(EVT, read); window.removeEventListener('storage', read); };
  }, []);
  const set = useCallback((l: CalcLevel) => { setLv(l); try { localStorage.setItem(LEVEL_KEY, l); } catch { /* ignorar */ } window.dispatchEvent(new Event(EVT)); }, []);
  return [lv, set];
}

export function LevelSwitch({ level, onChange, className }: { level: CalcLevel; onChange: (l: CalcLevel) => void; className?: string }) {
  const t = useT();
  return (
    <div className={cn('inline-flex rounded-lg border border-slate-300 dark:border-slate-600 overflow-hidden', className)} role="radiogroup" aria-label={t('calc.level.label')} data-testid="calc-level">
      {LEVELS.map((l) => (
        <button key={l} type="button" role="radio" aria-checked={level === l} title={t(`calc.level.${l}Desc`)} data-testid={`level-${l}`} onClick={() => onChange(l)}
          className={cn('px-3 min-h-[44px] md:min-h-[34px] text-sm', level === l ? 'bg-[var(--panel)] text-[var(--panel-ink)] dark:bg-slate-700' : 'hover:bg-slate-100 dark:hover:bg-slate-800')}>{t(`calc.level.${l}`)}</button>
      ))}
    </div>
  );
}

/** Ayuda de una línea junto a una etiqueta (accesible con teclado). */
export function Hint({ text }: { text: string }) {
  const t = useT(); const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block align-middle">
      <button type="button" aria-expanded={open} aria-label={t('calc.helpLabel')} onClick={() => setOpen((v) => !v)} onBlur={() => setOpen(false)}
        className="ml-1 inline-grid h-4 w-4 place-items-center rounded-full border border-slate-400 text-[10px] leading-none muted hover:bg-slate-100 dark:hover:bg-slate-800">?</button>
      {open && <span role="note" className="absolute z-30 left-0 top-5 w-60 rounded-lg border border-[var(--line)] bg-[var(--card)] p-2 text-xs font-normal normal-case shadow-lg">{text}</span>}
    </span>
  );
}

const CONF_ICON: Record<Confidence, string> = { alta: '●', media: '◐', baja: '○' };
export function ConfidenceBadge({ c }: { c: Confidence | undefined }) {
  const t = useT();
  if (!c) return null;
  return <Badge tone={c === 'alta' ? 'green' : c === 'media' ? 'blue' : 'amber'}><span aria-hidden="true">{CONF_ICON[c]}</span> {t('calc.conf.label', { level: t(`calc.conf.${c}`) })}</Badge>;
}

/* ───────── avisos de datos incompletos ───────── */
const WARN_LINK: Partial<Record<PriceWarning, string>> = { noMachine: '/maquinas', machineNoPurchase: '/maquinas', machineNoPower: '/maquinas', materialNoCost: '/inventario', noLabor: '/configuracion?tab=tarifas', noFixedCosts: '/configuracion?tab=tarifas' };
export function WarningList({ warnings, showAll }: { warnings: PriceWarning[] | undefined; showAll?: boolean }) {
  const t = useT();
  const critical: PriceWarning[] = ['noMachine', 'machineNoPurchase', 'machineNoPower', 'materialNoCost', 'noLabor'];
  const list = (warnings ?? []).filter((w) => showAll || critical.includes(w));
  if (!list.length) return null;
  const hasCritical = list.some((w) => critical.includes(w));
  return (
    <div className={cn('rounded-lg border p-2 text-xs space-y-1', hasCritical ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700' : 'border-slate-300 dark:border-slate-600')} role="status" data-testid="calc-warnings">
      {hasCritical && <p className="font-medium">{t('calc.warn.title')}</p>}
      <ul className="space-y-0.5">{list.map((w) => <li key={w}>{t(`calc.warn.${w}`)}{WARN_LINK[w] && <> · <Link className="underline" href={WARN_LINK[w]!}>{t('calc.warn.fix')}</Link></>}</li>)}</ul>
    </div>
  );
}

/* ───────── banda Piso / Recomendado / Alto ───────── */
export function PriceBand({ band, value, onChange, step, disabled }: { band: { floor: number; recommended: number; high: number }; value: number; onChange: (v: number) => void; step: number; disabled?: boolean }) {
  const t = useT();
  const lo = Math.max(0, Math.floor((band.floor * 0.7) / step) * step); const hi = Math.max(lo + step, Math.ceil((band.high * 1.2) / step) * step);
  const at = (v: number) => `${Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100))}%`;
  const state = value < band.floor ? 'below' : value > band.high ? 'above' : 'ok';
  return (
    <div className="space-y-1.5" data-testid="price-band">
      <div className="label !mb-0">{t('calc.band.label')}</div>
      <div className="relative pt-1 pb-6">
        <div className="relative h-2 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700" aria-hidden="true">
          <div className="absolute inset-y-0 left-0 bg-red-400/70" style={{ width: at(band.floor) }} />
          <div className="absolute inset-y-0 bg-emerald-400/70" style={{ left: at(band.floor), width: `calc(${at(band.high)} - ${at(band.floor)})` }} />
          <div className="absolute inset-y-0 bg-blue-400/60" style={{ left: at(band.high), right: 0 }} />
        </div>
        <input type="range" min={lo} max={hi} step={step} value={Math.min(hi, Math.max(lo, value))} disabled={disabled} onChange={(e) => onChange(+e.target.value)}
          aria-label={t('calc.band.label')} aria-valuetext={t('calc.band.value', { value: money(value) })} className="absolute inset-x-0 top-0 w-full h-4 opacity-90 cursor-pointer disabled:cursor-not-allowed" data-testid="band-range" />
        {(['floor', 'recommended', 'high'] as const).map((k) => (
          <button key={k} type="button" disabled={disabled} onClick={() => onChange(band[k])} style={{ left: at(band[k]) }} data-testid={`band-${k}`}
            className="absolute top-4 -translate-x-1/2 text-[10px] leading-tight text-center whitespace-nowrap hover:underline disabled:no-underline">
            <span className="block font-medium">{t(`calc.band.${k}`)}</span><span className="block tabular muted">{money(band[k])}</span>
          </button>
        ))}
      </div>
      {state === 'below' && <p className="text-xs text-red-700 dark:text-red-300" role="status">{t('calc.band.belowFloor')}</p>}
    </div>
  );
}

/* ───────── ¿Por qué este precio? ───────── */
export function WhyPrice({ bd, rt, input, level, showCosts }: { bd: CostBreakdown; rt: Rates; input: { gramsTotal: number; hoursTotal: number; costPerKg?: number; machine: Parameters<typeof machineRate>[0] }; level: CalcLevel; showCosts: boolean }) {
  const t = useT();
  const v2 = bd.engine === 2;
  const sentence = !v2 ? t('calc.why.generic')
    : !showCosts ? t('calc.why.generic')
    : bd.rule === 'floorHour' ? t('calc.why.floorHour', { rate: money(Math.round(hourFloor(rt))) })
    : bd.rule === 'floorGram' ? t('calc.why.floorGram', { rate: money(rt.floors?.perGram ?? 0) })
    : bd.rule === 'floorLine' ? t('calc.why.floorLine', { value: money(rt.minPrice) })
    : bd.rule === 'volumeLimited' ? t('calc.why.volumeLimited', { min: rt.volumeMinMarginPct ?? 0 })
    : t('calc.why.margin', { cost: money(bd.cost), margin: num(bd.marginReal ?? 0, 0) });
  const extras: string[] = [];
  if (showCosts && v2) {
    if (bd.urgencyPct) extras.push(t('calc.why.urgency', { pct: bd.urgencyPct }));
    if (bd.volumePct) extras.push(t('calc.why.volume', { pct: Math.abs(bd.volumePct) }));
    if ((bd.feesAmount ?? 0) > 0) extras.push(t('calc.why.fees', { pct: num((rt.payFeePct ?? 0) + (rt.channelFeePct ?? 0), 1) }));
  }
  const rows: Array<[string, number | undefined]> = [
    ['material', bd.material], ['machine', bd.machine], ['energy', bd.energy], ['overhead', bd.overhead], ['prep', bd.prep], ['supervision', bd.supervision], ['post', bd.post], ['design', bd.design], ['packaging', bd.packaging], ['failure', bd.failure],
  ];
  const mr = machineRate(input.machine, rt);
  return (
    <details className="text-sm" data-testid="why-price">
      <summary className="cursor-pointer font-medium">{t('calc.why.title')}</summary>
      <div className="mt-2 space-y-2">
        <p data-testid="why-sentence">{sentence}{showCosts && v2 && bd.rule && bd.rule !== 'margin' && <span className="muted"> {t('calc.why.fix')}</span>}</p>
        {extras.length > 0 && <p className="text-xs muted">{extras.join(' · ')}</p>}
        {showCosts && atLeast(level, 'detallado') && (
          <table className="w-full text-xs tabular" data-testid="why-table"><tbody>
            {rows.filter(([, v]) => v).map(([k, v]) => <tr key={k}><td className="py-0.5">{t(`calc.cost.${k}` as never)}</td><td className="text-right">{money(v!)}</td><td className="text-right muted w-12">{bd.cost > 0 ? pct(((v ?? 0) / bd.cost) * 100, 0) : ''}</td></tr>)}
            <tr className="border-t border-slate-300 dark:border-slate-600 font-medium"><td className="py-1">{t('calc.cost.total')}</td><td className="text-right">{money(bd.cost)}</td><td /></tr>
            <tr><td className="muted">{t('calc.cost.marginLine', { pct: num(bd.marginPct, 0) })}{bd.urgencyPct ? ` ${t('calc.cost.urgencyLine', { pct: bd.urgencyPct })}` : ''}{bd.volumePct ? ` ${t('calc.cost.volumeLine', { pct: bd.volumePct })}` : ''}</td><td className="text-right muted">{money(bd.priceBeforeRound)}</td><td /></tr>
            {(bd.feesAmount ?? 0) > 0 && <tr><td className="muted">{t('calc.cost.fees')}</td><td className="text-right muted">{money(bd.feesAmount!)}</td><td /></tr>}
          </tbody></table>
        )}
        {showCosts && level === 'experto' && v2 && (
          <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 p-2 text-xs font-mono space-y-1 break-words" data-testid="why-formula">
            <div>{t('calc.f.time', { h: num(input.hoursTotal, 2), eff: num(bd.hoursEffective, 2) })}</div>
            <div>{t('calc.f.machine', { dep: money(Math.round(mr.dep)), maint: money(Math.round(mr.maint)), cap: money(Math.round(mr.capital)), fixed: money(Math.round(mr.fixed)), total: money(Math.round(mr.total)), energy: money(Math.round(mr.energy)) })}</div>
            <div>{t('calc.f.material', { g: num(input.gramsTotal, 1), eff: num(bd.gramsEffective, 1), waste: num(rt.wastePct, 1), v: money(bd.material) })}</div>
            <div>{t('calc.f.labor', { rate: money(rt.laborHour), prep: money(bd.prep), sup: money(bd.supervision ?? 0), post: money(bd.post) })}</div>
            <div>{t('calc.f.fail', { v: money(bd.failure) })}</div>
            <div>{t(rt.marginMode === 'recargo' ? 'calc.f.priceMarkup' : 'calc.f.priceMargin', { cost: money(bd.cost), m: num(bd.marginPct, 1), price: money(bd.priceBeforeRound) })}</div>
            <div>{t('calc.f.floors', { hour: money(Math.round(hourFloor(rt) * bd.hoursEffective)), gram: money(Math.round((rt.floors?.perGram ?? 0) * input.gramsTotal)), line: money(rt.minPrice), rule: t(`calc.rule.${bd.rule ?? 'margin'}`) })}</div>
            <div>{t('calc.f.fixedBreak', { fixed: money(Math.round(fixedPerHour(rt))), be: money(Math.round(breakEvenRate(rt))) })}</div>
          </div>
        )}
      </div>
    </details>
  );
}

/* ───────── herramientas del nivel Experto ───────── */
export interface ExpertCtx {
  item: ItemPriceInput; env: Parameters<typeof buildLine>[1];
  /** Escenarios: devuelven el precio de la misma línea con cambios (perfil, máquina, material o cantidad). */
  scenario: (over: { profileId?: string | null; machineId?: string | null; materialId?: string | null; qty?: number }) => { unit: number; total: number; margin: number | null; perHour: number; cost: number };
  profiles: Array<{ id: string; name: string }>; machines: Array<{ id: string; name: string }>; materials: Array<{ id: string; label: string }>;
  current: { profileId: string | null; machineId: string | null; materialId: string | null; qty: number };
}
export function ExpertTools({ x, bd, unitFinal }: { x: ExpertCtx; bd: CostBreakdown; unitFinal: number }) {
  const t = useT();
  const { input, rt } = useMemo(() => buildLine(x.item, x.env), [x.item, x.env]);
  const baseQty = Math.max(1, x.item.qty);
  const qtys = useMemo(() => Array.from(new Set([1, 5, 10, 25, 50, 100, baseQty])).sort((a, b) => a - b), [baseQty]);
  const table = useMemo(() => quantityTable(input, rt, qtys), [input, rt, qtys]);
  const sens = useMemo(() => sensitivity(input, rt), [input, rt]);
  const [target, setTarget] = useState<number | ''>('');
  const inv = target !== '' && target > 0 ? inversePrice(input, rt, target) : null;
  const [cols, setCols] = useState<Array<{ profileId: string | null; machineId: string | null; materialId: string | null; qty: number }>>([{ ...x.current }, { ...x.current }]);
  const sc = cols.map((c) => x.scenario(c));
  const base = x.scenario(x.current);
  const json = JSON.stringify({ input, rates: rt, result: bd }, null, 2);
  const csv = () => {
    const lines = [['qty', 'unit', 'total', 'margin_pct'].join(','), ...table.map((r) => [r.qty, r.unit, r.total, r.marginReal != null ? r.marginReal.toFixed(1) : ''].join(','))];
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })); a.download = 'calculadora.csv'; a.click(); URL.revokeObjectURL(a.href);
  };
  const sel = 'input !min-h-[34px] text-xs';
  return (
    <details className="text-sm" data-testid="expert-tools" open>
      <summary className="cursor-pointer font-medium">{t('calc.exp.title')}</summary>
      <div className="mt-3 space-y-4">
        <section aria-label={t('calc.exp.qty')}>
          <h4 className="label">{t('calc.exp.qty')}</h4>
          <table className="w-full text-xs tabular" data-testid="qty-table"><thead><tr className="muted text-left"><th>{t('calc.exp.col.qty')}</th><th className="text-right">{t('calc.exp.col.unit')}</th><th className="text-right">{t('calc.exp.col.total')}</th><th className="text-right">{t('calc.exp.col.margin')}</th></tr></thead>
            <tbody>{table.map((r) => <tr key={r.qty} className={cn(r.qty === baseQty && 'font-semibold')}><td>{r.qty}</td><td className="text-right">{money(r.unit)}</td><td className="text-right">{money(r.total)}</td><td className="text-right">{r.marginReal != null ? pct(r.marginReal, 0) : '—'}</td></tr>)}</tbody></table>
        </section>
        <section aria-label={t('calc.exp.sens')}>
          <h4 className="label">{t('calc.exp.sens')}</h4>
          <ul className="grid grid-cols-2 gap-x-4 text-xs tabular" data-testid="sens-list">{sens.map((s) => <li key={s.key} className="flex justify-between"><span>{t(`calc.exp.sens_${s.key.replace('+', 'Up').replace('-', 'Down')}` as never)}</span><span className={s.delta > 0 ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}>{s.delta > 0 ? '+' : ''}{num(s.delta, 1)}%</span></li>)}</ul>
        </section>
        <section aria-label={t('calc.exp.inverse')}>
          <h4 className="label">{t('calc.exp.inverse')}</h4>
          <div className="flex items-center gap-2"><input type="number" min={0} inputMode="numeric" className="input !w-36" placeholder={String(unitFinal)} value={target} onChange={(e) => setTarget(e.target.value === '' ? '' : Math.max(0, +e.target.value))} aria-label={t('calc.exp.inverseInput')} data-testid="inverse-input" /><span className="text-xs muted">{t('calc.exp.inverseInput')}</span></div>
          {inv && <p className="text-xs mt-1.5" data-testid="inverse-result">{t('calc.exp.inverseResult', { margin: inv.marginPct != null ? pct(inv.marginPct, 0) : '—', perHour: money(Math.round(inv.perHour)) })} <b>{t(`calc.exp.verdict_${inv.verdict}`)}</b></p>}
        </section>
        <section aria-label={t('calc.exp.scen')}>
          <h4 className="label">{t('calc.exp.scen')}</h4>
          <div className="overflow-x-auto"><table className="w-full text-xs tabular" data-testid="scenarios"><thead><tr className="muted text-left"><th /><th>{t('calc.exp.scenCurrent')}</th>{cols.map((_, i) => <th key={i}>{t('calc.exp.scenN', { n: i + 1 })}</th>)}</tr></thead>
            <tbody>
              <tr><td className="pr-2">{t('calc.field.profile')}</td><td>{x.profiles.find((p) => p.id === x.current.profileId)?.name ?? '—'}</td>{cols.map((c, i) => <td key={i}><select className={sel} value={c.profileId ?? ''} aria-label={t('calc.field.profile')} onChange={(e) => setCols((s) => s.map((y, k) => (k === i ? { ...y, profileId: e.target.value || null } : y)))}>{x.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>)}</tr>
              <tr><td className="pr-2">{t('common.machine')}</td><td>{x.machines.find((p) => p.id === x.current.machineId)?.name ?? '—'}</td>{cols.map((c, i) => <td key={i}><select className={sel} value={c.machineId ?? ''} aria-label={t('common.machine')} onChange={(e) => setCols((s) => s.map((y, k) => (k === i ? { ...y, machineId: e.target.value || null } : y)))}>{x.machines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>)}</tr>
              <tr><td className="pr-2">{t('common.material')}</td><td>{x.materials.find((p) => p.id === x.current.materialId)?.label ?? '—'}</td>{cols.map((c, i) => <td key={i}><select className={sel} value={c.materialId ?? ''} aria-label={t('common.material')} onChange={(e) => setCols((s) => s.map((y, k) => (k === i ? { ...y, materialId: e.target.value || null } : y)))}>{x.materials.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></td>)}</tr>
              <tr><td className="pr-2">{t('common.quantity')}</td><td>{x.current.qty}</td>{cols.map((c, i) => <td key={i}><input type="number" min={1} className={cn(sel, '!w-20')} value={c.qty} aria-label={t('common.quantity')} onChange={(e) => setCols((s) => s.map((y, k) => (k === i ? { ...y, qty: Math.max(1, +e.target.value || 1) } : y)))} /></td>)}</tr>
              <tr className="font-semibold"><td className="pr-2">{t('calc.exp.col.unit')}</td><td>{money(base.unit)}</td>{sc.map((s, i) => <td key={i}>{money(s.unit)} <span className={cn('font-normal', s.unit > base.unit ? 'text-blue-700 dark:text-blue-300' : s.unit < base.unit ? 'text-amber-700 dark:text-amber-300' : 'muted')}>({s.unit >= base.unit ? '+' : ''}{base.unit ? num(((s.unit - base.unit) / base.unit) * 100, 0) : 0}%)</span></td>)}</tr>
              <tr><td className="pr-2">{t('calc.exp.col.margin')}</td><td>{base.margin != null ? pct(base.margin, 0) : '—'}</td>{sc.map((s, i) => <td key={i}>{s.margin != null ? pct(s.margin, 0) : '—'}</td>)}</tr>
              <tr><td className="pr-2">{t('calc.exp.perHour')}</td><td>{money(Math.round(base.perHour))}</td>{sc.map((s, i) => <td key={i}>{money(Math.round(s.perHour))}</td>)}</tr>
            </tbody></table></div>
        </section>
        <div className="flex flex-wrap gap-2"><CopyButton text={json} label={t('calc.exp.copyJson')} className="btn-ghost btn-sm" /><button type="button" className="btn-ghost btn-sm" onClick={csv}>{t('calc.exp.csv')}</button></div>
      </div>
    </details>
  );
}

/* ───────── guía «Cómo se calcula el precio» ───────── */
export function CalcGuide({ onClose }: { onClose?: () => void }) {
  const t = useT();
  return (
    <div className="card p-4 space-y-2 text-sm" data-testid="calc-guide" role="region" aria-label={t('calc.guide.title')}>
      <div className="flex items-start justify-between gap-2"><h3 className="font-semibold">{t('calc.guide.title')}</h3>{onClose && <button type="button" className="btn-ghost btn-sm" onClick={onClose} aria-label={t('common.close')}>✕</button>}</div>
      <ol className="list-decimal pl-5 space-y-1">{[1, 2, 3, 4, 5].map((n) => <li key={n}><b>{t(`calc.guide.s${n}t` as never)}</b> — {t(`calc.guide.s${n}d` as never)}</li>)}</ol>
      <p className="text-xs muted">{t('calc.guide.glossary')}</p>
    </div>
  );
}
