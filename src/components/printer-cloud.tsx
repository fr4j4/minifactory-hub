'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { addCloudPrinterAction, cloudDevicesAction, cloudLoginAction, cloudLogoutAction, cloudVerifyAction } from '@/actions/printers';
import { cn } from '@/lib/format';
import { ConfirmButton, Modal, useAction, useToast } from './client';
import type { DlgInput } from './printer-connect';

export interface CloudAccountRow { id: string; email: string; region: string; status: string; displayName: string | null; expiresAt: string | null; lastError: string | null; online: boolean }
interface Dev { serial: string; name: string; online: boolean; printStatus: string | null; model: string | null; modelName: string | null; hasLanCode: boolean; linked: string | null }

const PRINT_STATUS: Record<string, string> = { RUNNING: 'imprimiendo', IDLE: 'libre', FINISH: 'terminada', FAILED: 'falló', PAUSE: 'en pausa', PREPARE: 'preparando', ACTIVE: 'activa', SUCCESS: 'terminada' };

function LoginForm({ email0, region0, onDone }: { email0?: string; region0?: string; onDone: () => void }) {
  const toast = useToast(); const router = useRouter();
  const [region, setRegion] = useState<'global' | 'china'>((region0 as 'global') ?? 'global'); const [email, setEmail] = useState(email0 ?? ''); const [pass, setPass] = useState('');
  const [step, setStep] = useState<{ kind: 'code' | 'tfa'; pendingId: string } | null>(null); const [code, setCode] = useState(''); const [busy, setBusy] = useState(false);
  const login = async () => {
    setBusy(true); const r = await cloudLoginAction({ region, account: email, password: pass }); setBusy(false); setPass('');
    if (!r.ok) { toast.push(r.error, 'err'); return; }
    if (r.data.state === 'done') { toast.push('Sesión iniciada en Bambu Cloud'); router.refresh(); onDone(); return; }
    setStep({ kind: r.data.state, pendingId: r.data.pendingId });
  };
  const verify = async () => {
    if (!step) return; setBusy(true); const r = await cloudVerifyAction(step.pendingId, code); setBusy(false);
    if (!r.ok) { toast.push(r.error, 'err'); return; }
    toast.push('Sesión iniciada en Bambu Cloud'); router.refresh(); onDone();
  };
  if (step) return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); verify(); }} data-testid="cloud-code-form">
      <p className="text-sm">{step.kind === 'code' ? <>Bambu Lab envió un código de 6 dígitos a <b>{email}</b>. Escríbelo aquí (vence en unos minutos).</> : <>Tu cuenta tiene verificación en dos pasos: escribe el código de tu app autenticadora.</>}</p>
      <input className="input num text-2xl tracking-[.5em] text-center !min-h-[56px]" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-label="Código de verificación" autoFocus data-testid="cloud-code" />
      <div className="flex justify-between gap-2"><button type="button" className="btn-ghost" onClick={() => { setStep(null); setCode(''); }}>Volver</button><button className="btn-primary" disabled={busy || code.length < 4} data-testid="cloud-verify">{busy ? 'Verificando…' : 'Verificar'}</button></div>
    </form>
  );
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); login(); }} data-testid="cloud-login-form">
      <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3">
        <label className="block"><span className="label">Correo de la cuenta Bambu Lab</span><input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="cloud-email" /></label>
        <label className="block"><span className="label">Contraseña</span><input className="input" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} data-testid="cloud-password" /></label>
        <label className="block"><span className="label">Región</span><select className="input" value={region} onChange={(e) => setRegion(e.target.value as 'global')}><option value="global">Global</option><option value="china">China</option></select></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs muted max-w-lg">La contraseña se usa una sola vez para pedir el token y no se guarda. El token queda cifrado en el servidor.</p><button className="btn-primary" disabled={busy || !email || !pass} data-testid="cloud-login">{busy ? 'Conectando…' : 'Iniciar sesión'}</button></div>
    </form>
  );
}

function AccountCard({ a, found, machines, canCreate, canEdit, openLan }: { a: CloudAccountRow; found: Array<{ serial: string; ip: string }> | null; machines: Array<{ id: string; name: string }>; canCreate: boolean; canEdit: boolean; openLan: (d: DlgInput) => void }) {
  const toast = useToast(); const router = useRouter(); const { run, pending } = useAction();
  const [devs, setDevs] = useState<Dev[] | null>(null); const [loading, setLoading] = useState(false); const [relogin, setRelogin] = useState(false); const [add, setAdd] = useState<Dev | null>(null); const [machineId, setMachineId] = useState('');
  const active = a.status === 'activa';
  const load = async () => { setLoading(true); const r = await cloudDevicesAction(a.id); setLoading(false); if (!r.ok) { toast.push(r.error, 'err'); router.refresh(); return; } setDevs(r.data); };
  const exp = a.expiresAt ? new Date(a.expiresAt) : null; const days = exp ? Math.round((exp.getTime() - Date.now()) / 86_400_000) : null;
  return (
    <li className="card p-4 space-y-3" data-testid="cloud-account">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><div className="font-medium truncate">{a.displayName ? `${a.displayName} · ` : ''}{a.email}</div><div className="font-mono text-[11px] muted">Bambu Cloud {a.region === 'china' ? 'China' : 'Global'}{exp ? ` · sesión vence ${exp.toLocaleDateString('es-CL')}${days != null && days < 14 ? ` (en ${days} días)` : ''}` : ''}</div></div>
        <span className={cn('badge badge-led', active ? (a.online ? 'text-emerald-800 bg-emerald-50 border-emerald-200 dark:text-emerald-200 dark:bg-emerald-950/50 dark:border-emerald-900' : 'text-slate-700 bg-slate-100 border-slate-200 dark:text-slate-200 dark:bg-slate-800 dark:border-slate-700') : 'text-amber-900 bg-amber-50 border-amber-200 dark:text-amber-200 dark:bg-amber-950/50 dark:border-amber-900')} data-testid="cloud-status">{active ? (a.online ? 'Conectada' : 'Activa') : a.status === 'expirada' ? 'Sesión expirada' : 'Sesión cerrada'}</span>
      </div>
      {!active && a.lastError && <p className="text-xs text-amber-800 dark:text-amber-300" role="alert">{a.lastError}</p>}
      <div className="flex flex-wrap gap-2">
        {active && canCreate && <button className="btn-ghost btn-sm" onClick={load} disabled={loading} data-testid="cloud-devices">{loading ? 'Cargando…' : devs ? 'Actualizar impresoras' : 'Ver impresoras de la cuenta'}</button>}
        {!active && canCreate && <button className="btn-primary btn-sm" onClick={() => setRelogin(true)} data-testid="cloud-relogin">Volver a iniciar sesión</button>}
        {active && canEdit && <ConfirmButton className="btn-ghost btn-sm" message="Se borra el token guardado. Las impresoras en modo nube dejarán de actualizarse hasta que vuelvas a iniciar sesión." onConfirm={() => run(() => cloudLogoutAction(a.id), { ok: 'Sesión cerrada' })}>Cerrar sesión</ConfirmButton>}
      </div>
      {devs && (devs.length === 0 ? <p className="text-sm muted">La cuenta no tiene impresoras vinculadas.</p> :
        <ul className="divide-y divide-[var(--line)] -mx-1" data-testid="cloud-device-list">{devs.map((d) => { const lan = found?.find((f) => f.serial === d.serial); return (
          <li key={d.serial} className="px-1 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2" data-testid="cloud-device">
            <span className={cn('h-2 w-2 rounded-full shrink-0', d.online ? 'bg-emerald-500' : 'bg-slate-400')} aria-hidden />
            <div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{d.name}</div><div className="font-mono text-[11px] muted">Bambu Lab {d.modelName ?? d.model ?? '¿?'} · {d.serial} · {d.online ? (PRINT_STATUS[d.printStatus ?? ''] ?? d.printStatus ?? 'en línea') : 'sin conexión'}{lan ? ` · en tu red (${lan.ip})` : ''}</div></div>
            {d.linked ? <span className="text-xs muted">Ya conectada ({d.linked === 'cloud' ? 'nube' : 'LAN'})</span> : canCreate && <div className="flex flex-wrap gap-1.5">
              <button className="btn-ghost btn-sm" disabled={pending} onClick={() => { setMachineId(''); setAdd(d); }} data-testid="cloud-add">☁ Agregar por la nube</button>
              {d.hasLanCode && <button className="btn-primary btn-sm" onClick={() => openLan({ serial: d.serial, name: d.name, model: d.model, modelName: d.modelName, ip: lan?.ip, cloudAccountId: a.id })} data-testid="cloud-lan">Conectar por LAN</button>}
            </div>}
          </li>); })}</ul>)}
      {add && <Modal open onClose={() => setAdd(null)} title={`Agregar ${add.name} por la nube`}>
        <div className="space-y-3">
          <ul className="text-sm list-disc pl-5 muted space-y-1"><li>Verás estado, avance por capas, temperaturas, AMS y avisos en vivo desde cualquier red.</li><li><b>Solo lectura:</b> Bambu Lab no permite pausar, detener ni enviar impresiones desde programas externos por la nube.</li><li>La cámara en vivo no está disponible por la nube; se muestra la vista previa de la placa del trabajo.</li><li>Para controlarla, conéctala por LAN cuando estés en la misma red.</li></ul>
          <label className="block"><span className="label">Máquina</span><select className="input" value={machineId} onChange={(e) => setMachineId(e.target.value)} data-testid="cloud-machine"><option value="">Crear máquina nueva</option>{machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setAdd(null)}>Cancelar</button>
            <button className="btn-primary" disabled={pending} data-testid="cloud-add-confirm" onClick={() => run(() => addCloudPrinterAction({ accountId: a.id, serial: add.serial, name: add.name, machineId: machineId || null }), { ok: 'Impresora agregada (modo nube)', onOk: (r) => { setAdd(null); router.push(`/maquinas/${r.machineId}`); } })}>Agregar</button></div>
        </div>
      </Modal>}
      {relogin && <Modal open onClose={() => setRelogin(false)} title="Volver a iniciar sesión"><LoginForm email0={a.email} region0={a.region} onDone={() => setRelogin(false)} /></Modal>}
    </li>
  );
}

export function CloudSection({ accounts, found, machines, canCreate, canEdit, openLan }: { accounts: CloudAccountRow[]; found: Array<{ serial: string; ip: string }> | null; machines: Array<{ id: string; name: string }>; canCreate: boolean; canEdit: boolean; openLan: (d: DlgInput) => void }) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="space-y-3" data-testid="cloud-section">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><div className="eyebrow">Bambu Cloud · {accounts.length}</div><p className="text-sm muted mt-1 max-w-2xl">Inicia sesión con tu cuenta de Bambu Lab para ver tus impresoras desde cualquier red (solo lectura) o para conectarlas por LAN sin buscar el código en la pantalla.</p></div>
        {canCreate && accounts.length > 0 && !adding && <button className="btn-ghost btn-sm" onClick={() => setAdding(true)}>+ Otra cuenta</button>}
      </div>
      {canCreate && (accounts.length === 0 || adding) && <div className="card p-4"><LoginForm onDone={() => setAdding(false)} /></div>}
      {accounts.length > 0 && <ul className="grid gap-3 lg:grid-cols-2">{accounts.map((a) => <AccountCard key={a.id} a={a} found={found} machines={machines} canCreate={canCreate} canEdit={canEdit} openLan={openLan} />)}</ul>}
    </section>
  );
}
