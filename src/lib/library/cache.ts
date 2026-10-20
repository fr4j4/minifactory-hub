import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { remove } from '../storage';
/** Explicit snapshots are never LRU candidates. Every reader extends a lease;
 * production uses promote a cache entry to durable before returning bytes. */
export async function retainVersion(versionId:string, durable=true){
  const db=await getDb();await db.update(s.libraryCache).set({accessedAt:new Date(),leaseUntil:new Date(Date.now()+30*60_000),...(durable?{durable:true}:{})}).where(eq(s.libraryCache.versionId,versionId));
}
export async function collectCache(sourceId:string, incoming=0){
  const db=await getDb();const [src]=await db.select().from(s.librarySources).where(eq(s.librarySources.id,sourceId));
  if(!src)return;const quota=Number(src.config.cacheMiB??2048)*1048576;
  const rows=await db.select().from(s.libraryCache).where(eq(s.libraryCache.sourceId,sourceId)).orderBy(asc(s.libraryCache.accessedAt));
  let bytes=rows.reduce((n,r)=>n+r.bytes,0),freed=0;
  for(const r of rows){if(bytes+incoming<=quota)break;
    if(r.pinned||r.durable||(r.leaseUntil&&r.leaseUntil.getTime()>Date.now()))continue;
    const [used]=await db.select({n:sql<number>`count(*)::int`}).from(s.sliceRuns).where(eq(s.sliceRuns.fileVersionId,r.versionId));
    if(used.n)continue;
    const [quoted]=await db.select({n:sql<number>`count(*)::int`}).from(s.quoteItemModels).where(eq(s.quoteItemModels.fileVersionId,r.versionId));
    const [printed]=await db.select({n:sql<number>`count(*)::int`}).from(s.printJobs).where(eq(s.printJobs.fileVersionId,r.versionId));
    if(quoted.n||printed.n)continue;
    // Lock serializes eviction with lease acquisition and pinning.
    await db.transaction(async tx=>{const [live]=await tx.select().from(s.libraryCache).where(eq(s.libraryCache.versionId,r.versionId)).for('update');
      if(!live||live.durable||live.pinned||(live.leaseUntil&&live.leaseUntil.getTime()>Date.now()))return;
      await remove(live.storageKey);await tx.update(s.fileVersions).set({storageKey:''}).where(and(eq(s.fileVersions.id,r.versionId),eq(s.fileVersions.storageKey,live.storageKey)));
      await tx.delete(s.libraryCache).where(eq(s.libraryCache.versionId,r.versionId));bytes-=r.bytes;freed+=r.bytes;
    });
  }
  if(bytes+incoming>quota)throw new Error('Cuota de caché insuficiente; aumente la cuota o libere copias no fijadas');
  return {bytes,freed};
}
