'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { moveItemAction, resolveScanAction, saveItemAction, saveMaterialAction, updateSpoolAction, weighSpoolAction } from '@/actions/inventory';
import { Modal, useAction, useToast } from './client';
import { useT } from '@/i18n/client';
import { money } from '@/lib/format';
import { DateInput } from '@/components/date-input';
import { Icon } from '@/components/shell';
import { CatalogInfo } from '@/components/catalog-info';

export function MaterialForm({ m, profiles, trigger }: { m?: any; profiles: Array<{ id: string; name: string }>; trigger: React.ReactNode }) {
  const t = useT();
  const [open, setOpen] = useState(false); const { run, pending } = useAction();
  // el estado se rearma al abrir: si no, «Nuevo» mostraba lo del último guardado y Cancelar no descartaba
  const init = () => ({ tech: m?.tech ?? 'fdm', manufacturer: m?.manufacturer ?? '', line: m?.line ?? '', type: m?.type ?? 'PLA', colorName: m?.colorName ?? '', hex: m?.hex ?? '#888888', diameter: m?.diameter ?? 1.75, density: m?.density ?? 1.24, costPerKg: m?.costPerKg ?? 0, stockMinG: m?.stockMinG ?? 1000, tempNozzle: m?.tempNozzle ?? '', tempBed: m?.tempBed ?? '', supplierText: m?.supplierText ?? '', filamentProfileId: m?.filamentProfileId ?? '', riskFactor: m?.riskFactor != null ? String(m.riskFactor) : '', wastePct: m?.wastePct != null ? String(m.wastePct) : '' });
  const [v, setV] = useState(init);
  const f = (k: string) => (e: React.ChangeEvent<any>) => setV({ ...v, [k]: e.target.type === 'number' ? +e.target.value : e.target.value });
  return (
    <>
      <span onClick={() => { setV(init()); setOpen(true); }} className="inline-block">{trigger}</span>
      <Modal open={open} onClose={() => setOpen(false)} title={m ? t('inventory.editMaterial') : t('inventory.newMaterial')} wide>
        <form className="grid sm:grid-cols-3 gap-3" onSubmit={(e) => { e.preventDefault(); run(() => saveMaterialAction({ id: m?.id, ...v, riskFactor: v.riskFactor === '' ? null : +v.riskFactor, wastePct: v.wastePct === '' ? null : +v.wastePct }), { ok: t('inventory.materialSaved2'), onOk: () => setOpen(false) }); }}>
          <label className="block"><span className="label">{t('inventory.technology')}</span><select className="input" value={v.tech} onChange={f('tech')}><option value="fdm">{t('inventory.filamentFdm')}</option><option value="resina">{t('inventory.resin')}</option></select></label>
          <label className="block"><span className="label">{t('inventory.manufacturer')}</span><input className="input" value={v.manufacturer} onChange={f('manufacturer')} /></label><label className="block"><span className="label">{t('inventory.productLine')}</span><input className="input" value={v.line} onChange={f('line')} /></label>
          <label className="block"><span className="label">{t('inventory.material2')}</span><input className="input" required value={v.type} onChange={f('type')} list="mat-types" data-testid="mat-type" /><datalist id="mat-types">{['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'PA', 'PC', t('inventory.standardResin'), t('inventory.absLikeResin'), t('inventory.flexibleResin')].map((x) => <option key={x} value={x} />)}</datalist></label>
          <label className="block"><span className="label">{t('inventory.color')}</span><input className="input" required value={v.colorName} onChange={f('colorName')} data-testid="mat-color" /></label><label className="block"><span className="label">{t('inventory.swatch')}</span><input type="color" className="input !p-1" value={v.hex} onChange={f('hex')} /></label>
          <label className="block"><span className="label">{t('inventory.densityGCm')}</span><input type="number" step="0.01" className="input" value={v.density} onChange={f('density')} /></label><label className="block"><span className="label">{t('inventory.costPerKg')}</span><input type="number" className="input" value={v.costPerKg} onChange={f('costPerKg')} data-testid="mat-cost" />{v.tech === 'resina' && v.density > 0 && <span className="text-xs muted mt-1 block">{t('buy.perLiterHint', { cost: money(Math.round(v.costPerKg * v.density)) })}</span>}</label><label className="block"><span className="label">{t('inventory.minimumStockG')}</span><input type="number" className="input" value={v.stockMinG} onChange={f('stockMinG')} /></label>
          <label className="block"><span className="label">{t('inventory.nozzleTemp')}</span><input className="input" value={v.tempNozzle} onChange={f('tempNozzle')} placeholder="190–230" /></label><label className="block"><span className="label">{t('inventory.bedTemp')}</span><input className="input" value={v.tempBed} onChange={f('tempBed')} /></label><label className="block"><span className="label">{t('inventory.supplierText')}</span><input className="input" value={v.supplierText} onChange={f('supplierText')} /></label>
          <label className="block"><span className="label">{t('calc.mat.risk')}</span><input type="number" min={0} step="0.1" className="input" value={v.riskFactor} onChange={f('riskFactor')} placeholder="1" data-testid="mat-risk" /><span className="text-xs muted block mt-1">{t('calc.mat.riskHelp')}</span></label><label className="block"><span className="label">{t('calc.mat.waste')}</span><input type="number" min={0} max={100} step="0.1" className="input" value={v.wastePct} onChange={f('wastePct')} placeholder={t('calc.mat.useGlobal')} data-testid="mat-waste" /><span className="text-xs muted block mt-1">{t('calc.mat.wasteHelp')}</span></label><span className="hidden sm:block" />
          {m && (m.lineSpecs || m.traits?.length) && <div className="sm:col-span-3"><CatalogInfo specs={m.lineSpecs} traits={m.traits} /></div>}
          <div className="sm:col-span-3 flex justify-end"><button className="btn-primary" disabled={pending} data-testid="mat-save">{t('common.save')}</button></div>
        </form>
      </Modal>
    </>
  );
}

export function WeighForm({ id, tare, remaining }: { id: string; tare: number; remaining: number }) {
  const t = useT();
  const { run, pending } = useAction(); const [gross, setGross] = useState(Math.round(remaining + tare));
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => weighSpoolAction(id, gross), { onOk: (d) => { /* aviso en toast */ } , ok: t('inventory.weighingRecorded2') }); }}>
      <label className="block"><span className="label">{t('inventory.weightOnTheScaleGross')}</span><input type="number" min={0} inputMode="numeric" className="input text-lg tabular" value={gross} onChange={(e) => setGross(+e.target.value || 0)} data-testid="weigh-gross" /></label>
      <p className="text-xs muted">{t('inventory.tareNote', { tare })} <b data-testid="weigh-net">{Math.max(0, gross - tare)} g</b> {t('inventory.netWord')}.</p>
      <button className="btn-primary w-full" disabled={pending} data-testid="weigh-save">{t('inventory.recordWeighing')}</button>
    </form>
  );
}

export function SpoolEditor({ s: sp, machines }: { s: { id: string; location: string | null; machineId: string | null; slot: string | null; status: string; lastDriedAt: string | null }; machines: Array<{ id: string; name: string }> }) {
  const t = useT();
  const { run, pending } = useAction(); const [loc, setLoc] = useState(sp.location ?? ''); const [mid, setMid] = useState(sp.machineId ?? ''); const [slot, setSlot] = useState(sp.slot ?? ''); const [dried, setDried] = useState(sp.lastDriedAt ?? '');
  return (
    <div className="space-y-3">
      <label className="block"><span className="label">{t('common.location')}</span><input className="input" value={loc} onChange={(e) => setLoc(e.target.value)} placeholder={t('inventory.shelfDryBox')} /></label>
      <div className="grid grid-cols-2 gap-3"><label className="block"><span className="label">{t('inventory.loadedInMachine')}</span><select className="input" value={mid} onChange={(e) => setMid(e.target.value)}><option value="">{t('inventory.none')}</option>{machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label className="block"><span className="label">{t('inventory.slotAms')}</span><input className="input" value={slot} onChange={(e) => setSlot(e.target.value)} placeholder={t('inventory.slot2')} /></label></div>
      <label className="block"><span className="label">{t('inventory.lastDried')}</span><DateInput value={dried} onChange={setDried} /></label>
      <div className="flex flex-wrap gap-2"><button className="btn-primary" disabled={pending} onClick={() => run(() => updateSpoolAction(sp.id, mid ? { machineId: mid, slot, lastDriedAt: dried || null } : { location: loc, machineId: null, slot: slot || null, lastDriedAt: dried || null }), { ok: t('inventory.spoolUpdated2') })}>{t('common.save')}</button><button className="btn-ghost text-danger" disabled={pending} onClick={() => run(() => updateSpoolAction(sp.id, { status: 'descartada' }), { ok: t('inventory.spoolDiscarded2') })}>{t('inventory.discard')}</button></div>
    </div>
  );
}

export function ItemDialog({ item, trigger }: { item?: any; trigger: React.ReactNode }) {
  const t = useT();
  const [open, setOpen] = useState(false); const { run, pending } = useAction();
  const init = () => ({ category: item?.category ?? 'insumo', sku: item?.sku ?? '', name: item?.name ?? '', unit: item?.unit ?? 'un', stock: item?.stock ?? 0, minStock: item?.minStock ?? 0, unitCost: item?.unitCost ?? 0, supplierText: item?.supplierText ?? '', location: item?.location ?? '' });
  const [v, setV] = useState(init);
  const f = (k: string) => (e: React.ChangeEvent<any>) => setV({ ...v, [k]: e.target.type === 'number' ? +e.target.value : e.target.value });
  return (<><span onClick={() => { setV(init()); setOpen(true); }} className="inline-block">{trigger}</span>
    <Modal open={open} onClose={() => setOpen(false)} title={item ? t('inventory.editItem') : t('inventory.newItem')}>
      <form className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); run(() => saveItemAction({ id: item?.id, ...v }), { ok: t('inventory.saved2'), onOk: () => setOpen(false) }); }}>
        <label className="block col-span-2"><span className="label">{t('common.name2')}</span><input className="input" required value={v.name} onChange={f('name')} /></label>
        <label className="block"><span className="label">{t('common.category')}</span><select className="input" value={v.category} onChange={f('category')}><option value="repuesto">{t('inventory.sparePart')}</option><option value="insumo">{t('inventory.postProcessingSupply')}</option><option value="embalaje">{t('inventory.packaging')}</option></select></label><label className="block"><span className="label">{t('inventory.sku')}</span><input className="input" value={v.sku} onChange={f('sku')} /></label>
        {!item && <label className="block"><span className="label">{t('inventory.initialStock')}</span><input type="number" className="input" value={v.stock} onChange={f('stock')} /></label>}<label className="block"><span className="label">{t('inventory.unit')}</span><input className="input" value={v.unit} onChange={f('unit')} /></label>
        <label className="block"><span className="label">{t('inventory.minimumStock')}</span><input type="number" className="input" value={v.minStock} onChange={f('minStock')} /></label><label className="block"><span className="label">{t('inventory.unitCost2')}</span><input type="number" className="input" value={v.unitCost} onChange={f('unitCost')} /></label>
        <label className="block"><span className="label">{t('inventory.supplierText')}</span><input className="input" value={v.supplierText} onChange={f('supplierText')} /></label><label className="block"><span className="label">{t('common.location')}</span><input className="input" value={v.location} onChange={f('location')} /></label>
        <div className="col-span-2 flex justify-end"><button className="btn-primary" disabled={pending}>{t('common.save')}</button></div></form></Modal></>);
}

export function ItemMove({ id, name, unit }: { id: string; name: string; unit: string }) {
  const t = useT();
  const [open, setOpen] = useState(false); const { run, pending } = useAction(); const [kind, setKind] = useState<'entrada' | 'consumo' | 'ajuste' | 'descarte'>('entrada'); const [qty, setQty] = useState(1); const [cost, setCost] = useState(0); const [note, setNote] = useState('');
  return (<><button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>{t('inventory.move')}</button>
    <Modal open={open} onClose={() => setOpen(false)} title={t('inventory.movementOf', { name })}><div className="space-y-3">
      <select className="input" value={kind} onChange={(e) => setKind(e.target.value as any)} aria-label={t('common.typeLabel')}><option value="entrada">{t('inventory.purchaseReceipt2')}</option><option value="consumo">{t('inventory.consumption')}</option><option value="ajuste">{t('inventory.adjustment')}</option><option value="descarte">{t('inventory.disposal')}</option></select>
      <div className="grid grid-cols-2 gap-3"><label className="block"><span className="label">{t('inventory.quantityUnit', { unit })}</span><input type="number" className="input" value={qty} onChange={(e) => setQty(+e.target.value)} /></label>{kind === 'entrada' && <label className="block"><span className="label">{t('inventory.unitCost2')}</span><input type="number" className="input" value={cost || ''} onChange={(e) => setCost(+e.target.value || 0)} /></label>}</div>
      <input className="input" placeholder={t('inventory.note')} value={note} onChange={(e) => setNote(e.target.value)} aria-label={t('inventory.note')} />
      <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button><button className="btn-primary" disabled={pending} onClick={() => run(() => moveItemAction({ itemId: id, qty, kind, unitCost: cost || undefined, note }), { ok: t('inventory.movementRecorded2'), onOk: () => setOpen(false) })}>{t('common.register')}</button></div></div></Modal></>);
}

/** Escaneo de QR con la cámara del celular (BarcodeDetector) o ingreso manual del código. */
export function QrScanner() {
  const t = useT();
  const router = useRouter(); const toast = useToast(); const video = useRef<HTMLVideoElement>(null); const [code, setCode] = useState(''); const [cam, setCam] = useState<'idle' | 'on' | 'unsupported'>('idle'); const [busy, setBusy] = useState(false);
  const go = async (c: string) => { if (busy) return; setBusy(true); const r = await resolveScanAction(c); setBusy(false); if (r.ok) router.push((r.data as { href: string }).href); else toast.push(r.error, 'err'); };
  useEffect(() => () => { (video.current?.srcObject as MediaStream | null)?.getTracks().forEach((tt) => tt.stop()); }, []);
  const start = async () => {
    const BD = (window as any).BarcodeDetector; if (!BD || !navigator.mediaDevices) { setCam('unsupported'); return; }
    try { const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); video.current!.srcObject = stream; await video.current!.play(); setCam('on'); const det = new BD({ formats: ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e'] });
      const tick = async () => { if (!video.current?.srcObject) return; try { const r = await det.detect(video.current); if (r[0]?.rawValue) { (video.current.srcObject as MediaStream).getTracks().forEach((tt) => tt.stop()); go(r[0].rawValue); return; } } catch { /* sigue */ } requestAnimationFrame(tick); }; tick();
    } catch { setCam('unsupported'); }
  };
  return (
    <div className="space-y-4 max-w-md">
      <div className="card overflow-hidden"><video ref={video} className={cam === 'on' ? 'w-full aspect-square object-cover bg-black' : 'hidden'} playsInline muted aria-label={t('inventory.cameraForScanningQrCodes')} />{cam !== 'on' && <div className="p-6 text-center"><button className="btn-primary" onClick={start} data-testid="start-scan"><Icon name="camera" className="h-4 w-4" />{t('inventory.turnOnCameraAndScan')}</button>{cam === 'unsupported' && <p className="text-xs muted mt-2">{t('inventory.thisBrowserCannotReadQr')}</p>}</div>}</div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); go(code); }}><input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('inventory.spoolCodeEGB')} aria-label={t('inventory.spoolCode')} data-testid="scan-code" /><button className="btn-ghost shrink-0" disabled={!code.trim() || busy}>{t('inventory.open')}</button></form>
    </div>
  );
}
