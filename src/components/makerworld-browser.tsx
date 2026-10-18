'use client';
import {useEffect,useRef,useState} from 'react';
import {ExternalLink,LoaderCircle,Monitor,ShieldCheck} from 'lucide-react';
import {Uploader} from './uploader';
import {useLocale} from '@/i18n/client';

export function MakerworldBrowser({id,url,title,profile,onDone}:{id:string;url:string;title:string;profile:string;onDone:(id:string)=>void}){
  const locale=useLocale(),text=(es:string,en:string)=>locale==='es'?es:en;
  const [active,setActive]=useState(false),[busy,setBusy]=useState(false),[issue,setIssue]=useState(''),[state,setState]=useState<any>(null),[frame,setFrame]=useState(''),[typing,setTyping]=useState('');
  const [wide,setWide]=useState(false),viewport=useRef<HTMLDivElement>(null);
  const image=useRef<HTMLImageElement>(null),sequence=useRef(Promise.resolve()),done=useRef(onDone),lastMove=useRef(0);
  done.current=onDone;
  const endpoint=`/api/library/browser/${id}`;
  async function call(action:string,method='GET',body?:unknown){
    const r=await fetch(`${endpoint}?action=${action}`,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
    const data=await r.json();if(!r.ok)throw Error(data.error||text('El navegador no respondió','The browser did not respond'));return data;
  }
  function input(body:unknown){sequence.current=sequence.current.then(async()=>{await call('input','POST',body);}).catch(e=>setIssue(e.message));}
  async function start(){setBusy(true);setIssue('');try{setState(await call('start','POST'));setActive(true);}catch(e){setIssue((e as Error).message);}finally{setBusy(false);}}
  async function stop(){setBusy(true);try{await call('','DELETE');setActive(false);setState(null);setFrame('');}catch(e){setIssue((e as Error).message);}finally{setBusy(false);}}
  useEffect(()=>{
    if(!active)return;let cancelled=false,timer:ReturnType<typeof setTimeout>,blob='',lastStatus=0;
    async function poll(){
      try{
        if(document.hidden){timer=setTimeout(poll,2000);return;}
        if(Date.now()-lastStatus>2000){
          lastStatus=Date.now();const s=await call('status');if(cancelled)return;setState(s);
          if(s.phase==='done'){setActive(false);done.current(s.modelId);return;}
          // Worker completes the download even when this dialog is closed.
          if(['downloaded','saving'].includes(s.phase)){timer=setTimeout(poll,2000);return;}
        }
        const r=await fetch(`${endpoint}?action=frame`,{cache:'no-store'});if(!r.ok)throw Error((await r.json()).error);
        const next=URL.createObjectURL(await r.blob());if(cancelled){URL.revokeObjectURL(next);return;}if(blob)URL.revokeObjectURL(blob);blob=next;setFrame(next);
        timer=setTimeout(poll,800);
      }catch(e){if(!cancelled){setIssue((e as Error).message);setActive(false);}}
    }
    void poll();return()=>{cancelled=true;clearTimeout(timer);if(blob)URL.revokeObjectURL(blob);};
  },[active,id]);
  function pointer(e:React.PointerEvent<HTMLImageElement>,event:string){
    const el=e.currentTarget,rect=el.getBoundingClientRect();
    if(event==='mousePressed'){el.focus();el.setPointerCapture(e.pointerId);}
    if(event==='mouseMoved'){if(!e.buttons||Date.now()-lastMove.current<80)return;lastMove.current=Date.now();}
    e.preventDefault();input({type:'pointer',event,x:(e.clientX-rect.left)*el.naturalWidth/rect.width,y:(e.clientY-rect.top)*el.naturalHeight/rect.height,buttons:event==='mouseReleased'?0:1});
  }
  return <section className="space-y-4" data-testid="makerworld-browser">
    <div className="rounded-2xl bg-[var(--accent-soft)] p-5 flex gap-3"><ShieldCheck className="shrink-0 text-[var(--accent-ink)]"/><div><h3 className="font-semibold">{text('Verifica el acceso en MakerWorld','Verify access on MakerWorld')}</h3><p className="text-sm muted mt-1">{text('La app descargará el archivo. Solo necesitas iniciar sesión o resolver la verificación en esta ventana.','The app will download the file. You only need to sign in or complete the verification in this window.')}</p></div></div>
    <div className="text-sm"><p className="font-medium">{title}</p><p className="muted">{profile}</p></div>
    {!active?<button className="btn-primary gap-2" disabled={busy} onClick={start}>{busy?<LoaderCircle size={17} className="animate-spin"/>:<Monitor size={17}/>} {text('Resolver en el navegador','Resolve in browser')}</button>:<>
      <div className="rounded-xl border border-[var(--line)] overflow-hidden"><div className="px-3 py-2 bg-[var(--field)] flex items-center justify-between gap-2 text-xs"><span className="truncate">{state?.origin||'https://makerworld.com'}</span><span>{text('Sesión temporal · 20 min','Temporary session · 20 min')}</span></div>
        {frame?<div ref={viewport} className="overflow-auto max-h-[65vh]"><img ref={image} src={frame} alt={text('Navegador interactivo de MakerWorld','Interactive MakerWorld browser')} draggable={false} tabIndex={0} role="application" aria-label={text('Navegador remoto. Haz clic para usar el ratón y teclado.','Remote browser. Click to use mouse and keyboard.')} className={`w-full ${wide?'min-w-[900px]':'min-w-0'} touch-none outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--accent)]`} onPointerDown={e=>pointer(e,'mousePressed')} onPointerMove={e=>pointer(e,'mouseMoved')} onPointerUp={e=>pointer(e,'mouseReleased')} onPointerCancel={e=>pointer(e,'mouseReleased')} onWheel={e=>{const r=e.currentTarget.getBoundingClientRect();input({type:'pointer',event:'mouseWheel',x:(e.clientX-r.left)*e.currentTarget.naturalWidth/r.width,y:(e.clientY-r.top)*e.currentTarget.naturalHeight/r.height,deltaY:e.deltaY});}} onKeyDown={e=>{if(e.ctrlKey||e.metaKey)return;e.preventDefault();if(e.key.length===1)input({type:'text',text:e.key});else if(['Enter','Tab','Backspace','Delete','Escape','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))input({type:'key',key:e.key,shift:e.shiftKey});}} onPaste={e=>{e.preventDefault();input({type:'text',text:e.clipboardData.getData('text').slice(0,1024)});}}/></div>:<div className="grid place-items-center h-64"><LoaderCircle className="animate-spin"/></div>}
      </div>
      <div className="flex justify-center gap-2 text-xs"><button className="btn-ghost" onClick={()=>{setWide(!wide);requestAnimationFrame(()=>{const el=viewport.current;if(el)el.scrollLeft=(el.scrollWidth-el.clientWidth)/2;});}}>{wide?text('Ajustar vista','Fit view'):text('Ampliar vista','Enlarge view')}</button>{wide&&<><button className="btn-ghost" onClick={()=>viewport.current?.scrollBy({left:-200,behavior:'smooth'})}>{text('← Izquierda','← Left')}</button><button className="btn-ghost" onClick={()=>viewport.current?.scrollBy({left:200,behavior:'smooth'})}>{text('Derecha →','Right →')}</button></>}</div>
      <p role="status" className="text-sm muted">{state?.phase==='downloading'?text('El servidor está descargando el 3MF…','The server is downloading the 3MF…'):['downloaded','saving'].includes(state?.phase)?text('Guardando en tu biblioteca… Puedes cerrar esta ventana.','Saving to your library… You can close this window.'):text('Resuelve la verificación en la página. Cuando MakerWorld permita el acceso, continuaremos automáticamente.','Complete the verification on the page. We will continue automatically once MakerWorld allows access.')}</p>
      <details className="text-xs muted"><summary className="cursor-pointer">{text('Teclado móvil y controles','Mobile keyboard and controls')}</summary><div className="mt-3 flex gap-2"><input type="password" className="input" aria-label={text('Texto para el campo seleccionado en MakerWorld','Text for the selected MakerWorld field')} placeholder={text('Primero selecciona un campo arriba','First select a field above')} value={typing} autoComplete="off" onChange={e=>setTyping(e.target.value)}/><button className="btn-ghost" onClick={()=>{input({type:'text',text:typing});setTyping('');}}>{text('Escribir','Type')}</button><button className="btn-ghost" onClick={()=>input({type:'key',key:'Enter'})}>↵</button></div><button className="btn-ghost mt-2" disabled={busy} onClick={async()=>{setBusy(true);setIssue('');try{setState(await call('retry','POST'));}catch(e){setIssue((e as Error).message);}finally{setBusy(false);}}}>{text('Reintentar descarga','Retry download')}</button><button className="btn-ghost mt-2" disabled={busy} onClick={stop}>{text('Cerrar sesión temporal','Close temporary session')}</button></details>
    </>}
    {(issue||state?.error)&&<p role="alert" className="box-danger rounded-xl p-3 text-sm">{issue||state.error}</p>}
    <details className="border-t border-[var(--line)] pt-4"><summary className="text-sm muted cursor-pointer">{text('Si MakerWorld sigue bloqueando el acceso','If MakerWorld still blocks access')}</summary><div className="space-y-3 mt-3"><p className="text-xs muted">{text('Puedes descargarlo en tu navegador habitual y adjuntarlo aquí. Se conservarán los datos y las imágenes del modelo seleccionado.','Download in your usual browser and attach it here. Details and images of the selected model will be preserved.')}</p><a className="btn-ghost gap-2" href={url} target="_blank" rel="noreferrer">MakerWorld <ExternalLink size={15}/></a><Uploader intent={{intent:'library.import',operationId:id}} accept=".3mf" multiple={false} label={text('Adjunta el 3MF del perfil seleccionado','Attach the 3MF for the selected profile')} onDone={results=>{const result=results.find(r=>r.ok&&r.data?.modelFileId);if(result){void call('','DELETE').catch(()=>{});done.current(result.data.modelFileId);}}}/></div></details>
    <p className="text-xs muted">{text('Reutilizamos tu cuenta asociada cuando MakerWorld lo permite. La sesión temporal se elimina al terminar o caducar; no guardamos tu contraseña.','We reuse your linked account when MakerWorld allows it. The temporary session is deleted on completion or expiry; we do not store your password.')}</p>
  </section>;
}
