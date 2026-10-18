import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { and, eq } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { config } from '../config';
import { absPath, exists, newKey, putFile, sha256File } from '../storage';
import { openSource } from './catalog';
import type { Connector } from './connectors/types';
export function byteLimit(max: number) { let n = 0; return new Transform({ transform(chunk, enc, cb) { n += chunk.length; cb(n > max ? new Error('Archivo excede el límite de descarga') : null, chunk); } }); }
const pending = new Map<string, Promise<string>>();
export function ensureVersionLocal(id: string): Promise<string> { let p = pending.get(id); if (!p) {
    p = materialize(id).finally(() => pending.delete(id));
    pending.set(id, p);
} return p; }
async function materialize(id: string) {
    const db = await getDb();
    let [v] = await db.select().from(s.fileVersions).where(and(eq(s.fileVersions.id, id), eq(s.fileVersions.workspaceId, WORKSPACE_ID)));
    if (!v)
        throw new Error('Versión no encontrada');
    if (v.storageKey && await exists(v.storageKey))
        return v.storageKey;
    const remote = (v.meta as any)?.remote;
    if (!remote)
        throw new Error('Original no disponible');
    const tempRoot = path.join(config.storageDir, '.downloads');
    await fsp.mkdir(tempRoot, { recursive: true });
    const lock = path.join(tempRoot, id + '.lock');
    let handle;
    try {
        handle = await fsp.open(lock, 'wx');
    }
    catch {
        const stale = await fsp.stat(lock).catch(() => null);
        if (stale && Date.now() - stale.mtimeMs > 10 * 60 * 1000) {
            await fsp.rm(lock, { force: true });
            handle = await fsp.open(lock, 'wx');
        }
        else
            throw new Error('Descarga en curso; reintente en unos instantes');
    }
    const tmp = path.join(tempRoot, crypto.randomUUID());
    let c: Connector | undefined;
    try {
        c = await openSource(remote.sourceId);
        const before = await c.stat(remote.id);
        if (before.revision !== remote.revision)
            throw new Error('El original cambió: vuelva a escanear la fuente');
        if (before.downloadable === false)
            throw new Error('El proveedor no permite descargar');
        if (before.size > config.maxUploadBytes)
            throw new Error('Archivo excede el límite de 500 MiB');
        const disk = await fsp.statfs(tempRoot);
        if (Number(disk.bavail) * Number(disk.bsize) < before.size + 64 * 1024 * 1024)
            throw new Error('Espacio insuficiente para descargar');
        await pipeline(await c.read(remote.id), byteLimit(config.maxUploadBytes), fs.createWriteStream(tmp, { flags: 'wx' }));
        const after = await c.stat(remote.id);
        if (after.revision !== before.revision || (await fsp.stat(tmp)).size !== before.size)
            throw new Error('El archivo cambió durante la descarga');
        const sha = await sha256File(tmp);
        if (v.sha256 && v.sha256 !== sha)
            throw new Error('El contenido no coincide con esta versión');
        const key = newKey('models', v.format);
        await putFile(key, tmp);
        await db.update(s.fileVersions).set({ storageKey: key, sha256: sha, size: before.size, updatedAt: new Date() }).where(eq(s.fileVersions.id, id));
        await db.update(s.modelFiles).set({ hash: sha }).where(and(eq(s.modelFiles.id, v.modelFileId), eq(s.modelFiles.currentVersionId, id)));
        return key;
    }
    finally {
        await c?.close();
        await handle.close();
        await fsp.rm(lock, { force: true });
        await fsp.rm(tmp, { force: true });
    }
}
