'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addContactAction, addPaymentAction, cancelOrderAction, planProductionAction, promoteCustomerAction, setOrderStatusAction } from '@/actions/orders';
import { CopyButton, Modal, useAction } from './client';
import { SOURCES } from '@/lib/format';

export function OrderActions({ id, status, canPlan, canReady, hasStockLines, shipMethod, tracking, msgReady, msgShipped, wa, waShipped, canEdit, occasional }: { id: string; status: string; canPlan: boolean; canReady: boolean; hasStockLines: boolean; shipMethod: string | null; tracking: string | null; msgReady: string; msgShipped: string; wa: string; waShipped: string; canEdit: boolean; occasional: boolean }) {
  const { run, pending } = useAction(); const [del, setDel] = useState(false); const [can, setCan] = useState(false); const [trk, setTrk] = useState(tracking ?? ''); const [m, setM] = useState(shipMethod ?? 'retiro'); const [reason, setReason] = useState('');
  const closed = status === 'entregado' || status === 'cancelado';
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canEdit && !closed && canPlan && <button className="btn-primary" disabled={pending} onClick={() => run(() => planProductionAction(id), { ok: 'Trabajos creados en la cola' })} data-testid="plan-production">Enviar a producción</button>}
      {canEdit && !closed && canReady && status !== 'listo' && <button className="btn-ghost" disabled={pending} onClick={() => run(() => setOrderStatusAction(id, 'listo'), { ok: 'Pedido listo' })} data-testid="mark-ready">Marcar listo</button>}
      {canEdit && status === 'listo' && <button className="btn-primary" onClick={() => setDel(true)} data-testid="mark-delivered">Entregar</button>}
      {status === 'listo' && <><CopyButton text={msgReady} label="Copiar aviso" className="btn-ghost" /><a className="btn-ghost" href={wa} target="_blank" rel="noopener noreferrer">Avisar por WhatsApp</a></>}
      {status === 'entregado' && tracking && <><CopyButton text={msgShipped} label="Copiar aviso de despacho" className="btn-ghost" /><a className="btn-ghost" href={waShipped} target="_blank" rel="noopener noreferrer">WhatsApp</a></>}
      {canEdit && occasional && <button className="btn-ghost" onClick={() => run(() => promoteCustomerAction(id), { ok: 'Ficha de cliente creada' })}>Crear ficha del cliente</button>}
      {canEdit && !closed && <button className="btn-ghost text-red-600" onClick={() => setCan(true)}>Cancelar pedido</button>}
      <Modal open={del} onClose={() => setDel(false)} title="Entregar pedido">
        <div className="space-y-3"><div className="flex gap-2">{['retiro', 'despacho'].map((x) => <button key={x} className={`btn-ghost flex-1 ${m === x ? '!bg-brand-600 !text-white' : ''}`} onClick={() => setM(x)}>{x === 'retiro' ? 'Retiro en taller' : 'Despacho'}</button>)}</div>
          {m === 'despacho' && <label className="block"><span className="label">N° de seguimiento</span><input className="input" value={trk} onChange={(e) => setTrk(e.target.value)} data-testid="tracking" /></label>}
          {hasStockLines && <p className="text-xs muted">Las unidades reservadas de productos del catálogo salen del stock al entregar.</p>}
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setDel(false)}>Cancelar</button><button className="btn-primary" disabled={pending} data-testid="deliver-confirm" onClick={() => run(() => setOrderStatusAction(id, 'entregado', { tracking: trk, shipMethod: m }), { ok: 'Pedido entregado', onOk: () => setDel(false) })}>Confirmar entrega</button></div></div>
      </Modal>
      <Modal open={can} onClose={() => setCan(false)} title="Cancelar pedido">
        <p className="text-sm muted mb-3">Se cancelan los trabajos en cola y se libera el material y el stock reservados.</p>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo de la cancelación" aria-label="Motivo" />
        <div className="flex justify-end gap-2 mt-3"><button className="btn-ghost" onClick={() => setCan(false)}>Volver</button><button className="btn-danger" disabled={pending || !reason.trim()} onClick={() => run(() => cancelOrderAction(id, reason), { ok: 'Pedido cancelado', onOk: () => setCan(false) })}>Cancelar pedido</button></div>
      </Modal>
    </div>
  );
}

export function PaymentButton({ orderId, saleId, balance }: { orderId?: string; saleId?: string; balance: number }) {
  const { run, pending } = useAction(); const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(balance); const [method, setMethod] = useState('transferencia'); const [note, setNote] = useState(''); const [dt, setDt] = useState(''); const [folio, setFolio] = useState('');
  return (
    <>
      <button className="btn-ghost btn-sm" onClick={() => { setAmount(balance); setOpen(true); }} data-testid="add-payment">+ Registrar pago</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Registrar pago">
        <div className="space-y-3"><div className="grid grid-cols-2 gap-3"><label className="block"><span className="label">Monto ($)</span><input type="number" min={1} className="input" value={amount || ''} onChange={(e) => setAmount(+e.target.value || 0)} data-testid="pay-amount" /></label>
          <label className="block"><span className="label">Método</span><select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>{['transferencia', 'efectivo', 'tarjeta', 'marketplace', 'otro'].map((x) => <option key={x}>{x}</option>)}</select></label></div>
          <div className="grid grid-cols-2 gap-3"><label className="block"><span className="label">Documento tributario (opcional)</span><select className="input" value={dt} onChange={(e) => setDt(e.target.value)}><option value="">Ninguno</option><option value="boleta">Boleta</option><option value="factura">Factura</option></select></label>{dt && <label className="block"><span className="label">Folio</span><input className="input" value={folio} onChange={(e) => setFolio(e.target.value)} /></label>}</div>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (ej. abono 50%)" aria-label="Nota del pago" />
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" disabled={pending || amount <= 0} data-testid="pay-save" onClick={() => run(() => addPaymentAction({ orderId, saleId, amount, method, note, taxDocType: dt || undefined, taxDocFolio: folio || undefined }), { ok: 'Pago registrado', onOk: () => setOpen(false) })}>Registrar</button></div></div>
      </Modal>
    </>
  );
}

export function ContactForm({ orderId, customerId }: { orderId: string; customerId: string | null }) {
  const { run, pending } = useAction(); const [ch, setCh] = useState('whatsapp'); const [txt, setTxt] = useState('');
  return (
    <form className="flex flex-col sm:flex-row gap-2" onSubmit={(e) => { e.preventDefault(); run(() => addContactAction({ orderId, customerId, channel: ch, summary: txt }), { ok: 'Contacto anotado', onOk: () => setTxt('') }); }}>
      <select className="input sm:!w-40" value={ch} onChange={(e) => setCh(e.target.value)} aria-label="Canal">{Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <input className="input" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Ej. Se avisó que el pedido está listo" aria-label="Resumen del contacto" data-testid="contact-text" />
      <button className="btn-ghost shrink-0" disabled={pending || !txt.trim()} data-testid="contact-add">Anotar</button>
    </form>
  );
}
