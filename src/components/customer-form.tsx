'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { importCustomersAction, saveCustomerAction } from '@/actions/customers';
import { Modal, useAction, useToast } from './client';

export function CustomerForm({ c, priceLists }: { c?: { id: string; type: string; name: string; phone: string | null; email: string | null; taxId: string | null; priceListId: string | null; photoConsent: string; tags: string[]; notes: string | null; depositPct: number | null; addresses: Array<{ label: string; text: string }> }; priceLists: Array<{ id: string; name: string; adjustPct: number }> }) {
  const { run, pending } = useAction(); const router = useRouter();
  const [v, setV] = useState({ type: c?.type ?? 'particular', name: c?.name ?? '', phone: c?.phone ?? '', email: c?.email ?? '', taxId: c?.taxId ?? '', priceListId: c?.priceListId ?? '', photoConsent: c?.photoConsent ?? 'unknown', tags: (c?.tags ?? []).join(', '), notes: c?.notes ?? '', depositPct: c?.depositPct != null ? String(c.depositPct) : '', address: c?.addresses?.[0]?.text ?? '' });
  const f = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form className="grid sm:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); run(() => saveCustomerAction({ id: c?.id, type: v.type, name: v.name, phone: v.phone, email: v.email, taxId: v.taxId, priceListId: v.priceListId || null, photoConsent: v.photoConsent, tags: v.tags.split(',').map((t) => t.trim()).filter(Boolean), notes: v.notes, depositPct: v.depositPct ? +v.depositPct : null, addresses: v.address ? [{ label: 'Despacho', text: v.address }] : [] }), { ok: 'Cliente guardado', onOk: (id) => { if (!c) router.push(`/clientes/${id}`); } }); }}>
      <label className="block sm:col-span-2"><span className="label">Nombre o razón social *</span><input className="input" required value={v.name} onChange={f('name')} data-testid="cust-name" /></label>
      <label className="block"><span className="label">Tipo</span><select className="input" value={v.type} onChange={f('type')}><option value="particular">Particular</option><option value="empresa">Empresa</option><option value="revendedor">Revendedor</option></select></label>
      <label className="block"><span className="label">Teléfono / WhatsApp</span><input className="input" inputMode="tel" value={v.phone} onChange={f('phone')} /></label>
      <label className="block"><span className="label">Email</span><input className="input" type="email" value={v.email} onChange={f('email')} /></label>
      <label className="block"><span className="label">RUT / ID tributario</span><input className="input" value={v.taxId} onChange={f('taxId')} /></label>
      <label className="block"><span className="label">Lista de precios</span><select className="input" value={v.priceListId} onChange={f('priceListId')}><option value="">— Ninguna —</option>{priceLists.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.adjustPct > 0 ? '+' : ''}{p.adjustPct}%)</option>)}</select></label>
      <label className="block"><span className="label">Abono exigido (%)</span><input className="input" type="number" min={0} max={100} value={v.depositPct} onChange={f('depositPct')} placeholder="Usar el de la configuración" /></label>
      <label className="block"><span className="label">Uso de fotos en publicaciones</span><select className="input" value={v.photoConsent} onChange={f('photoConsent')} data-testid="cust-consent"><option value="unknown">Sin definir (solo uso interno)</option><option value="yes">Sí</option><option value="no_brand">Sí, sin marca del cliente</option><option value="no">No</option></select></label>
      <label className="block"><span className="label">Etiquetas</span><input className="input" value={v.tags} onChange={f('tags')} placeholder="maker, universidad…" /></label>
      <label className="block sm:col-span-2"><span className="label">Dirección de despacho</span><input className="input" value={v.address} onChange={f('address')} /></label>
      <label className="block sm:col-span-2"><span className="label">Notas internas</span><textarea className="input h-20" value={v.notes} onChange={f('notes')} /></label>
      <div className="sm:col-span-2 flex justify-end"><button className="btn-primary" disabled={pending} data-testid="cust-save">Guardar cliente</button></div>
    </form>
  );
}

export function ImportCustomers() {
  const [open, setOpen] = useState(false); const [csv, setCsv] = useState(''); const { run, pending } = useAction(); const toast = useToast();
  return (<>
    <button className="btn-ghost" onClick={() => setOpen(true)}>Importar CSV</button>
    <Modal open={open} onClose={() => setOpen(false)} title="Importar clientes desde CSV">
      <p className="text-sm muted mb-2">Columnas: <code>nombre, telefono, email, rut, tipo, etiquetas</code>. Los nombres repetidos se omiten.</p>
      <input type="file" accept=".csv,text/csv" aria-label="Archivo CSV" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); }} />
      <textarea className="input font-mono text-xs h-32 mt-2" value={csv} onChange={(e) => setCsv(e.target.value)} aria-label="Contenido CSV" placeholder="nombre,telefono,email" />
      <div className="flex justify-end gap-2 mt-3"><button className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" disabled={pending || !csv.trim()} onClick={() => run(() => importCustomersAction(csv), { onOk: (d) => { toast.push(`Importados ${d.created}, omitidos ${d.skipped}`); setOpen(false); } })}>Importar</button></div>
    </Modal></>);
}
