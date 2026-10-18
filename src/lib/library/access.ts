import {can} from '../perm';
import { and, eq, sql, type SQL } from 'drizzle-orm';
import { getDb, s } from '@/db';
import type { SessionUser } from '../auth';
/** Shared catalogue access is the intersection of Hub permissions and connection grants.
 * A model tied to multiple connections requires every grant, preventing a copy from
 * implicitly publishing private metadata. Administrators remain recovery operators. */
export function sourceAccess(user: SessionUser): SQL {
  if(user.role==='admin') return sql`true`;
  return sql`(${s.librarySources.createdBy}=${user.id}::uuid or coalesce(${s.librarySources.config}->>'visibility','workshop')='workshop' or coalesce(${s.librarySources.config}->'users','[]'::jsonb) ? ${user.id} or coalesce(${s.librarySources.config}->'roles','[]'::jsonb) ? ${user.role})`;
}
export function modelAccess(user:SessionUser):SQL {
  return sql`(${s.modelFiles.workspaceId}=${user.workspaceId}::uuid and not exists(select 1 from library_entries inner join library_sources on library_sources.id=library_entries.source_id where library_entries.model_id=${s.modelFiles.id} and not (${sourceAccess(user)})))`;
}
export async function assertModelAccess(user:SessionUser,id:string){
  const db=await getDb();const [row]=await db.select().from(s.modelFiles).where(and(eq(s.modelFiles.id,id),modelAccess(user)));
  if(!row)throw new Error('Modelo no disponible');return row;
}
export async function assertVersionAccess(user:SessionUser,id:string){
  const db=await getDb();const [v]=await db.select().from(s.fileVersions).where(and(eq(s.fileVersions.id,id),eq(s.fileVersions.workspaceId,user.workspaceId)));
  if(!v)throw new Error('Versión no disponible');await assertModelAccess(user,v.modelFileId);return v;
}

export function photoAccess(user:SessionUser):SQL {
 return sql`(${s.photos.workspaceId}=${user.workspaceId}::uuid and not exists(select 1 from model_files where (model_files.id=${s.photos.modelFileId} or model_files.id in (select model_id from library_photo_links where photo_id=${s.photos.id})) and not (${modelAccess(user)})))`;
}
export async function assertMediaAccess(user:SessionUser,key:string){
 const db=await getDb();
 const versions=await db.select().from(s.fileVersions).where(sql`${s.fileVersions.thumbKey}=${key} or ${s.fileVersions.meta}->>'previewKey'=${key} or ${s.fileVersions.meta}->>'turnKey'=${key} or ${s.fileVersions.meta}->>'gcodePreviewKey'=${key}`);
 if(versions.length&&!can(user,'archivos','V'))throw new Error('Media no disponible');
 for(const v of versions)await assertModelAccess(user,v.modelFileId);
 const photos=await db.select().from(s.photos).where(sql`${s.photos.storageKey}=${key} or exists(select 1 from jsonb_each_text(coalesce(${s.photos.variants},'{}'::jsonb)) v where v.value=${key})`);
 if(photos.length&&!can(user,'galeria','V'))throw new Error('Media no disponible');
 for(const p of photos){const [allowed]=await db.select({id:s.photos.id}).from(s.photos).where(and(eq(s.photos.id,p.id),photoAccess(user)));if(!allowed)throw new Error('Media no disponible');}
 const links=await db.select().from(s.libraryPhotoLinks).where(sql`${s.libraryPhotoLinks.data}->>'editedKey'=${key}`);for(const l of links){await assertModelAccess(user,l.modelId);await assertPhotoAccess(user,l.photoId);}
 const assets=await db.select().from(s.libraryAssets).where(eq(s.libraryAssets.storageKey,key));for(const a of assets){await assertModelAccess(user,a.modelId);if(a.data?.targetId)await assertModelAccess(user,a.data.targetId);}
}

export async function assertPhotoAccess(user:SessionUser,id:string){const db=await getDb();const [p]=await db.select().from(s.photos).where(and(eq(s.photos.id,id),photoAccess(user)));if(!p)throw new Error('Foto no disponible');return p;}

export function runAccess(user:SessionUser):SQL {return sql`(${s.sliceRuns.workspaceId}=${user.workspaceId}::uuid and exists(select 1 from file_versions join model_files on model_files.id=file_versions.model_file_id where file_versions.id=${s.sliceRuns.fileVersionId} and ${modelAccess(user)}))`;}

export function assetAccess(user:SessionUser):SQL {return sql`(${s.libraryAssets.data}->>'targetId' is null or exists(select 1 from model_files where model_files.id::text=${s.libraryAssets.data}->>'targetId' and ${modelAccess(user)}))`;}
