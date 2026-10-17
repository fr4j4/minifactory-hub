'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { approveQuoteAction, newVersionAction, previewRecalcAction, rejectQuoteAction, sendQuoteAction } from '@/actions/quotes';
import { CopyButton, Modal, useAction } from './client';
import { money, sources } from '@/lib/format';
import { useT } from '@/i18n/client';
import { tOr } from '@/i18n/translate';
import { DateInput } from '@/components/date-input';
import { Icon } from '@/components/shell';

/** El editor de borrador de la misma página se registra aquí: antes de aprobar guarda lo pendiente y entrega el total vigente (null si no pudo guardar). */
export const draftFlush: { current: null | (() => Promise<number | null>) } = { current: null };

export function QuoteActions({ id, status, canEdit, canOrder, msg, wa, defaultBy, depositPct, total }: { id: string; status: string; canEdit: boolean; canOrder: boolean; msg: string; wa: string; defaultBy: string; depositPct: number; total: number }) {
  const t = useT();
  const { run, pending } = useAction(); const router = useRouter();
  const [ap, setAp] = useState(false); const [rj, setRj] = useState(false);
  const [by, setBy] = useState(defaultBy); const [channel, setChannel] = useState('whatsapp'); const [dep, setDep] = useState(Math.round(total * depositPct / 100)); const [method, setMethod] = useState('transferencia'); const [due, setDue] = useState(''); const [plan, setPlan] = useState(true); const [reason, setReason] = useState('');
  const [liveTotal, setLiveTotal] = useState<number | null>(null); const shown = liveTotal ?? total;
  // mientras se guarda el borrador el botón queda deshabilitado; el abono solo se recalcula si cambió el total
  const [opening, setOpening] = useState(false);
  const openApprove = async () => {
    if (draftFlush.current) {
      setOpening(true);
      const tot = await draftFlush.current().finally(() => setOpening(false));
      if (tot == null) return;
      if (tot !== shown) { setLiveTotal(tot); setDep(Math.round(tot * depositPct / 100)); }
    }
    setAp(true);
  };
  const [rc, setRc] = useState<{ lines: Array<{ id: string; description: string; qty: number; oldUnit: number; newUnit: number }>; oldTotal: number; newTotal: number; delta: number } | null>(null);
  const openRecalc = async () => { const r = await previewRecalcAction(id); if (r.ok && r.data) setRc(r.data); else run(async () => r); };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a className="btn-ghost" href={`/api/quotes/${id}/pdf`} data-testid="quote-pdf"><Icon name="download" className="h-4 w-4" />{t('quotes.pdf')}</a>
      <CopyButton text={msg} label={t('quotes.copyMessage')} className="btn-ghost" />
      <a className="btn-ghost" href={wa} target="_blank" rel="noopener noreferrer">{t('quotes.whatsapp')}</a>
      {canEdit && status === 'borrador' && <button className="btn-ghost" disabled={pending} onClick={() => run(() => sendQuoteAction(id), { ok: t('quotes.markedAsSentPricesAnd2') })} data-testid="quote-send">{t('quotes.markAsSent')}</button>}
      {canEdit && ['borrador', 'enviado', 'vencido'].includes(status) && canOrder && <button className="btn-primary" disabled={pending || opening} aria-busy={opening} onClick={openApprove} data-testid="quote-approve">{opening ? t('common.saving') : t('quotes.theCustomerAccepted')}</button>}
      {canEdit && ['enviado', 'vencido', 'rechazado', 'aprobado'].includes(status) && <button className="btn-ghost" disabled={pending} onClick={() => run(() => newVersionAction(id, false), { ok: t('quotes.newVersionCreated2'), onOk: (nid) => router.push(`/presupuestos/${nid}`) })} data-testid="quote-newversion">{t('quotes.newVersion')}</button>}
      {canEdit && ['enviado', 'rechazado', 'aprobado'].includes(status) && <button className="btn-ghost" onClick={openRecalc} data-testid="quote-recalc">{t('quotes.recalcCurrent')}</button>}
      {canEdit && status === 'vencido' && <button className="btn-ghost" disabled={pending} onClick={() => run(() => newVersionAction(id, true), { ok: t('quotes.reactivatedWithCurrentRates2'), onOk: (nid) => router.push(`/presupuestos/${nid}`) })}>{t('quotes.reactivateWithCurrentRates')}</button>}
      {canEdit && ['enviado', 'vencido'].includes(status) && <button className="btn-ghost text-danger" onClick={() => setRj(true)}>{t('quotes.rejected')}</button>}
      <Modal open={!!rc} onClose={() => setRc(null)} title={t('quotes.recalcTitle')} wide>
        {rc && <div className="space-y-3 text-sm" data-testid="recalc-preview">
          <p className="muted">{t('quotes.recalcHint')}</p>
          <table className="w-full"><thead><tr><th className="th">{t('quotes.recalcLine')}</th><th className="th text-right">{t('quotes.recalcBefore')}</th><th className="th text-right">{t('quotes.recalcNow')}</th></tr></thead>
            <tbody>{rc.lines.map((l) => <tr key={l.id}><td className="td">{l.description} × {l.qty}</td><td className="td text-right tabular">{money(l.oldUnit * l.qty)}</td><td className="td text-right tabular">{money(l.newUnit * l.qty)}</td></tr>)}</tbody>
            <tfoot><tr><td className="td font-semibold">{t('quotes.recalcTotal')}</td><td className="td text-right tabular font-semibold">{money(rc.oldTotal)}</td><td className="td text-right tabular font-semibold">{money(rc.newTotal)} <span className="muted font-normal">({rc.delta >= 0 ? '+' : '−'}{money(Math.abs(rc.delta))})</span></td></tr></tfoot></table>
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setRc(null)}>{t('common.cancel')}</button>
            <button className="btn-primary" disabled={pending} data-testid="recalc-apply" onClick={() => run(() => newVersionAction(id, true), { ok: t('quotes.reactivatedWithCurrentRates2'), onOk: (nid) => { setRc(null); router.push(`/presupuestos/${nid}`); } })}>{t('quotes.recalcApply')}</button></div>
        </div>}
      </Modal>
      <Modal open={ap} onClose={() => setAp(false)} title={t('quotes.registerCustomerApproval')}>
        <div className="space-y-3">
          <p className="text-sm muted">{t('quotes.approvalIsRecordedManuallyThe')}</p>
          <div className="grid grid-cols-2 gap-3"><label className="block"><span className="label">{t('quotes.approvedBy')}</span><input className="input" value={by} onChange={(e) => setBy(e.target.value)} data-testid="approve-by" /></label>
            <label className="block"><span className="label">{t('quotes.approvalChannel')}</span><select className="input" value={channel} onChange={(e) => setChannel(e.target.value)}>{Object.entries(sources(t)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="block"><span className="label">{t('quotes.depositReceived')}</span><input type="number" min={0} className="input" value={dep || ''} onChange={(e) => setDep(+e.target.value || 0)} data-testid="approve-deposit" /></label>
            <label className="block"><span className="label">{t('common.method')}</span><select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>{['transferencia', 'efectivo', 'tarjeta', 'otro'].map((m) => <option key={m} value={m}>{tOr(t, `payMethod.${m}`, m)}</option>)}</select></label>
            <label className="block col-span-2"><span className="label">{t('quotes.committedDate')}</span><DateInput value={due} onChange={setDue} /></label></div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--bg)]/50 p-3 text-sm" data-testid="approve-summary" aria-live="polite">{t('quotes.approveSummary', { total: money(shown), deposit: money(dep), balance: money(Math.max(0, shown - dep)) })} {plan ? t('quotes.approveSummaryPlan') : t('quotes.approveSummaryNoPlan')}</div>
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
