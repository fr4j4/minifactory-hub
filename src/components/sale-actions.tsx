'use client';
import { useState } from 'react';
import { setSaleStatusAction } from '@/actions/catalog';
import { Modal, useAction } from './client';
import { useT } from '@/i18n/client';

export function SaleActions({ id, status, canEdit }: { id: string; status: string; canEdit: boolean }) {
  const t = useT();
  const { run, pending } = useAction(); const [open, setOpen] = useState(false); const [reason, setReason] = useState(''); const [ret, setRet] = useState(true); const [trk, setTrk] = useState(''); const [ship, setShip] = useState(false);
  if (!canEdit || status === 'anulada') return null;
  return (
    <span className="inline-flex gap-1">
      {status === 'por_despachar' && <button className="btn-ghost btn-sm" onClick={() => setShip(true)} data-testid="sale-dispatch">{t('sales.ship')}</button>}
      {status === 'despachada' && <button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => setSaleStatusAction(id, 'entregada'), { ok: t('sales.markedAsDelivered2') })}>{t('sales.delivered')}</button>}
      <button className="btn-ghost btn-sm text-red-600 dark:text-red-400" onClick={() => setOpen(true)}>{t('sales.voidLabel')}</button>
      <Modal open={ship} onClose={() => setShip(false)} title={t('sales.shipSale')}><input className="input" placeholder={t('sales.trackingNumberOptional')} value={trk} onChange={(e) => setTrk(e.target.value)} aria-label={t('sales.tracking2')} /><div className="flex justify-end gap-2 mt-3"><button className="btn-ghost" onClick={() => setShip(false)}>{t('common.cancel')}</button><button className="btn-primary" disabled={pending} onClick={() => run(() => setSaleStatusAction(id, 'despachada', { tracking: trk }), { ok: t('sales.shipped2'), onOk: () => setShip(false) })}>{t('sales.ship')}</button></div></Modal>
      <Modal open={open} onClose={() => setOpen(false)} title={t('sales.voidSaleReturn')}>
        <div className="space-y-3"><input className="input" placeholder={t('sales.reasonRequired')} value={reason} onChange={(e) => setReason(e.target.value)} aria-label={t('common.reason')} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ret} onChange={(e) => setRet(e.target.checked)} /> {t('sales.thePartGoesBackTo')}</label>
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>{t('common.back')}</button><button className="btn-danger" disabled={pending || !reason.trim()} onClick={() => run(() => setSaleStatusAction(id, 'anulada', { reason, returnToStock: ret }), { ok: t('sales.saleVoided2'), onOk: () => setOpen(false) })}>{t('sales.voidLabel')}</button></div></div>
      </Modal>
    </span>
  );
}
