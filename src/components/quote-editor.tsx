'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { calcQuote } from '@/lib/pricing';
import type { CalcContext } from '@/lib/context';
import type { ModelBrief } from '@/actions/quotes';
import { saveQuoteAction } from '@/actions/quotes';
import type { LinkRow } from '@/actions/links';
import { computeItem, LineEditor, newItem, uid, type ItemState } from './line-editor';
import { CustomerPicker, SourceSelect, type CustomerOpt } from './customer-picker';
import { LinksEditor } from './links-editor';
import { Badge, Card } from './ui';
import { Modal, useToast } from './client';
import { cn, money, num, pct } from '@/lib/format';
import { useLocale, useT } from '@/i18n/client';
import { LOCALE_TAG } from '@/i18n/config';
import { DateInput } from '@/components/date-input';

export interface QuoteState { id?: string; customerId: string | null; customerName: string; customerPhone: string; source: string; title: string; urgency: string; discount: number; finalTotal: number | null; priceReason: string; notes: string; validUntil: string; items: ItemState[]; links: LinkRow[] }
export type VariantOpt = { id: string; label: string; price: number; avgCost: number; stock: number };

export function QuoteEditor({ initial, ctx, customers, models, variants, showCosts, canPrice, number, version }: { initial: QuoteState; ctx: CalcContext; customers: CustomerOpt[]; models: ModelBrief[]; variants: VariantOpt[]; showCosts: boolean; canPrice: boolean; number?: string; version?: number }) {
  const t = useT(); const locale = useLocale();
  const router = useRouter(); const toast = useToast();
  const [q, setQ] = useState<QuoteState>(initial); const [dirty, setDirty] = useState(false); const [saving, setSaving] = useState(false); const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [addProd, setAddProd] = useState(false);
  const qRef = useRef(q); qRef.current = q;
  const idRef = useRef(initial.id);
  const vById = useMemo(() => Object.fromEntries(variants.map((v) => [v.id, v])), [variants]);
  const cust = customers.find((c) => c.id === q.customerId); const adj = cust?.priceAdj ?? 0;
  const set = useCallback((p: Partial<QuoteState>) => { setQ((x) => ({ ...x, ...p })); setDirty(true); }, []);
  const setItem = (uidv: string, p: Partial<ItemState>) => { setQ((x) => ({ ...x, items: x.items.map((i) => (i.uid === uidv ? { ...i, ...p } : i)) })); setDirty(true); };

  // totales en vivo (el servidor recalcula con los mismos datos)
  const calc = useMemo(() => {
    const lines = q.items.map((it) => { const c = computeItem(it, ctx, adj, it.variantId ? vById[it.variantId] : undefined); return { id: it.uid, qty: Math.max(1, it.qty), optional: it.optional, suggestedUnit: c.suggestedUnit, finalUnit: it.finalUnit, cost: c.cost - (it.shipping ?? 0), shipping: it.shipping }; });
    const urg = ctx.urgency.find((u) => u.key === q.urgency)?.pct ?? 0;
    if (urg) for (const l of lines) l.suggestedUnit = Math.round(l.suggestedUnit * (1 + urg / 100) / 10) * 10;
    return calcQuote(lines, ctx.rates, { discount: q.discount, finalTotalOverride: q.finalTotal });
  }, [q.items, q.discount, q.finalTotal, q.urgency, ctx, adj, vById]);

  const payload = (x: QuoteState) => ({
    id: idRef.current, customerId: x.customerId, customerName: x.customerName || null, customerPhone: x.customerPhone || null, source: x.source || null, title: x.title || null, urgency: x.urgency, discount: x.discount, finalTotal: x.finalTotal,
    priceReason: x.priceReason || null, notes: x.notes || null, validUntil: x.validUntil || null, links: x.links,
    items: x.items.map((i) => ({ id: i.id, kind: i.kind, description: i.description, qty: i.qty, optional: i.optional, groupName: i.groupName || null, materialId: i.materialId, color: i.color, machineId: i.machineId, processProfileId: i.processProfileId, mode: i.mode, gramsTotal: i.gramsTotal, hoursTotal: i.hoursTotal, origin: i.origin as any, postMinutes: i.postMinutes, postSupplies: i.postSupplies, prepMinutes: i.prepMinutes, shipping: i.shipping, finalUnit: i.finalUnit, sliceRunId: i.sliceRunId, variantId: i.variantId, models: i.models.map((m) => ({ modelFileId: m.modelFileId, fileVersionId: m.fileVersionId, qty: m.qty })), links: i.links })),
  });
  // un guardado manual no se pierde si coincide con el autoguardado: espera a que termine por completo
  // (incluido el id del presupuesto recién creado) y vuelve a guardar con los datos actuales
  const inflight = useRef<Promise<string | null> | null>(null);
  const save = useCallback(async (silent = false): Promise<string | null> => {
    if (inflight.current) { if (silent) return null; await inflight.current; }
    const run = (async () => {
      setSaving(true);
      const r = await saveQuoteAction(payload(qRef.current));
      setSaving(false);
      if (!r.ok) { if (!silent) toast.push(r.error, 'err'); return null; }
      setDirty(false); setSavedAt(new Date());
      if (!idRef.current) { idRef.current = r.data; window.history.replaceState(null, '', `/presupuestos/${r.data}`); }
      if (!silent) toast.push(t('quotes.quoteSaved'));
      return r.data;
    })();
    inflight.current = run;
    try { return await run; } finally { if (inflight.current === run) inflight.current = null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // guardado automático de borradores
  useEffect(() => { if (!dirty) return; const tt = setTimeout(() => { if (qRef.current.items.length) save(true); }, 2500); return () => clearTimeout(tt); }, [q, dirty, save]);
  useEffect(() => { const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); } }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h); }, [dirty]);

  const addItem = () => set({ items: [...q.items.map((i) => ({ ...i, open: false })), newItem(ctx)] });
  const addProduct = (vid: string) => { const v = vById[vid]; set({ items: [...q.items, newItem(ctx, { kind: 'producto', variantId: vid, description: v.label, qty: 1, materialId: null, machineId: null })] }); setAddProd(false); };
  const dup = (it: ItemState) => set({ items: [...q.items, { ...it, uid: uid(), id: undefined, open: true }] });
  const tt = calc;
  return (
    <div className="space-y-4 pb-24" data-testid="quote-editor">
      <Card>
        <div className="space-y-3">
          <CustomerPicker customers={customers} value={{ customerId: q.customerId, name: q.customerName, phone: q.customerPhone }} onChange={(v) => set({ customerId: v.customerId, customerName: v.name, customerPhone: v.phone })} />
          <div className="grid sm:grid-cols-4 gap-3">
            <label className="block sm:col-span-2"><span className="label">{t('quotes.quoteTitle')}</span><input className="input" value={q.title} onChange={(e) => set({ title: e.target.value })} placeholder={t('quotes.eGSensorHousings')} data-testid="quote-title" /></label>
            <SourceSelect value={q.source} onChange={(v) => set({ source: v })} />
            <label className="block"><span className="label">{t('quotes.validUntil2')}</span><DateInput value={q.validUntil} onChange={(v) => set({ validUntil: v })} /></label>
          </div>
          <div className="grid sm:grid-cols-4 gap-3">
            <label className="block"><span className="label">{t('quotes.urgency')}</span><select className="input" value={q.urgency} onChange={(e) => set({ urgency: e.target.value })}>{ctx.urgency.map((u) => <option key={u.key} value={u.key}>{u.label}{u.pct ? ` (+${u.pct}%)` : ''}</option>)}</select></label>
            {adj !== 0 && <div className="sm:col-span-3 text-sm self-end pb-2"><Badge tone="blue">{t('quotes.customerPriceList')} {adj > 0 ? '+' : ''}{adj}%</Badge></div>}
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        {q.items.length === 0 && <Card><div className="text-center py-8"><p className="font-medium">{t('quotes.addTheFirstItem')}</p><p className="text-sm muted mt-1">{t('quotes.oneItemPerModelOr')}</p></div></Card>}
        {q.items.map((it, i) => <LineEditor key={it.uid} it={it} index={i} ctx={ctx} models={models} showCosts={showCosts} canPrice={canPrice} priceAdj={adj} variantsById={vById} onChange={(p) => setItem(it.uid, p)} onRemove={() => set({ items: q.items.filter((x) => x.uid !== it.uid) })} onDuplicate={() => dup(it)} />)}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={addItem} data-testid="add-line">{t('quotes.addItem')}</button>
          {variants.length > 0 && <button className="btn-ghost" onClick={() => setAddProd(true)}>{t('quotes.catalogProduct2')}</button>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t('quotes.quoteReferenceLinks')} className="lg:col-span-2"><LinksEditor value={q.links} onChange={(v) => set({ links: v })} /></Card>
        <Card title={t('common.notes')}>
          <textarea className="input h-28" value={q.notes} onChange={(e) => set({ notes: e.target.value })} placeholder={t('quotes.termsAgreementsCustomerDetails')} aria-label={t('quotes.quoteNotes')} />
        </Card>
      </div>

      {/* resumen fijo: precio sugerido vs final */}
      <div className="fixed md:sticky bottom-[64px] md:bottom-0 inset-x-0 z-30 md:z-20 bg-[var(--card)] backdrop-blur border-t md:border border-slate-200 dark:border-slate-700 md:rounded-xl md:shadow-lg px-3 py-3 safe-bottom" data-testid="quote-summary">
        <div className="max-w-[1500px] mx-auto flex flex-wrap items-center gap-x-6 gap-y-2">
          <div><div className="text-[11px] muted">{t('common.suggested')}</div><div className="tabular font-medium" data-testid="sum-suggested">{money(tt.suggestedTotal)}</div></div>
          <div><label className="text-[11px] muted block" htmlFor="final-total">{t('quotes.finalQuotePrice')}</label>
            <div className="flex items-center gap-1"><input id="final-total" type="number" min={0} inputMode="numeric" className="input !w-36 !min-h-[36px] font-semibold tabular" placeholder={String(tt.subtotal)} value={q.finalTotal ?? ''} disabled={!canPrice} onChange={(e) => set({ finalTotal: e.target.value === '' ? null : Math.max(0, Math.round(+e.target.value)) })} data-testid="final-total" />{q.finalTotal != null && <button className="btn-ghost btn-sm" onClick={() => set({ finalTotal: null })}>{t('quotes.remove')}</button>}</div></div>
          <div><label className="text-[11px] muted block" htmlFor="disc">{t('common.discount')}</label><input id="disc" type="number" min={0} className="input !w-28 !min-h-[36px] tabular" value={q.discount || ''} onChange={(e) => set({ discount: Math.max(0, +e.target.value || 0) })} /></div>
          <div><div className="text-[11px] muted">{ctx.rates.taxMode === 'incluido' ? t('quotes.vatIncluded', { pct: ctx.rates.taxPct }) : ctx.rates.taxMode === 'sumado' ? t('quotes.plusVat', { pct: ctx.rates.taxPct }) : t('quotes.noVat')}</div><div className="tabular text-sm">{money(tt.tax)}</div></div>
          <div className="ml-auto text-right"><div className="text-[11px] muted">{t('common.total')} {tt.diffPct !== 0 && <span className={cn(tt.diffPct < 0 ? 'text-amber-600' : 'text-blue-600')}>({tt.diffPct > 0 ? '+' : ''}{num(tt.diffPct, 1)}% vs sugerido)</span>}</div><div className="text-xl font-bold tabular" data-testid="sum-total">{money(tt.total)}</div></div>
          {showCosts && <div className="text-right"><div className="text-[11px] muted">{t('common.margin')}</div><Badge tone={tt.belowCost ? 'red' : tt.belowMin ? 'amber' : 'green'}>{pct(tt.marginPct, 0)}</Badge></div>}
          <div className="flex items-center gap-2">
            <span className="text-xs muted hidden lg:inline" aria-live="polite">{saving ? t('common.saving') : dirty ? t('quotes.unsavedChanges') : savedAt ? t('quotes.saved', { time: savedAt.toLocaleTimeString(LOCALE_TAG[locale], { hour: '2-digit', minute: '2-digit' }) }) : ''}</span>
            <button className="btn-primary" onClick={async () => { const id = await save(false); if (id) router.push(`/presupuestos/${id}?guardado=1`); }} disabled={saving || q.items.length === 0} data-testid="quote-save">{t('common.save')}</button>
          </div>
        </div>
        {(tt.belowCost || tt.belowMin) && showCosts && <p className="text-xs mt-1 text-amber-700 dark:text-amber-300 max-w-[1500px] mx-auto">{tt.belowCost ? t('quotes.theFinalPriceIsBelow') : t('quotes.theMarginIsBelowThe', { pct: ctx.rates.minMarginPct })}</p>}
        {tt.belowCost && <div className="max-w-[1500px] mx-auto mt-1"><input className="input" placeholder={t('quotes.reasonForThePriceRequired')} value={q.priceReason} onChange={(e) => set({ priceReason: e.target.value })} aria-label={t('quotes.reasonForThePrice2')} /></div>}
      </div>

      <Modal open={addProd} onClose={() => setAddProd(false)} title={t('quotes.catalogProduct3')}>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">{variants.map((v) => <li key={v.id}><button className="w-full text-left py-2.5 flex items-center justify-between gap-2 min-h-[48px]" onClick={() => addProduct(v.id)}><span>{v.label}</span><span className="text-xs muted tabular">{money(v.price)} · {t('common.stock')} {v.stock}</span></button></li>)}</ul>
      </Modal>
    </div>
  );
}
