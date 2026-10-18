'use server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { requirePerm, loginThrottled, loginFailed, loginOk } from '@/lib/auth';
import { seal, unseal } from '@/lib/secret';
import { ensureJobWorker } from '@/lib/jobs';
import { safe as baseSafe } from './common';
import {MakerworldError} from '@/lib/library/makerworld-http';
import { accountWhere, makerworldAccount, makerworldLogin, makerworldEmailCode, makerworldTfa, checkMakerworld, storeMakerworldToken, inspectMakerworld, makerworldReference, parseDownloadResponse, resolveMakerworld } from '@/lib/library/makerworld';
import {fetchSourceMeta,parseSourceUrl} from '@/lib/library/source';
import { MODEL_EXT } from '@/lib/files';
import { extOf } from '@/lib/mesh/parse';
const urlSchema = z.string().url().max(16384).refine(v=>{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;},'Use HTTPS sin credenciales');
async function user() {const u=await requirePerm('archivos','C');if(u.workspaceId!==WORKSPACE_ID)throw new Error('Taller inválido');return u;}
async function safe<T>(fn:()=>Promise<T>){
  let code='request_failed',retryAfter=0;
  const result=await baseSafe(async()=>{try{return await fn();}catch(e){if(e instanceof MakerworldError){code=e.code;retryAfter=e.retryAfter;}throw e;}});
  return result.ok?result:{...result,code,retryAfter};
}
export async function makerworldConnection() {return safe(async()=>{
  const u=await user(),row=await makerworldAccount(u.id);
  if(!row)return {connected:false,status:'disconnected',expiresAt:null};
  if(row.expiresAt&&row.expiresAt.getTime()<=Date.now())return {connected:false,status:'expired',expiresAt:row.expiresAt.toISOString()};
  try{await checkMakerworld(u.id);return {connected:true,status:'verified',expiresAt:row.expiresAt?.toISOString()||null};}
  catch(e){return {connected:false,status:e instanceof MakerworldError&&e.code==='authentication'?'expired':'unavailable',expiresAt:row.expiresAt?.toISOString()||null};}
});}
const sentCodes=new Map<string,number>();
export async function resendMakerworldCode(account:string){return safe(async()=>{
  const u=await user(),email=z.email().parse(account.trim()),last=sentCodes.get(u.id)||0;
  if(Date.now()-last<60_000)throw new MakerworldError('rate_limit','Espera un minuto antes de solicitar otro código.',60);
  if(loginThrottled(`makerworld:${u.id}`))throw new MakerworldError('rate_limit','Demasiados intentos. Espera 15 minutos.',900);
  sentCodes.set(u.id,Date.now());loginFailed(`makerworld:${u.id}`);
  for(const [key,time]of sentCodes)if(Date.now()-time>900_000)sentCodes.delete(key);
  await makerworldEmailCode(email);return {sent:true};
});}
export async function connectMakerworld(input:unknown) {return safe(async()=>{
  const u=await user(),key=`makerworld:${u.id}`;
  if(loginThrottled(key))throw new MakerworldError('rate_limit','Demasiados intentos. Espera 15 minutos.',900);
  const p=z.object({method:z.enum(['password','code','token','tfa']),account:z.string().max(254).optional(),credential:z.string().min(1).max(16000),challenge:z.string().max(16000).optional()}).parse(input);
  loginFailed(key);
  if(p.method==='token'){await storeMakerworldToken(u.id,p.credential.trim());loginOk(key);return {kind:'connected' as const};}
  if(p.method==='tfa'){
    z.string().regex(/^\d{6}$/).parse(p.credential);
    const challenge=JSON.parse(unseal(p.challenge||''));
    if(challenge.userId!==u.id||challenge.expires<Date.now())throw new Error('El segundo factor caducó. Inicia sesión de nuevo.');
    await storeMakerworldToken(u.id,await makerworldTfa(challenge.key,p.credential));loginOk(key);return {kind:'connected' as const};
  }
  const account=z.email().parse(p.account?.trim());
  if(p.method==='code')z.string().regex(/^\d{6}$/).parse(p.credential);
  const result=await makerworldLogin(account,p.method==='code'?{code:p.credential}:{password:p.credential});
  if(result.kind==='tfa')return {kind:'tfa' as const,challenge:seal(JSON.stringify({key:result.tfaKey,userId:u.id,expires:Date.now()+5*60_000}))};
  if(result.kind!=='token'){if(result.kind==='code')sentCodes.set(u.id,Date.now());return result;}
  await storeMakerworldToken(u.id,result.token,result.expiresIn);loginOk(key);return {kind:'connected' as const};
});}
export async function disconnectMakerworld(){return safe(async()=>{const u=await user();await(await getDb()).delete(s.libraryAccounts).where(accountWhere(u.id));});}
export async function testMakerworldConnection(){return safe(async()=>{const u=await user();await checkMakerworld(u.id);return true;});}
export async function inspectLibraryImport(raw:string){return safe(async()=>{
  await user();const url=urlSchema.parse(raw);
  if(makerworldReference(url))return inspectMakerworld(url);
  const filename=decodeURIComponent(new URL(url).pathname.split('/').at(-1)||'archivo');
  const direct=MODEL_EXT.includes(extOf(filename))||extOf(filename)==='zip';
  const meta=direct?null:await fetchSourceMeta(parseSourceUrl(url)!);
  return {url:new URL(url).origin+new URL(url).pathname,title:meta?.title||filename,author:meta?.authorName||null,license:meta?.licenseText||null,description:meta?.description||null,image:meta?.imageUrls[0]||null,imageUrls:meta?.imageUrls||[],profiles:[],selected:'',manualRequired:!direct};
});}
export async function prepareLibraryImport(input:unknown){return safe(async()=>{
  const u=await user();const p=z.object({url:urlSchema,instanceId:z.string().regex(/^\d*$/).max(30),download:z.string().max(65536).optional()}).parse(input);
  let filename=decodeURIComponent(new URL(p.url).pathname.split('/').at(-1)||'archivo'),download=p.url;
  let preview:any={title:filename,author:null,license:null};let origin=new URL(p.url).origin+new URL(p.url).pathname;
  const ref=makerworldReference(p.url);
  if(ref){
    preview=await inspectMakerworld(p.url);
    const profile=preview.profiles.find((v:any)=>v.id===(p.instanceId||preview.selected));
    if(!profile)throw new Error('Selecciona un perfil disponible');
    if(profile.size&&profile.size>500*1024*1024)throw new Error('El perfil supera el límite de 500 MiB');
    const resolved=p.download?.trim()?parseDownloadResponse(p.download,`makerworld-${profile.id}.3mf`):await resolveMakerworld(profile.id,profile.devModelName,u.id);
    download=resolved.url;filename=resolved.filename;
    origin=ref.designId?`https://makerworld.com/models/${ref.designId}#profileId-${profile.id}`:preview.url;
    preview={...preview,profile,selected:profile.id};
  } else if(p.download?.trim())throw new Error('El JSON de descarga se admite para modelos MakerWorld');
  const direct=MODEL_EXT.includes(extOf(filename))||extOf(filename)==='zip';
  const result={...preview,url:origin,filename,downloadHost:new URL(download).hostname,manualRequired:!direct};
  const [op]=await(await getDb()).insert(s.libraryOperations).values({workspaceId:WORKSPACE_ID,createdBy:u.id,kind:'url.import',status:'planned',input:{url:origin,secretUrl:seal(download),filename,prepared:direct,preview:result},result}).returning();
  return {id:op.id,...result};
});}
export async function confirmLibraryImport(id:string){return safe(async()=>{
  const u=await user();z.uuid().parse(id);const db=await getDb();
  // Queue and transition together: no orphaned queued operation on enqueue failure.
  await db.transaction(async tx=>{
    const [op]=await tx.update(s.libraryOperations).set({status:'queued',updatedAt:new Date()}).where(and(eq(s.libraryOperations.id,id),eq(s.libraryOperations.workspaceId,WORKSPACE_ID),eq(s.libraryOperations.createdBy,u.id),eq(s.libraryOperations.kind,'url.import'),eq(s.libraryOperations.status,'planned'))).returning();
    if(!op)throw new Error('La importación ya fue confirmada o no está disponible');
    await tx.insert(s.jobs).values({workspaceId:WORKSPACE_ID,kind:'url.import',payload:{operationId:id},createdBy:u.id});
  });ensureJobWorker();return id;
});}
export async function libraryImportStatus(id:string){return safe(async()=>{const u=await user();z.uuid().parse(id);const[op]=await(await getDb()).select().from(s.libraryOperations).where(and(eq(s.libraryOperations.id,id),eq(s.libraryOperations.workspaceId,WORKSPACE_ID),eq(s.libraryOperations.createdBy,u.id),eq(s.libraryOperations.kind,'url.import')));if(!op)throw new Error('Importación no encontrada');return {status:op.status,error:op.error,modelId:op.result?.modelId||null};});}
