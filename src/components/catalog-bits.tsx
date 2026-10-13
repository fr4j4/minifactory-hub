'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adjustStockAction, produceAction, saveProductAction, updateVariantAction } from '@/actions/catalog';
import { Modal, useAction } from './client';
import { money } from '@/lib/format';

type Mat = { id: string; label: string };

export function ProductForm({ p, materials, models }: { p?: { id: string; name: string; category: string | null; description: string | null; mode: string; status: string; modelFileId: string | null; attributes: Array<{ name: string; values: string[] }>; tags: string[] }; materials: Mat[]; models: Array<{ id: string; name: string }> }) {
  const { run, pending } = useAction(); const router = useRouter();
  const [v, setV] = useState({ name: p?.name ?? '', category: p?.category ?? '', description: p?.description ?? '', mode: (p?.mode ?? 'simple') as 'simple' | 'variantes', status: p?.status ?? 'activo', modelFileId: p?.modelFileId ?? '', tags: (p?.tags ?? []).join(', '), price: 0, weightG: 0, printH: 0, minStock: 0, materialId: '' });
  const [attrs, setAttrs] = useState<Array<{ name: string; values: string }>>((p?.attributes ?? [{ name: 'Color', values: [] }]).map((a) => ({ name: a.name, values: a.values.join(', ') })));
  const set = (k: string) => (e: React.ChangeEvent<any>) => setV({ ...v, [k]: e.target.type === 'number' ? +e.target.value : e.target.value });
  return (
    <form className="grid sm:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); run(() => saveProductAction({ id: p?.id, name: v.name, category: v.category || null, description: v.description || null, mode: v.mode, status: v.status, modelFileId: v.modelFileId || null, tags: v.tags.split(',').map((t) => t.trim()).filter(Boolean), attributes: attrs.map((a) => ({ name: a.name.trim(), values: a.values.split(',').map((x) => x.trim()).filter(Boolean) })), price: v.price, weightG: v.weightG, printH: v.printH, minStock: v.minStock, materialId: v.materialId || null }), { ok: 'Producto guardado', onOk: (id) => { if (!p) router.push(`/catalogo/${id}`); } }); }}>
      <label className="block sm:col-span-2"><span className="label">Nombre *</span><input className="input" required value={v.name} onChange={set('name')} data-testid="prod-name" /></label>
      <label className="block"><span className="label">Categoría</span><input className="input" value={v.category} onChange={set('category')} /></label>
      <label className="block"><span className="label">Estado</span><select className="input" value={v.status} onChange={set('status')}><option value="borrador">Borrador</option><option value="activo">Activo</option><option value="descontinuado">Descontinuado</option></select></label>
      <div className="sm:col-span-2"><span className="label">Modalidad</span><div className="flex gap-2" role="radiogroup">{([['simple', 'Simple (una sola referencia)'], ['variantes', 'Con variantes (color, tamaño…)']] as const).map(([k, l]) => <button type="button" key={k} role="radio" aria-checked={v.mode === k} onClick={() => setV({ ...v, mode: k })} className={`btn-ghost flex-1 ${v.mode === k ? '!bg-[var(--panel)] !text-[var(--panel-ink)] !border-[var(--panel)] dark:!bg-slate-700' : ''}`} data-testid={`mode-${k}`}>{l}</button>)}</div></div>
      {v.mode === 'variantes' && (
        <div className="sm:col-span-2 space-y-2"><span className="label">Atributos (se generan todas las combinaciones)</span>
          {attrs.map((a, i) => <div key={i} className="grid grid-cols-5 gap-2"><input className="input col-span-2" placeholder="Atributo (Color)" value={a.name} onChange={(e) => setAttrs(attrs.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} aria-label={`Nombre del atributo ${i + 1}`} /><input className="input col-span-2" placeholder="Valores: Negro, Rojo, Blanco" value={a.values} onChange={(e) => setAttrs(attrs.map((x, k) => (k === i ? { ...x, values: e.target.value } : x)))} aria-label={`Valores del atributo ${i + 1}`} /><button type="button" className="btn-ghost" onClick={() => setAttrs(attrs.filter((_, k) => k !== i))} aria-label="Quitar atributo">✕</button></div>)}
          <button type="button" className="btn-ghost btn-sm" onClick={() => setAttrs([...attrs, { name: '', values: '' }])}>+ Atributo</button></div>
      )}
      {!p && <>
        <label className="block"><span className="label">Precio de venta ($)</span><input type="number" min={0} className="input" value={v.price || ''} onChange={set('price')} data-testid="prod-price" /></label>
        <label className="block"><span className="label">Material</span><select className="input" value={v.materialId} onChange={set('materialId')}><option value="">—</option>{materials.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
        <label className="block"><span className="label">Peso (g)</span><input type="number" min={0} className="input" value={v.weightG || ''} onChange={set('weightG')} /></label>
        <label className="block"><span className="label">Tiempo de impresión (h)</span><input type="number" min={0} step="0.1" className="input" value={v.printH || ''} onChange={set('printH')} /></label>
        <label className="block"><span className="label">Stock mínimo</span><input type="number" min={0} className="input" value={v.minStock || ''} onChange={set('minStock')} /></label></>}
      <label className="block"><span className="label">Modelo 3D vinculado</span><select className="input" value={v.modelFileId} onChange={set('modelFileId')}><option value="">—</option>{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      <label className="block"><span className="label">Etiquetas</span><input className="input" value={v.tags} onChange={set('tags')} /></label>
      <label className="block sm:col-span-2"><span className="label">Descripción</span><textarea className="input h-20" value={v.description} onChange={set('description')} /></label>
      <div className="sm:col-span-2 flex justify-end"><button className="btn-primary" disabled={pending} data-testid="prod-save">Guardar producto</button></div>
    </form>
  );
}

export function VariantRow({ v, label, avgCost, channels, canEdit, materials }: { v: { id: string; sku: string; stock: number; reserved: number; minStock: number; price: number; avgCost: number; location: string | null; weightG: number; printH: number; active: boolean; priceByChannel: Record<string, number> }; label: string; avgCost: number; channels: Array<{ id: string; name: string }>; canEdit: boolean; materials: Mat[] }) {
  const { run, pending } = useAction(); const [adj, setAdj] = useState(false); const [prod, setProd] = useState(false); const [edit, setEdit] = useState(false);
  const [kind, setKind] = useState<'ajuste' | 'merma' | 'muestra' | 'uso_interno' | 'devolucion'>('ajuste'); const [qty, setQty] = useState(v.stock); const [reason, setReason] = useState(''); const [ret, setRet] = useState(true); const [pq, setPq] = useState(Math.max(1, v.minStock * 2 - v.stock));
  const [price, setPrice] = useState(v.price); const [min, setMin] = useState(v.minStock); const [loc, setLoc] = useState(v.location ?? ''); const [pbc, setPbc] = useState<Record<string, number>>(v.priceByChannel ?? {});
  const margin = v.price > 0 ? ((v.price - avgCost) / v.price) * 100 : null; const avail = v.stock - v.reserved; const low = v.minStock > 0 && v.stock <= v.minStock;
  return (
    <>
      <tr data-testid="variant-row" className={!v.active ? 'opacity-50' : ''}>
        <td className="td"><div className="font-medium">{label}</div><div className="text-xs muted tabular">{v.sku}{v.location ? ` · ${v.location}` : ''}</div></td>
        <td className="td text-right tabular"><span className={low ? 'text-red-600 dark:text-red-400 font-semibold' : ''} data-testid="variant-stock">{v.stock}</span>{v.reserved > 0 && <div className="text-xs muted">disp. {avail}</div>}</td>
        <td className="td text-right tabular muted">{v.minStock || '—'}</td><td className="td text-right tabular">{money(v.price)}</td><td className="td text-right tabular muted">{money(avgCost)}</td><td className="td text-right tabular">{margin != null ? `${margin.toFixed(0)}%` : '—'}</td>
        <td className="td text-right whitespace-nowrap">{canEdit && <><button className="btn-ghost btn-sm" onClick={() => setProd(true)} data-testid="variant-produce">Producir</button> <button className="btn-ghost btn-sm" onClick={() => { setQty(v.stock); setKind('ajuste'); setAdj(true); }} data-testid="variant-adjust">Stock</button> <button className="btn-ghost btn-sm" onClick={() => setEdit(true)}>Editar</button></>}</td>
      </tr>
      <Modal open={adj} onClose={() => setAdj(false)} title={`Stock de ${label}`}>
        <div className="space-y-3"><label className="block"><span className="label">Movimiento</span><select className="input" value={kind} onChange={(e) => setKind(e.target.value as any)}><option value="ajuste">Conteo físico (fijar cantidad)</option><option value="merma">Merma / falla</option><option value="muestra">Muestra o regalo</option><option value="uso_interno">Uso interno (fotos, feria)</option><option value="devolucion">Devolución de venta</option></select></label>
          <label className="block"><span className="label">{kind === 'ajuste' ? 'Cantidad contada' : 'Cantidad'}</span><input type="number" min={0} className="input" value={qty} onChange={(e) => setQty(+e.target.value || 0)} data-testid="stock-qty" /></label>
          {kind === 'devolucion' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ret} onChange={(e) => setRet(e.target.checked)} /> La pieza está sana: reingresa al stock (si no, va a merma)</label>}
          <input className="input" placeholder="Motivo (obligatorio en ajustes, mermas y devoluciones)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Motivo" data-testid="stock-reason" />
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setAdj(false)}>Cancelar</button><button className="btn-primary" disabled={pending} data-testid="stock-save" onClick={() => run(() => adjustStockAction({ variantId: v.id, kind, qty, reason, returnToStock: ret }), { ok: 'Stock actualizado', onOk: () => setAdj(false) })}>Guardar</button></div></div>
      </Modal>
      <Modal open={prod} onClose={() => setProd(false)} title={`Producir ${label}`}>
        <div className="space-y-3"><p className="text-sm muted">Crea una orden de producción para stock: entra a la misma cola que los pedidos y, al terminar, las unidades buenas suman al stock.</p>
          <label className="block"><span className="label">Unidades a producir</span><input type="number" min={1} className="input" value={pq} onChange={(e) => setPq(+e.target.value || 1)} data-testid="prod-qty" /></label>
          {(v.weightG <= 0 || v.printH <= 0) && <p className="text-xs text-amber-700">Falta el peso o el tiempo de impresión de la variante: el trabajo quedará sin estimación.</p>}
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setProd(false)}>Cancelar</button><button className="btn-primary" disabled={pending} data-testid="prod-confirm" onClick={() => run(() => produceAction(v.id, pq), { ok: 'Orden de producción creada en la cola', onOk: () => setProd(false) })}>Crear orden</button></div></div>
      </Modal>
      <Modal open={edit} onClose={() => setEdit(false)} title={`Editar ${label}`}>
        <div className="grid grid-cols-2 gap-3"><label className="block"><span className="label">Precio de lista ($)</span><input type="number" min={0} className="input" value={price} onChange={(e) => setPrice(+e.target.value || 0)} /></label><label className="block"><span className="label">Stock mínimo</span><input type="number" min={0} className="input" value={min} onChange={(e) => setMin(+e.target.value || 0)} /></label>
          <label className="block col-span-2"><span className="label">Ubicación</span><input className="input" value={loc} onChange={(e) => setLoc(e.target.value)} /></label>
          <div className="col-span-2"><span className="label">Precio por canal (opcional)</span><div className="grid grid-cols-2 gap-2">{channels.map((c) => <label key={c.id} className="text-xs">{c.name}<input type="number" min={0} className="input" value={pbc[c.id] ?? ''} placeholder={String(price)} onChange={(e) => setPbc({ ...pbc, [c.id]: +e.target.value || 0 })} /></label>)}</div></div>
          <div className="col-span-2 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setEdit(false)}>Cancelar</button><button className="btn-primary" disabled={pending} onClick={() => run(() => updateVariantAction(v.id, { price, minStock: min, location: loc || null, priceByChannel: Object.fromEntries(Object.entries(pbc).filter(([, x]) => x > 0)) }), { ok: 'Guardado', onOk: () => setEdit(false) })}>Guardar</button></div></div>
      </Modal>
    </>
  );
}
