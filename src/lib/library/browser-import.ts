import fs from 'node:fs/promises';
import {and,eq} from 'drizzle-orm';
import {z} from 'zod';
import {unzipSync} from 'fflate';
import {getDb,s,WORKSPACE_ID} from '@/db';
import {ingestModel} from '@/lib/files';
import {ensureJobWorker} from '@/lib/jobs';
import {normalizeLicense} from './source';
import {saveImportSource} from './url-import';

export async function browserOperation(id:string,user:{id:string;workspaceId:string}) {
  z.uuid().parse(id);
  if(user.workspaceId!==WORKSPACE_ID)throw new Error('Taller inválido');
  const [op]=await(await getDb()).select().from(s.libraryOperations).where(and(eq(s.libraryOperations.id,id),eq(s.libraryOperations.workspaceId,user.workspaceId),eq(s.libraryOperations.createdBy,user.id),eq(s.libraryOperations.kind,'url.import')));
  if(!op?.input.browserRequired)throw new Error('Importación no encontrada');
  return op;
}

/** Same ingestion for browser downloads and a file supplied by its owner. CAS prevents duplicate versions. */
export async function completeBrowserImport(id:string,user:{id:string;workspaceId:string},file:string,filename:string) {
  const op=await browserOperation(id,user),db=await getDb();
  if(op.status==='done')return {modelFileId:String(op.result?.modelId||id)};
  if(op.status!=='awaiting_file')throw new Error('Esta importación está ocupada o ya terminó');
  const stat=await fs.stat(file);
  if(!/\.3mf$/i.test(filename)||stat.size<4||stat.size>500*1024*1024)throw new Error('Selecciona un archivo 3MF de hasta 500 MiB');
  const handle=await fs.open(file,'r'),header=Buffer.alloc(4);
  try{await handle.read(header,0,4,0);}finally{await handle.close();}
  if(!header.equals(Buffer.from([0x50,0x4b,0x03,0x04])))throw new Error('El archivo no es un 3MF válido');
  let model=false,contentTypes=false,total=0,count=0;
  try{unzipSync(new Uint8Array(await fs.readFile(file)),{filter:entry=>{
    total+=entry.originalSize;count++;
    if(total>512*1024*1024||count>20000)throw new Error('Archivo descomprimido demasiado grande');
    model||=entry.name.toLowerCase()==='3d/3dmodel.model';contentTypes||=entry.name.toLowerCase()==='[content_types].xml';return false;
  }});}catch{throw new Error('El 3MF está dañado o supera los límites de descompresión');}
  if(!model||!contentTypes)throw new Error('El archivo no contiene la estructura de un modelo 3MF');
  const [claimed]=await db.update(s.libraryOperations).set({status:'running',error:null,updatedAt:new Date()}).where(and(eq(s.libraryOperations.id,id),eq(s.libraryOperations.status,'awaiting_file'))).returning();
  if(!claimed)throw new Error('Esta importación está ocupada');
  try {
    const [version]=await db.select().from(s.fileVersions).where(eq(s.fileVersions.modelFileId,id));
    if(!version){
      const p=op.input.preview;
      await db.insert(s.modelFiles).values({id,workspaceId:WORKSPACE_ID,name:p.title,author:p.author||null,format:'3mf',origin:op.input.url,license:normalizeLicense(p.license).code,createdBy:user.id}).onConflictDoNothing();
      await ingestModel({tmpPath:file,filename,modelFileId:id,userId:user.id});
    }
    await saveImportSource(id,op);
    await db.update(s.libraryOperations).set({status:'done',result:{...op.result,modelId:id},updatedAt:new Date()}).where(eq(s.libraryOperations.id,id));
    ensureJobWorker();return {modelFileId:id};
  }catch(e){
    await db.update(s.libraryOperations).set({status:'awaiting_file',error:'No se pudo guardar el archivo. Puedes volver a intentarlo.',updatedAt:new Date()}).where(eq(s.libraryOperations.id,id));throw e;
  }
}
