'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { approveQuoteAction, newVersionAction, rejectQuoteAction, sendQuoteAction } from '@/actions/quotes';
import { CopyButton, Modal, useAction } from './client';
import { sources } from '@/lib/format';
import { useT } from '@/i18n/client';
import { tOr } from '@/i18n/translate';

export function QuoteActions({ id, status, canEdit, canOrder, msg, wa, defaultBy, depositPct, total }: { id: string; status: string; canEdit: boolean; canOrder: boolean; msg: string; wa: string; defaultBy: string; depositPct: number; total: number }) {
  const t = useT();
  const { run, pending } = useAction(); const router = useRouter();
  const [ap, setAp] = useState(false); const [rj, setRj] = useState(false);
  const [by, setBy] = useState(defaultBy); const [channel, setChannel] = useState('whatsapp'); const [dep, setDep] = useState(Math.round(total * depositPct / 100)); const [method, setMethod] = useState('transferencia'); const [due, setDue] = useState(''); const [plan, setPlan] = useState(true); const [reason, setReason] = useState('');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a className="btn-ghost" href={`/api/quotes/${id}/pdf`} data-testid="quote-pdf">{t('quotes.pdf')}</a>
      <CopyButton text={msg} label={t('quotes.copyMessage')} className="btn-ghost" />
      <a className="btn-ghost" href={wa} target="_blank" rel="noopener noreferrer">{t('quotes.whatsapp')}</a>
      {canEdit && status === 'borrador' && <button className="btn-ghost" disabled={pending} onClick={() => run(() => sendQuoteAction(id), { ok: t('quotes.markedAsSentPricesAnd2') })} data-testid="quote-send">{t('quotes.markAsSent')}</button>}
      {canEdit && ['borrador', 'enviado', 'vencido'].includes(status) && canOrder && <button className="btn-primary" onClick={() => setAp(true)} data-testid="quote-approve">{t('quotes.theCustomerAccepted')}</button>}
      {canEdit && ['enviado', 'vencido', 'rechazado', 'aprobado'].includes(status) && <button className="btn-ghost" disabled={pending} onClick={() => run(() => newVersionAction(id, false), { ok: t('quotes.newVersionCreated2'), onOk: (nid) => router.push(`/presupuestos/${nid}`) })} data-testid="quote-newversion">{t('quotes.newVersion')}</button>}
      {canEdit && status === 'vencido' && <button className="btn-ghost" disabled={pending} onClick={() => run(() => newVersionAction(id, true), { ok: t('quotes.reactivatedWithCurrentRates2'), onOk: (nid) => router.push(`/presupuestos/${nid}`) })}>{t('quotes.reactivateWithCurrentRates')}</button>}
      {canEdit && ['enviado', 'vencido'].includes(status) && <button className="btn-ghost text-red-600 dark:text-red-400" onClick={() => setRj(true)}>{t('quotes.rejected')}</button>}
      <Modal open={ap} onClose={() => setAp(false)} title={t('quotes.registerCustomerApproval')}>
        <div className="space-y-3">
          <p className="text-sm muted">{t('quotes.approvalIsRecordedManuallyThe')}</p>
          <div className="grid grid-cols-2 gap-3"><label className="block"><span className="label">{t('quotes.approvedBy')}</span><input className="input" value={by} onChange={(e) => setBy(e.target.value)} data-testid="approve-by" /></label>
            <label className="block"><span className="label">{t('quotes.approvalChannel')}</span><select className="input" value={channel} onChange={(e) => setChannel(e.target.value)}>{Object.entries(sources(t)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="block"><span className="label">{t('quotes.depositReceived')}</span><input type="number" min={0} className="input" value={dep || ''} onChange={(e) => setDep(+e.target.value || 0)} data-testid="approve-deposit" /></label>
            <label className="block"><span className="label">{t('common.method')}</span><select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>{['transferencia', 'efectivo', 'tarjeta', 'otro'].map((m) => <option key={m} value={m}>{tOr(t, `payMethod.${m}`, m)}</option>)}</select></label>
            <label className="block col-span-2"><span className="label">{t('quotes.committedDate')}</span><input type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} /></label></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={plan} onChange={(e) => setPlan(e.target.checked)} /> {t('quotes.sendToProductionNowCreate')}</label>
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setAp(false)}>{t('common.cancel')}</button><button className="btn-primary" disabled={pending} data-testid="approve-confirm" onClick={() => run(() => approveQuoteAction(id, { by, channel, depositAmount: dep, depositMethod: method, dueDate: due || null, plan }), { ok: t('quotes.orderCreated2'), onOk: (oid) => router.push(`/pedidos/${oid}`) })}>{t('quotes.createOrder')}</button></div>
        </div>
      </Modal>
      <Modal open={rj} onClose={() => setRj(false)} title={t('quotes.quoteRejected')}>
        <label className="block"><span className="label">{t('quotes.reasonForSalesStatistics')}</span><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('quotes.priceLeadTimeFoundAnother')} /></label>
        <div className="flex justify-end gap-2 mt-3"><button className="btn-ghost" onClick={() => setRj(false)}>{t('common.cancel')}</button><button className="btn-danger" disabled={pending} onClick={() => run(() => rejectQuoteAction(id, reason || t('quotes.noReason2')), { ok: t('quotes.recorded2'), onOk: () => setRj(false) })}>{t('quotes.markAsRejected')}</button></div>
      </Modal>
    </div>
  );
}
