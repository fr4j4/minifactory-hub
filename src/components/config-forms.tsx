'use client';
import { useState } from 'react';
import { savePriceListAction, saveProfileAction, saveSettingsAction, saveUserAction } from '@/actions/settings';
import { saleToggleChannelAction } from '@/actions/catalog';
import { Modal, useAction } from './client';
import type { AppSettings } from '@/lib/settings';
import { DEFAULT_MATRIX, type Module } from '@/lib/perm';

const num = (e: React.ChangeEvent<HTMLInputElement>) => (e.target.value === '' ? 0 : +e.target.value);

export function ShopForm({ st }: { st: AppSettings }) {
  const { run, pending } = useAction(); const [v, setV] = useState(st.shop); const [h, setH] = useState(st.workHours); const [hol, setHol] = useState(st.workHours.holidays.join(', '));
  const f = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form className="grid sm:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); run(() => saveSettingsAction({ shop: v, workHours: { ...h, holidays: hol.split(',').map((x) => x.trim()).filter(Boolean) } }), { ok: 'Datos del taller guardados' }); }}>
      <label className="block"><span className="label">Nombre del taller</span><input className="input" value={v.name} onChange={f('name')} data-testid="shop-name" /></label><label className="block"><span className="label">Razón social</span><input className="input" value={v.legalName} onChange={f('legalName')} /></label>
      <label className="block"><span className="label">RUT / ID tributario</span><input className="input" value={v.taxId} onChange={f('taxId')} /></label><label className="block"><span className="label">Teléfono</span><input className="input" value={v.phone} onChange={f('phone')} /></label>
      <label className="block"><span className="label">Email</span><input className="input" value={v.email} onChange={f('email')} /></label><label className="block"><span className="label">Dirección</span><input className="input" value={v.address} onChange={f('address')} /></label>
      <label className="block"><span className="label">Color de marca</span><input type="color" className="input !p-1" value={v.brandColor} onChange={f('brandColor')} /></label><label className="block"><span className="label">Zona horaria</span><input className="input" value={v.timezone} onChange={f('timezone')} /></label>
      <div className="sm:col-span-2 border-t border-slate-200 dark:border-slate-700 pt-3"><h3 className="font-medium text-sm mb-2">Calendario del taller (para el Gantt y las fechas comprometidas)</h3>
        <div className="grid sm:grid-cols-4 gap-3"><label className="block"><span className="label">Abre</span><input type="time" className="input" value={h.start} onChange={(e) => setH({ ...h, start: e.target.value })} /></label><label className="block"><span className="label">Cierra</span><input type="time" className="input" value={h.end} onChange={(e) => setH({ ...h, end: e.target.value })} /></label>
          <div className="sm:col-span-2"><span className="label">Días de trabajo</span><div className="flex flex-wrap gap-1">{['D', 'L', 'M', 'X', 'J', 'V', 'S'].map((d, i) => <button type="button" key={i} aria-pressed={h.days.includes(i)} onClick={() => setH({ ...h, days: h.days.includes(i) ? h.days.filter((x) => x !== i) : [...h.days, i] })} className={`btn-ghost btn-sm !px-3 ${h.days.includes(i) ? '!bg-brand-600 !text-white' : ''}`}>{d}</button>)}</div></div></div>
        <label className="block mt-3"><span className="label">Feriados (AAAA-MM-DD, separados por coma)</span><input className="input" value={hol} onChange={(e) => setHol(e.target.value)} /></label></div>
      <div className="sm:col-span-2 flex justify-end"><button className="btn-primary" disabled={pending}>Guardar</button></div>
    </form>
  );
}

export function RatesForm({ st }: { st: AppSettings }) {
  const { run, pending } = useAction(); const [r, setR] = useState(st.rates); const [valid, setValid] = useState(st.quoteValidDays); const [resv, setResv] = useState(st.reservationDays); const [dep, setDep] = useState(st.minDepositPct);
  const f = (k: keyof typeof r) => (e: React.ChangeEvent<any>) => setR({ ...r, [k]: e.target.type === 'number' ? num(e) : e.target.value });
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(() => saveSettingsAction({ rates: r, quoteValidDays: valid, reservationDays: resv, minDepositPct: dep }), { ok: 'Tarifas guardadas: los presupuestos ya enviados no cambian de precio' }); }}>
      <p className="text-xs muted">Los presupuestos enviados o aprobados quedan congelados: cambiar una tarifa nunca altera documentos ya emitidos.</p>
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="block"><span className="label">Energía ($/kWh)</span><input type="number" className="input" value={r.kwh} onChange={f('kwh')} data-testid="rate-kwh" /></label><label className="block"><span className="label">Mano de obra ($/hora)</span><input type="number" className="input" value={r.laborHour} onChange={f('laborHour')} data-testid="rate-labor" /></label><label className="block"><span className="label">Preparación por defecto (min)</span><input type="number" className="input" value={r.prepMinutes} onChange={f('prepMinutes')} /></label>
        <label className="block"><span className="label">Desperdicio (%)</span><input type="number" className="input" value={r.wastePct} onChange={f('wastePct')} /></label><label className="block"><span className="label">Tasa de falla por defecto (%)</span><input type="number" className="input" value={r.failRatePct} onChange={f('failRatePct')} /></label><label className="block"><span className="label">Margen por defecto sobre costo (%)</span><input type="number" className="input" value={r.marginPct} onChange={f('marginPct')} data-testid="rate-margin" /></label>
        <label className="block"><span className="label">Margen mínimo de alerta (%)</span><input type="number" className="input" value={r.minMarginPct} onChange={f('minMarginPct')} /></label><label className="block"><span className="label">Precio mínimo por línea ($)</span><input type="number" className="input" value={r.minPrice} onChange={f('minPrice')} /></label>
        <label className="block"><span className="label">Redondeo</span><select className="input" value={r.rounding.mode} onChange={(e) => setR({ ...r, rounding: { ...r.rounding, mode: e.target.value as any } })}><option value="none">Sin redondeo</option><option value="step">A múltiplos de…</option><option value="ending990">Terminado en 990</option></select></label>
        {r.rounding.mode === 'step' && <label className="block"><span className="label">Redondear a ($)</span><input type="number" className="input" value={r.rounding.step} onChange={(e) => setR({ ...r, rounding: { ...r.rounding, step: num(e) } })} /></label>}
        <label className="block"><span className="label">IVA (%)</span><input type="number" className="input" value={r.taxPct} onChange={f('taxPct')} /></label><label className="block"><span className="label">IVA en los precios</span><select className="input" value={r.taxMode} onChange={f('taxMode')}><option value="incluido">Incluido</option><option value="sumado">Se suma al total</option><option value="exento">Exento</option></select></label>
        <label className="block"><span className="label">Vigencia de presupuestos (días)</span><input type="number" className="input" value={valid} onChange={(e) => setValid(num(e))} /></label><label className="block"><span className="label">Caducidad de reservas (días)</span><input type="number" className="input" value={resv} onChange={(e) => setResv(num(e))} /></label><label className="block"><span className="label">Abono sugerido (%)</span><input type="number" className="input" value={dep} onChange={(e) => setDep(num(e))} /></label>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div><h3 className="text-sm font-medium mb-1.5">Recargos por urgencia</h3>{r.urgency.map((u, i) => <div key={u.key} className="grid grid-cols-3 gap-2 mb-1.5"><input className="input col-span-2" value={u.label} onChange={(e) => setR({ ...r, urgency: r.urgency.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} aria-label="Nombre" /><input type="number" className="input" value={u.pct} onChange={(e) => setR({ ...r, urgency: r.urgency.map((x, k) => (k === i ? { ...x, pct: num(e) } : x)) })} aria-label="Porcentaje" /></div>)}</div>
        <div><h3 className="text-sm font-medium mb-1.5">Descuento por volumen (desde N unidades, % negativo)</h3>{r.volumeTiers.map((t, i) => <div key={i} className="grid grid-cols-2 gap-2 mb-1.5"><input type="number" className="input" value={t.minQty} onChange={(e) => setR({ ...r, volumeTiers: r.volumeTiers.map((x, k) => (k === i ? { ...x, minQty: num(e) } : x)) })} aria-label="Desde unidades" /><input type="number" className="input" value={t.pct} onChange={(e) => setR({ ...r, volumeTiers: r.volumeTiers.map((x, k) => (k === i ? { ...x, pct: num(e) } : x)) })} aria-label="Porcentaje" /></div>)}<button type="button" className="btn-ghost btn-sm" onClick={() => setR({ ...r, volumeTiers: [...r.volumeTiers, { minQty: 100, pct: -25 }] })}>+ Tramo</button></div>
      </div>
      <div className="flex justify-end"><button className="btn-primary" disabled={pending} data-testid="rates-save">Guardar tarifas</button></div>
    </form>
  );
}

export function TemplatesForm({ st }: { st: AppSettings }) {
  const { run, pending } = useAction(); const [t, setT] = useState(st.templates); const [n, setN] = useState(st.numbering);
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => saveSettingsAction({ templates: t, numbering: n }), { ok: 'Plantillas guardadas' }); }}>
      <p className="text-xs muted">Variables: <code>{'{cliente} {numero} {total} {vigencia} {seguimiento}'}</code>. Los mensajes se copian o se abren en WhatsApp: no se envía nada automáticamente.</p>
      {([['terms', 'Términos y condiciones (PDF del presupuesto)'], ['whatsappQuote', 'Mensaje de presupuesto'], ['whatsappReady', 'Aviso de pedido listo'], ['whatsappShipped', 'Aviso de despacho']] as const).map(([k, l]) => <label key={k} className="block"><span className="label">{l}</span><textarea className="input h-20" value={t[k]} onChange={(e) => setT({ ...t, [k]: e.target.value })} /></label>)}
      <h3 className="text-sm font-medium pt-2">Numeración de documentos</h3>
      <div className="grid sm:grid-cols-5 gap-3">{(['quote', 'order', 'sale', 'job', 'production'] as const).map((k) => <label key={k} className="block"><span className="label">{{ quote: 'Presupuesto', order: 'Pedido', sale: 'Venta', job: 'Trabajo', production: 'Producción' }[k]}</span><input className="input tabular" value={n[k]} onChange={(e) => setN({ ...n, [k]: e.target.value })} /></label>)}</div>
      <p className="text-xs muted">Ej. <code>P-{'{YYYY}'}-{'{NNNN}'}</code> genera P-2026-0001 y reinicia cada año.</p>
      <div className="flex justify-end"><button className="btn-primary" disabled={pending}>Guardar</button></div>
    </form>
  );
}

const MODS: Array<[Module, string]> = [['pedidos', 'Pedidos'], ['presupuestos', 'Presupuestos'], ['clientes', 'Clientes'], ['archivos', 'Archivos 3D'], ['laminador', 'Laminador'], ['catalogo', 'Catálogo'], ['ventas', 'Ventas rápidas'], ['inventario', 'Inventario'], ['maquinas', 'Máquinas'], ['cola', 'Cola'], ['galeria', 'Galería'], ['pagos', 'Pagos'], ['reportes', 'Reportes'], ['config', 'Configuración']];
export function UserDialog({ u, trigger, selfId }: { u?: { id: string; name: string; email: string; role: string; active: boolean; permOverrides: Record<string, string> }; trigger: React.ReactNode; selfId: string }) {
  const [open, setOpen] = useState(false); const { run, pending } = useAction(); const [v, setV] = useState({ name: u?.name ?? '', email: u?.email ?? '', role: u?.role ?? 'operador', password: '', active: u?.active ?? true }); const [ov, setOv] = useState<Record<string, string>>(u?.permOverrides ?? {});
  const eff = (m: Module) => ov[m] ?? (DEFAULT_MATRIX as any)[v.role][m] ?? '';
  const toggle = (m: Module, a: string) => { const cur = eff(m); const next = cur.includes(a) ? cur.replace(a, '') : cur + a; setOv({ ...ov, [m]: ['V', 'C', 'E', 'X'].filter((x) => next.includes(x)).join('') }); };
  return (<><span onClick={() => setOpen(true)} className="inline-block">{trigger}</span>
    <Modal open={open} onClose={() => setOpen(false)} title={u ? `Editar ${u.name}` : 'Nuevo usuario'} wide>
      <div className="grid sm:grid-cols-2 gap-3"><label className="block"><span className="label">Nombre</span><input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} data-testid="user-name" /></label><label className="block"><span className="label">Correo</span><input className="input" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} data-testid="user-email" /></label>
        <label className="block"><span className="label">Rol</span><select className="input" value={v.role} onChange={(e) => { setV({ ...v, role: e.target.value }); setOv({}); }} data-testid="user-role"><option value="admin">Administrador</option><option value="operador">Operador</option><option value="ventas">Ventas</option></select></label><label className="block"><span className="label">{u ? 'Nueva contraseña (opcional)' : 'Contraseña (mín. 8)'}</span><input className="input" type="password" autoComplete="new-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} data-testid="user-pass" /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} disabled={u?.id === selfId} /> Usuario activo</label></div>
      <h3 className="text-sm font-medium mt-4 mb-1">Permisos por módulo <span className="muted font-normal">(V = ver, C = crear, E = editar, X = eliminar)</span></h3>
      <div className="overflow-x-auto"><table className="w-full text-sm"><tbody>{MODS.map(([m, l]) => <tr key={m} className="border-t border-slate-100 dark:border-slate-800"><td className="py-1.5 pr-3">{l}</td>{['V', 'C', 'E', 'X'].map((a) => <td key={a} className="px-1"><label className="inline-flex items-center gap-1"><input type="checkbox" checked={eff(m).includes(a)} onChange={() => toggle(m, a)} aria-label={`${l} ${a}`} />{a}</label></td>)}</tr>)}</tbody></table></div>
      <div className="flex justify-end gap-2 mt-4"><button className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" disabled={pending} data-testid="user-save" onClick={() => run(() => saveUserAction({ id: u?.id, ...v, password: v.password || undefined, permOverrides: ov }), { ok: 'Usuario guardado', onOk: () => setOpen(false) })}>Guardar</button></div>
    </Modal></>);
}

export function ChannelDialog({ c, trigger }: { c?: { id: string; name: string; kind: string; commissionPct: number; commissionFixed: number; avgShipping: number; active: boolean }; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false); const { run, pending } = useAction(); const [v, setV] = useState({ name: c?.name ?? '', kind: c?.kind ?? 'marketplace', commissionPct: c?.commissionPct ?? 0, commissionFixed: c?.commissionFixed ?? 0, avgShipping: c?.avgShipping ?? 0, active: c?.active ?? true });
  return (<><span onClick={() => setOpen(true)} className="inline-block">{trigger}</span>
    <Modal open={open} onClose={() => setOpen(false)} title={c ? 'Editar canal' : 'Nuevo canal de venta'}><div className="grid grid-cols-2 gap-3"><label className="block col-span-2"><span className="label">Nombre</span><input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} data-testid="channel-name" /></label><label className="block"><span className="label">Tipo</span><select className="input" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}><option value="directo">Directo</option><option value="marketplace">Marketplace</option><option value="feria">Feria</option><option value="redes">Redes sociales</option></select></label><label className="block"><span className="label">Comisión (%)</span><input type="number" step="0.1" className="input" value={v.commissionPct} onChange={(e) => setV({ ...v, commissionPct: +e.target.value })} data-testid="channel-pct" /></label><label className="block"><span className="label">Comisión fija ($)</span><input type="number" className="input" value={v.commissionFixed} onChange={(e) => setV({ ...v, commissionFixed: +e.target.value })} /></label><label className="block"><span className="label">Envío promedio ($)</span><input type="number" className="input" value={v.avgShipping} onChange={(e) => setV({ ...v, avgShipping: +e.target.value })} /></label><label className="flex items-center gap-2 text-sm col-span-2"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Canal activo</label>
      <div className="col-span-2 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" disabled={pending || !v.name.trim()} data-testid="channel-save" onClick={() => run(() => saleToggleChannelAction({ id: c?.id, ...v }), { ok: 'Canal guardado', onOk: () => setOpen(false) })}>Guardar</button></div></div></Modal></>);
}

export function PriceListDialog({ p, trigger }: { p?: { id: string; name: string; adjustPct: number }; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false); const { run, pending } = useAction(); const [name, setName] = useState(p?.name ?? ''); const [pct, setPct] = useState(p?.adjustPct ?? 0);
  return (<><span onClick={() => setOpen(true)} className="inline-block">{trigger}</span><Modal open={open} onClose={() => setOpen(false)} title="Lista de precios"><div className="space-y-3"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (Revendedor)" aria-label="Nombre" /><label className="block"><span className="label">Ajuste sobre el precio sugerido (%; negativo = descuento)</span><input type="number" className="input" value={pct} onChange={(e) => setPct(+e.target.value)} /></label><div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" disabled={pending || !name.trim()} onClick={() => run(() => savePriceListAction({ id: p?.id, name, adjustPct: pct }), { ok: 'Guardada', onOk: () => setOpen(false) })}>Guardar</button></div></div></Modal></>);
}

const NOTIFS: Array<[string, string]> = [['stock_bajo', 'Stock bajo'], ['mantenimiento', 'Mantenimiento vencido'], ['trabajo_terminado', 'Trabajo terminado'], ['trabajo_fallido', 'Trabajo fallido'], ['marketplace', 'Venta por despachar']];
export function ProfileForm({ prefs }: { prefs: Record<string, boolean> }) {
  const { run, pending } = useAction(); const [p, setP] = useState(prefs); const [cur, setCur] = useState(''); const [nw, setNw] = useState('');
  return (
    <form className="space-y-4 max-w-xl" onSubmit={(e) => { e.preventDefault(); run(() => saveProfileAction({ notifPrefs: p, currentPassword: cur, newPassword: nw || undefined }), { ok: 'Perfil guardado', onOk: () => { setCur(''); setNw(''); } }); }}>
      <div><h3 className="text-sm font-medium mb-2">Avisos que quiero recibir</h3><ul className="space-y-1.5">{NOTIFS.map(([k, l]) => <li key={k}><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p[k] !== false} onChange={(e) => setP({ ...p, [k]: e.target.checked })} /> {l}</label></li>)}</ul></div>
      <div className="grid sm:grid-cols-2 gap-3"><label className="block"><span className="label">Contraseña actual</span><input type="password" className="input" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></label><label className="block"><span className="label">Nueva contraseña (mín. 8)</span><input type="password" className="input" autoComplete="new-password" value={nw} onChange={(e) => setNw(e.target.value)} /></label></div>
      <button className="btn-primary" disabled={pending}>Guardar</button>
    </form>
  );
}
