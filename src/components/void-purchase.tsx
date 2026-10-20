'use client';
import { useState } from 'react';
import { voidPurchaseAction } from '@/actions/purchases';
import { Modal, useAction } from './client';
import { useT } from '@/i18n/client';

/** Anula una compra registrada por error. El servidor solo lo permite si nada de lo que trajo se usó todavía. */
export function VoidPurchase({ id, number }: { id: string; number: string }) {
  const t = useT(); const { run, pending } = useAction(); const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn-ghost text-danger" onClick={() => setOpen(true)} data-testid="void-purchase">{t('buy.void')}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('buy.voidTitle', { number })}>
        <div className="space-y-3 text-sm"><p>{t('buy.voidConfirm')}</p>
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button><button className="btn-danger" disabled={pending} onClick={() => run(() => voidPurchaseAction(id), { ok: t('buy.voided'), onOk: () => setOpen(false) })} data-testid="void-confirm">{t('buy.void')}</button></div></div>
      </Modal>
    </>
  );
}
