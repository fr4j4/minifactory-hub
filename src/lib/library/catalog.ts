import { policy, included } from './policy';
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { connector } from './connectors';
import type { Connector, SourceKind, RemoteEntry } from './connectors/types';
import { seal, unseal } from '../secret';
import { MODEL_EXT } from '../files';
import { extOf } from '../mesh/parse';
import { enqueueJob } from '../jobs';
import { z } from 'zod';
export const sourceInput = z.object({ name: z.string().trim().min(1).max(100), kind: z.enum(['local', 'drive', 'ftp', 'ftps', 'sftp', 'webdav', 's3', 'onedrive', 'dropbox']), config: z.record(z.string(), z.unknown()), secret: z.record(z.string(), z.unknown()).default({}), writable: z.boolean().default(false) });
export async function getSource(id: string) { const db = await getDb(); const [row] = await db.select().from(s.librarySources).where(and(eq(s.librarySources.id, id), eq(s.librarySources.workspaceId, WORKSPACE_ID), isNull(s.librarySources.deletedAt))); if (!row)
    throw new Error('Fuente no encontrada'); return row; }
export async function openSource(id: string): Promise<Connector> { const row = await getSource(id); if (!row.enabled)
    throw new Error('Fuente pausada'); return connector(row.kind as SourceKind, row.config, row.secret ? JSON.parse(unseal(row.secret)) : {}); }
export async function saveSource(input: unknown, userId: string) { const i = sourceInput.parse(input); if (JSON.stringify(i).length > 32000)
    throw new Error('Configuración demasiado grande'); const db = await getDb(); const [row] = await db.insert(s.librarySources).values({ workspaceId: WORKSPACE_ID, createdBy: userId, name: i.name, kind: i.kind, config: policy(i.config), secret: Object.keys(i.secret).length ? seal(JSON.stringify(i.secret)) : null, writable: i.writable }).returning(); return row.id; }
export async function testSource(id: string) { const db = await getDb(); let c: Connector | undefined; try {
    c = await openSource(id);
    await c.list(c.root);
    await db.update(s.librarySources).set({ status: 'connected', error: null, updatedAt: new Date() }).where(eq(s.librarySources.id, id));
    return c.capabilities;
}
catch (e) {
    await db.update(s.librarySources).set({ status: 'error', error: (e as Error).message }).where(eq(s.librarySources.id, id));
    throw e;
}
finally {
    await c?.close();
} }
export async function startScan(id: string, userId?: string, incremental=false) {
    const db = await getDb();
    await getSource(id);
    const scan = await db.transaction(async (tx) => {
        await tx.select().from(s.librarySources).where(eq(s.librarySources.id, id)).for('update');
        const [live] = await tx.select().from(s.libraryScans).where(and(eq(s.libraryScans.sourceId, id), inArray(s.libraryScans.status, ['queued', 'running'])));
        if (live)
            return live;
        const retrying = await tx.select({ scan: s.libraryScans }).from(s.libraryScans).innerJoin(s.jobs, sql `${s.jobs.payload}->>'scanId' = ${s.libraryScans.id}::text`).where(and(eq(s.libraryScans.sourceId, id), eq(s.libraryScans.status, 'error'), inArray(s.jobs.status, ['queued', 'running']))).limit(1);
        if (retrying.length)
            return retrying[0].scan;
        const [row] = await tx.insert(s.libraryScans).values({ workspaceId: WORKSPACE_ID, sourceId: id, createdBy: userId, checkpoint: { queue: [], visited: [], incremental } }).returning();
        await tx.insert(s.jobs).values({ workspaceId: WORKSPACE_ID, kind: 'source.scan', payload: { scanId: row.id }, maxAttempts: 3, createdBy: userId });
        return row;
    });
    (await import('../jobs')).ensureJobWorker();
    return scan.id;
}
export async function scanSource(scanId: string) {
    const db = await getDb();
    let c: Connector | undefined;
    let sourceId = '';
    try {
        const [scan] = await db.select().from(s.libraryScans).where(and(eq(s.libraryScans.id, scanId), eq(s.libraryScans.workspaceId, WORKSPACE_ID)));
        if (!scan || ['done', 'cancelled'].includes(scan.status))
            return;
        sourceId = scan.sourceId;
        c = await openSource(sourceId);
        const source = await getSource(sourceId);
        let cp = scan.checkpoint;
        if (!cp.queue.length && !cp.visited.length){
            if(c.changes){try{const changes=await c.changes(source.config.changeCursor);cp.changeCursor=changes.cursor;if(cp.incremental&&source.config.changeCursor&&!changes.changed){await db.update(s.libraryScans).set({status:'done',finishedAt:new Date(),checkpoint:cp}).where(eq(s.libraryScans.id,scanId));await db.update(s.librarySources).set({status:'connected',lastScanAt:new Date(),config:{...source.config,changeCursor:changes.cursor}}).where(eq(s.librarySources.id,sourceId));return;}}catch(e){if(!/HTTP (400|403|404|409|410)/.test((e as Error).message))throw e;}}
            cp = { ...cp,queue: [{ id: c.root, path: '' }], visited: [] };
        }
        await db.update(s.libraryScans).set({ status: 'running', error: null }).where(eq(s.libraryScans.id, scanId));
        await db.update(s.librarySources).set({ status: 'scanning', error: null }).where(eq(s.librarySources.id, sourceId));
        while (cp.queue.length) {
            const [live] = await db.select().from(s.libraryScans).where(eq(s.libraryScans.id, scanId));
            if (live.status === 'cancelled')
                return;
            if (!(await getSource(sourceId)).enabled)
                throw new Error('Fuente pausada');
            const dir = cp.queue[0];
            const page = await c.list(dir.id, dir.cursor);
            page.entries = page.entries.filter(e => included(source.config, [dir.path,e.name].filter(Boolean).join('/'),e.directory));
            const pending = [...cp.queue.slice(1)];
            const seen = new Set(cp.visited);
            for (const e of page.entries) {
                if (!e.name || e.name.startsWith('.') || e.name.includes('/') || e.name.includes('\\'))
                    continue;
                if (e.directory && !seen.has(e.id) && !pending.some(d => d.id === e.id) && e.id !== dir.id)
                    pending.push({ id: e.id, path: [dir.path, e.name].filter(Boolean).join('/') });
            }
            if (page.cursor) {
                if (page.cursor === dir.cursor)
                    throw new Error('El proveedor repitió el cursor');
                pending.unshift({ ...dir, cursor: page.cursor });
            }
            else
                seen.add(dir.id);
            const next = { ...cp,queue: pending, visited: [...seen] };
            if (next.visited.length > 100000 || next.queue.length > 100000)
                throw new Error('Demasiadas carpetas; acote la raíz');
            await db.transaction(async (tx) => {
                // Another retry may have completed this page; the scan lease serializes page publication.
                for (const e of page.entries) {
                    if (!e.name || e.name.startsWith('.') || e.name.includes('/') || e.name.includes('\\'))
                        continue;
                    const full = [dir.path, e.name].filter(Boolean).join('/');
                    let [old] = await tx.select().from(s.libraryEntries).where(and(eq(s.libraryEntries.sourceId, sourceId), eq(s.libraryEntries.remoteId, e.id)));
                    if(!old && source.kind==='local' && !e.directory){
                        const identity=e.revision.split(':').slice(0,4).join(':');
                        const candidates=await tx.select().from(s.libraryEntries).where(and(eq(s.libraryEntries.sourceId,sourceId),sql`split_part(${s.libraryEntries.revision},':',1)||':'||split_part(${s.libraryEntries.revision},':',2)||':'||split_part(${s.libraryEntries.revision},':',3)||':'||split_part(${s.libraryEntries.revision},':',4)=${identity}`));
                        if(candidates.length===1){const previous=candidates[0];const stillExists=await c!.stat(previous.remoteId).then(()=>true,()=>false);if(!stillExists){old=previous;old.revision=e.revision;if(old.versionId){const [version]=await tx.select().from(s.fileVersions).where(eq(s.fileVersions.id,old.versionId));if(version?.meta?.remote)await tx.update(s.fileVersions).set({meta:{...version.meta,remote:{...version.meta.remote,id:e.id,revision:e.revision}}}).where(eq(s.fileVersions.id,version.id));}}}
                    }
                    const values = { workspaceId: WORKSPACE_ID, sourceId, remoteId: e.id, parentId: dir.id, path: full, name: e.name, directory: e.directory, revision: e.revision, size: String(e.size), downloadable: e.downloadable !== false, seenScanId: scanId, state: 'available', updatedAt: new Date() };
                    let modelId = old?.modelId, versionId = old?.versionId;
                    if (!e.directory && MODEL_EXT.includes(extOf(e.name)) && (!old || old.revision !== e.revision || !old.versionId)) {
                        if (!modelId) {
                            const [m] = await tx.insert(s.modelFiles).values({ workspaceId: WORKSPACE_ID, name: e.name.replace(/\.[^.]+$/, ''), format: extOf(e.name), license: 'desconocida', createdBy: scan.createdBy }).returning();
                            modelId = m.id;
                        }
                        const [mx] = await tx.select({ n: sql<number> `coalesce(max(${s.fileVersions.number}),0)::int` }).from(s.fileVersions).where(eq(s.fileVersions.modelFileId, modelId));
                        const [v] = await tx.insert(s.fileVersions).values({ workspaceId: WORKSPACE_ID, modelFileId: modelId, number: Number(mx.n) + 1, storageKey: '', format: extOf(e.name), size: Math.min(e.size, 2147483647), meta: { status: 'indexed', remote: { sourceId, id: e.id, revision: e.revision, size: e.size } }, createdBy: scan.createdBy }).returning();
                        versionId = v.id;
                        if(source.config.autoAi===true&&source.config.allowAi===true&&scan.createdBy)await tx.insert(s.jobs).values({workspaceId:WORKSPACE_ID,kind:'metadata.suggest',payload:{modelId,userId:scan.createdBy},createdBy:scan.createdBy,maxAttempts:1});
                        if ((source.config.analyzeOnScan === true || ['copy','offline'].includes(source.config.mode)) && e.downloadable !== false && e.size <= 500 * 1024 * 1024)
                            await tx.insert(s.jobs).values({ workspaceId: WORKSPACE_ID, kind: 'file.process', payload: { versionId }, createdBy: scan.createdBy });
                        await tx.update(s.modelFiles).set({ currentVersionId: versionId, format: extOf(e.name), hash: null, dimX: null, dimY: null, dimZ: null, volumeCm3: null, areaCm2: null, triangles: null, closed: null, updatedAt: new Date() }).where(eq(s.modelFiles.id, modelId));
                    }
                    if (old)
                        await tx.update(s.libraryEntries).set({ ...values, modelId, versionId }).where(eq(s.libraryEntries.id, old.id));
                    else
                        await tx.insert(s.libraryEntries).values({ ...values, modelId, versionId });
                }
                await tx.update(s.libraryScans).set({ checkpoint: next, count: sql `${s.libraryScans.count}+${page.entries.length}`, updatedAt: new Date() }).where(eq(s.libraryScans.id, scanId));
            });
            cp = next;
        }
        await db.transaction(async (tx) => { const [state]=await tx.select().from(s.libraryScans).where(eq(s.libraryScans.id,scanId)).for('update');if(state.status==='cancelled')return; await tx.update(s.libraryEntries).set({ state: 'missing', updatedAt: new Date() }).where(and(eq(s.libraryEntries.sourceId, sourceId), sql `${s.libraryEntries.seenScanId} IS DISTINCT FROM ${scanId}::uuid`)); await tx.update(s.libraryScans).set({ status: 'done', finishedAt: new Date(), error: null }).where(eq(s.libraryScans.id, scanId)); await tx.update(s.librarySources).set({ status: 'connected', lastScanAt: new Date(), error: null, ...(cp.changeCursor?{config:sql`jsonb_set(${s.librarySources.config},'{changeCursor}',${JSON.stringify(cp.changeCursor)}::jsonb)`}:{}) }).where(eq(s.librarySources.id, sourceId)); });
    }
    catch (e) {
        await db.update(s.libraryScans).set({ status: 'error', error: (e as Error).message }).where(eq(s.libraryScans.id, scanId));
        if (sourceId)
            await db.update(s.librarySources).set({ status: 'error', error: (e as Error).message }).where(eq(s.librarySources.id, sourceId));
        throw e;
    }
    finally {
        await c?.close();
    }
}
let lastSchedule = 0;
export async function scheduleScans() { if (Date.now() - lastSchedule < 60000)
    return; lastSchedule = Date.now(); const db = await getDb(); const sources = await db.select().from(s.librarySources).where(and(eq(s.librarySources.workspaceId, WORKSPACE_ID), eq(s.librarySources.enabled, true), eq(s.librarySources.status, 'connected'), isNull(s.librarySources.deletedAt))); for (const source of sources) {
    const minutes = Number(source.config.scanIntervalMinutes);
    if (Number.isFinite(minutes) && minutes >= 5 && source.lastScanAt && Date.now() - source.lastScanAt.getTime() > minutes * 60000)
        await startScan(source.id, source.createdBy || undefined,true);
} }
