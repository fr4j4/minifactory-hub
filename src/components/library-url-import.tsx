'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Modal} from './client';
import {useLocale,useT} from '@/i18n/client';
import {makerworldConnection,connectMakerworld,disconnectMakerworld,testMakerworldConnection,inspectLibraryImport,prepareLibraryImport,confirmLibraryImport,libraryImportStatus} from '@/actions/library-import';

export function LibraryUrlImport(){
  const t=useT(),locale=useLocale(),label=(es:string,en:string)=>locale==='es'?es:en;
  const[open,setOpen]=useState(false),[url,setUrl]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const[preview,setPreview]=useState<any>(null),[plan,setPlan]=useState<any>(null),[profile,setProfile]=useState(''),[download,setDownload]=useState('');
  const[connection,setConnection]=useState<any>(null),[method,setMethod]=useState<'password'|'code'|'token'|'tfa'>('password'),[account,setAccount]=useState(''),[credential,setCredential]=useState(''),[challenge,setChallenge]=useState('');
  const[operation,setOperation]=useState(''),[status,setStatus]=useState<any>(null);
  async function run(fn:()=>Promise<any>){setBusy(true);setMessage('');try{const r=await fn();if(!r.ok){setMessage(r.error);return null;}return r.data;}catch{setMessage(label('No se pudo completar la solicitud','Could not complete the request'));return null;}finally{setBusy(false);}}
  async function refreshConnection(){const r=await makerworldConnection();if(r.ok)setConnection(r.data);}
  useEffect(()=>{if(open)void refreshConnection();},[open]);
  useEffect(()=>{if(!operation)return;let stopped=false;const tick=async()=>{const r=await libraryImportStatus(operation);if(!stopped&&r.ok){setStatus(r.data);if(['done','error','partial','cancelled'].includes(r.data.status))clearInterval(timer);}};const timer=setInterval(tick,2500);void tick();return()=>{stopped=true;clearInterval(timer);};},[operation]);
  function reset(){setPreview(null);setPlan(null);setOperation('');setStatus(null);setDownload('');setMessage('');}
  const chosen=preview?.profiles.find((p:any)=>p.id===profile);
  return <div className="mb-4"><button className="btn-ghost" onClick={()=>setOpen(true)}>{t('library.importUrl')}</button><Modal open={open} onClose={()=>{if(!busy){setOpen(false);setCredential('');setDownload('');}}} title={t('library.importUrl')} wide>
    <div className="space-y-4" data-testid="url-import-dialog">
      <p className="text-sm muted">{label('Revisa el modelo y conecta tu cuenta para descargar los perfiles de MakerWorld. Límite: 500 MiB por archivo.','Review the model and connect your account to download MakerWorld profiles. Limit: 500 MiB per file.')}</p>
      <form className="flex gap-2" onSubmit={async e=>{e.preventDefault();reset();const data=await run(()=>inspectLibraryImport(url));if(data){setPreview(data);setProfile(data.selected);}}}>
        <input aria-label="URL" className="input" type="url" required value={url} disabled={busy} onChange={e=>{setUrl(e.target.value);reset();}} placeholder="https://makerworld.com/…"/>
        <button className="btn-primary" disabled={busy}>{label('Consultar','Inspect')}</button>
      </form>
      <details className="card p-3"><summary>{label('Conector MakerWorld · mi cuenta','MakerWorld connector · my account')} · {connection?.connected&&!connection?.expired?label('Conectada','Connected'):label('Sin sesión activa','Not connected')}</summary>
        <p className="text-sm muted my-2">{label('Integración a medida para cuentas globales Bambu/MakerWorld. Token cifrado y privado de tu usuario; no se guarda la contraseña. SSO, CAPTCHA o 2FA: inicia sesión en MakerWorld y usa el token o el JSON de descarga.','Custom integration for global Bambu/MakerWorld accounts. Your token is encrypted and private; passwords are not stored. SSO, CAPTCHA or 2FA: sign in on MakerWorld and use the token or download JSON.')}</p>
        <a href="https://makerworld.com" target="_blank" rel="noreferrer" className="text-sm underline">{label('Abrir MakerWorld para iniciar sesión','Open MakerWorld to sign in')}</a>
        {connection?.connected&&<button className="btn-ghost ml-2" disabled={busy} onClick={async()=>{await run(()=>disconnectMakerworld());await refreshConnection();setPlan(null);}}>{label('Desconectar','Disconnect')}</button>}
        {connection?.connected&&<button className="btn-ghost" disabled={busy} onClick={async()=>{if(await run(()=>testMakerworldConnection()))setMessage(label('Sesión verificada con MakerWorld.','Session verified with MakerWorld.'));}}>{label('Probar conexión','Test connection')}</button>}
        <form className="grid gap-2 mt-3" onSubmit={async e=>{e.preventDefault();const secret=credential;setCredential('');const r=await run(()=>connectMakerworld({method,account,credential:secret,challenge}));if(r?.kind==='code'){setMethod('code');setMessage(label('Introduce el código recibido por correo.','Enter the code sent by email.'));}else if(r?.kind==='tfa'){setMethod('tfa');setChallenge(r.challenge);setMessage(label('Introduce el código de tu app autenticadora.','Enter the code from your authenticator app.'));}else if(r?.kind==='browser'){setMethod('token');setMessage(label('Completa el acceso en MakerWorld y pega el token de sesión.','Sign in on MakerWorld and paste the session token.'));}else if(r){setChallenge('');await refreshConnection();setMessage(label('Cuenta conectada. Puedes preparar la descarga.','Account connected. You can prepare the download.'));}}}>
          <label>{label('Método de acceso','Sign-in method')}<select className="input" value={method} disabled={busy} onChange={e=>{setMethod(e.target.value as typeof method);setCredential('');}}><option value="password">{label('Correo y contraseña','Email and password')}</option><option value="code">{label('Código recibido por correo','Email verification code')}</option><option value="token">{label('Token de sesión existente','Existing session token')}</option>{challenge&&<option value="tfa">{label('App autenticadora (2FA)','Authenticator app (2FA)')}</option>}</select></label>
          {method!=='token'&&<label>{label('Correo Bambu / MakerWorld','Bambu / MakerWorld email')}<input className="input" type="email" autoComplete="username" required value={account} disabled={busy} onChange={e=>setAccount(e.target.value)}/></label>}
          <label>{method==='token'?t('library.token'):method==='code'||method==='tfa'?label('Código de 6 dígitos','6-digit code'):t('library.password')}<input className="input" type="password" autoComplete="off" required value={credential} disabled={busy} onChange={e=>setCredential(e.target.value)}/></label>
          {method==='token'&&<p className="text-xs muted">{label('En tu navegador, abre las herramientas de desarrollo de makerworld.com → Almacenamiento/Aplicación → Cookies → token. Copia solo su valor aquí. No lo publiques ni lo compartas por chat.','In your browser, open developer tools for makerworld.com → Storage/Application → Cookies → token. Paste only its value here. Do not publish or share it in chat.')}</p>}
          <button className="btn-ghost" disabled={busy}>{label('Conectar cuenta','Connect account')}</button>
        </form>
      </details>
      {preview&&<section className="card p-4 space-y-3">
        {preview.image&&<img src={preview.image} alt="" referrerPolicy="no-referrer" className="w-40 h-40 object-contain rounded"/>}
        <h3 className="font-semibold">{preview.title}</h3><p>{t('library.importAuthor')}: {preview.author||'—'}</p><p>{t('library.importLicense')}: {preview.license||label('No informada','Not provided')}</p>
        {preview.description&&<p className="text-sm max-h-32 overflow-auto">{preview.description}</p>}
        {!!preview.profiles.length&&<><label>{label('Perfil de impresión','Print profile')}<select className="input" value={profile} disabled={busy||!!operation} onChange={e=>{setProfile(e.target.value);setPlan(null);setDownload('');}}>{preview.profiles.map((p:any)=><option key={p.id} value={p.id}>{p.title} · {p.id}</option>)}</select></label><p className="text-sm">3MF · {chosen?.size?`${(chosen.size/1048576).toFixed(2)} MiB`:label('Tamaño desconocido','Unknown size')} · {chosen?.plates||'—'} {label('placas','plates')} · {chosen?.printer}</p></>}
        <a href={preview.url} target="_blank" rel="noreferrer" className="text-sm underline">{label('Ver origen y condiciones de uso','View source and terms of use')}</a>
        {!!preview.profiles.length&&<label className="block">{label('Alternativa: JSON o URL de descarga del navegador','Alternative: download JSON or URL from your browser')}<textarea className="input" rows={3} value={download} disabled={busy||!!operation} onChange={e=>{setDownload(e.target.value);setPlan(null);}} placeholder={'{"url":"https://…","name":"modelo.3mf"}'}/><span className="text-xs muted">{label('El enlace temporal se guarda cifrado. Puede caducar; prepara y confirma de inmediato.','The temporary link is stored encrypted. It can expire; prepare and confirm promptly.')}</span></label>}
        {!operation&&<button className="btn-primary" disabled={busy||(!profile&&!!preview.profiles.length)} onClick={async()=>{setPlan(null);const data=await run(()=>prepareLibraryImport({url,instanceId:profile,download}));if(data){setPlan(data);setDownload('');}}}>{label('Preparar descarga','Prepare download')}</button>}
      </section>}
      {plan&&!operation&&<section className="card p-3 space-y-2"><p>{plan.filename} · {plan.downloadHost}</p><p className="text-sm">{plan.manualRequired?label('Se guardará el origen; deberás subir el archivo y asociarlo desde Actividad reciente.','The source will be saved; upload the file and associate it from Recent activity.'):label('Se creará una copia local y se analizará el archivo. La descarga no concede derechos comerciales.','A local copy will be created and analyzed. Downloading does not grant commercial rights.')}</p><button className="btn-primary" disabled={busy} onClick={async()=>{const id=await run(()=>confirmLibraryImport(plan.id));if(id)setOperation(id);}}>{label('Confirmar importación','Confirm import')}</button></section>}
      {busy&&<p role="status">{t('library.busy')}</p>}{message&&<p role="alert" className="text-sm">{message}</p>}
      {status&&<p role="status">{label('Importación','Import')}: {status.status}{status.error&&` · ${status.error}`}{status.modelId&&<> · <Link href={`/archivos/${status.modelId}`}>{label('Abrir modelo','Open model')}</Link></>}</p>}
      {status?.status==='error'&&<button className="btn-ghost" onClick={()=>{setOperation('');setStatus(null);setPlan(null);}}>{label('Preparar un enlace nuevo','Prepare a new link')}</button>}
      <Link className="text-sm underline" href="/archivos/fuentes">{t('library.activity')}</Link>
    </div>
  </Modal></div>;
}
