import {unseal} from '../secret';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { and, eq } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { request } from './connectors/http';
import { byteLimit } from './content';
import { parseSourceUrl, fetchSourceMeta } from './source';
import { MODEL_EXT, ingestModel, ingestZip } from '../files';
import { extOf } from '../mesh/parse';
export async function executeImport(id: string) {
    const db = await getDb();
    const [op] = await db.select().from(s.libraryOperations).where(and(eq(s.libraryOperations.id, id), eq(s.libraryOperations.workspaceId, WORKSPACE_ID)));
    if (!op || ['done', 'awaiting_file','cancelled'].includes(op.status))
        return;
    let tmp = '';
    try {
        const parsed = parseSourceUrl(String(op.input.secretUrl?unseal(op.input.secretUrl):op.input.url));
        if (!parsed)
            throw new Error('URL inválida');
        const url = new URL(parsed.url);
        if (url.username || url.password)
            throw new Error('No incluya claves en la URL');
        const filename = decodeURIComponent(url.pathname.split('/').at(-1) || 'archivo');
        if (!MODEL_EXT.includes(extOf(filename)) && extOf(filename)!=='zip') {
            const meta = await fetchSourceMeta(parsed);
            await db.update(s.libraryOperations).set({ status: 'awaiting_file', result: { url: op.input.url, title: meta.title, author: meta.authorName, license: meta.licenseText, message: 'Descargue el archivo desde el sitio y súbalo; luego asocie esta URL en Origen.' } }).where(eq(s.libraryOperations.id, id));
            return;
        }
        const [existing] = await db.select().from(s.fileVersions).where(eq(s.fileVersions.modelFileId, id));
        if (existing) {
            await db.update(s.libraryOperations).set({ status: 'done', result: { modelId: id } }).where(eq(s.libraryOperations.id, id));
            return;
        }
        await db.update(s.libraryOperations).set({ status: 'running', error: null }).where(eq(s.libraryOperations.id, id));
        tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'mf-import-'));
        const file = path.join(tmp, 'original');
        await pipeline(await request(url.toString()), byteLimit(500 * 1024 * 1024), fs.createWriteStream(file));
        if(extOf(filename)==='zip'){
          const result=await ingestZip({tmpPath:file,filename,userId:op.createdBy,importId:id});
          await db.update(s.libraryOperations).set({status:result.failed.length?'partial':'done',result:{...result,modelId:result.modelFileId},updatedAt:new Date()}).where(eq(s.libraryOperations.id,id));return;
        }
        await db.insert(s.modelFiles).values({ id, workspaceId: WORKSPACE_ID, name: filename.replace(/\.[^.]+$/, ''), format: extOf(filename), origin: op.input.url, license: 'desconocida', createdBy: op.createdBy }).onConflictDoNothing();
        await ingestModel({ tmpPath: file, filename, modelFileId: id, userId: op.createdBy });
        await db.update(s.libraryOperations).set({ status: 'done', result: { modelId: id }, updatedAt: new Date() }).where(eq(s.libraryOperations.id, id));
    }
    catch (e) {
        await db.update(s.libraryOperations).set({ status: 'error', error: (e as Error).message }).where(eq(s.libraryOperations.id, id));
        throw e;
    }
    finally {
        if (tmp)
            await fsp.rm(tmp, { recursive: true, force: true });
    }
}
