import { and, eq, isNull } from 'drizzle-orm';
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
    if (i.kind !== 'mkdir' && (!entry || entry.directory))
        throw new Error('Seleccione un archivo');
    const destination = ['copy', 'move'].includes(i.kind) && i.destinationId ? await getSource(i.destinationId) : source;
    if (['copy', 'move'].includes(i.kind) && !destination.writable)
        throw new Error('Destino de solo lectura');
    const c = await openSource(source.id);
    let dest: Connector | undefined;
    try {
        if (i.kind === 'mkdir' && !c.capabilities.mkdir || i.kind === 'rename' && !c.capabilities.rename || ['trash', 'move'].includes(i.kind) && !c.capabilities.trash)
            throw new Error('Operación no disponible en esta fuente');
        if (['copy', 'move'].includes(i.kind)) {
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
        const [op] = await db.insert(s.libraryOperations).values({ workspaceId: WORKSPACE_ID, kind: i.kind, createdBy: userId, input: { ...i, destinationId: destination.id, remoteId: entry?.remoteId, versionId: entry?.versionId, expectedRevision: entry?.revision, displayPath: entry?.path, destinationName: destination.name } }).returning();
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
    if (!op || op.status === 'done')
        return;
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
        if (op.kind === 'rename') {
            if (i.versionId)
                await ensureVersionLocal(i.versionId);
            if (!c.rename)
                throw new Error('No soportado');
            result.remoteId = await c.rename(i.remoteId, safeName(i.name));
            await db.update(s.libraryEntries).set({ remoteId: result.remoteId, name: i.name, path: [String(i.displayPath).split('/').slice(0, -1).join('/'), i.name].filter(Boolean).join('/'), revision: (await c.stat(result.remoteId)).revision }).where(eq(s.libraryEntries.id, i.entryId));
        }
        else if (op.kind === 'mkdir') {
            if (!c.mkdir)
                throw new Error('No soportado');
            result.remoteId = await c.mkdir(i.parent, safeName(i.name));
        }
        else if (op.kind === 'trash') {
            if (!c.trash)
                throw new Error('No soportado');
            if (!i.versionId)
                throw new Error('Archive primero una copia administrada del archivo');
            await ensureVersionLocal(i.versionId);
            await c.trash(i.remoteId);
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
            await pipeline(await dest.read(result.destinationRemoteId), byteLimit(500 * 1024 * 1024), fs.createWriteStream(verify));
            if (await sha256File(verify) !== await sha256File(local))
                throw new Error('La copia no coincide; origen conservado');
            const sourceAlreadyRemoved = result.stage === 'source_removed';
            if (!sourceAlreadyRemoved) result.stage = 'verified';
            await db.update(s.libraryOperations).set({ result }).where(eq(s.libraryOperations.id, id));
            if (op.kind === 'move' && !sourceAlreadyRemoved) {
                if (!c.trash)
                    throw new Error('Origen sin papelera; copia conservada');
                if ((await c.stat(i.remoteId)).revision !== i.expectedRevision)
                    throw new Error('El origen cambió después de copiar');
                await c.trash(i.remoteId);
                result.stage = 'source_removed';
                await db.update(s.libraryOperations).set({ result }).where(eq(s.libraryOperations.id, id));
            }
        }
        await db.update(s.libraryOperations).set({ status: 'done', result, updatedAt: new Date() }).where(eq(s.libraryOperations.id, id));
        await audit('library_operation', id, op.kind, { sourceId: i.sourceId }, op.createdBy);
        await startScan(i.sourceId, op.createdBy || undefined);
        if (i.destinationId && i.destinationId !== i.sourceId)
            await startScan(i.destinationId, op.createdBy || undefined);
    }
    catch (e) {
        await db.update(s.libraryOperations).set({ status: 'error', error: (e as Error).message, updatedAt: new Date() }).where(eq(s.libraryOperations.id, id));
        throw e;
    }
    finally {
        await c?.close();
        await dest?.close();
        if (tmp)
            await fsp.rm(tmp, { recursive: true, force: true });
    }
}
