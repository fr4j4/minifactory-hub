'use client';
import { useState } from 'react';
import { setSaleStatusAction } from '@/actions/catalog';
import { Modal, useAction } from './client';

export function SaleActions({ id, status, canEdit }: { id: string; status: string; canEdit: boolean }) {
  const { run, pending } = useAction(); const [open, setOpen] = useState(false); const [reason, setReason] = useState(''); const [ret, setRet] = useState(true); const [trk, setTrk] = useState(''); const [ship, setShip] = useState(false);
  if (!canEdit || status === 'anulada') return null;
  return (
    <span className="inline-flex gap-1">
      {status === 'por_despachar' && <button className="btn-ghost btn-sm" onClick={() => setShip(true)} data-testid="sale-dispatch">Despachar</button>}
      {status === 'despachada' && <button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => setSaleStatusAction(id, 'entregada'), { ok: 'Marcada como entregada' })}>Entregada</button>}
      <button className="btn-ghost btn-sm text-red-600 dark:text-red-400" onClick={() => setOpen(true)}>Anular</button>
      <Modal open={ship} onClose={() => setShip(false)} title="Despachar venta"><input className="input" placeholder="N° de seguimiento (opcional)" value={trk} onChange={(e) => setTrk(e.target.value)} aria-label="Seguimiento" /><div className="flex justify-end gap-2 mt-3"><button className="btn-ghost" onClick={() => setShip(false)}>Cancelar</button><button className="btn-primary" disabled={pending} onClick={() => run(() => setSaleStatusAction(id, 'despachada', { tracking: trk }), { ok: 'Despachada', onOk: () => setShip(false) })}>Despachar</button></div></Modal>
      <Modal open={open} onClose={() => setOpen(false)} title="Anular venta / devolución">
        <div className="space-y-3"><input className="input" placeholder="Motivo (obligatorio)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Motivo" /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ret} onChange={(e) => setRet(e.target.checked)} /> La pieza vuelve al stock (si está dañada, va a merma)</label>
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>Volver</button><button className="btn-danger" disabled={pending || !reason.trim()} onClick={() => run(() => setSaleStatusAction(id, 'anulada', { reason, returnToStock: ret }), { ok: 'Venta anulada', onOk: () => setOpen(false) })}>Anular</button></div></div>
      </Modal>
    </span>
  );
}
