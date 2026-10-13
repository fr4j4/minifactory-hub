'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addSpoolAction, findSpoolByCodeAction, moveItemAction, saveItemAction, saveMaterialAction, updateSpoolAction, weighSpoolAction } from '@/actions/inventory';
import { Modal, useAction, useToast } from './client';

export function MaterialForm({ m, profiles, trigger }: { m?: any; profiles: Array<{ id: string; name: string }>; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false); const { run, pending } = useAction();
  const [v, setV] = useState({ tech: m?.tech ?? 'fdm', manufacturer: m?.manufacturer ?? '', line: m?.line ?? '', type: m?.type ?? 'PLA', colorName: m?.colorName ?? '', hex: m?.hex ?? '#888888', diameter: m?.diameter ?? 1.75, density: m?.density ?? 1.24, costPerKg: m?.costPerKg ?? 0, stockMinG: m?.stockMinG ?? 1000, tempNozzle: m?.tempNozzle ?? '', tempBed: m?.tempBed ?? '', supplierText: m?.supplierText ?? '', filamentProfileId: m?.filamentProfileId ?? '' });
  const f = (k: string) => (e: React.ChangeEvent<any>) => setV({ ...v, [k]: e.target.type === 'number' ? +e.target.value : e.target.value });
  return (
    <>
      <span onClick={() => setOpen(true)} className="inline-block">{trigger}</span>
      <Modal open={open} onClose={() => setOpen(false)} title={m ? 'Editar material' : 'Nuevo material'} wide>
        <form className="grid sm:grid-cols-3 gap-3" onSubmit={(e) => { e.preventDefault(); run(() => saveMaterialAction({ id: m?.id, ...v, filamentProfileId: v.filamentProfileId || null }), { ok: 'Material guardado', onOk: () => setOpen(false) }); }}>
          <label className="block"><span className="label">Tecnología</span><select className="input" value={v.tech} onChange={f('tech')}><option value="fdm">Filamento (FDM)</option><option value="resina">Resina</option></select></label>
          <label className="block"><span className="label">Fabricante</span><input className="input" value={v.manufacturer} onChange={f('manufacturer')} /></label><label className="block"><span className="label">Línea</span><input className="input" value={v.line} onChange={f('line')} /></label>
          <label className="block"><span className="label">Material *</span><input className="input" required value={v.type} onChange={f('type')} list="mat-types" data-testid="mat-type" /><datalist id="mat-types">{['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'PA', 'PC', 'Resina estándar', 'Resina ABS-like', 'Resina flexible'].map((x) => <option key={x} value={x} />)}</datalist></label>
          <label className="block"><span className="label">Color *</span><input className="input" required value={v.colorName} onChange={f('colorName')} data-testid="mat-color" /></label><label className="block"><span className="label">Muestra</span><input type="color" className="input !p-1" value={v.hex} onChange={f('hex')} /></label>
          <label className="block"><span className="label">Densidad (g/cm³)</span><input type="number" step="0.01" className="input" value={v.density} onChange={f('density')} /></label><label className="block"><span className="label">Costo por {v.tech === 'resina' ? 'litro' : 'kg'} ($)</span><input type="number" className="input" value={v.costPerKg} onChange={f('costPerKg')} data-testid="mat-cost" /></label><label className="block"><span className="label">Stock mínimo (g)</span><input type="number" className="input" value={v.stockMinG} onChange={f('stockMinG')} /></label>
          <label className="block"><span className="label">Temp. boquilla</span><input className="input" value={v.tempNozzle} onChange={f('tempNozzle')} placeholder="190–230" /></label><label className="block"><span className="label">Temp. cama</span><input className="input" value={v.tempBed} onChange={f('tempBed')} /></label><label className="block"><span className="label">Proveedor (texto)</span><input className="input" value={v.supplierText} onChange={f('supplierText')} /></label>
          <label className="block sm:col-span-3"><span className="label">Perfil de filamento del laminador</span><select className="input" value={v.filamentProfileId} onChange={f('filamentProfileId')}><option value="">— Ninguno —</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <div className="sm:col-span-3 flex justify-end"><button className="btn-primary" disabled={pending} data-testid="mat-save">Guardar</button></div>
        </form>
      </Modal>
    </>
  );
}

export function AddSpoolButton({ materials }: { materials: Array<{ id: string; label: string; costPerKg: number }> }) {
  const [open, setOpen] = useState(false); const { run, pending } = useAction(); const [mid, setMid] = useState(materials[0]?.id ?? ''); const [g, setG] = useState(1000); const [tare, setTare] = useState(200); const [cost, setCost] = useState(materials[0]?.costPerKg ?? 0); const [lot, setLot] = useState(''); const [loc, setLoc] = useState(''); const [n, setN] = useState(1); const [sup, setSup] = useState('');
  return (<>
    <button className="btn-primary" onClick={() => setOpen(true)} data-testid="add-spool">+ Entrada de compra</button>
    <Modal open={open} onClose={() => setOpen(false)} title="Entrada de compra (bobinas o botellas)">
      <div className="space-y-3"><p className="text-xs muted">Registra lo que compraste: cada unidad física recibe su código QR. El costo actualiza el promedio ponderado del material. El proveedor es solo texto.</p>
        <label className="block"><span className="label">Material</span><select className="input" value={mid} onChange={(e) => { setMid(e.target.value); setCost(materials.find((m) => m.id === e.target.value)?.costPerKg ?? 0); }} data-testid="spool-material">{materials.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
        <div className="grid grid-cols-3 gap-3"><label className="block"><span className="label">Cantidad</span><input type="number" min={1} max={20} className="input" value={n} onChange={(e) => setN(+e.target.value || 1)} /></label><label className="block"><span className="label">Neto (g)</span><input type="number" className="input" value={g} onChange={(e) => setG(+e.target.value || 0)} data-testid="spool-g" /></label><label className="block"><span className="label">Tara carrete (g)</span><input type="number" className="input" value={tare} onChange={(e) => setTare(+e.target.value || 0)} /></label></div>
        <div className="grid grid-cols-2 gap-3"><label className="block"><span className="label">Costo por kg ($)</span><input type="number" className="input" value={cost} onChange={(e) => setCost(+e.target.value || 0)} data-testid="spool-cost" /></label><label className="block"><span className="label">Lote</span><input className="input" value={lot} onChange={(e) => setLot(e.target.value)} /></label><label className="block"><span className="label">Ubicación</span><input className="input" value={loc} onChange={(e) => setLoc(e.target.value)} /></label><label className="block"><span className="label">Proveedor (texto)</span><input className="input" value={sup} onChange={(e) => setSup(e.target.value)} /></label></div>
        <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" disabled={pending || !mid} data-testid="spool-save" onClick={() => run(() => addSpoolAction({ materialId: mid, initialG: g, tareG: tare, unitCost: cost, lot, location: loc, supplierText: sup, count: n }), { ok: 'Entrada registrada', onOk: () => setOpen(false) })}>Registrar</button></div></div>
    </Modal></>);
}

export function WeighForm({ id, tare, remaining }: { id: string; tare: number; remaining: number }) {
  const { run, pending } = useAction(); const [gross, setGross] = useState(Math.round(remaining + tare));
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => weighSpoolAction(id, gross), { onOk: (d) => { /* aviso en toast */ } , ok: 'Pesaje registrado' }); }}>
      <label className="block"><span className="label">Peso en la balanza (bruto, g)</span><input type="number" min={0} inputMode="numeric" className="input text-lg tabular" value={gross} onChange={(e) => setGross(+e.target.value || 0)} data-testid="weigh-gross" /></label>
      <p className="text-xs muted">Se resta la tara ({tare} g): quedarán <b data-testid="weigh-net">{Math.max(0, gross - tare)} g</b> netos.</p>
      <button className="btn-primary w-full" disabled={pending} data-testid="weigh-save">Registrar pesaje</button>
    </form>
  );
}

export function SpoolEditor({ s: sp, machines }: { s: { id: string; location: string | null; machineId: string | null; slot: string | null; status: string; lastDriedAt: string | null }; machines: Array<{ id: string; name: string }> }) {
  const { run, pending } = useAction(); const [loc, setLoc] = useState(sp.location ?? ''); const [mid, setMid] = useState(sp.machineId ?? ''); const [slot, setSlot] = useState(sp.slot ?? ''); const [dried, setDried] = useState(sp.lastDriedAt ?? '');
  return (
    <div className="space-y-3">
      <label className="block"><span className="label">Ubicación</span><input className="input" value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Estante, caja seca…" /></label>
      <div className="grid grid-cols-2 gap-3"><label className="block"><span className="label">Cargada en máquina</span><select className="input" value={mid} onChange={(e) => setMid(e.target.value)}><option value="">— Ninguna —</option>{machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label className="block"><span className="label">Ranura (AMS)</span><input className="input" value={slot} onChange={(e) => setSlot(e.target.value)} placeholder="Ranura 2" /></label></div>
      <label className="block"><span className="label">Último secado</span><input type="date" className="input" value={dried} onChange={(e) => setDried(e.target.value)} /></label>
      <div className="flex flex-wrap gap-2"><button className="btn-primary" disabled={pending} onClick={() => run(() => updateSpoolAction(sp.id, mid ? { machineId: mid, slot, lastDriedAt: dried || null } : { location: loc, machineId: null, slot: slot || null, lastDriedAt: dried || null }), { ok: 'Bobina actualizada' })}>Guardar</button><button className="btn-ghost text-red-600" disabled={pending} onClick={() => run(() => updateSpoolAction(sp.id, { status: 'descartada' }), { ok: 'Bobina descartada' })}>Descartar</button></div>
    </div>
  );
}

export function ItemDialog({ item, trigger }: { item?: any; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false); const { run, pending } = useAction();
  const [v, setV] = useState({ category: item?.category ?? 'insumo', sku: item?.sku ?? '', name: item?.name ?? '', unit: item?.unit ?? 'un', stock: item?.stock ?? 0, minStock: item?.minStock ?? 0, unitCost: item?.unitCost ?? 0, supplierText: item?.supplierText ?? '', location: item?.location ?? '' });
  const f = (k: string) => (e: React.ChangeEvent<any>) => setV({ ...v, [k]: e.target.type === 'number' ? +e.target.value : e.target.value });
  return (<><span onClick={() => setOpen(true)} className="inline-block">{trigger}</span>
    <Modal open={open} onClose={() => setOpen(false)} title={item ? 'Editar ítem' : 'Nuevo ítem'}>
      <form className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); run(() => saveItemAction({ id: item?.id, ...v }), { ok: 'Guardado', onOk: () => setOpen(false) }); }}>
        <label className="block col-span-2"><span className="label">Nombre *</span><input className="input" required value={v.name} onChange={f('name')} /></label>
        <label className="block"><span className="label">Categoría</span><select className="input" value={v.category} onChange={f('category')}><option value="repuesto">Repuesto</option><option value="insumo">Insumo de post-proceso</option><option value="embalaje">Embalaje</option></select></label><label className="block"><span className="label">SKU</span><input className="input" value={v.sku} onChange={f('sku')} /></label>
        {!item && <label className="block"><span className="label">Stock inicial</span><input type="number" className="input" value={v.stock} onChange={f('stock')} /></label>}<label className="block"><span className="label">Unidad</span><input className="input" value={v.unit} onChange={f('unit')} /></label>
        <label className="block"><span className="label">Stock mínimo</span><input type="number" className="input" value={v.minStock} onChange={f('minStock')} /></label><label className="block"><span className="label">Costo unitario ($)</span><input type="number" className="input" value={v.unitCost} onChange={f('unitCost')} /></label>
        <label className="block"><span className="label">Proveedor (texto)</span><input className="input" value={v.supplierText} onChange={f('supplierText')} /></label><label className="block"><span className="label">Ubicación</span><input className="input" value={v.location} onChange={f('location')} /></label>
        <div className="col-span-2 flex justify-end"><button className="btn-primary" disabled={pending}>Guardar</button></div></form></Modal></>);
}

export function ItemMove({ id, name, unit }: { id: string; name: string; unit: string }) {
  const [open, setOpen] = useState(false); const { run, pending } = useAction(); const [kind, setKind] = useState<'entrada' | 'consumo' | 'ajuste' | 'descarte'>('entrada'); const [qty, setQty] = useState(1); const [cost, setCost] = useState(0); const [note, setNote] = useState('');
  return (<><button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>Mover</button>
    <Modal open={open} onClose={() => setOpen(false)} title={`Movimiento de ${name}`}><div className="space-y-3">
      <select className="input" value={kind} onChange={(e) => setKind(e.target.value as any)} aria-label="Tipo"><option value="entrada">Entrada por compra</option><option value="consumo">Consumo</option><option value="ajuste">Ajuste (±)</option><option value="descarte">Descarte</option></select>
      <div className="grid grid-cols-2 gap-3"><label className="block"><span className="label">Cantidad ({unit})</span><input type="number" className="input" value={qty} onChange={(e) => setQty(+e.target.value)} /></label>{kind === 'entrada' && <label className="block"><span className="label">Costo unitario ($)</span><input type="number" className="input" value={cost || ''} onChange={(e) => setCost(+e.target.value || 0)} /></label>}</div>
      <input className="input" placeholder="Nota" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Nota" />
      <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" disabled={pending} onClick={() => run(() => moveItemAction({ itemId: id, qty, kind, unitCost: cost || undefined, note }), { ok: 'Movimiento registrado', onOk: () => setOpen(false) })}>Registrar</button></div></div></Modal></>);
}

/** Escaneo de QR con la cámara del celular (BarcodeDetector) o ingreso manual del código. */
export function QrScanner() {
  const router = useRouter(); const toast = useToast(); const video = useRef<HTMLVideoElement>(null); const [code, setCode] = useState(''); const [cam, setCam] = useState<'idle' | 'on' | 'unsupported'>('idle'); const [busy, setBusy] = useState(false);
  const go = async (c: string) => { if (busy) return; setBusy(true); const r = await findSpoolByCodeAction(c); setBusy(false); if (r.ok) router.push(`/inventario/bobinas/${r.data}`); else toast.push(r.error, 'err'); };
  useEffect(() => () => { (video.current?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop()); }, []);
  const start = async () => {
    const BD = (window as any).BarcodeDetector; if (!BD || !navigator.mediaDevices) { setCam('unsupported'); return; }
    try { const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); video.current!.srcObject = stream; await video.current!.play(); setCam('on'); const det = new BD({ formats: ['qr_code'] });
      const tick = async () => { if (!video.current?.srcObject) return; try { const r = await det.detect(video.current); if (r[0]?.rawValue) { (video.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop()); go(r[0].rawValue); return; } } catch { /* sigue */ } requestAnimationFrame(tick); }; tick();
    } catch { setCam('unsupported'); }
  };
  return (
    <div className="space-y-4 max-w-md">
      <div className="card overflow-hidden"><video ref={video} className={cam === 'on' ? 'w-full aspect-square object-cover bg-black' : 'hidden'} playsInline muted aria-label="Cámara para escanear QR" />{cam !== 'on' && <div className="p-6 text-center"><button className="btn-primary" onClick={start} data-testid="start-scan">📷 Activar cámara y escanear</button>{cam === 'unsupported' && <p className="text-xs muted mt-2">Este navegador no puede leer QR con la cámara. Escribe el código de la etiqueta abajo.</p>}</div>}</div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); go(code); }}><input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código de la bobina (ej. B-0003)" aria-label="Código de bobina" data-testid="scan-code" /><button className="btn-ghost shrink-0" disabled={!code.trim() || busy}>Abrir</button></form>
    </div>
  );
}
