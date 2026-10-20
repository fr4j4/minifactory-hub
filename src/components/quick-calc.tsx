'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { calcQuote, completeness } from '@/lib/pricing';
import { effectiveRates } from '@/lib/item-price';
import type { CalcContext } from '@/lib/context';
import type { ModelBrief } from '@/actions/quotes';
import { saveQuoteAction } from '@/actions/quotes';
import { computeItem, LineEditor, newItem, toCalcOpts, uid, type CalcEnv, type ItemState } from './line-editor';
import { CalcGuide, ConfidenceBadge, LevelSwitch, atLeast, useCalcLevel } from './calc-bits';
import type { CustomerOpt } from './customer-picker';
import { CopyButton, useToast } from './client';
import { Badge } from './ui';
import { cn, money, pct } from '@/lib/format';
import { profileDesc, profileName } from '@/lib/calc-presets';
import { useT } from '@/i18n/client';
import { tOr } from '@/i18n/translate';

const HIST_KEY = 'mf.calcHistory'; const GUIDE_KEY = 'mf.calcGuideSeen';
interface Snapshot { items: ItemState[]; customerId: string | null; channelId: string | null; calcProfileId: string | null; urgency: string; applyTax: boolean }
interface HistoryRow { id: string; ts: number; desc: string; qty: number; total: number; snap: Snapshot }
const slim = (it: ItemState): ItemState => ({ ...it, links: [], open: true });
const readHist = (): HistoryRow[] => { try { return JSON.parse(localStorage.getItem(HIST_KEY) ?? '[]'); } catch { return []; } };
const writeHist = (h: HistoryRow[]) => { try { localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(0, 20))); } catch { /* sin almacenamiento */ } };

/** Calculadora rápida independiente: cotiza una consulta (ej. por WhatsApp) sin crear presupuesto. */
export function QuickCalc({ ctx, models, customers, showCosts, canPrice, canCreate, level: level0 = 'basico' }: { ctx: CalcContext; models: ModelBrief[]; customers: CustomerOpt[]; showCosts: boolean; canPrice: boolean; canCreate: boolean; level?: 'basico' | 'detallado' | 'experto' }) {
  const t = useT(); const router = useRouter(); const toast = useToast();
  const [level, setLevel] = useCalcLevel(level0);
  const [items, setItems] = useState<ItemState[]>(() => [newItem(ctx)]);
  const [customerId, setCustomerId] = useState<string | null>(null); const [channelId, setChannelId] = useState<string | null>(null);
  const [calcProfileId, setCalcProfileId] = useState<string | null>(null); const [urgency, setUrgency] = useState('normal');
  const [applyTax, setApplyTax] = useState(!!ctx.rates.taxDefault);
  const [busy, setBusy] = useState(false); const [guide, setGuide] = useState(false); const [hist, setHist] = useState<HistoryRow[]>([]);
  const [showStatus, setShowStatus] = useState(false);
  useEffect(() => { setHist(readHist()); try { if (!localStorage.getItem(GUIDE_KEY)) setGuide(true); } catch { /* ignorar */ } }, []);
  const closeGuide = () => { setGuide(false); try { localStorage.setItem(GUIDE_KEY, '1'); } catch { /* ignorar */ } };

  const cust = customers.find((c) => c.id === customerId);
  const env = useMemo<CalcEnv>(() => ({ priceAdj: cust?.priceAdj ?? 0, urgency, quoteProfileId: calcProfileId, customerProfileId: cust?.calcProfileId ?? null, channelId }), [cust, urgency, calcProfileId, channelId]);
  const qRates = useMemo(() => { const ch = channelId ? ctx.channels.find((c) => c.id === channelId) : undefined; return effectiveRates({}, { rates: ctx.rates, profiles: ctx.calcProfiles, quoteProfileId: calcProfileId, customerProfileId: cust?.calcProfileId ?? null, channelProfileId: ch?.calcProfileId, channelFeePct: ch?.commissionPct }).rt; }, [ctx, channelId, calcProfileId, cust]);
  const computed = useMemo(() => items.map((it) => computeItem(it, ctx, env)), [items, ctx, env]);
  const tt = useMemo(() => calcQuote(items.map((it, i) => ({ id: it.uid, qty: Math.max(1, it.qty), suggestedUnit: computed[i].suggestedUnit, finalUnit: it.finalUnit, cost: computed[i].cost, shipping: it.shipping })), qRates, { applyTax }), [items, computed, qRates, applyTax]);
  const net = tt.net; const total = tt.total;
  const qtyAll = items.reduce((a, i) => a + Math.max(1, i.qty), 0);
  const label = items.length === 1 ? (items[0].description || t('calculator.yourPart')) : t('calc.nPieces', { n: items.length });
  const text = applyTax ? t('calc.replyPlusVat', { item: label, qty: qtyAll, net: money(net), total: money(total) }) : t('calc.reply', { item: label, qty: qtyAll, total: money(net) });
  const first = computed[0];
  const status = useMemo(() => completeness(ctx.rates, { machines: ctx.machines.map((m) => ({ purchaseValue: m.cost.purchaseValue, watts: m.cost.watts })), materials: ctx.materials.map((m) => ({ costPerKg: m.costPerKg })), hasProfile: ctx.calcProfiles.length > 0 }), [ctx]);
  const setItem = (id: string, p: Partial<ItemState>) => setItems((x) => x.map((i) => (i.uid === id ? { ...i, ...p } : i)));

  const record = useCallback(() => {
    const row: HistoryRow = { id: uid(), ts: Date.now(), desc: label, qty: qtyAll, total, snap: { items: items.map(slim), customerId, channelId, calcProfileId, urgency, applyTax } };
    const next = [row, ...readHist()]; writeHist(next); setHist(next.slice(0, 20));
  }, [label, qtyAll, total, items, customerId, channelId, calcProfileId, urgency, applyTax]);
  const restore = (h: HistoryRow, copy = false) => { const s = h.snap; setItems(s.items.map((i) => ({ ...i, uid: uid(), open: true }))); setCustomerId(s.customerId); setChannelId(s.channelId); setCalcProfileId(s.calcProfileId); setUrgency(s.urgency); setApplyTax(s.applyTax); if (!copy) toast.push(t('calc.history.restored')); };
  const dropHist = (id: string) => { const n = readHist().filter((h) => h.id !== id); writeHist(n); setHist(n); };
  const example = () => setItems([newItem(ctx, { description: t('calc.exampleName'), qty: 1, unitGrams: 45, unitHours: 3.5, gramsTotal: 45, hoursTotal: 3.5, mode: 'manual', origin: { grams: 'manual', hours: 'manual' } })]);
  const reset = () => { setItems([newItem(ctx)]); setCustomerId(null); setChannelId(null); setCalcProfileId(null); setUrgency('normal'); };

  const toQuote = async () => {
    if (!status.items.every((i) => i.ok || !i.critical) && !window.confirm(t('calc.confirmIncomplete'))) return;
    setBusy(true); record();
    const r = await saveQuoteAction({
      customerId, customerName: cust?.name ?? null, customerPhone: cust?.phone ?? null, urgency, applyTax, calcProfileId, channelId,
      items: items.map((it) => ({ kind: it.models.length ? 'modelo' : 'manual', description: it.description, qty: it.qty, materialId: it.materialId, color: it.color, machineId: it.machineId, processProfileId: it.processProfileId, mode: it.mode, gramsTotal: it.gramsTotal, hoursTotal: it.hoursTotal, origin: it.origin as any, postMinutes: it.postMinutes, postSupplies: it.postSupplies, prepMinutes: it.prepMinutes, shipping: it.shipping, finalUnit: it.finalUnit, sliceRunId: it.sliceRunId, calcProfileId: it.calcProfileId, calcOpts: toCalcOpts(it), models: it.models.map((m) => ({ modelFileId: m.modelFileId, fileVersionId: m.fileVersionId, qty: m.qty })) })),
    });
    setBusy(false); if (!r.ok) toast.push(r.error, 'err'); else router.push(`/presupuestos/${r.data.id}`);
  };

  const sel = 'input';
  return (
    <div className="space-y-4 pb-28 md:pb-4" data-testid="quick-calc">
      <div className="flex flex-wrap items-center gap-2">
        <LevelSwitch level={level} onChange={setLevel} />
        <button type="button" className="btn-ghost btn-sm" onClick={() => (guide ? closeGuide() : setGuide(true))} aria-expanded={guide} data-testid="guide-toggle">{t('calc.guide.button')}</button>
        <button type="button" className="btn-ghost btn-sm" onClick={example} data-testid="calc-example">{t('calc.tryExample')}</button>
        <button type="button" className="btn-ghost btn-sm" onClick={reset}>{t('calc.reset')}</button>
        {(
          <button type="button" className="ml-auto" onClick={() => setShowStatus((v) => !v)} aria-expanded={showStatus} data-testid="calc-status">
            <Badge tone={status.status === 'lista' ? 'green' : status.status === 'casi' ? 'amber' : 'red'}>{t(`calc.status.${status.status}`)}</Badge>
          </button>
        )}
      </div>
      {guide && <CalcGuide onClose={closeGuide} />}
      {showStatus && (
        <div className="card p-3 text-sm" data-testid="status-list"><ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1">{status.items.map((i) => <li key={i.key} className="flex items-center gap-2"><span aria-hidden="true">{i.ok ? '✓' : i.critical ? '✕' : '○'}</span><span className={cn(!i.ok && 'font-medium')}>{t(`calc.check.${i.key}`)}</span>{!i.ok && <Link className="underline text-xs" href={i.key === 'machine' ? '/maquinas' : i.key === 'material' ? '/inventario' : '/configuracion?tab=tarifas'}>{t('calc.warn.fix')}</Link>}</li>)}</ul></div>
      )}
      {atLeast(level, 'detallado') && (
        <div className="card p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="calc-context">
          <label className="block"><span className="label">{t('common.customer')}</span><select className={sel} value={customerId ?? ''} onChange={(e) => setCustomerId(e.target.value || null)} data-testid="calc-customer"><option value="">—</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          {ctx.channels.length > 0 && <label className="block"><span className="label">{t('calc.field.channel')}</span><select className={sel} value={channelId ?? ''} onChange={(e) => setChannelId(e.target.value || null)} data-testid="calc-channel"><option value="">—</option>{ctx.channels.map((c) => <option key={c.id} value={c.id}>{c.name}{c.commissionPct ? ` (${c.commissionPct}%)` : ''}</option>)}</select></label>}
          {<label className="block"><span className="label">{t('calc.field.profile')}</span><select className={sel} value={calcProfileId ?? ''} onChange={(e) => setCalcProfileId(e.target.value || null)} data-testid="calc-profile"><option value="">{t('calc.field.profileDefault')}</option>{ctx.calcProfiles.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{profileName(t, p)}</option>)}</select></label>}
          <label className="block"><span className="label">{t('quotes.urgency')}</span><select className={sel} value={urgency} onChange={(e) => setUrgency(e.target.value)} data-testid="calc-urgency">{ctx.urgency.map((u) => <option key={u.key} value={u.key}>{u.label}{u.pct ? ` (+${u.pct}%)` : ''}</option>)}</select></label>
        </div>
      )}
      {items.map((it, i) => (
        <LineEditor key={it.uid} it={i === 0 ? { ...it, open: true } : it} index={i} ctx={ctx} models={models} showCosts={showCosts} canPrice={canPrice} env={env} level={level} variantsById={{}}
          onChange={(p) => setItem(it.uid, p)} onRemove={items.length > 1 ? () => setItems(items.filter((x) => x.uid !== it.uid)) : undefined} onDuplicate={() => setItems([...items, { ...it, uid: uid(), id: undefined, open: true }])} />
      ))}
      <button type="button" className="btn-ghost" onClick={() => setItems([...items.map((x) => ({ ...x, open: false })), newItem(ctx)])} data-testid="calc-add-piece">{t('calc.addPiece')}</button>

      <div className="card p-4 flex-wrap items-center gap-3 hidden md:flex" data-testid="quick-result">
        <div>
          <div className="text-xs muted">{applyTax ? t('calc.totalWithTax') : t('calc.netPrice')}</div>
          <div className="text-3xl font-bold tabular" data-testid="quick-total">{money(total)}</div>
          {applyTax && <div className="text-xs muted tabular" data-testid="quick-net">{t('calc.netPlusTax', { net: money(net), tax: money(tt.tax), pct: ctx.rates.taxPct })}</div>}
          {!applyTax && <div className="text-xs muted">{t('calc.noTaxNote')}</div>}
          {items.length === 1 && <div className="flex flex-wrap items-center gap-2 mt-1"><ConfidenceBadge c={first.bd.confidence} />{first.bd.range && <span className="text-xs tabular">{t('calc.range', { min: money(first.bd.range.min * Math.max(1, items[0].qty)), max: money(first.bd.range.max * Math.max(1, items[0].qty)) })}</span>}</div>}
          {showCosts && tt.marginPct != null && <div className="mt-1"><Badge tone={tt.belowCost ? 'red' : tt.belowMin ? 'amber' : 'green'}>{t('common.margin')} {pct(tt.marginPct, 0)}</Badge></div>}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={applyTax} onChange={(e) => setApplyTax(e.target.checked)} data-testid="apply-tax" />{t('calc.applyTax', { pct: ctx.rates.taxPct })}</label>}
          <span onClickCapture={record}><CopyButton text={text} label={t('calculator.copyReply')} className="btn-ghost" /></span>
          <button type="button" className="btn-ghost" onClick={() => { record(); toast.push(t('calc.history.saved')); }} data-testid="calc-save-history">{t('calc.history.save')}</button>
          {canCreate && <button className="btn-primary" onClick={toQuote} disabled={busy} data-testid="calc-to-quote">{t('calculator.convertToQuote')}</button>}
        </div>
      </div>

      {/* móvil: barra inferior fija con el precio y la acción principal */}
      <div className="md:hidden fixed inset-x-0 bottom-[64px] z-30 bg-[var(--card)] border-t border-slate-200 dark:border-slate-700 px-3 py-2 safe-bottom" data-testid="quick-result-mobile">
        <div className="flex items-center gap-3">
          <div className="min-w-0"><div className="text-lg font-bold tabular" data-testid="quick-total-mobile" aria-live="polite">{money(total)}</div>{<div className="text-[11px] muted">{applyTax ? t('calc.totalWithTax') : t('calc.netPrice')}</div>}</div>
          <div className="ml-auto flex items-center gap-2">
            {<label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={applyTax} onChange={(e) => setApplyTax(e.target.checked)} />{t('calc.iva')}</label>}
            <span onClickCapture={record}><CopyButton text={text} label={t('calculator.copyReply')} className="btn-primary btn-sm" /></span>
          </div>
        </div>
      </div>

      {hist.length > 0 && (
        <section className="card p-3" aria-label={t('calc.history.title')} data-testid="calc-history">
          <h3 className="font-medium text-sm mb-2">{t('calc.history.title')}</h3>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">{hist.map((h) => (
            <li key={h.id} className="py-1.5 flex items-center gap-2"><span className="min-w-0 flex-1 truncate">{h.desc} · {t('calculator.unitsShort', { n: h.qty })}</span><span className="tabular font-medium">{money(h.total)}</span><span className="text-xs muted hidden sm:inline">{new Date(h.ts).toLocaleString()}</span>
              <button type="button" className="btn-ghost btn-sm" onClick={() => restore(h)}>{t('calc.history.open')}</button><button type="button" className="btn-ghost btn-sm" onClick={() => dropHist(h.id)} aria-label={t('common.deleteLabel')}>✕</button></li>))}</ul>
        </section>
      )}
    </div>
  );
}
