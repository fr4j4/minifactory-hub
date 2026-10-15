'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adjustStockAction, produceAction, saveProductAction, updateVariantAction } from '@/actions/catalog';
import { Modal, useAction } from './client';
import { money } from '@/lib/format';
import { useT } from '@/i18n/client';

type Mat = { id: string; label: string };

export function ProductForm({ p, materials, models }: { p?: { id: string; name: string; category: string | null; description: string | null; mode: string; status: string; modelFileId: string | null; attributes: Array<{ name: string; values: string[] }>; tags: string[] }; materials: Mat[]; models: Array<{ id: string; name: string }> }) {
  const t = useT();
  const { run, pending } = useAction(); const router = useRouter();
  const [v, setV] = useState({ name: p?.name ?? '', category: p?.category ?? '', description: p?.description ?? '', mode: (p?.mode ?? 'simple') as 'simple' | 'variantes', status: p?.status ?? 'activo', modelFileId: p?.modelFileId ?? '', tags: (p?.tags ?? []).join(', '), price: 0, weightG: 0, printH: 0, minStock: 0, materialId: '' });
  const [attrs, setAttrs] = useState<Array<{ name: string; values: string }>>((p?.attributes ?? [{ name: 'Color', values: [] }]).map((a) => ({ name: a.name, values: a.values.join(', ') })));
  const set = (k: string) => (e: React.ChangeEvent<any>) => setV({ ...v, [k]: e.target.type === 'number' ? +e.target.value : e.target.value });
  return (
    <form className="grid sm:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); run(() => saveProductAction({ id: p?.id, name: v.name, category: v.category || null, description: v.description || null, mode: v.mode, status: v.status, modelFileId: v.modelFileId || null, tags: v.tags.split(',').map((tt) => tt.trim()).filter(Boolean), attributes: attrs.map((a) => ({ name: a.name.trim(), values: a.values.split(',').map((x) => x.trim()).filter(Boolean) })), price: v.price, weightG: v.weightG, printH: v.printH, minStock: v.minStock, materialId: v.materialId || null }), { ok: t('catalog.productSaved2'), onOk: (id) => { if (!p) router.push(`/catalogo/${id}`); } }); }}>
      <label className="block sm:col-span-2"><span className="label">{t('common.name2')}</span><input className="input" required value={v.name} onChange={set('name')} data-testid="prod-name" /></label>
      <label className="block"><span className="label">{t('common.category')}</span><input className="input" value={v.category} onChange={set('category')} /></label>
      <label className="block"><span className="label">{t('common.status')}</span><select className="input" value={v.status} onChange={set('status')}><option value="borrador">{t('catalog.draft')}</option><option value="activo">{t('catalog.active')}</option><option value="descontinuado">{t('catalog.discontinued')}</option></select></label>
      <div className="sm:col-span-2"><span className="label">{t('catalog.typeLabel')}</span><div className="flex gap-2" role="radiogroup">{([['simple', t('catalog.simpleASingleReference')], ['variantes', t('catalog.withVariantsColorSize')]] as const).map(([k, l]) => <button type="button" key={k} role="radio" aria-checked={v.mode === k} onClick={() => setV({ ...v, mode: k })} className={`btn-ghost flex-1 ${v.mode === k ? '!bg-[var(--panel)] !text-[var(--panel-ink)] !border-[var(--panel)] dark:!bg-slate-700' : ''}`} data-testid={`mode-${k}`}>{l}</button>)}</div></div>
      {v.mode === 'variantes' && (
        <div className="sm:col-span-2 space-y-2"><span className="label">{t('catalog.attributesAllCombinationsAreGene')}</span>
          {attrs.map((a, i) => <div key={i} className="grid grid-cols-5 gap-2"><input className="input col-span-2" placeholder={t('catalog.attributeColor')} value={a.name} onChange={(e) => setAttrs(attrs.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} aria-label={t('catalog.nameOfAttribute', { i: i + 1 })} /><input className="input col-span-2" placeholder={t('catalog.valuesBlackRedWhite')} value={a.values} onChange={(e) => setAttrs(attrs.map((x, k) => (k === i ? { ...x, values: e.target.value } : x)))} aria-label={t('catalog.valuesOfAttribute', { i: i + 1 })} /><button type="button" className="btn-ghost" onClick={() => setAttrs(attrs.filter((_, k) => k !== i))} aria-label={t('catalog.removeAttribute')}>✕</button></div>)}
          <button type="button" className="btn-ghost btn-sm" onClick={() => setAttrs([...attrs, { name: '', values: '' }])}>{t('catalog.attribute')}</button></div>
      )}
      {!p && <>
        <label className="block"><span className="label">{t('catalog.salePrice')}</span><input type="number" min={0} className="input" value={v.price || ''} onChange={set('price')} data-testid="prod-price" /></label>
        <label className="block"><span className="label">{t('common.material')}</span><select className="input" value={v.materialId} onChange={set('materialId')}><option value="">—</option>{materials.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
        <label className="block"><span className="label">{t('catalog.weightG')}</span><input type="number" min={0} className="input" value={v.weightG || ''} onChange={set('weightG')} /></label>
        <label className="block"><span className="label">{t('catalog.printTimeH')}</span><input type="number" min={0} step="0.1" className="input" value={v.printH || ''} onChange={set('printH')} /></label>
        <label className="block"><span className="label">{t('catalog.minimumStock')}</span><input type="number" min={0} className="input" value={v.minStock || ''} onChange={set('minStock')} /></label></>}
      <label className="block"><span className="label">{t('catalog.linked3dModel')}</span><select className="input" value={v.modelFileId} onChange={set('modelFileId')}><option value="">—</option>{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      <label className="block"><span className="label">{t('common.tags')}</span><input className="input" value={v.tags} onChange={set('tags')} /></label>
      <label className="block sm:col-span-2"><span className="label">{t('common.description')}</span><textarea className="input h-20" value={v.description} onChange={set('description')} /></label>
      <div className="sm:col-span-2 flex justify-end"><button className="btn-primary" disabled={pending} data-testid="prod-save">{t('catalog.saveProduct')}</button></div>
    </form>
  );
}

export function VariantRow({ v, label, avgCost, channels, canEdit, materials }: { v: { id: string; sku: string; stock: number; reserved: number; minStock: number; price: number; avgCost: number; location: string | null; weightG: number; printH: number; active: boolean; priceByChannel: Record<string, number> }; label: string; avgCost: number; channels: Array<{ id: string; name: string }>; canEdit: boolean; materials: Mat[] }) {
  const t = useT();
  const { run, pending } = useAction(); const [adj, setAdj] = useState(false); const [prod, setProd] = useState(false); const [edit, setEdit] = useState(false);
  const [kind, setKind] = useState<'ajuste' | 'merma' | 'muestra' | 'uso_interno' | 'devolucion'>('ajuste'); const [qty, setQty] = useState(v.stock); const [reason, setReason] = useState(''); const [ret, setRet] = useState(true); const [pq, setPq] = useState(Math.max(1, v.minStock * 2 - v.stock));
  const [price, setPrice] = useState(v.price); const [min, setMin] = useState(v.minStock); const [loc, setLoc] = useState(v.location ?? ''); const [pbc, setPbc] = useState<Record<string, number>>(v.priceByChannel ?? {});
  const margin = v.price > 0 ? ((v.price - avgCost) / v.price) * 100 : null; const avail = v.stock - v.reserved; const low = v.minStock > 0 && v.stock <= v.minStock;
  return (
    <>
      <tr data-testid="variant-row" className={!v.active ? 'opacity-50' : ''}>
        <td className="td"><div className="font-medium">{label}</div><div className="text-xs muted tabular">{v.sku}{v.location ? ` · ${v.location}` : ''}</div></td>
        <td className="td text-right tabular"><span className={low ? 'text-danger font-semibold' : ''} data-testid="variant-stock">{v.stock}</span>{v.reserved > 0 && <div className="text-xs muted">{t('catalog.avail')} {avail}</div>}</td>
        <td className="td text-right tabular muted">{v.minStock || '—'}</td><td className="td text-right tabular">{money(v.price)}</td><td className="td text-right tabular muted">{money(avgCost)}</td><td className="td text-right tabular">{margin != null ? `${margin.toFixed(0)}%` : '—'}</td>
        <td className="td text-right whitespace-nowrap">{canEdit && <><button className="btn-ghost btn-sm" onClick={() => setProd(true)} data-testid="variant-produce">{t('catalog.produce')}</button> <button className="btn-ghost btn-sm" onClick={() => { setQty(v.stock); setKind('ajuste'); setAdj(true); }} data-testid="variant-adjust">{t('common.stock')}</button> <button className="btn-ghost btn-sm" onClick={() => setEdit(true)}>{t('common.edit')}</button></>}</td>
      </tr>
      <Modal open={adj} onClose={() => setAdj(false)} title={t('catalog.stockOf', { label })}>
        <div className="space-y-3"><label className="block"><span className="label">{t('catalog.movement')}</span><select className="input" value={kind} onChange={(e) => setKind(e.target.value as any)}><option value="ajuste">{t('catalog.physicalCountSetQuantity')}</option><option value="merma">{t('catalog.wasteFailure')}</option><option value="muestra">{t('catalog.sampleOrGift')}</option><option value="uso_interno">{t('catalog.internalUsePhotosFair')}</option><option value="devolucion">{t('catalog.salesReturn')}</option></select></label>
          <label className="block"><span className="label">{kind === 'ajuste' ? t('catalog.countedQuantity') : t('common.quantity')}</span><input type="number" min={0} className="input" value={qty} onChange={(e) => setQty(+e.target.value || 0)} data-testid="stock-qty" /></label>
          {kind === 'devolucion' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ret} onChange={(e) => setRet(e.target.checked)} /> {t('catalog.thePartIsInGood')}</label>}
          <input className="input" placeholder={t('catalog.reasonRequiredForAdjustmentsWast')} value={reason} onChange={(e) => setReason(e.target.value)} aria-label={t('common.reason')} data-testid="stock-reason" />
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setAdj(false)}>{t('common.cancel')}</button><button className="btn-primary" disabled={pending} data-testid="stock-save" onClick={() => run(() => adjustStockAction({ variantId: v.id, kind, qty, reason, returnToStock: ret }), { ok: t('catalog.stockUpdated2'), onOk: () => setAdj(false) })}>{t('common.save')}</button></div></div>
      </Modal>
      <Modal open={prod} onClose={() => setProd(false)} title={t('catalog.produce2', { label })}>
        <div className="space-y-3"><p className="text-sm muted">{t('catalog.createsAProductionOrderFor')}</p>
          <label className="block"><span className="label">{t('catalog.unitsToProduce')}</span><input type="number" min={1} className="input" value={pq} onChange={(e) => setPq(+e.target.value || 1)} data-testid="prod-qty" /></label>
          {(v.weightG <= 0 || v.printH <= 0) && <p className="text-xs text-amber-700">{t('catalog.theVariantSWeightOr')}</p>}
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setProd(false)}>{t('common.cancel')}</button><button className="btn-primary" disabled={pending} data-testid="prod-confirm" onClick={() => run(() => produceAction(v.id, pq), { ok: t('catalog.productionOrderCreatedInThe2'), onOk: () => setProd(false) })}>{t('catalog.createOrder')}</button></div></div>
      </Modal>
      <Modal open={edit} onClose={() => setEdit(false)} title={t('catalog.edit', { label })}>
        <div className="grid grid-cols-2 gap-3"><label className="block"><span className="label">{t('catalog.listPrice')}</span><input type="number" min={0} className="input" value={price} onChange={(e) => setPrice(+e.target.value || 0)} /></label><label className="block"><span className="label">{t('catalog.minimumStock')}</span><input type="number" min={0} className="input" value={min} onChange={(e) => setMin(+e.target.value || 0)} /></label>
          <label className="block col-span-2"><span className="label">{t('common.location')}</span><input className="input" value={loc} onChange={(e) => setLoc(e.target.value)} /></label>
          <div className="col-span-2"><span className="label">{t('catalog.pricePerChannelOptional')}</span><div className="grid grid-cols-2 gap-2">{channels.map((c) => <label key={c.id} className="text-xs">{c.name}<input type="number" min={0} className="input" value={pbc[c.id] ?? ''} placeholder={String(price)} onChange={(e) => setPbc({ ...pbc, [c.id]: +e.target.value || 0 })} /></label>)}</div></div>
          <div className="col-span-2 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setEdit(false)}>{t('common.cancel')}</button><button className="btn-primary" disabled={pending} onClick={() => run(() => updateVariantAction(v.id, { price, minStock: min, location: loc || null, priceByChannel: Object.fromEntries(Object.entries(pbc).filter(([, x]) => x > 0)) }), { ok: t('catalog.saved2'), onOk: () => setEdit(false) })}>{t('common.save')}</button></div></div>
      </Modal>
    </>
  );
}
