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

export interface QuoteState { id?: string; customerId: string | null; customerName: string; customerPhone: string; source: string; title: string; urgency: string; discount: number; finalTotal: number | null; priceReason: string; notes: string; validUntil: string; items: ItemState[]; links: LinkRow[] }
export type VariantOpt = { id: string; label: string; price: number; avgCost: number; stock: number };

export function QuoteEditor({ initial, ctx, customers, models, variants, showCosts, canPrice, number, version }: { initial: QuoteState; ctx: CalcContext; customers: CustomerOpt[]; models: ModelBrief[]; variants: VariantOpt[]; showCosts: boolean; canPrice: boolean; number?: string; version?: number }) {
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
  const save = useCallback(async (silent = false) => {
    if (saving) return null; setSaving(true);
    const r = await saveQuoteAction(payload(qRef.current));
    setSaving(false);
    if (!r.ok) { if (!silent) toast.push(r.error, 'err'); return null; }
    setDirty(false); setSavedAt(new Date());
    if (!idRef.current) { idRef.current = r.data; window.history.replaceState(null, '', `/presupuestos/${r.data}`); }
    if (!silent) toast.push('Presupuesto guardado');
    return r.data;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saving]);
  // guardado automático de borradores
  useEffect(() => { if (!dirty) return; const t = setTimeout(() => { if (qRef.current.items.length) save(true); }, 2500); return () => clearTimeout(t); }, [q, dirty, save]);
  useEffect(() => { const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); } }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h); }, [dirty]);

  const addItem = () => set({ items: [...q.items.map((i) => ({ ...i, open: false })), newItem(ctx)] });
  const addProduct = (vid: string) => { const v = vById[vid]; set({ items: [...q.items, newItem(ctx, { kind: 'producto', variantId: vid, description: v.label, qty: 1, materialId: null, machineId: null })] }); setAddProd(false); };
  const dup = (it: ItemState) => set({ items: [...q.items, { ...it, uid: uid(), id: undefined, open: true }] });
  const t = calc;
  return (
    <div className="space-y-4 pb-24" data-testid="quote-editor">
      <Card>
        <div className="space-y-3">
          <CustomerPicker customers={customers} value={{ customerId: q.customerId, name: q.customerName, phone: q.customerPhone }} onChange={(v) => set({ customerId: v.customerId, customerName: v.name, customerPhone: v.phone })} />
          <div className="grid sm:grid-cols-4 gap-3">
            <label className="block sm:col-span-2"><span className="label">Título del presupuesto</span><input className="input" value={q.title} onChange={(e) => set({ title: e.target.value })} placeholder="Ej. Carcasas para sensor" data-testid="quote-title" /></label>
            <SourceSelect value={q.source} onChange={(v) => set({ source: v })} />
            <label className="block"><span className="label">Vigencia hasta</span><input type="date" className="input" value={q.validUntil} onChange={(e) => set({ validUntil: e.target.value })} /></label>
          </div>
          <div className="grid sm:grid-cols-4 gap-3">
            <label className="block"><span className="label">Urgencia</span><select className="input" value={q.urgency} onChange={(e) => set({ urgency: e.target.value })}>{ctx.urgency.map((u) => <option key={u.key} value={u.key}>{u.label}{u.pct ? ` (+${u.pct}%)` : ''}</option>)}</select></label>
            {adj !== 0 && <div className="sm:col-span-3 text-sm self-end pb-2"><Badge tone="blue">Lista de precios del cliente: {adj > 0 ? '+' : ''}{adj}%</Badge></div>}
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        {q.items.length === 0 && <Card><div className="text-center py-8"><p className="font-medium">Agrega la primera línea</p><p className="text-sm muted mt-1">Una línea por modelo (o por placa con varios modelos). Puedes tener todas las que necesites.</p></div></Card>}
        {q.items.map((it, i) => <LineEditor key={it.uid} it={it} index={i} ctx={ctx} models={models} showCosts={showCosts} canPrice={canPrice} priceAdj={adj} variantsById={vById} onChange={(p) => setItem(it.uid, p)} onRemove={() => set({ items: q.items.filter((x) => x.uid !== it.uid) })} onDuplicate={() => dup(it)} />)}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={addItem} data-testid="add-line">+ Agregar línea</button>
          {variants.length > 0 && <button className="btn-ghost" onClick={() => setAddProd(true)}>+ Producto del catálogo</button>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Links de referencia del presupuesto" className="lg:col-span-2"><LinksEditor value={q.links} onChange={(v) => set({ links: v })} /></Card>
        <Card title="Notas">
          <textarea className="input h-28" value={q.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Condiciones, acuerdos, detalles del cliente…" aria-label="Notas del presupuesto" />
        </Card>
      </div>

      {/* resumen fijo: precio sugerido vs final */}
      <div className="fixed md:sticky bottom-[64px] md:bottom-0 inset-x-0 z-30 md:z-20 bg-white/95 dark:bg-[#0e1527]/95 backdrop-blur border-t md:border border-slate-200 dark:border-slate-700 md:rounded-xl md:shadow-lg px-3 py-3 safe-bottom" data-testid="quote-summary">
        <div className="max-w-[1500px] mx-auto flex flex-wrap items-center gap-x-6 gap-y-2">
          <div><div className="text-[11px] muted">Sugerido</div><div className="tabular font-medium" data-testid="sum-suggested">{money(t.suggestedTotal)}</div></div>
          <div><label className="text-[11px] muted block" htmlFor="final-total">Precio final del presupuesto</label>
            <div className="flex items-center gap-1"><input id="final-total" type="number" min={0} inputMode="numeric" className="input !w-36 !min-h-[36px] font-semibold tabular" placeholder={String(t.subtotal)} value={q.finalTotal ?? ''} disabled={!canPrice} onChange={(e) => set({ finalTotal: e.target.value === '' ? null : Math.max(0, Math.round(+e.target.value)) })} data-testid="final-total" />{q.finalTotal != null && <button className="btn-ghost btn-sm" onClick={() => set({ finalTotal: null })}>Quitar</button>}</div></div>
          <div><label className="text-[11px] muted block" htmlFor="disc">Descuento</label><input id="disc" type="number" min={0} className="input !w-28 !min-h-[36px] tabular" value={q.discount || ''} onChange={(e) => set({ discount: Math.max(0, +e.target.value || 0) })} /></div>
          <div><div className="text-[11px] muted">{ctx.rates.taxMode === 'incluido' ? `IVA ${ctx.rates.taxPct}% incluido` : ctx.rates.taxMode === 'sumado' ? `+ IVA ${ctx.rates.taxPct}%` : 'Sin IVA'}</div><div className="tabular text-sm">{money(t.tax)}</div></div>
          <div className="ml-auto text-right"><div className="text-[11px] muted">Total {t.diffPct !== 0 && <span className={cn(t.diffPct < 0 ? 'text-amber-600' : 'text-blue-600')}>({t.diffPct > 0 ? '+' : ''}{num(t.diffPct, 1)}% vs sugerido)</span>}</div><div className="text-xl font-bold tabular" data-testid="sum-total">{money(t.total)}</div></div>
          {showCosts && <div className="text-right"><div className="text-[11px] muted">Margen</div><Badge tone={t.belowCost ? 'red' : t.belowMin ? 'amber' : 'green'}>{pct(t.marginPct, 0)}</Badge></div>}
          <div className="flex items-center gap-2">
            <span className="text-xs muted hidden lg:inline" aria-live="polite">{saving ? 'Guardando…' : dirty ? 'Cambios sin guardar' : savedAt ? `Guardado ${savedAt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
            <button className="btn-primary" onClick={async () => { const id = await save(false); if (id) router.push(`/presupuestos/${id}`); router.refresh(); }} disabled={saving || q.items.length === 0} data-testid="quote-save">Guardar</button>
          </div>
        </div>
        {(t.belowCost || t.belowMin) && showCosts && <p className="text-xs mt-1 text-amber-700 dark:text-amber-300 max-w-[1500px] mx-auto">{t.belowCost ? 'El precio final queda bajo el costo: solo un Administrador puede guardarlo y debes indicar el motivo.' : `El margen queda bajo el mínimo (${ctx.rates.minMarginPct}%).`}</p>}
        {t.belowCost && <div className="max-w-[1500px] mx-auto mt-1"><input className="input" placeholder="Motivo del precio (obligatorio si queda bajo el costo)" value={q.priceReason} onChange={(e) => set({ priceReason: e.target.value })} aria-label="Motivo del precio" /></div>}
      </div>

      <Modal open={addProd} onClose={() => setAddProd(false)} title="Producto del catálogo">
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">{variants.map((v) => <li key={v.id}><button className="w-full text-left py-2.5 flex items-center justify-between gap-2 min-h-[48px]" onClick={() => addProduct(v.id)}><span>{v.label}</span><span className="text-xs muted tabular">{money(v.price)} · stock {v.stock}</span></button></li>)}</ul>
      </Modal>
    </div>
  );
}
