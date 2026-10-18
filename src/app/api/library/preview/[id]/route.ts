import {assertVersionAccess} from '@/lib/library/access';
import {renderThumbnail} from '@/lib/mesh/ops';
import { and,eq } from 'drizzle-orm';
import sharp from 'sharp';
import { zipSync } from 'fflate';
import { getDb,s,WORKSPACE_ID } from '@/db';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/perm';
import { getBuffer } from '@/lib/storage';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 const u=await getSession();if(!u||!can(u,'archivos','V'))return new Response('Unauthorized',{status:401});const {id}=await params;const db=await getDb();const [v]=await db.select().from(s.fileVersions).where(and(eq(s.fileVersions.id,id),eq(s.fileVersions.workspaceId,WORKSPACE_ID)));try{await assertVersionAccess(u,id);}catch{return new Response('Not found',{status:404});}
 if(new URL(req.url).searchParams.get('kind')==='technical'){
   if(!v?.meta?.previewKey)return new Response('Preview unavailable',{status:409});const bin=await getBuffer(v.meta.previewKey);const nv=bin.readUInt32LE(4),ni=bin.readUInt32LE(8);if(ni>4500000||bin.length<20+nv*12+ni*4)return new Response('Preview too large',{status:413});const stride=Math.max(1,Math.ceil(ni/3/60000));const p:number[]=[];for(let i=0;i<ni;i+=3*stride)for(let j=0;j<3;j++){const idx=bin.readUInt32LE(20+nv*12+(i+j)*4);for(let k=0;k<3;k++)p.push(bin.readFloatLE(20+idx*12+k*4));}const files:Record<string,Uint8Array>={};for(const [name,az,el]of [['front',0,0],['back',180,0],['left',90,0],['right',270,0],['top',0,90],['perspective',-35,28]] as const)files[name+'.webp']=await renderThumbnail({positions:new Float32Array(p)},{az,el,format:'webp'});return new Response(new Uint8Array(zipSync(files)),{headers:{'content-type':'application/zip','content-disposition':'attachment; filename="technical-views.zip"','cache-control':'no-store'}});
 }
 const key=v?.meta?.turnKey;if(!key||typeof key!=='string')return new Response('Genere primero la vista 360',{status:409});
 const data=await getBuffer(key);if(new URL(req.url).searchParams.get('kind')==='gif'){const result=await sharp(data,{animated:true}).gif({colours:64,effort:3}).toBuffer();if(result.length>1024*1024)return new Response('GIF excede 1 MiB; use las capturas',{status:413});return new Response(new Uint8Array(result),{headers:{'content-type':'image/gif','content-disposition':'attachment; filename="modelo-360.gif"','cache-control':'no-store'}});}
 const meta=await sharp(data,{animated:true}).metadata();const files:Record<string,Uint8Array>={};for(let i=0;i<Math.min(meta.pages||1,12);i++)files[`vista-${String(i+1).padStart(2,'0')}.webp`]=await sharp(data,{page:i,pages:1}).webp().toBuffer();return new Response(new Uint8Array(zipSync(files)),{headers:{'content-type':'application/zip','content-disposition':'attachment; filename="vistas-360.zip"','cache-control':'no-store'}});
}
