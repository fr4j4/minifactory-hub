'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { approveQuoteAction, newVersionAction, rejectQuoteAction, sendQuoteAction } from '@/actions/quotes';
import { CopyButton, Modal, useAction } from './client';
import { SOURCES } from '@/lib/format';

export function QuoteActions({ id, status, canEdit, canOrder, msg, wa, defaultBy, depositPct, total }: { id: string; status: string; canEdit: boolean; canOrder: boolean; msg: string; wa: string; defaultBy: string; depositPct: number; total: number }) {
  const { run, pending } = useAction(); const router = useRouter();
  const [ap, setAp] = useState(false); const [rj, setRj] = useState(false);
  const [by, setBy] = useState(defaultBy); const [channel, setChannel] = useState('whatsapp'); const [dep, setDep] = useState(Math.round(total * depositPct / 100)); const [method, setMethod] = useState('transferencia'); const [due, setDue] = useState(''); const [plan, setPlan] = useState(true); const [reason, setReason] = useState('');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a className="btn-ghost" href={`/api/quotes/${id}/pdf`} data-testid="quote-pdf">⬇ PDF</a>
      <CopyButton text={msg} label="Copiar mensaje" className="btn-ghost" />
      <a className="btn-ghost" href={wa} target="_blank" rel="noopener noreferrer">WhatsApp</a>
      {canEdit && status === 'borrador' && <button className="btn-ghost" disabled={pending} onClick={() => run(() => sendQuoteAction(id), { ok: 'Marcado como enviado: precios y costos quedan congelados' })} data-testid="quote-send">Marcar como enviado</button>}
      {canEdit && ['borrador', 'enviado', 'vencido'].includes(status) && canOrder && <button className="btn-primary" onClick={() => setAp(true)} data-testid="quote-approve">El cliente aceptó</button>}
      {canEdit && ['enviado', 'vencido', 'rechazado', 'aprobado'].includes(status) && <button className="btn-ghost" disabled={pending} onClick={() => run(() => newVersionAction(id, false), { ok: 'Nueva versión creada', onOk: (nid) => router.push(`/presupuestos/${nid}`) })} data-testid="quote-newversion">Nueva versión</button>}
      {canEdit && status === 'vencido' && <button className="btn-ghost" disabled={pending} onClick={() => run(() => newVersionAction(id, true), { ok: 'Reactivado con tarifas actuales', onOk: (nid) => router.push(`/presupuestos/${nid}`) })}>Reactivar con tarifas actuales</button>}
      {canEdit && ['enviado', 'vencido'].includes(status) && <button className="btn-ghost text-red-600 dark:text-red-400" onClick={() => setRj(true)}>Rechazado</button>}
      <Modal open={ap} onClose={() => setAp(false)} title="Registrar aprobación del cliente">
        <div className="space-y-3">
          <p className="text-sm muted">La aprobación se registra a mano. Se crea el pedido con los precios finales de este presupuesto.</p>
          <div className="grid grid-cols-2 gap-3"><label className="block"><span className="label">Quién aprobó</span><input className="input" value={by} onChange={(e) => setBy(e.target.value)} data-testid="approve-by" /></label>
            <label className="block"><span className="label">Por qué canal</span><select className="input" value={channel} onChange={(e) => setChannel(e.target.value)}>{Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="block"><span className="label">Abono recibido ($)</span><input type="number" min={0} className="input" value={dep || ''} onChange={(e) => setDep(+e.target.value || 0)} data-testid="approve-deposit" /></label>
            <label className="block"><span className="label">Método</span><select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>{['transferencia', 'efectivo', 'tarjeta', 'otro'].map((m) => <option key={m}>{m}</option>)}</select></label>
            <label className="block col-span-2"><span className="label">Fecha comprometida</span><input type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} /></label></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={plan} onChange={(e) => setPlan(e.target.checked)} /> Enviar a producción ahora (crear trabajos en la cola)</label>
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setAp(false)}>Cancelar</button><button className="btn-primary" disabled={pending} data-testid="approve-confirm" onClick={() => run(() => approveQuoteAction(id, { by, channel, depositAmount: dep, depositMethod: method, dueDate: due || null, plan }), { ok: 'Pedido creado', onOk: (oid) => router.push(`/pedidos/${oid}`) })}>Crear pedido</button></div>
        </div>
      </Modal>
      <Modal open={rj} onClose={() => setRj(false)} title="Presupuesto rechazado">
        <label className="block"><span className="label">Motivo (para el embudo comercial)</span><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Precio, plazo, encontró otra opción…" /></label>
        <div className="flex justify-end gap-2 mt-3"><button className="btn-ghost" onClick={() => setRj(false)}>Cancelar</button><button className="btn-danger" disabled={pending} onClick={() => run(() => rejectQuoteAction(id, reason || 'Sin motivo'), { ok: 'Registrado', onOk: () => setRj(false) })}>Marcar rechazado</button></div>
      </Modal>
    </div>
  );
}
