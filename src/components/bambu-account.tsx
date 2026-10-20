'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, ExternalLink, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale } from '@/i18n/client';
import { connectMakerworld, disconnectMakerworld, makerworldConnection, resendMakerworldCode } from '@/actions/library-import';
import { enableBambuPrinters, ownBambuAccounts, useBambuAccount } from '@/actions/integrations';
import { Modal } from './client';

type Method = 'password'|'code'|'tfa'|'token';
type Failure = {ok:false;error:string;code?:string;retryAfter?:number};
export function BambuAccountForm({onDone,printers=false,email0=''}:{onDone:()=>void;printers?:boolean;email0?:string}) {
  const locale=useLocale(),text=(es:string,en:string)=>locale==='es'?es:en,router=useRouter();
  const [method,setMethod]=useState<Method>('password'),[email,setEmail]=useState(email0),[secret,setSecret]=useState(''),[challenge,setChallenge]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState<Failure|null>(null),[cooldown,setCooldown]=useState(0),[notice,setNotice]=useState(''),[connected,setConnected]=useState(false);
  const [accounts,setAccounts]=useState<Array<{id:string;email:string;status:string}>>([]);
  const [savedSession,setSavedSession]=useState(false);
  const mounted=useRef(true),lock=useRef(false),errorRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{mounted.current=true;ownBambuAccounts().then(r=>{if(mounted.current&&r.ok)setAccounts(r.data.filter(a=>a.status==='activa'));}).catch(()=>{});return()=>{mounted.current=false;};},[]);
  useEffect(()=>{makerworldConnection().then(r=>{if(mounted.current&&r.ok)setSavedSession(r.data.connected);}).catch(()=>{});},[]);
  useEffect(()=>{if(error)errorRef.current?.focus();},[error]);
  useEffect(()=>{if(cooldown){const timer=setTimeout(()=>setCooldown(v=>v-1),1000);return()=>clearTimeout(timer);}},[cooldown]);
  async function run<T>(fn:()=>Promise<{ok:true;data:T}|Failure>) {
    if(lock.current)return; lock.current=true;setBusy(true);setError(null);
    try {const r=await fn();if(!mounted.current)return;if(!r.ok){setError(r);if(r.retryAfter)setCooldown(r.retryAfter);return;}return r.data;}
    catch {if(mounted.current)setError({ok:false,error:text('No se pudo contactar con el servidor. Reintenta.','Could not contact the server. Try again.')});}
    finally {lock.current=false;if(mounted.current)setBusy(false);}
  }
  function done(){router.refresh();onDone();}
  function authenticated(){setSecret('');setChallenge('');if(printers)setConnected(true);else done();}
  async function submit(){
    const credential=secret;setSecret('');
    const r=await run(()=>connectMakerworld({method,account:email.trim(),credential,challenge}));
    if(!r)return;
    if(r.kind==='connected'){authenticated();return;}
    if(r.kind==='code'){setMethod('code');setNotice(text('Usa el código de Bambu. Si no llega, puedes solicitar uno nuevo.','Use the Bambu code. If it does not arrive, request a new one.'));}
    if(r.kind==='tfa'){setMethod('tfa');setChallenge(r.challenge);}
    if(r.kind==='browser'){setMethod('token');setNotice(text('Completa la verificación en Bambu y asocia la sesión del navegador.','Complete verification on Bambu and link the browser session.'));}
  }
  const blocked=error?.code==='browser_required'||error?.code==='rate_limit';
  return <div className="max-w-md mx-auto space-y-5" data-testid="bambu-account-form" aria-busy={busy}>
    <div className="flex items-center gap-3"><div className="p-3 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-ink)]"><ShieldCheck size={26}/></div><div><h3 className="text-xl font-semibold">{connected?text('Cuenta verificada','Account verified'):method==='code'?text('Verifica tu correo','Verify your email'):method==='tfa'?text('Verificación en dos pasos','Two-step verification'):text('Asocia tu cuenta Bambu','Link your Bambu account')}</h3><p className="text-sm muted">MakerWorld · Bambu Lab</p></div></div>
    {connected?<div className="space-y-4"><p className="text-sm">{text('La sesión de MakerWorld está guardada. Puedes usarla también para las impresoras del taller. No se añadirán impresoras automáticamente.','Your MakerWorld session is saved. You can also use it for workshop printers. Printers will not be added automatically.')}</p><label className="block"><span className="label">{text('Correo de la cuenta Bambu','Bambu account email')}</span><input className="input" type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><button className="btn-primary w-full" disabled={busy||!email} onClick={async()=>{const r=await run(async()=>{const result=await enableBambuPrinters(email);return result.ok?{ok:true as const,data:true}:result;});if(r)done();}}>{busy?text('Asociando…','Linking…'):text('Usar también para impresoras','Also use for printers')}</button><button className="btn-ghost w-full" disabled={busy} onClick={done}>{text('Solo MakerWorld por ahora','Only MakerWorld for now')}</button></div>:<>
    {method==='password'&&savedSession&&<button className="btn-primary w-full justify-between" disabled={busy} onClick={authenticated}>{text('Usar mi sesión verificada','Use my verified session')}<ArrowRight size={16}/></button>}
    {method==='password'&&accounts.length>0&&<div className="rounded-xl bg-[var(--field)] p-3 space-y-2"><p className="text-xs muted">{text('Ya tienes una cuenta Bambu asociada','You already have a linked Bambu account')}</p>{accounts.map(a=><button key={a.id} className="btn-ghost w-full justify-between" disabled={busy} onClick={async()=>{const r=await run(async()=>{const result=await useBambuAccount(a.id);return result.ok?{ok:true as const,data:true}:result;});if(r){setEmail(a.email);authenticated();}}}>{a.email}<ArrowRight size={16}/></button>)}</div>}
    {method==='token'&&<div className="rounded-xl bg-[var(--field)] p-4 space-y-3 text-sm"><p>{text('Inicia sesión y completa la verificación en la web oficial. Después copia el token de esa sesión. Abrir la web no transfiere la sesión automáticamente.','Sign in and complete verification on the official website. Then copy its session token. Opening the website does not transfer your session automatically.')}</p><a className="btn-ghost gap-2" href="https://makerworld.com" target="_blank" rel="noreferrer">{text('Abrir MakerWorld','Open MakerWorld')}<ExternalLink size={15}/></a><p className="muted text-xs">{text('Herramientas del navegador → Aplicación / Almacenamiento → Cookies de MakerWorld → token. Copia solo su valor; nunca tu contraseña.','Browser developer tools → Application / Storage → MakerWorld cookies → token. Copy only its value, never your password.')}</p></div>}
    <form className="space-y-4" onSubmit={e=>{e.preventDefault();void submit();}}>
      {method==='password'&&<label className="block"><span className="label">{text('Correo de tu cuenta Bambu','Bambu account email')}</span><input className="input" type="email" required autoComplete="username" value={email} disabled={busy} onChange={e=>setEmail(e.target.value)}/></label>}
      {method==='code'&&<p className="text-sm flex gap-2"><Mail size={18}/>{email}</p>}
      {method==='tfa'&&<p className="text-sm muted">{text('Introduce el código de tu app autenticadora.','Enter your authenticator app code.')}</p>}
      <label className="block"><span className="label">{method==='password'?text('Contraseña','Password'):method==='token'?text('Token de sesión','Session token'):text('Código de 6 dígitos','6-digit code')}</span><input className={`input ${['code','tfa'].includes(method)?'font-mono text-center text-xl tracking-[.4em]':''}`} type={['code','tfa'].includes(method)?'text':'password'} autoComplete={method==='password'?'current-password':method==='token'?'off':'one-time-code'} inputMode={['code','tfa'].includes(method)?'numeric':undefined} pattern={['code','tfa'].includes(method)?'[0-9]{6}':undefined} maxLength={['code','tfa'].includes(method)?6:16000} required value={secret} disabled={busy} onChange={e=>setSecret(e.target.value)}/></label>
      <button className="btn-primary w-full justify-center gap-2" disabled={busy||!!blocked&&cooldown>0&&method!=='token'}>{busy?<><LoaderCircle className="animate-spin" size={17}/>{text('Conectando con Bambu…','Connecting to Bambu…')}</>:text('Asociar cuenta','Link account')}</button>
    </form>
    {method==='code'&&<button className="text-sm underline muted" disabled={busy||cooldown>0} onClick={async()=>{const r=await run(()=>resendMakerworldCode(email));if(r){setCooldown(60);setNotice(text('Código solicitado. Revisa también spam.','Code requested. Check your spam folder too.'));}}}>{cooldown?text(`Reenviar en ${cooldown} s`,`Resend in ${cooldown}s`):text('Solicitar otro código','Request another code')}</button>}
    {notice&&<p className="text-sm muted" role="status">{notice}</p>}
    {method==='tfa'&&email&&<button className="text-sm underline muted" disabled={busy||cooldown>0} onClick={async()=>{const r=await run(()=>resendMakerworldCode(email));if(r){setSecret('');setMethod('code');setCooldown(60);setNotice(text('Se solicitó un código por correo.','An email code was requested.'));}}}>{text('Usar un código por correo','Use an email code')}</button>}
    </>}
    {error&&<div ref={errorRef} tabIndex={-1} role="alert" className="box-danger rounded-xl p-4 text-sm"><p>{error.error}</p>{error.code==='browser_required'&&<button className="btn-ghost mt-3" onClick={()=>{setSecret('');setError(null);setNotice('');setMethod('token');}}>{text('Asociar sesión del navegador','Link browser session')}</button>}</div>}
    {!connected&&<div className="flex justify-between text-sm border-t border-[var(--line)] pt-4"><button className="underline muted" disabled={busy} onClick={()=>{setSecret('');setError(null);setNotice('');setMethod(method==='token'?'password':'token');}}>{method==='token'?text('Usar correo y contraseña','Use email and password'):text('Sesión del navegador','Browser session')}</button>{['code','tfa'].includes(method)&&<button className="underline muted" disabled={busy} onClick={()=>{setSecret('');setChallenge('');setMethod('password');setError(null);}}>{text('Volver','Back')}</button>}</div>}
    <p className="text-xs muted flex items-center gap-2"><LockKeyhole size={14}/>{text('Sesión cifrada. La contraseña no se guarda.','Encrypted session. Your password is not stored.')}</p>
  </div>;
}

export function IntegrationSettings({canPrinters}:{canPrinters:boolean}) {
  const locale=useLocale(),text=(es:string,en:string)=>locale==='es'?es:en;
  const [open,setOpen]=useState(false),[connected,setConnected]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [accounts,setAccounts]=useState<Array<{id:string;email:string;status:string}>>([]);
  async function refresh(){setBusy(true);try{const [r,a]=await Promise.all([makerworldConnection(),ownBambuAccounts()]);if(r.ok){setConnected(r.data.connected);setStatus(r.data.status);}else setError(r.error);if(a.ok)setAccounts(a.data);}catch{setError(text('No se pudo consultar la conexión.','Could not check the connection.'));}finally{setBusy(false);}}
  useEffect(()=>{void refresh();},[]);
  return <section className="space-y-5" data-testid="integrations-panel"><div><h2 className="text-2xl font-semibold">{text('Integraciones','Integrations')}</h2><p className="muted text-sm mt-2">{text('Gestiona aquí tus cuentas y reutilízalas al importar modelos o conectar impresoras.','Manage your accounts here and reuse them for model imports and printers.')}</p></div><div className="grid md:grid-cols-2 gap-4">
    <div className="card p-6 space-y-4"><ShieldCheck size={28} className="text-[var(--accent-ink)]"/><h3 className="text-xl font-semibold">MakerWorld</h3><p className="muted text-sm">{text('Descargas y biblioteca 3D · cuenta personal','Downloads and 3D library · personal account')}</p><span className="badge">{busy?text('Comprobando…','Checking…'):connected?text('Cuenta verificada','Account verified'):status==='expired'?text('Sesión caducada','Session expired'):text('Sin conexión verificada','No verified connection')}</span><div className="flex gap-2"><button className="btn-primary" onClick={()=>setOpen(true)}>{connected?text('Gestionar cuenta','Manage account'):text('Asociar cuenta','Link account')}</button>{connected&&<button className="btn-ghost" disabled={busy} onClick={async()=>{setBusy(true);const r=await disconnectMakerworld();if(!r.ok)setError(r.error);await refresh();}}>{text('Desconectar','Disconnect')}</button>}</div><p className="text-xs muted">{text('Desconectar MakerWorld no cierra las sesiones usadas por las impresoras.','Disconnecting MakerWorld does not close printer sessions.')}</p></div>
    <div className="card p-6 space-y-4"><CheckCircle2 size={28} className="text-[var(--accent-ink)]"/><h3 className="text-xl font-semibold">Bambu Lab</h3><p className="muted text-sm">{text('Impresoras del taller · Bambu Cloud','Workshop printers · Bambu Cloud')}</p>{accounts.length?<ul className="space-y-2 text-sm">{accounts.map(a=><li key={a.id} className="flex justify-between gap-2"><span className="truncate">{a.email}</span><span className="badge">{a.status==='activa'?text('Sesión guardada','Session saved'):text('Reconectar','Reconnect')}</span></li>)}</ul>:<p className="muted text-sm">{text('Todavía no has asociado una cuenta para impresoras.','You have not linked a printer account yet.')}</p>}<div className="flex flex-wrap gap-2">{canPrinters&&<button className="btn-primary" onClick={()=>setOpen(true)}>{text('Asociar cuenta Bambu','Link Bambu account')}</button>}<Link className="btn-ghost inline-flex" href="/maquinas/conectores">{text('Gestionar impresoras y sesiones','Manage printers and sessions')}</Link></div></div>
    </div>{error&&<p role="alert" className="box-danger p-3 rounded-xl">{error}</p>}<Modal open={open} onClose={()=>setOpen(false)} title={text('Asociar MakerWorld y Bambu Lab','Link MakerWorld and Bambu Lab')}>{open&&<BambuAccountForm printers={canPrinters} onDone={()=>{setOpen(false);void refresh();}}/>}</Modal></section>;
}
