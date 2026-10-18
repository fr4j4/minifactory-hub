import fs from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {and,eq,inArray} from 'drizzle-orm';
import {getDb,s,WORKSPACE_ID} from '@/db';
import {can} from '@/lib/perm';
import {byteLimit} from './content';
import {browserOperation,completeBrowserImport} from './browser-import';
import {browserService} from './browser-service';
export async function finishBrowserDownload(id:string,user:{id:string;workspaceId:string}){
  const op=await browserOperation(id,user);
  if(op.status==='done')return {phase:'done',modelId:String(op.result?.modelId||id)};
  const status=await(await browserService(id,'status')).json();
  if(status.phase!=='downloaded'||!status.file)throw Object.assign(new Error('Esperando la verificación o descarga en MakerWorld'),{retryAfterMs:15000});
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mf-browser-import-'));
  try{
    const file=path.join(dir,'model.3mf'),res=await browserService(id,'file');
    if(!res.body)throw new Error('Descarga vacía');
    await pipeline(Readable.fromWeb(res.body as any),byteLimit(500*1024*1024),createWriteStream(file));
    const result=await completeBrowserImport(id,user,file,status.file.filename);
    await browserService(id,'','DELETE').catch(()=>{});
    return {phase:'done',modelId:result.modelFileId};
  }finally{await fs.rm(dir,{recursive:true,force:true});}
}
export async function watchBrowserDownload(p:Record<string,any>){
  const db=await getDb(),[u]=await db.select().from(s.users).where(and(eq(s.users.id,p.userId),eq(s.users.workspaceId,WORKSPACE_ID),eq(s.users.active,true)));
  if(!u||!can(u as any,'archivos','C')){await browserService(p.operationId,'','DELETE').catch(()=>{});return;}
  const op=await browserOperation(p.operationId,u);
  if(['done','cancelled','error'].includes(op.status))return;
  if(Date.now()>p.deadline){await browserService(op.id,'','DELETE').catch(()=>{});return;}
  // Recover a process interrupted during ingestion after its bounded transfer has expired.
  if(op.status==='running'&&Date.now()-op.updatedAt.getTime()>5*60_000)await db.update(s.libraryOperations).set({status:'awaiting_file'}).where(and(eq(s.libraryOperations.id,op.id),eq(s.libraryOperations.status,'running'),eq(s.libraryOperations.updatedAt,op.updatedAt)));
  await finishBrowserDownload(op.id,u);
}
export async function queueBrowserDownload(id:string,userId:string,deadline:number){
  const db=await getDb();
  await db.transaction(async tx=>{
    await tx.select().from(s.libraryOperations).where(eq(s.libraryOperations.id,id)).for('update');
    const active=await tx.select().from(s.jobs).where(and(eq(s.jobs.kind,'browser.import'),inArray(s.jobs.status,['queued','running'])));
    const existing=active.find(j=>j.payload.operationId===id);
    if(existing){await tx.update(s.jobs).set({payload:{operationId:id,userId,deadline},runAfter:new Date()}).where(eq(s.jobs.id,existing.id));return;}
    await tx.insert(s.jobs).values({workspaceId:WORKSPACE_ID,createdBy:userId,kind:'browser.import',payload:{operationId:id,userId,deadline},maxAttempts:100});
  });
}
