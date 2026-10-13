'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addContactAction, addPaymentAction, cancelOrderAction, planProductionAction, promoteCustomerAction, setOrderStatusAction } from '@/actions/orders';
import { CopyButton, Modal, useAction } from './client';
import { sources } from '@/lib/format';
import { useT } from '@/i18n/client';
import { tOr } from '@/i18n/translate';

export function OrderActions({ id, status, canPlan, canReady, hasStockLines, shipMethod, tracking, msgReady, msgShipped, wa, waShipped, canEdit, occasional }: { id: string; status: string; canPlan: boolean; canReady: boolean; hasStockLines: boolean; shipMethod: string | null; tracking: string | null; msgReady: string; msgShipped: string; wa: string; waShipped: string; canEdit: boolean; occasional: boolean }) {
  const t = useT();
  const { run, pending } = useAction(); const [del, setDel] = useState(false); const [can, setCan] = useState(false); const [trk, setTrk] = useState(tracking ?? ''); const [m, setM] = useState(shipMethod ?? 'retiro'); const [reason, setReason] = useState('');
  const closed = status === 'entregado' || status === 'cancelado';
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canEdit && !closed && canPlan && <button className="btn-primary" disabled={pending} onClick={() => run(() => planProductionAction(id), { ok: t('orders.jobsCreatedInTheQueue2') })} data-testid="plan-production">{t('orders.sendToProduction')}</button>}
      {canEdit && !closed && canReady && status !== 'listo' && <button className="btn-ghost" disabled={pending} onClick={() => run(() => setOrderStatusAction(id, 'listo'), { ok: t('orders.orderReady2') })} data-testid="mark-ready">{t('orders.markReady')}</button>}
      {canEdit && status === 'listo' && <button className="btn-primary" onClick={() => setDel(true)} data-testid="mark-delivered">{t('orders.deliver')}</button>}
      {status === 'listo' && <><CopyButton text={msgReady} label={t('orders.copyMessage')} className="btn-ghost" /><a className="btn-ghost" href={wa} target="_blank" rel="noopener noreferrer">{t('orders.notifyViaWhatsapp')}</a></>}
      {status === 'entregado' && tracking && <><CopyButton text={msgShipped} label={t('orders.copyShippingMessage')} className="btn-ghost" /><a className="btn-ghost" href={waShipped} target="_blank" rel="noopener noreferrer">{t('orders.whatsapp')}</a></>}
      {canEdit && occasional && <button className="btn-ghost" onClick={() => run(() => promoteCustomerAction(id), { ok: t('orders.customerRecordCreated2') })}>{t('orders.createCustomerRecord')}</button>}
      {canEdit && !closed && <button className="btn-ghost text-red-600 dark:text-red-400" onClick={() => setCan(true)}>{t('orders.cancelOrder')}</button>}
      <Modal open={del} onClose={() => setDel(false)} title={t('orders.deliverOrder')}>
        <div className="space-y-3"><div className="flex gap-2">{['retiro', 'despacho'].map((x) => <button key={x} className={`btn-ghost flex-1 ${m === x ? '!bg-[var(--panel)] !text-[var(--panel-ink)] dark:!bg-slate-700' : ''}`} onClick={() => setM(x)}>{x === 'retiro' ? t('common.workshopPickup') : t('common.shipping')}</button>)}</div>
          {m === 'despacho' && <label className="block"><span className="label">{t('orders.trackingNumber')}</span><input className="input" value={trk} onChange={(e) => setTrk(e.target.value)} data-testid="tracking" /></label>}
          {hasStockLines && <p className="text-xs muted">{t('orders.reservedUnitsOfCatalogProducts')}</p>}
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setDel(false)}>{t('common.cancel')}</button><button className="btn-primary" disabled={pending} data-testid="deliver-confirm" onClick={() => run(() => setOrderStatusAction(id, 'entregado', { tracking: trk, shipMethod: m }), { ok: t('orders.orderDelivered2'), onOk: () => setDel(false) })}>{t('orders.confirmDelivery')}</button></div></div>
      </Modal>
      <Modal open={can} onClose={() => setCan(false)} title={t('orders.cancelOrder')}>
        <p className="text-sm muted mb-3">{t('orders.queuedJobsAreCancelledAnd')}</p>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('orders.reasonForCancellation')} aria-label={t('common.reason')} />
        <div className="flex justify-end gap-2 mt-3"><button className="btn-ghost" onClick={() => setCan(false)}>{t('common.back')}</button><button className="btn-danger" disabled={pending || !reason.trim()} onClick={() => run(() => cancelOrderAction(id, reason), { ok: t('orders.orderCancelled3'), onOk: () => setCan(false) })}>{t('orders.cancelOrder')}</button></div>
      </Modal>
    </div>
  );
}

export function PaymentButton({ orderId, saleId, balance }: { orderId?: string; saleId?: string; balance: number }) {
  const t = useT();
  const { run, pending } = useAction(); const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(balance); const [method, setMethod] = useState('transferencia'); const [note, setNote] = useState(''); const [dt, setDt] = useState(''); const [folio, setFolio] = useState('');
  return (
    <>
      <button className="btn-ghost btn-sm" onClick={() => { setAmount(balance); setOpen(true); }} data-testid="add-payment">{t('orders.registerPayment')}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('orders.registerPayment2')}>
        <div className="space-y-3"><div className="grid grid-cols-2 gap-3"><label className="block"><span className="label">{t('orders.amount')}</span><input type="number" min={1} className="input" value={amount || ''} onChange={(e) => setAmount(+e.target.value || 0)} data-testid="pay-amount" /></label>
          <label className="block"><span className="label">{t('common.method')}</span><select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>{['transferencia', 'efectivo', 'tarjeta', 'marketplace', 'otro'].map((x) => <option key={x} value={x}>{tOr(t, `payMethod.${x}`, x)}</option>)}</select></label></div>
          <div className="grid grid-cols-2 gap-3"><label className="block"><span className="label">{t('orders.taxDocumentOptional')}</span><select className="input" value={dt} onChange={(e) => setDt(e.target.value)}><option value="">{t('orders.none')}</option><option value="boleta">{t('orders.receipt')}</option><option value="factura">{t('orders.invoice')}</option></select></label>{dt && <label className="block"><span className="label">{t('orders.documentNo')}</span><input className="input" value={folio} onChange={(e) => setFolio(e.target.value)} /></label>}</div>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('orders.noteEG50Deposit')} aria-label={t('orders.paymentNote')} />
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button><button className="btn-primary" disabled={pending || amount <= 0} data-testid="pay-save" onClick={() => run(() => addPaymentAction({ orderId, saleId, amount, method, note, taxDocType: dt || undefined, taxDocFolio: folio || undefined }), { ok: t('orders.paymentRecorded2'), onOk: () => setOpen(false) })}>{t('common.register')}</button></div></div>
      </Modal>
    </>
  );
}

export function ContactForm({ orderId, customerId }: { orderId: string; customerId: string | null }) {
  const t = useT();
  const { run, pending } = useAction(); const [ch, setCh] = useState('whatsapp'); const [txt, setTxt] = useState('');
  return (
    <form className="flex flex-col sm:flex-row gap-2" onSubmit={(e) => { e.preventDefault(); run(() => addContactAction({ orderId, customerId, channel: ch, summary: txt }), { ok: t('orders.contactLogged2'), onOk: () => setTxt('') }); }}>
      <select className="input sm:!w-40" value={ch} onChange={(e) => setCh(e.target.value)} aria-label={t('common.channel')}>{Object.entries(sources(t)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <input className="input" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder={t('orders.eGCustomerWasTold')} aria-label={t('orders.contactSummary')} data-testid="contact-text" />
      <button className="btn-ghost shrink-0" disabled={pending || !txt.trim()} data-testid="contact-add">{t('orders.log')}</button>
    </form>
  );
}
