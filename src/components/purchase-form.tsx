'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { previewPurchaseAction, receivePurchaseAction } from '@/actions/purchases';
import { useToast } from './client';
import { DateInput } from './date-input';
import { SpoolIcon } from './spool-icon';
import { useT } from '@/i18n/client';
import { cn, money } from '@/lib/format';
import type { PurchasePlan } from '@/lib/services/purchases';

export interface BuyMaterial { id: string; label: string; hex: string; type: string; tech: string; packG: number | null; costPerKg: number }
export interface BuyItem { id: string; name: string; unit: string; unitCost: number; category: string }
export interface BuySupplier { id: string; name: string; recoversVat: boolean }
interface Line { key: string; kind: 'filamento' | 'item'; refId: string; qty: number; netG: number; tareG: string; price: number; lot: string; location: string }

let seq = 0;
const num = (v: string) => (v === '' ? 0 : Number(v));

/** Nueva compra: documento arriba, líneas en medio (filamentos e insumos), costo real calculado al pie. Al recibirla se crean los carretes. */
export function PurchaseForm({ suppliers, materials, items, today, preset }: { suppliers: BuySupplier[]; materials: BuyMaterial[]; items: BuyItem[]; today: string; preset: Array<{ materialId?: string; itemId?: string; qty: number }> }) {
  const t = useT(); const toast = useToast(); const router = useRouter();
  const matById = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]); const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const mk = (kind: Line['kind'], refId: string, qty = 1): Line => {
    const m = kind === 'filamento' ? matById.get(refId) : undefined; const it = kind === 'item' ? itemById.get(refId) : undefined;
    const netG = m?.packG ?? 1000;
    return { key: `l${++seq}`, kind, refId, qty, netG, tareG: '', price: m ? Math.round((m.costPerKg * netG) / 1000) : it?.unitCost ?? 0, lot: '', location: '' };
  };
  const [lines, setLines] = useState<Line[]>(() => preset.flatMap((p) => p.materialId && matById.has(p.materialId) ? [mk('filamento', p.materialId, p.qty)] : p.itemId && itemById.has(p.itemId) ? [mk('item', p.itemId, p.qty)] : []));
  const [supplier, setSupplier] = useState(''); const [boughtAt, setBoughtAt] = useState(today); const [doc, setDoc] = useState(''); const [shipping, setShipping] = useState(''); const [discount, setDiscount] = useState(''); const [notes, setNotes] = useState('');
  const [q, setQ] = useState(''); const [plan, setPlan] = useState<PurchasePlan | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [saving, setSaving] = useState(false);
  const sup = suppliers.find((x) => x.name.toLowerCase() === supplier.trim().toLowerCase());
  const upd = (key: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const add = (kind: Line['kind'], refId: string) => { setLines((ls) => { const ex = ls.find((l) => l.kind === kind && l.refId === refId); return ex ? ls.map((l) => (l === ex ? { ...l, qty: l.qty + 1 } : l)) : [...ls, mk(kind, refId)]; }); setQ(''); };

  const needle = q.trim().toLowerCase();
  const found = needle ? [...materials.filter((m) => m.label.toLowerCase().includes(needle)).slice(0, 8).map((m) => ({ kind: 'filamento' as const, id: m.id, label: m.label, hex: m.hex, type: m.type })), ...items.filter((i) => i.name.toLowerCase().includes(needle)).slice(0, 5).map((i) => ({ kind: 'item' as const, id: i.id, label: i.name, hex: null, type: i.category }))] : [];

  const payload = () => ({ supplierId: sup?.id ?? null, supplierText: supplier, boughtAt, docNumber: doc, shipping: num(shipping), discount: num(discount), notes, lines: lines.map((l) => ({ kind: l.kind, materialId: l.kind === 'filamento' ? l.refId : null, itemId: l.kind === 'item' ? l.refId : null, qty: l.qty, netG: l.kind === 'filamento' ? l.netG : undefined, tareG: l.kind === 'filamento' && l.tareG !== '' ? Number(l.tareG) : undefined, unitPrice: l.price, lot: l.lot || undefined, location: l.location || undefined })) });
  // el costo real se recalcula en el servidor al cambiar cualquier cosa (con una pausa para no consultar en cada tecla)
  const seqRef = useRef(0);
  useEffect(() => {
    if (!lines.length) { setPlan(null); setErr(null); return; }
    const id = ++seqRef.current; setBusy(true);
    const h = setTimeout(async () => { const r = await previewPurchaseAction(payload()); if (id !== seqRef.current) return; setBusy(false); if (r.ok) { setPlan(r.data); setErr(null); } else { setPlan(null); setErr(r.error); } }, 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, supplier, shipping, discount]);
  const submit = async () => {
    setSaving(true); const r = await receivePurchaseAction({ ...payload(), boughtAt: boughtAt || today }); setSaving(false);
    if (!r.ok) { toast.push(r.error, 'err'); return; }
    toast.push(t('buy.received', { number: r.data.number, spools: r.data.spools }));
    router.push(`/inventario/compras/${r.data.id}`);
  };
  const lineOf = (i: number) => plan?.lines[i];
  const cls = 'input';
  return (
    <div className="space-y-4" data-testid="purchase-form">
      <section className="card p-4">
        <h2 className="text-sm font-semibold mb-3">{t('buy.documentTitle')}</h2>
        <div className="grid sm:grid-cols-4 gap-3">
          <label className="block sm:col-span-2"><span className="label">{t('buy.supplier')}</span><input className={cls} list="buy-suppliers" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder={t('buy.supplierHint')} data-testid="buy-supplier" /><datalist id="buy-suppliers">{suppliers.map((x) => <option key={x.id} value={x.name} />)}</datalist></label>
          <label className="block"><span className="label">{t('buy.date')}</span><DateInput value={boughtAt} onChange={setBoughtAt} /></label>
          <label className="block"><span className="label">{t('buy.docNumber')}</span><input className={cls} value={doc} onChange={(e) => setDoc(e.target.value)} placeholder={t('buy.docHint')} /></label>
        </div>
        {sup?.recoversVat && <p className="text-xs muted mt-2">{t('buy.vatRecoverable', { pct: plan?.vatPct ?? 19 })}</p>}
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-semibold mb-3">{t('buy.linesTitle')}</h2>
        <div className="relative mb-3">
          <input className={cls} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('buy.addPlaceholder')} aria-label={t('buy.addPlaceholder')} data-testid="buy-search" />
          {found.length > 0 && (
            <ul className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-[var(--line)] bg-[var(--card)] shadow-lg max-h-72 overflow-auto" role="listbox">
              {found.map((f) => (
                <li key={f.kind + f.id}><button type="button" className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-[var(--accent-soft)]" onClick={() => add(f.kind, f.id)} data-testid="buy-pick">
                  {f.hex ? <SpoolIcon hex={f.hex} label={f.type} size={28} /> : <span className="h-7 w-7 rounded-md bg-slate-200 dark:bg-slate-700 grid place-items-center text-[10px] font-mono" aria-hidden>{f.type.slice(0, 2)}</span>}
                  <span className="text-sm">{f.label}</span><span className="muted text-xs ml-auto">{f.kind === 'filamento' ? f.type : t(`buy.cat.${f.type}` as any)}</span></button></li>))}
            </ul>)}
          {needle && found.length === 0 && <p className="text-xs muted mt-1">{t('buy.nothingFound')}</p>}
        </div>

        {lines.length === 0 ? <p className="muted text-sm py-6 text-center">{t('buy.noLinesYet')}</p> : (
          <ul className="space-y-2.5">
            {lines.map((l, i) => {
              const m = l.kind === 'filamento' ? matById.get(l.refId) : undefined; const it = l.kind === 'item' ? itemById.get(l.refId) : undefined; const p = lineOf(i);
              return (
                <li key={l.key} className="rounded-xl border border-[var(--line)] p-3" data-testid="buy-line">
                  <div className="flex items-start gap-3">
                    {m ? <SpoolIcon hex={m.hex} label={m.tech === 'resina' ? 'RES' : m.type} resin={m.tech === 'resina'} size={40} /> : <span className="h-10 w-10 rounded-lg bg-slate-200 dark:bg-slate-700 grid place-items-center text-xs font-mono shrink-0" aria-hidden>{(it?.name ?? '?').slice(0, 2).toUpperCase()}</span>}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2"><div className="font-medium truncate">{m?.label ?? it?.name}</div><button type="button" className="btn-ghost btn-sm text-danger shrink-0" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={t('buy.removeLine')}>✕</button></div>
                      <div className={cn('grid gap-2 mt-2', m ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3')}>
                        <label className="block"><span className="label">{m ? t('buy.spoolsQty') : t('buy.unitsQty', { unit: it?.unit ?? '' })}</span><input type="number" min={m ? 1 : 0.01} step={m ? 1 : 'any'} className={cls} value={l.qty} onChange={(e) => upd(l.key, { qty: Number(e.target.value) })} data-testid="buy-qty" /></label>
                        {m && <label className="block"><span className="label">{t('buy.netG')}</span><input type="number" min={1} className={cls} value={l.netG} onChange={(e) => upd(l.key, { netG: Number(e.target.value) })} data-testid="buy-net" /></label>}
                        <label className="block"><span className="label">{m ? t('buy.pricePerSpool') : t('buy.pricePerUnit')}</span><input type="number" min={0} className={cls} value={l.price} onChange={(e) => upd(l.key, { price: Number(e.target.value) })} data-testid="buy-price" /></label>
                        {m && <label className="block"><span className="label">{t('buy.tareG')}</span><input type="number" min={0} className={cls} value={l.tareG} placeholder={m.tech === 'resina' ? '0' : '200'} onChange={(e) => upd(l.key, { tareG: e.target.value })} /></label>}
                        {m && <label className="block max-sm:col-span-2"><span className="label">{t('buy.lot')}</span><input className={cls} value={l.lot} onChange={(e) => upd(l.key, { lot: e.target.value })} /></label>}
                        <div className="flex flex-col justify-end text-right text-xs tabular"><span className="muted">{t('buy.lineTotal')}</span><b className="text-sm">{money(l.qty * l.price)}</b></div>
                      </div>
                      {p && <p className="text-xs muted mt-1.5" data-testid="buy-real-cost">{m ? t('buy.realCostKg', { cost: money(p.costPerKg ?? 0), unit: money(p.unitCost) }) : t('buy.realCostUnit', { cost: money(p.unitCost) })}</p>}
                    </div>
                  </div>
                </li>);
            })}
          </ul>)}
      </section>

      <section className="card p-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="block"><span className="label">{t('buy.shipping')}</span><input type="number" min={0} className={cls} value={shipping} onChange={(e) => setShipping(e.target.value)} placeholder="0" data-testid="buy-shipping" /></label>
          <label className="block"><span className="label">{t('buy.discount')}</span><input type="number" min={0} className={cls} value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" data-testid="buy-discount" /></label>
          <label className="block"><span className="label">{t('buy.notes')}</span><input className={cls} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-[var(--line)] pt-3">
          <div className="text-sm space-y-0.5" aria-live="polite">
            {err ? <p className="text-danger" role="alert">{err}</p> : plan ? (<>
              <p className="muted">{t('buy.summaryLine', { spools: plan.spools, subtotal: money(plan.subtotal) })}</p>
              <p className="num text-lg font-semibold" data-testid="buy-total">{t('buy.total')}: {money(plan.total)}</p>
              {plan.recoversVat && <p className="text-xs muted">{t('buy.netOfVat', { net: money(plan.netTotal), pct: plan.vatPct })}</p>}
            </>) : <p className="muted">{busy ? t('buy.calculating') : t('buy.addLinesToSee')}</p>}
          </div>
          <button className="btn-primary" disabled={saving || busy || !plan || !!err} onClick={submit} data-testid="buy-receive">{saving ? t('buy.saving') : t('buy.receive')}</button>
        </div>
      </section>
    </div>
  );
}
