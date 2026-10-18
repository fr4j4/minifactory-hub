import path from 'node:path';
import {and,eq} from 'drizzle-orm';
import {getDb,s,WORKSPACE_ID} from '@/db';
/** Extract resource references as data; never fetch a URI from model content. */
export function dependencyNames(data:Uint8Array,format:string):string[]{
 let refs:string[]=[];const text=new TextDecoder().decode(data);
 if(format==='obj')refs=[...text.matchAll(/^\s*mtllib\s+(.+)$/gm)].map(m=>m[1].trim());
 if(format==='mtl')refs=[...text.matchAll(/^\s*(?:map_\w+|bump|disp)\s+(.+)$/gm)].map(m=>m[1].trim());
 if(format==='gltf'){const json=JSON.parse(text);refs=[...(json.buffers||[]),...(json.images||[])].map(x=>x.uri).filter((x:unknown):x is string=>typeof x==='string'&&!x.startsWith('data:'));}
 return [...new Set(refs)].slice(0,200);
}
export async function recordDependencies(versionId:string,bytes:Uint8Array,format:string){
 const names=dependencyNames(bytes,format);if(!names.length)return;
 const db=await getDb();const [v]=await db.select().from(s.fileVersions).where(eq(s.fileVersions.id,versionId));if(!v)return;
 const [entry]=await db.select().from(s.libraryEntries).where(eq(s.libraryEntries.versionId,versionId));let incomplete=false;
 for(const name of names){const safe=!name.startsWith('/')&&!name.includes('\\')&&!name.split('/').includes('..')&&!/^[a-z]+:/i.test(name);const target=entry&&safe?(await db.select().from(s.libraryEntries).where(and(eq(s.libraryEntries.sourceId,entry.sourceId),eq(s.libraryEntries.path,path.posix.join(path.posix.dirname(entry.path),name)),eq(s.libraryEntries.state,'available'))))[0]:null;
 const [old]=await db.select().from(s.libraryAssets).where(and(eq(s.libraryAssets.modelId,v.modelFileId),eq(s.libraryAssets.versionId,versionId),eq(s.libraryAssets.name,name),eq(s.libraryAssets.role,'dependency')));const missing=!target&&!old?.storageKey;incomplete ||= missing;if(old)await db.update(s.libraryAssets).set({entryId:target?.id,data:{...old.data,missing,blocked:!safe}}).where(eq(s.libraryAssets.id,old.id));else await db.insert(s.libraryAssets).values({workspaceId:WORKSPACE_ID,modelId:v.modelFileId,versionId,role:'dependency',name,entryId:target?.id,data:{missing,blocked:!safe}});
 }
 await db.update(s.fileVersions).set({meta:{...v.meta,dependencies:{names,incomplete}}}).where(eq(s.fileVersions.id,versionId));return {names,incomplete};
}
