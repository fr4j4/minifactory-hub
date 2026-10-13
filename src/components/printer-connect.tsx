'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { connectPrinterAction, discoverPrintersAction, removePrinterAction, updatePrinterAction } from '@/actions/printers';
import type { LiveRow } from '@/lib/bambu/manager';
import { MODEL_OPTIONS } from '@/lib/bambu/models';
import { cn } from '@/lib/format';
import { ConfirmButton, Modal, useAction, useToast } from './client';
import { PrinterPill, PrinterStateBadge, usePrinter } from './printer-live';
import { CloudSection, type CloudAccountRow } from './printer-cloud';

interface Found { serial: string; ip: string; model: string | null; modelName: string | null; name: string | null; connect: string | null; signal: string | null; firmware: string | null; linked: boolean }
export interface LinkedRow { id: string; machineId: string; machineName: string; serial: string; host: string | null; mode: string; model: string | null; name: string | null; enabled: boolean; syncQueue: boolean; fingerprint: string | null; lastError: string | null; live: LiveRow | null }

export type DlgInput = Partial<Found> & { manual?: boolean; cloudAccountId?: string };
function ConnectDialog({ f, machines, onClose }: { f: DlgInput; machines: Array<{ id: string; name: string }>; onClose: () => void }) {
  const router = useRouter(); const toast = useToast();
  const [code, setCode] = useState(''); const [host, setHost] = useState(f.ip ?? ''); const [serial, setSerial] = useState(f.serial ?? ''); const [model, setModel] = useState(f.model ?? MODEL_OPTIONS[0].code);
  const [name, setName] = useState(f.name ?? ''); const [machineId, setMachineId] = useState(''); const [adv, setAdv] = useState(false);
  const [ports, setPorts] = useState({ mqtt: 8883, camera: '' as number | '', ftp: 990 }); const [busy, setBusy] = useState(false);
  const fromCloud = !!f.cloudAccountId;
  const go = async () => {
    setBusy(true);
    const r = await connectPrinterAction({ serial, host, accessCode: code, cloudAccountId: f.cloudAccountId ?? null, model, name, machineId: machineId || null, mqttPort: ports.mqtt, cameraPort: ports.camera === '' ? null : ports.camera, ftpPort: ports.ftp });
    setBusy(false);
    if (!r.ok) { toast.push(r.error, 'err'); return; }
    toast.push('Impresora conectada'); onClose(); router.push(`/maquinas/${r.data.machineId}`);
  };
  return (
    <Modal open onClose={onClose} title={f.manual ? 'Conectar por IP' : `Conectar ${f.name ?? f.serial}${fromCloud ? ' por LAN' : ''}`}>
      <div className="space-y-3">
        {fromCloud ? <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 text-sm space-y-1.5" data-testid="cloud-lan-note">
          <p className="font-medium">Código de acceso desde Bambu Cloud</p>
          <p className="muted">Usaremos el código LAN que entrega tu cuenta (no se muestra ni pasa por el navegador). La impresora debe estar en tu red, con el Modo LAN o el «Modo desarrollador» activo para poder controlarla.</p>
          {!f.ip && <p className="muted">No la encontramos al buscar en la red: escribe su IP (Ajustes → Red en la pantalla de la impresora).</p>}
        </div> : <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 text-sm space-y-1.5">
          <p className="font-medium">En la pantalla de la impresora:</p>
          <ol className="list-decimal pl-5 muted space-y-0.5"><li>Ajustes → Red (WLAN): activa el <b>Modo LAN</b> (o «LAN Only Liveview» para la cámara).</li><li>Copia el <b>código de acceso</b> de 8 caracteres.</li><li>En P1/A1 con firmware reciente activa también el <b>Modo desarrollador</b> si la conexión es rechazada.</li></ol>
        </div>}
        {fromCloud && !f.ip && <label className="block"><span className="label">IP de la impresora</span><input className="input" value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.1.50" data-testid="conn-host" /></label>}
        {!fromCloud && <label className="block"><span className="label">Código de acceso</span><input className="input num tracking-[.2em]" value={code} onChange={(e) => setCode(e.target.value.trim())} maxLength={16} autoComplete="off" spellCheck={false} placeholder="12345678" data-testid="conn-code" /></label>}
        {f.manual && <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="label">IP</span><input className="input" value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.1.50" data-testid="conn-host" /></label>
          <label className="block"><span className="label">Número de serie</span><input className="input num" value={serial} onChange={(e) => setSerial(e.target.value.toUpperCase())} data-testid="conn-serial" /></label>
          <label className="block col-span-2"><span className="label">Modelo</span><select className="input" value={model} onChange={(e) => setModel(e.target.value)}>{MODEL_OPTIONS.map((m) => <option key={m.code} value={m.code}>Bambu Lab {m.name}</option>)}</select></label>
        </div>}
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="label">Nombre en el taller</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={`Bambu Lab ${f.modelName ?? ''}`} data-testid="conn-name" /></label>
          <label className="block"><span className="label">Máquina</span><select className="input" value={machineId} onChange={(e) => setMachineId(e.target.value)} data-testid="conn-machine"><option value="">Crear máquina nueva</option>{machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        </div>
        <button type="button" className="text-xs underline muted" onClick={() => setAdv((v) => !v)} aria-expanded={adv}>Puertos avanzados</button>
        {adv && <div className="grid grid-cols-3 gap-3">
          <label className="block"><span className="label">MQTT</span><input type="number" className="input" value={ports.mqtt} onChange={(e) => setPorts({ ...ports, mqtt: +e.target.value })} data-testid="conn-mqtt" /></label>
          <label className="block"><span className="label">Cámara</span><input type="number" className="input" value={ports.camera} placeholder="auto" onChange={(e) => setPorts({ ...ports, camera: e.target.value ? +e.target.value : '' })} data-testid="conn-camera" /></label>
          <label className="block"><span className="label">FTPS</span><input type="number" className="input" value={ports.ftp} onChange={(e) => setPorts({ ...ports, ftp: +e.target.value })} data-testid="conn-ftp" /></label>
        </div>}
        <p className="text-xs muted">Probaremos la conexión antes de guardarla. El código queda cifrado en el servidor y nunca se muestra de vuelta.</p>
        <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy || (!fromCloud && code.length < 6) || !host || !serial} onClick={go} data-testid="conn-go">{busy ? 'Probando conexión…' : 'Conectar'}</button></div>
      </div>
    </Modal>
  );
}

function LinkedCard({ l, canEdit, canRemove }: { l: LinkedRow; canEdit: boolean; canRemove: boolean }) {
  const r = usePrinter(l.id, l.live); const { run, pending } = useAction(); const [edit, setEdit] = useState(false); const [code, setCode] = useState(''); const [host, setHost] = useState(l.host ?? '');
  return (
    <li className="card p-4 flex flex-col gap-3" data-testid="linked-printer">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><Link href={`/maquinas/${l.machineId}`} className="font-display text-lg font-semibold tracking-tight hover:text-[var(--accent-ink)]">{l.machineName}</Link><div className="font-mono text-[11px] muted mt-0.5">{r?.modelName ? `Bambu Lab ${r.modelName}` : l.model} · {l.serial} · {l.mode === 'cloud' ? 'Bambu Cloud' : l.host}</div>{l.mode === 'cloud' && <span className="inline-block mt-1.5 font-mono text-[10px] uppercase tracking-[.1em] rounded-full border border-sky-300 dark:border-sky-800 text-sky-800 dark:text-sky-300 px-2 py-0.5" data-testid="mode-cloud">☁ nube · solo lectura</span>}</div>
        {r ? <PrinterStateBadge r={r} /> : <span className="badge">{l.enabled ? 'Conectando…' : 'Deshabilitada'}</span>}
      </div>
      {r && <PrinterPill machineId={l.machineId} initial={r} />}
      {r && !r.online && (r.error ?? l.lastError) && <p className="text-xs text-amber-800 dark:text-amber-300" role="alert">{r.error ?? l.lastError}</p>}
      {(canEdit || canRemove) && <div className="flex flex-wrap gap-2 mt-auto">
        {canEdit && <button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => updatePrinterAction(l.id, { enabled: !l.enabled }), { ok: l.enabled ? 'Conexión pausada' : 'Conexión activada' })}>{l.enabled ? 'Pausar conexión' : 'Activar'}</button>}
        {canEdit && <button className="btn-ghost btn-sm" onClick={() => setEdit(true)}>Editar</button>}
        {canRemove && <ConfirmButton className="btn-ghost btn-sm text-red-600 dark:text-red-400" message="¿Desconectar esta impresora? La máquina y su historial se mantienen." onConfirm={() => run(() => removePrinterAction(l.id), { ok: 'Impresora desconectada' })}>Desconectar</ConfirmButton>}
      </div>}
      {edit && <Modal open onClose={() => setEdit(false)} title={`Editar ${l.machineName}`}>
        <div className="space-y-3">
          {l.mode !== 'cloud' && <><label className="block"><span className="label">IP</span><input className="input" value={host} onChange={(e) => setHost(e.target.value)} /></label>
          <label className="block"><span className="label">Nuevo código de acceso (opcional)</span><input className="input num" value={code} onChange={(e) => setCode(e.target.value.trim())} autoComplete="off" /></label></>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked={l.syncQueue} onChange={(e) => run(() => updatePrinterAction(l.id, { syncQueue: e.target.checked }), { ok: 'Guardado' })} /> Sincronizar con la cola (estado de la máquina y avisos al terminar)</label>
          <p className="text-xs muted">Certificado: {l.fingerprint ? <span className="num break-all">{l.fingerprint.slice(0, 29)}…</span> : 'se fijará en la próxima conexión'}</p>
          <div className="flex flex-wrap justify-end gap-2">
            {l.fingerprint && <ConfirmButton className="btn-ghost" message="Olvidar el certificado guardado y confiar en el que presente la impresora en la próxima conexión. Úsalo solo si reemplazaste o reseteaste la impresora." onConfirm={() => run(() => updatePrinterAction(l.id, { resetFingerprint: true }), { ok: 'Certificado olvidado' })}>Olvidar certificado</ConfirmButton>}
            <button className="btn-primary" disabled={pending} onClick={() => run(() => updatePrinterAction(l.id, l.mode === 'cloud' ? {} : { host, ...(code ? { accessCode: code } : {}) }), { ok: 'Guardado', onOk: () => setEdit(false) })}>Guardar</button>
          </div>
        </div>
      </Modal>}
    </li>
  );
}

export function ConnectorsBoard({ linked, machines, accounts, canCreate, canEdit, canRemove }: { linked: LinkedRow[]; machines: Array<{ id: string; name: string }>; accounts: CloudAccountRow[]; canCreate: boolean; canEdit: boolean; canRemove: boolean }) {
  const toast = useToast(); const [scanning, setScanning] = useState(false); const [found, setFound] = useState<Found[] | null>(null); const [info, setInfo] = useState<string | null>(null);
  const [dlg, setDlg] = useState<DlgInput | null>(null);
  const scan = async () => {
    setScanning(true); setFound(null); setInfo(null);
    const r = await discoverPrintersAction(6); setScanning(false);
    if (!r.ok) { toast.push(r.error, 'err'); return; }
    setFound(r.data.found); if (r.data.errors.length) setInfo(r.data.errors.join(' · '));
  };
  return (
    <div className="space-y-6">
      {canCreate && <section className="relative overflow-hidden rounded-3xl bg-[var(--panel)] text-[var(--panel-ink)] p-5 md:p-6 ring-1 ring-black/5 dark:ring-white/[.07]">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-50" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.07) 1px, transparent 1.2px)', backgroundSize: '18px 18px' }} />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="relative h-14 w-14 shrink-0" aria-hidden>{[0, 1, 2].map((i) => <span key={i} className={cn('absolute inset-0 rounded-full border border-[var(--accent)]', scanning ? 'animate-ping' : 'opacity-30')} style={{ animationDelay: `${i * 0.45}s`, animationDuration: '1.6s', transform: `scale(${0.45 + i * 0.27})` }} />)}<span className="absolute inset-[38%] rounded-full bg-[var(--accent)]" /></div>
          <div className="flex-1 min-w-[220px]"><h2 className="font-display text-xl font-semibold tracking-tight">Buscar impresoras Bambu Lab en la red</h2><p className="text-sm text-white/70 mt-1">Escucha los anuncios de las impresoras encendidas en tu red local durante unos segundos. Funciona con X1, P1, A1 y H2.</p></div>
          <div className="flex flex-wrap gap-2"><button className="btn-primary" onClick={scan} disabled={scanning} data-testid="scan">{scanning ? 'Buscando…' : 'Buscar en la red'}</button><button className="btn-ghost !bg-transparent !text-white !border-white/25 hover:!bg-white/10" onClick={() => setDlg({ manual: true })} data-testid="manual">Conectar por IP</button></div>
        </div>
        {found && <div className="relative mt-5">
          {found.length === 0 ? <p className="text-sm text-white/75" data-testid="scan-empty">No se encontraron impresoras. Revisa que estén encendidas, en la misma red y con el Modo LAN activo, o conéctalas por IP.{info ? ` (${info})` : ''}</p> :
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="found">{found.map((f) => (
              <li key={f.serial} className="rounded-2xl bg-white/[.05] border border-white/10 p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="font-medium truncate">{f.name ?? f.serial}</div><div className="font-mono text-[11px] text-white/60">Bambu Lab {f.modelName ?? f.model ?? '¿?'} · {f.ip}</div></div><span className={cn('font-mono text-[10px] uppercase tracking-[.1em]', f.connect === 'lan' ? 'text-emerald-400' : 'text-amber-300')}>{f.connect === 'lan' ? 'modo LAN' : f.connect ?? '—'}</span></div>
                <div className="font-mono text-[10px] text-white/55">{f.serial}{f.signal ? ` · señal ${f.signal} dBm` : ''}{f.firmware ? ` · fw ${f.firmware}` : ''}</div>
                {f.linked ? <span className="text-xs text-white/60 mt-1">Ya conectada</span> : <button className="btn-primary btn-sm self-start mt-1" onClick={() => setDlg(f)} data-testid="found-connect">Conectar</button>}
              </li>))}</ul>}
        </div>}
      </section>}
      <CloudSection accounts={accounts} found={found} machines={machines} canCreate={canCreate} canEdit={canEdit} openLan={setDlg} />
      <section>
        <div className="eyebrow mb-3">Impresoras conectadas · {linked.length}</div>
        {linked.length === 0 ? <p className="text-sm muted">Aún no hay impresoras conectadas.</p> : <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{linked.map((l) => <LinkedCard key={l.id} l={l} canEdit={canEdit} canRemove={canRemove} />)}</ul>}
      </section>
      <section className="card p-4 text-sm space-y-2">
        <h2 className="text-[13px] font-semibold">Cómo funciona</h2>
        <ul className="list-disc pl-5 muted space-y-1">
          <li><b>LAN:</b> conexión directa por la red local (MQTT con TLS, cámara y FTPS), sin pasar por la nube. Permite controlar y enviar impresiones.</li>
          <li><b>Nube:</b> estado en vivo desde cualquier red a través de Bambu Cloud, en solo lectura: el firmware actual de Bambu Lab bloquea el control desde programas externos por la nube y la cámara en vivo no está disponible.</li>
          <li>Se fija el certificado de la impresora en la primera conexión: si cambia, la conexión se rechaza y recibes un aviso.</li>
          <li>Con «Sincronizar con la cola», el estado de la máquina cambia solo y recibes avisos cuando una impresión termina, falla o se pausa.</li>
          <li>El servidor debe estar en la misma red que las impresoras (en Docker, usa <code>network_mode: host</code> para detectarlas).</li>
        </ul>
      </section>
      {dlg && <ConnectDialog f={dlg} machines={machines} onClose={() => setDlg(null)} />}
    </div>
  );
}
