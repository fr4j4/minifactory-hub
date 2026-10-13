'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSaleAction } from '@/actions/catalog';
import { useToast } from './client';
import { Badge } from './ui';
import { cn, money, pct } from '@/lib/format';

export interface SaleVariant { id: string; label: string; sku: string; stock: number; price: number; cost: number; priceByChannel: Record<string, number> }
export interface SaleChannel { id: string; name: string; kind: string; commissionPct: number; commissionFixed: number; avgShipping: number }

/** Venta rápida (mostrador, feria o marketplace): pocos toques y margen neto a la vista. */
export function QuickSale({ variants, channels, showCosts }: { variants: SaleVariant[]; channels: SaleChannel[]; showCosts: boolean }) {
  const toast = useToast(); const router = useRouter();
  const [ch, setCh] = useState<string>(channels[0]?.id ?? ''); const [q, setQ] = useState(''); const [cart, setCart] = useState<Array<{ id: string; qty: number; price: number | null }>>([]);
  const [ship, setShip] = useState<number | null>(null); const [paid, setPaid] = useState(true); const [method, setMethod] = useState('efectivo'); const [ext, setExt] = useState(''); const [cust, setCust] = useState(''); const [by, setBy] = useState(''); const [busy, setBusy] = useState(false); const [last, setLast] = useState<any>(null);
  const channel = channels.find((c) => c.id === ch); const byId = useMemo(() => Object.fromEntries(variants.map((v) => [v.id, v])), [variants]);
  const listOf = (v: SaleVariant) => (channel && v.priceByChannel[channel.id]) || v.price;
  const lines = cart.map((c) => ({ ...c, v: byId[c.id], unit: c.price ?? listOf(byId[c.id]) }));
  const sub = lines.reduce((a, l) => a + l.unit * l.qty, 0); const cost = lines.reduce((a, l) => a + l.v.cost * l.qty, 0);
  const commission = channel ? Math.round(sub * channel.commissionPct / 100 + (sub > 0 ? channel.commissionFixed : 0)) : 0; const shipping = ship ?? channel?.avgShipping ?? 0; const net = sub - commission - shipping - cost;
  const hits = variants.filter((v) => !q || v.label.toLowerCase().includes(q.toLowerCase()) || v.sku.toLowerCase().includes(q.toLowerCase())).slice(0, 24);
  const add = (id: string) => setCart((c) => (c.find((x) => x.id === id) ? c.map((x) => (x.id === id ? { ...x, qty: x.qty + 1 } : x)) : [...c, { id, qty: 1, price: null }]));
  const save = async () => {
    setBusy(true);
    const r = await createSaleAction({ channelId: ch || null, customerName: cust || null, items: lines.map((l) => ({ variantId: l.id, qty: l.qty, unitPrice: l.price ?? undefined })), shipping: ship ?? undefined, paid, method, externalOrder: ext || null, shipBy: by || null });
    setBusy(false);
    if (!r.ok) { toast.push(r.error, 'err'); return; }
    setLast(r.data); setCart([]); setExt(''); setCust(''); toast.push(`Venta ${r.data.number} registrada${r.data.shortages.length ? ' (faltaba stock: ' + r.data.shortages.join(', ') + ')' : ''}`); router.refresh();
  };
  return (
    <div className="grid gap-4 lg:grid-cols-5" data-testid="quick-sale">
      <div className="lg:col-span-3 space-y-3">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Canal de venta">{channels.map((c) => <button key={c.id} role="radio" aria-checked={ch === c.id} onClick={() => setCh(c.id)} className={cn('btn-ghost', ch === c.id && '!bg-brand-600 !text-white !border-brand-600')} data-testid={`channel-${c.name}`}>{c.name}</button>)}</div>
        <input className="input" placeholder="Buscar producto o SKU…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar producto" data-testid="sale-search" />
        <ul className="grid grid-cols-2 xl:grid-cols-3 gap-2">{hits.map((v) => <li key={v.id}><button className="card w-full text-left p-3 min-h-[76px] hover:border-brand-500" onClick={() => add(v.id)} data-testid="sale-product"><div className="text-sm font-medium leading-snug">{v.label}</div><div className="flex justify-between text-xs muted mt-1 tabular"><span>{money(listOf(v))}</span><span className={v.stock <= 0 ? 'text-red-600 font-medium' : ''}>stock {v.stock}</span></div></button></li>)}{hits.length === 0 && <li className="text-sm muted col-span-full">Sin resultados.</li>}</ul>
      </div>
      <div className="lg:col-span-2">
        <div className="card p-4 space-y-3 lg:sticky lg:top-20">
          <h2 className="font-semibold">Venta</h2>
          {lines.length === 0 ? <p className="text-sm muted">Toca un producto para agregarlo.</p> : (
            <ul className="space-y-2" data-testid="cart">{lines.map((l) => <li key={l.id} className="flex items-center gap-2 text-sm"><span className="flex-1 min-w-0 truncate">{l.v.label}</span>
              <input type="number" min={1} className="input !w-16 !min-h-[40px] text-center" value={l.qty} aria-label={`Cantidad de ${l.v.label}`} onChange={(e) => setCart(cart.map((x) => (x.id === l.id ? { ...x, qty: Math.max(1, +e.target.value || 1) } : x)))} />
              <input type="number" min={0} className="input !w-24 !min-h-[40px] tabular" value={l.price ?? ''} placeholder={String(listOf(l.v))} aria-label={`Precio de ${l.v.label}`} onChange={(e) => setCart(cart.map((x) => (x.id === l.id ? { ...x, price: e.target.value === '' ? null : +e.target.value } : x)))} data-testid="sale-price" />
              <button className="btn-ghost btn-sm" onClick={() => setCart(cart.filter((x) => x.id !== l.id))} aria-label="Quitar">✕</button></li>)}</ul>)}
          {channel?.kind === 'marketplace' && <div className="grid grid-cols-2 gap-2"><input className="input" placeholder="N° de orden externa" value={ext} onChange={(e) => setExt(e.target.value)} aria-label="Orden externa" /><input type="date" className="input" value={by} onChange={(e) => setBy(e.target.value)} aria-label="Despachar antes de" /></div>}
          <input className="input" placeholder="Cliente (opcional)" value={cust} onChange={(e) => setCust(e.target.value)} aria-label="Cliente" />
          <div className="grid grid-cols-2 gap-2"><label className="text-xs">Envío que paga el taller ($)<input type="number" min={0} className="input" value={ship ?? ''} placeholder={String(channel?.avgShipping ?? 0)} onChange={(e) => setShip(e.target.value === '' ? null : +e.target.value)} /></label>
            <label className="text-xs">Cobro<select className="input" value={paid ? method : 'pendiente'} onChange={(e) => { if (e.target.value === 'pendiente') setPaid(false); else { setPaid(true); setMethod(e.target.value); } }}>{['efectivo', 'transferencia', 'tarjeta', 'marketplace', 'pendiente'].map((m) => <option key={m}>{m}</option>)}</select></label></div>
          <dl className="text-sm tabular space-y-1 border-t border-slate-200 dark:border-slate-700 pt-2"><div className="flex justify-between text-lg font-bold"><dt>Total</dt><dd data-testid="sale-total">{money(sub)}</dd></div>
            {commission > 0 && <div className="flex justify-between muted"><dt>Comisión {channel?.name}</dt><dd>−{money(commission)}</dd></div>}{shipping > 0 && <div className="flex justify-between muted"><dt>Envío</dt><dd>−{money(shipping)}</dd></div>}
            {showCosts && <div className="flex justify-between font-medium"><dt>Margen neto</dt><dd><Badge tone={net < 0 ? 'red' : 'green'}>{money(net)} {sub > 0 && `(${pct((net / sub) * 100, 0)})`}</Badge></dd></div>}</dl>
          <button className="btn-primary w-full" disabled={busy || lines.length === 0} onClick={save} data-testid="sale-save">{busy ? 'Registrando…' : 'Registrar venta'}</button>
          {last && <p className="text-xs muted" role="status">Última: {last.number} · {money(last.subtotal)}{showCosts ? ` · margen neto ${money(last.netMargin)}` : ''}</p>}
        </div>
      </div>
    </div>
  );
}
