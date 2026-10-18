import {can,type Role} from '../perm';
import { and, eq, isNull, like, or } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { openSource, getSource, startScan } from './catalog';
import { ensureVersionLocal, byteLimit } from './content';
import { absPath, sha256File } from '../storage';
import { audit } from '../audit';
import { safeName, type Connector } from './connectors/types';
import { z } from 'zod';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
const inputSchema = z.object({ kind: z.enum(['rename', 'trash', 'mkdir', 'copy', 'move']), sourceId: z.uuid(), entryId: z.uuid().optional(), name: z.string().min(1).max(200), parent: z.string().default(''), destinationId: z.uuid().optional() });
export async function planOperation(input: unknown, userId: string) {
    const i = inputSchema.parse(input);
    safeName(i.name);
    const db = await getDb();
    const source = await getSource(i.sourceId);
    if (!source.writable && i.kind !== 'copy')
        throw new Error('Fuente configurada como solo lectura');
    const [entry] = i.entryId ? await db.select().from(s.libraryEntries).where(and(eq(s.libraryEntries.id, i.entryId), eq(s.libraryEntries.sourceId, i.sourceId))) : [];
    if (i.kind !== 'mkdir' && (!entry || (entry.directory && (i.kind==='copy'||i.kind==='move'&&i.destinationId&&i.destinationId!==i.sourceId))))
        throw new Error('Seleccione un archivo');
    const destination = ['copy', 'move'].includes(i.kind) && i.destinationId ? await getSource(i.destinationId) : source;
    if (['copy', 'move'].includes(i.kind) && !destination.writable)
        throw new Error('Destino de solo lectura');
    const c = await openSource(source.id);
    let dest: Connector | undefined;
    try {
        const nativeMove=i.kind==='move'&&destination.id===source.id&&!!c.move;
        if(i.kind==='move'&&entry?.directory&&!nativeMove)throw new Error('Esta fuente no admite mover carpetas');
        if (i.kind === 'mkdir' && !c.capabilities.mkdir || i.kind === 'rename' && !c.capabilities.rename || ['trash', 'move'].includes(i.kind) && !nativeMove && !c.capabilities.trash)
            throw new Error('Operación no disponible en esta fuente');
        if (['copy', 'move'].includes(i.kind)&&!nativeMove) {
            dest = await openSource(destination.id);
            if (!dest.capabilities.upload)
                throw new Error('El destino no permite carga');
        }
        const parentConnector = dest || c;
        if (i.parent !== parentConnector.root) {
            const [folder] = await db.select().from(s.libraryEntries).where(and(eq(s.libraryEntries.sourceId, destination.id), eq(s.libraryEntries.remoteId, i.parent), eq(s.libraryEntries.directory, true), eq(s.libraryEntries.state, 'available')));
            if (!folder)
                throw new Error('Carpeta de destino fuera del inventario');
        }
        const [parentEntry]=await db.select().from(s.libraryEntries).where(and(eq(s.libraryEntries.sourceId,destination.id),eq(s.libraryEntries.remoteId,i.parent)));
        const [op] = await db.insert(s.libraryOperations).values({ workspaceId: WORKSPACE_ID, kind: i.kind, createdBy: userId, input: { ...i, nativeMove, originalParent:entry?.parentId,destinationParentPath:parentEntry?.path||'', destinationId: destination.id, remoteId: entry?.remoteId, versionId: entry?.versionId, expectedRevision: entry?.revision, directory:entry?.directory, displayPath: entry?.path, destinationName: destination.name } }).returning();
        return op;
    }
    finally {
        await c.close();
        await dest?.close();
    }
}
export async function executeOperation(id: string) {
    const db = await getDb();
    const [op] = await db.select().from(s.libraryOperations).where(and(eq(s.libraryOperations.id, id), eq(s.libraryOperations.workspaceId, WORKSPACE_ID)));
    if (!op || ['done','cancelled','undone'].includes(op.status))
        return;
    if(op.createdBy){const [actor]=await db.select().from(s.users).where(eq(s.users.id,op.createdBy));if(!actor?.active||actor.role!=='admin'||!can({...actor,role:actor.role as Role,permOverrides:actor.permOverrides||{}},'config','E'))throw new Error('Permiso de operación revocado');}
    const i = op.input;
    let c: Connector | undefined, dest: Connector | undefined;
    let tmp = '';
    try {
        const source = await getSource(i.sourceId);
        if (!source.writable && op.kind !== 'copy')
            throw new Error('Fuente de solo lectura');
        c = await openSource(source.id);
        if (i.remoteId !== undefined && op.result?.stage !== 'source_removed') {
            const current = await c.stat(i.remoteId);
            if (current.revision !== i.expectedRevision)
                throw new Error('Conflicto: la revisión cambió. Prepare otro plan.');
        }
        await db.update(s.libraryOperations).set({ status: 'running', error: null }).where(eq(s.libraryOperations.id, id));
        let result: any = op.result || {};
        if(i.directory&&(['rename','trash'].includes(op.kind)||i.nativeMove)){
          const children=await db.select().from(s.libraryEntries).where(and(eq(s.libraryEntries.sourceId,i.sourceId),like(s.libraryEntries.path,String(i.displayPath).replace(/[%_\\]/g,'\\$&')+'/%')));
          for(const child of children)if(child.versionId)await ensureVersionLocal(child.versionId);
        }
        if (op.kind === 'rename'||i.nativeMove) {
            if (i.versionId)
                await ensureVersionLocal(i.versionId);
            if (!c.rename)
                throw new Error('No soportado');
            result.remoteId = i.nativeMove?await c.move!(i.remoteId,i.parent,safeName(i.name)):await c.rename(i.remoteId, safeName(i.name));
            if(i.directory){const prefix=String(i.displayPath)+'/';const children=await db.select().from(s.libraryEntries).where(eq(s.libraryEntries.sourceId,i.sourceId));const newPath=[i.nativeMove?i.destinationParentPath:String(i.displayPath).split('/').slice(0,-1).join('/'),i.name].filter(Boolean).join('/');for(const child of children.filter(x=>x.path.startsWith(prefix))){const remoteId=child.remoteId.startsWith(i.remoteId+'/')?result.remoteId+child.remoteId.slice(i.remoteId.length):child.remoteId;const parentId=child.parentId?.startsWith(i.remoteId)?result.remoteId+child.parentId.slice(i.remoteId.length):child.parentId;await db.update(s.libraryEntries).set({remoteId,parentId,path:newPath+child.path.slice(String(i.displayPath).length)}).where(eq(s.libraryEntries.id,child.id));if(child.versionId){const [v]=await db.select().from(s.fileVersions).where(eq(s.fileVersions.id,child.versionId));if(v?.meta?.remote)await db.update(s.fileVersions).set({meta:{...v.meta,remote:{...v.meta.remote,id:remoteId}}}).where(eq(s.fileVersions.id,v.id));}}}
            await db.update(s.libraryEntries).set({ remoteId: result.remoteId, ...(i.nativeMove?{parentId:i.parent}:{}),name: i.name, path: [i.nativeMove?i.destinationParentPath:String(i.displayPath).split('/').slice(0, -1).join('/'), i.name].filter(Boolean).join('/'), revision: (await c.stat(result.remoteId)).revision }).where(eq(s.libraryEntries.id, i.entryId));
        }
        else if (op.kind === 'mkdir') {
            if (!c.mkdir)
                throw new Error('No soportado');
            result.remoteId = await c.mkdir(i.parent, safeName(i.name));
        }
        else if (op.kind === 'trash') {
            if (!c.trash)
                throw new Error('No soportado');
            if (!i.versionId && !i.directory)throw new Error('Archive primero una copia administrada del archivo');
            if(i.versionId)await ensureVersionLocal(i.versionId);
            result.trashId=await c.trash(i.remoteId,id);result.stage='source_removed';
            await db.update(s.libraryOperations).set({result}).where(eq(s.libraryOperations.id,id));
            await db.update(s.libraryEntries).set({ state: 'trashed' }).where(eq(s.libraryEntries.id, i.entryId));
        }
        else if (op.kind === 'copy' || op.kind === 'move') {
            if (!i.versionId)
                throw new Error('Solo se transfieren modelos catalogados');
            if (!(await getSource(i.destinationId)).writable)
                throw new Error('Destino de solo lectura');
            dest = await openSource(i.destinationId);
            if (!dest.upload)
                throw new Error('El destino no permite carga');
            const local = absPath(await ensureVersionLocal(i.versionId));
            if (!result.destinationRemoteId) {
                result.destinationRemoteId = await dest.upload(i.parent, safeName(i.name), local);
                result.stage = 'copied';
                await db.update(s.libraryOperations).set({ result }).where(eq(s.libraryOperations.id, id));
            }
            tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'mf-verify-'));
            const verify = path.join(tmp, 'content');
            await pipeline(await dest.read(result.destinationRemoteId), byteLimit(500 * 1024 * 1024), fs.createWriteStream(verify),{signal:AbortSignal.timeout(300000)});
            if (await sha256File(verify) !== await sha256File(local))
                throw new Error('La copia no coincide; origen conservado');
            const sourceAlreadyRemoved = result.stage === 'source_removed';
            if (!sourceAlreadyRemoved) result.stage = 'verified';
            await db.update(s.libraryOperations).set({ result }).where(eq(s.libraryOperations.id, id));
            const [live]=await db.select().from(s.libraryOperations).where(eq(s.libraryOperations.id,id));if(live.status==='cancelled')return;
            if (op.kind === 'move' && !sourceAlreadyRemoved) {
                if (!c.trash)
                    throw new Error('Origen sin papelera; copia conservada');
                if ((await c.stat(i.remoteId)).revision !== i.expectedRevision)
                    throw new Error('El origen cambió después de copiar');
                result.trashId=await c.trash(i.remoteId,id);
                result.stage = 'source_removed';
                await db.update(s.libraryOperations).set({ result }).where(eq(s.libraryOperations.id, id));
            }
        }
        await db.update(s.libraryOperations).set({ status: 'done', result, updatedAt: new Date() }).where(eq(s.libraryOperations.id, id));
        await audit('library_operation', id, op.kind, { sourceId: i.sourceId }, op.createdBy);
        await startScan(i.sourceId, op.createdBy || undefined).catch(()=>undefined);
        if (i.destinationId && i.destinationId !== i.sourceId)
            await startScan(i.destinationId, op.createdBy || undefined).catch(()=>undefined);
    }
    catch (e) {
        const [live]=await db.select().from(s.libraryOperations).where(eq(s.libraryOperations.id,id));
        if(live?.status==='done'||live?.status==='cancelled')throw e;
        await db.update(s.libraryOperations).set({ status: live?.result?.destinationRemoteId ? 'partial' : 'error', error: (e as Error).message, updatedAt: new Date() }).where(eq(s.libraryOperations.id, id));
        throw e;
    }
    finally {
        await c?.close();
        await dest?.close();
        if (tmp)
            await fsp.rm(tmp, { recursive: true, force: true });
    }
}
