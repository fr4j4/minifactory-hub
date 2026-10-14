'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { calcQuote } from '@/lib/pricing';
import type { CalcContext } from '@/lib/context';
import type { ModelBrief } from '@/actions/quotes';
import type { LinkRow } from '@/actions/links';
import { createOrderAction } from '@/actions/orders';
import { computeItem, LineEditor, newItem, uid, type ItemState } from './line-editor';
import { CustomerPicker, SourceSelect, type CustomerOpt } from './customer-picker';
import { LinksEditor } from './links-editor';
import { Badge, Card } from './ui';
import { Modal, useToast } from './client';
import type { VariantOpt } from './quote-editor';
import { sources, cn, money, num, pct } from '@/lib/format';
import { useT } from '@/i18n/client';
import { tOr } from '@/i18n/translate';

/** Registro manual de un pedido: rápido desde el celular; puede mezclar piezas a medida y productos del catálogo. */
export function OrderForm({ ctx, customers, models, variants, showCosts, canPrice, initialCustomer }: { ctx: CalcContext; customers: CustomerOpt[]; models: ModelBrief[]; variants: VariantOpt[]; showCosts: boolean; canPrice: boolean; initialCustomer?: string }) {
  const t = useT();
  const router = useRouter(); const toast = useToast();
  const c0 = customers.find((c) => c.id === initialCustomer);
  const [cust, setCust] = useState({ customerId: c0?.id ?? null as string | null, name: c0?.name ?? '', phone: c0?.phone ?? '' });
  const [source, setSource] = useState(''); const [title, setTitle] = useState(''); const [due, setDue] = useState(''); const [priority, setPriority] = useState('normal'); const [ship, setShip] = useState('retiro'); const [addr, setAddr] = useState(''); const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemState[]>([newItem(ctx)]); const [links, setLinks] = useState<LinkRow[]>([]); const [discount, setDiscount] = useState(0); const [dep, setDep] = useState(0); const [method, setMethod] = useState('transferencia');
  const [busy, setBusy] = useState(false); const [addProd, setAddProd] = useState(false);
  const vById = useMemo(() => Object.fromEntries(variants.map((v) => [v.id, v])), [variants]);
  const adj = customers.find((c) => c.id === cust.customerId)?.priceAdj ?? 0;
  const setItem = (id: string, p: Partial<ItemState>) => setItems((x) => x.map((i) => (i.uid === id ? { ...i, ...p } : i)));
  const tt = useMemo(() => calcQuote(items.map((it) => { const c = computeItem(it, ctx, adj, it.variantId ? vById[it.variantId] : undefined); return { id: it.uid, qty: Math.max(1, it.qty), suggestedUnit: c.suggestedUnit, finalUnit: it.finalUnit, cost: c.cost - it.shipping, shipping: it.shipping }; }), ctx.rates, { discount }), [items, ctx, adj, vById, discount]);
  const save = async () => {
    setBusy(true);
    const r = await createOrderAction({
      customerId: cust.customerId, customerName: cust.name, customerPhone: cust.phone, source: source || null, title: title || null, dueDate: due || null, priority, shipMethod: ship, shipAddress: addr || null, notes: notes || null, discount, links,
      deposit: dep > 0 ? { amount: dep, method } : null,
      items: items.map((i) => ({ kind: i.kind, description: i.description || (i.variantId ? vById[i.variantId]?.label : t('common.order')), qty: i.qty, materialId: i.materialId, color: i.color, machineId: i.machineId, processProfileId: i.processProfileId, mode: i.mode, gramsTotal: i.gramsTotal, hoursTotal: i.hoursTotal, origin: i.origin as any, postMinutes: i.postMinutes, postSupplies: i.postSupplies, prepMinutes: i.prepMinutes, shipping: i.shipping, finalUnit: i.finalUnit, sliceRunId: i.sliceRunId, variantId: i.variantId, models: i.models.map((m) => ({ modelFileId: m.modelFileId, fileVersionId: m.fileVersionId, qty: m.qty })), links: i.links })),
    });
    setBusy(false);
    if (!r.ok) { toast.push(r.error, 'err'); return; }
    toast.push(t('orders.orderRegistered')); router.push(`/pedidos/${r.data}`);
  };
  return (
    <div className="space-y-4 pb-24" data-testid="order-form">
      <Card title={t('orders.customerAndSource')}><div className="space-y-3">
        <CustomerPicker customers={customers} value={cust} onChange={setCust} />
        <div className="grid sm:grid-cols-4 gap-3">
          <SourceSelect value={source} onChange={setSource} />
          <label className="block sm:col-span-2"><span className="label">{t('orders.whatTheyOrderedTitle')}</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('orders.eG20KeychainsWith')} data-testid="order-title" /></label>
          <label className="block"><span className="label">{t('orders.requestedDate')}</span><input type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} data-testid="order-due" /></label>
        </div>
      </div></Card>
      <div className="space-y-3">
        {items.map((it, i) => <LineEditor key={it.uid} it={it} index={i} ctx={ctx} models={models} showCosts={showCosts} canPrice={canPrice} priceAdj={adj} variantsById={vById} onChange={(p) => setItem(it.uid, p)} onRemove={items.length > 1 ? () => setItems(items.filter((x) => x.uid !== it.uid)) : undefined} onDuplicate={() => setItems([...items, { ...it, uid: uid() }])} />)}
        <div className="flex flex-wrap gap-2"><button className="btn-ghost" onClick={() => setItems([...items.map((x) => ({ ...x, open: false })), newItem(ctx)])} data-testid="add-line">{t('orders.customItem')}</button>{variants.length > 0 && <button className="btn-ghost" onClick={() => setAddProd(true)} data-testid="add-product">{t('orders.catalogProduct')}</button>}</div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t('common.delivery')}><div className="space-y-3"><div className="flex gap-2">{['retiro', 'despacho'].map((m) => <button key={m} className={cn('btn-ghost flex-1 capitalize', ship === m && '!bg-[var(--panel)] !text-[var(--panel-ink)] !border-[var(--panel)] dark:!bg-slate-700')} onClick={() => setShip(m)} aria-pressed={ship === m}>{m === 'retiro' ? t('common.workshopPickup') : t('common.shipping')}</button>)}</div>{ship === 'despacho' && <input className="input" placeholder={t('orders.shippingAddress')} value={addr} onChange={(e) => setAddr(e.target.value)} />}
          <label className="block"><span className="label">{t('orders.priority')}</span><select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="normal">{t('orders.normal')}</option><option value="alta">{t('orders.high')}</option><option value="baja">{t('orders.low')}</option></select></label></div></Card>
        <Card title={t('orders.depositAndDiscount')}><div className="space-y-3"><div className="grid grid-cols-2 gap-3"><label className="block"><span className="label">{t('orders.depositReceived')}</span><input type="number" min={0} className="input" value={dep || ''} onChange={(e) => setDep(+e.target.value || 0)} data-testid="order-deposit" /></label><label className="block"><span className="label">{t('common.method')}</span><select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>{['transferencia', 'efectivo', 'tarjeta', 'otro'].map((m) => <option key={m} value={m}>{tOr(t, `payMethod.${m}`, m)}</option>)}</select></label></div><label className="block"><span className="label">{t('orders.discount')}</span><input type="number" min={0} className="input" value={discount || ''} onChange={(e) => setDiscount(+e.target.value || 0)} /></label></div></Card>
        <Card title={t('orders.notesAndReferences')}><textarea className="input h-20 mb-3" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('orders.conversationDetails')} aria-label={t('common.notes')} /><LinksEditor value={links} onChange={setLinks} compact /></Card>
      </div>
      <div className="fixed md:sticky bottom-[64px] md:bottom-0 inset-x-0 z-30 bg-[var(--card)] backdrop-blur border-t md:border border-slate-200 dark:border-slate-700 md:rounded-xl md:shadow-lg px-3 py-3 safe-bottom">
        <div className="max-w-[1500px] mx-auto flex flex-wrap items-center gap-x-6 gap-y-2">
          <div><div className="text-[11px] muted">{t('common.suggested')}</div><div className="tabular">{money(tt.suggestedTotal)}</div></div>
          <div className="ml-auto text-right"><div className="text-[11px] muted">{t('orders.orderTotal')}</div><div className="text-xl font-bold tabular" data-testid="order-total">{money(tt.total)}</div></div>
          {showCosts && <Badge tone={tt.belowCost ? 'red' : tt.belowMin ? 'amber' : 'green'}>{t('common.margin')} {pct(tt.marginPct, 0)}</Badge>}
          <button className="btn-primary" onClick={save} disabled={busy} data-testid="order-save">{busy ? t('common.saving') : t('common.registerOrder')}</button>
        </div>
      </div>
      <Modal open={addProd} onClose={() => setAddProd(false)} title={t('orders.catalogProduct2')}><ul className="divide-y divide-slate-100 dark:divide-slate-800">{variants.map((v) => <li key={v.id}><button className="w-full text-left py-2.5 flex items-center justify-between gap-2 min-h-[48px]" onClick={() => { setItems([...items, newItem(ctx, { kind: 'producto', variantId: v.id, description: v.label, materialId: null, machineId: null })]); setAddProd(false); }}><span>{v.label}</span><span className="text-xs muted tabular">{money(v.price)} · {t('orders.availShort', { stock: v.stock })}</span></button></li>)}</ul></Modal>
    </div>
  );
}
