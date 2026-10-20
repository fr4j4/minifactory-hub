import {getSession} from '@/lib/auth';
import {can} from '@/lib/perm';
import {browserOperation} from '@/lib/library/browser-import';
import {browserService} from '@/lib/library/browser-service';
import {finishBrowserDownload,queueBrowserDownload} from '@/lib/library/browser-download';
import {ensureJobWorker} from '@/lib/jobs';
import {makerworldToken} from '@/lib/library/makerworld';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
async function handle(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const user=await getSession();if(!user||!can(user,'archivos','C'))return Response.json({error:'Sin acceso'},{status:401,headers});
    // Mutations require same-origin browser requests, including DELETE/keyboard input.
    const origin=req.headers.get('origin');
    // Next constructs req.url with its container port; Host retains the external port.
    const sameHost=origin&&/^https?:\/\//.test(origin)&&new URL(origin).host===(req.headers.get('host')||new URL(req.url).host);
    if(req.method!=='GET'&&!sameHost)return Response.json({error:'Origen inválido'},{status:403,headers});
    const {id}=await params,op=await browserOperation(id,user),action=new URL(req.url).searchParams.get('action')||'status';
    if(req.method==='DELETE'){await browserService(id,'','DELETE');return Response.json({closed:true},{headers});}
    if(op.status==='done'&&action==='status')return Response.json({phase:'done',modelId:op.result?.modelId||id},{headers});
    if(op.status==='running'&&action==='status')return Response.json({phase:'saving'},{headers});
    if(op.status!=='awaiting_file')throw new Error('La importación ya terminó o está ocupada');
    if(req.method==='GET'&&action==='frame'){
      const frame=await browserService(id,'frame');return new Response(frame.body,{headers:{...headers,'Content-Type':'image/jpeg'}});
    }
    if(req.method==='GET'&&action==='status')return Response.json(await(await browserService(id,'status')).json(),{headers});
    if(req.method!=='POST'||!['start','input','retry','finish'].includes(action))return Response.json({error:'Acción inválida'},{status:400,headers});
    if(action==='start'){
      const p=op.input.preview.profile;
      const token=await makerworldToken(user.id).catch(()=>undefined);
      const state=await(await browserService(id,'start','POST',{url:op.input.url,profile:p.id,device:p.devModelName,token})).json();
      await queueBrowserDownload(id,user.id,Date.parse(state.expiresAt));ensureJobWorker();
      return Response.json(state,{headers});
    }
    if(action==='input'){
      if(Number(req.headers.get('content-length')||0)>8192)throw new Error('Entrada demasiado grande');
      const text=await req.text();if(text.length>8192)throw new Error('Entrada demasiado grande');
      return Response.json(await(await browserService(id,'input','POST',JSON.parse(text))).json(),{headers});
    }
    if(action==='retry')return Response.json(await(await browserService(id,'retry','POST')).json(),{headers});
    return Response.json(await finishBrowserDownload(id,user),{headers});
  }catch(e){return Response.json({error:(e as Error).message.replace(/https?:\/\/\S+/g,'[URL]')},{status:400,headers});}
}
export const GET=handle;export const POST=handle;export const DELETE=handle;
