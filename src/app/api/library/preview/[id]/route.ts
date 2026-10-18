import { and,eq } from 'drizzle-orm';
import sharp from 'sharp';
import { zipSync } from 'fflate';
import { getDb,s,WORKSPACE_ID } from '@/db';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/perm';
import { getBuffer } from '@/lib/storage';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 const u=await getSession();if(!u||!can(u,'archivos','V'))return new Response('Unauthorized',{status:401});const {id}=await params;const db=await getDb();const [v]=await db.select().from(s.fileVersions).where(and(eq(s.fileVersions.id,id),eq(s.fileVersions.workspaceId,WORKSPACE_ID)));const key=v?.meta?.turnKey;if(!key||typeof key!=='string')return new Response('Genere primero la vista 360',{status:409});
 const data=await getBuffer(key);if(new URL(req.url).searchParams.get('kind')==='gif'){const result=await sharp(data,{animated:true}).gif({colours:64,effort:3}).toBuffer();if(result.length>1024*1024)return new Response('GIF excede 1 MiB; use las capturas',{status:413});return new Response(new Uint8Array(result),{headers:{'content-type':'image/gif','content-disposition':'attachment; filename="modelo-360.gif"','cache-control':'private, max-age=3600'}});}
 const meta=await sharp(data,{animated:true}).metadata();const files:Record<string,Uint8Array>={};for(let i=0;i<Math.min(meta.pages||1,12);i++)files[`vista-${String(i+1).padStart(2,'0')}.webp`]=await sharp(data,{page:i,pages:1}).webp().toBuffer();return new Response(new Uint8Array(zipSync(files)),{headers:{'content-type':'application/zip','content-disposition':'attachment; filename="vistas-360.zip"','cache-control':'private, max-age=3600'}});
}
