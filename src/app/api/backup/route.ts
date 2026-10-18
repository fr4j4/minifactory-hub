import { Zip,ZipPassThrough } from 'fflate';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { getTableName,is,Table,sql } from 'drizzle-orm';
import { getDb,schema } from '@/db';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/perm';
import { config } from '@/lib/config';
/** Streaming export: bounded chunks, explicit omission of credentials and remote-only originals. */
export async function GET(req:Request){const u=await getSession();if(!u||u.role!=='admin'||!can(u,'config','E'))return new Response('Unauthorized',{status:403});
 const withFiles=new URL(req.url).searchParams.get('archivos')!=='0';const db=await getDb();
 async function* generate(){let chunks:Uint8Array[]=[];let error:Error|null=null;const zip=new Zip((err,data)=>{if(err)error=err;else if(data)chunks.push(data);});const enc=new TextEncoder();const drain=function*(){if(error)throw error;const next=chunks;chunks=[];yield* next;};
 const clean=(key:string,value:any)=>/secret|password|token|accessCode|apiKey/i.test(key)?undefined:value;
 try{for(const table of Object.values(schema)){if(!is(table,Table))continue;const name=getTableName(table);if(name==='sessions'||name==='upload_sessions')continue;const entry=new ZipPassThrough(`datos/${name}.json`);zip.add(entry);yield* drain();entry.push(enc.encode('['));yield* drain();let offset=0,first=true;
   for(;;){const rows=await (db as any).select().from(table).limit(250).offset(offset);for(const row of rows){entry.push(enc.encode((first?'':',')+JSON.stringify(row,clean)));first=false;yield* drain();}if(rows.length<250)break;offset+=rows.length;}entry.push(enc.encode(']'),true);yield* drain();}
 const omitted:string[]=[];async function* walk(dir:string,relative:string):AsyncGenerator<{path:string;name:string}>{for(const d of await fsp.readdir(dir,{withFileTypes:true}).catch(()=>[])){if(d.name.startsWith('.'))continue;const p=path.join(dir,d.name),name=path.posix.join(relative,d.name);if(d.isSymbolicLink()){omitted.push(name);continue;}if(d.isDirectory())yield* walk(p,name);else if(d.isFile())yield{path:p,name};}}
 if(withFiles)for await(const f of walk(config.storageDir,'archivos')){const entry=new ZipPassThrough(f.name);zip.add(entry);yield* drain();try{for await(const chunk of fs.createReadStream(f.path,{highWaterMark:64*1024})){entry.push(new Uint8Array(chunk));yield* drain();}}catch{omitted.push(f.name);}entry.push(new Uint8Array(),true);yield* drain();}
 const manifest=new ZipPassThrough('MANIFIESTO.json');zip.add(manifest);manifest.push(enc.encode(JSON.stringify({createdAt:new Date().toISOString(),format:2,credentials:'excluded; reconnect services after restore',files:withFiles?'managed originals and photos; remote-only originals NOT included':'excluded',omitted,consistency:'online export; pause writes for a point-in-time copy'})),true);yield* drain();zip.end();yield* drain();}finally{zip.terminate();}}
 return new Response(Readable.toWeb(Readable.from(generate())) as ReadableStream,{headers:{'content-type':'application/zip','content-disposition':'attachment; filename="minifactory-backup.zip"','cache-control':'no-store'}});
}
