'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { importCustomersAction, saveCustomerAction } from '@/actions/customers';
import { Modal, useAction, useToast } from './client';
import { useT } from '@/i18n/client';

export function CustomerForm({ c, priceLists }: { c?: { id: string; type: string; name: string; phone: string | null; email: string | null; taxId: string | null; priceListId: string | null; photoConsent: string; tags: string[]; notes: string | null; depositPct: number | null; addresses: Array<{ label: string; text: string }> }; priceLists: Array<{ id: string; name: string; adjustPct: number }> }) {
  const t = useT();
  const { run, pending } = useAction(); const router = useRouter();
  const [v, setV] = useState({ type: c?.type ?? 'particular', name: c?.name ?? '', phone: c?.phone ?? '', email: c?.email ?? '', taxId: c?.taxId ?? '', priceListId: c?.priceListId ?? '', photoConsent: c?.photoConsent ?? 'unknown', tags: (c?.tags ?? []).join(', '), notes: c?.notes ?? '', depositPct: c?.depositPct != null ? String(c.depositPct) : '', address: c?.addresses?.[0]?.text ?? '' });
  const f = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form className="grid sm:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); run(() => saveCustomerAction({ id: c?.id, type: v.type, name: v.name, phone: v.phone, email: v.email, taxId: v.taxId, priceListId: v.priceListId || null, photoConsent: v.photoConsent, tags: v.tags.split(',').map((tt) => tt.trim()).filter(Boolean), notes: v.notes, depositPct: v.depositPct ? +v.depositPct : null, addresses: v.address ? [{ label: 'Despacho', text: v.address }] : [] }), { ok: t('customers.customerSaved2'), onOk: (id) => { if (!c) router.push(`/clientes/${id}`); } }); }}>
      <label className="block sm:col-span-2"><span className="label">{t('customers.nameOrLegalName')}</span><input className="input" required value={v.name} onChange={f('name')} data-testid="cust-name" /></label>
      <label className="block"><span className="label">{t('common.typeLabel')}</span><select className="input" value={v.type} onChange={f('type')}><option value="particular">{t('customers.individual')}</option><option value="empresa">{t('customers.company')}</option><option value="revendedor">{t('customers.reseller')}</option></select></label>
      <label className="block"><span className="label">{t('customers.phoneWhatsapp')}</span><input className="input" inputMode="tel" value={v.phone} onChange={f('phone')} /></label>
      <label className="block"><span className="label">{t('customers.email')}</span><input className="input" type="email" value={v.email} onChange={f('email')} /></label>
      <label className="block"><span className="label">{t('customers.taxId')}</span><input className="input" value={v.taxId} onChange={f('taxId')} /></label>
      <label className="block"><span className="label">{t('customers.priceList')}</span><select className="input" value={v.priceListId} onChange={f('priceListId')}><option value="">{t('customers.none')}</option>{priceLists.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.adjustPct > 0 ? '+' : ''}{p.adjustPct}%)</option>)}</select></label>
      <label className="block"><span className="label">{t('customers.requiredDeposit')}</span><input className="input" type="number" min={0} max={100} value={v.depositPct} onChange={f('depositPct')} placeholder={t('customers.useTheOneFromSettings')} /></label>
      <label className="block"><span className="label">{t('customers.useOfPhotosInPosts')}</span><select className="input" value={v.photoConsent} onChange={f('photoConsent')} data-testid="cust-consent"><option value="unknown">{t('customers.notSetInternalUseOnly')}</option><option value="yes">{t('common.yesLabel')}</option><option value="no_brand">{t('customers.yesWithoutTheCustomerS')}</option><option value="no">{t('customers.noLabel')}</option></select></label>
      <label className="block"><span className="label">{t('common.tags')}</span><input className="input" value={v.tags} onChange={f('tags')} placeholder={t('customers.makerUniversity')} /></label>
      <label className="block sm:col-span-2"><span className="label">{t('customers.shippingAddress')}</span><input className="input" value={v.address} onChange={f('address')} /></label>
      <label className="block sm:col-span-2"><span className="label">{t('customers.internalNotes')}</span><textarea className="input h-20" value={v.notes} onChange={f('notes')} /></label>
      <div className="sm:col-span-2 flex justify-end"><button className="btn-primary" disabled={pending} data-testid="cust-save">{t('customers.saveCustomer')}</button></div>
    </form>
  );
}

export function ImportCustomers() {
  const t = useT();
  const [open, setOpen] = useState(false); const [csv, setCsv] = useState(''); const { run, pending } = useAction(); const toast = useToast();
  return (<>
    <button className="btn-ghost" onClick={() => setOpen(true)}>{t('customers.importCsv')}</button>
    <Modal open={open} onClose={() => setOpen(false)} title={t('customers.importCustomersFromCsv')}>
      <p className="text-sm muted mb-2">{t('customers.csvColumns')} <code>nombre, telefono, email, rut, tipo, etiquetas</code>. {t('customers.csvDuplicates')}</p>
      <input type="file" accept=".csv,text/csv" aria-label={t('customers.csvFile')} onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); }} />
      <textarea className="input font-mono text-xs h-32 mt-2" value={csv} onChange={(e) => setCsv(e.target.value)} aria-label={t('customers.csvContent')} placeholder="nombre,telefono,email" />
      <div className="flex justify-end gap-2 mt-3"><button className="btn-ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button><button className="btn-primary" disabled={pending || !csv.trim()} onClick={() => run(() => importCustomersAction(csv), { onOk: (d) => { toast.push(t('customers.importedSkipped2', { created: d.created, skipped: d.skipped })); setOpen(false); } })}>{t('customers.importLabel')}</button></div>
    </Modal></>);
}
