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
import { parseSourceUrl, fetchSourceMeta, normalizeLicense } from './source';
import { MODEL_EXT, ingestModel, ingestZip } from '../files';
import { extOf } from '../mesh/parse';
async function saveImportSource(modelId: string, op: typeof s.libraryOperations.$inferSelect) {
    const preview = op.input.preview;
    if (!preview?.profile) return;
    const db = await getDb();
    await db.transaction(async tx => {
        const [model] = await tx.select().from(s.modelFiles).where(eq(s.modelFiles.id, modelId)).for('update');
        if (!model || model.sourceId) return;
        const images = (Array.isArray(preview.imageUrls) ? preview.imageUrls : preview.image ? [preview.image] : []).filter((url: unknown) => typeof url === 'string').slice(0, 12).map((url: string) => ({ url }));
        const [source] = await tx.insert(s.modelSources).values({workspaceId:WORKSPACE_ID,createdBy:op.createdBy,provider:'makerworld',url:op.input.url,title:preview.title,authorName:preview.author,description:preview.description,images,licenseText:preview.license,licenseCode:normalizeLicense(preview.license).code,commercialUse:normalizeLicense(preview.license).commercial,fetchStatus:'ok',fetchedAt:new Date()}).returning();
        await tx.update(s.modelFiles).set({sourceId:source.id}).where(eq(s.modelFiles.id,modelId));
        if (images.length) await tx.insert(s.jobs).values({workspaceId:WORKSPACE_ID,createdBy:op.createdBy,kind:'source.images',payload:{modelId,sourceId:source.id}});
    });
}
export async function executeImport(id: string) {
    const db = await getDb();
    const [op] = await db.select().from(s.libraryOperations).where(and(eq(s.libraryOperations.id, id), eq(s.libraryOperations.workspaceId, WORKSPACE_ID)));
    if (!op || ['planned','done', 'awaiting_file','cancelled'].includes(op.status))
        return;
    let tmp = '';
    try {
        const downloadUrl = String(op.input.secretUrl?unseal(op.input.secretUrl):op.input.url);
        const parsed = parseSourceUrl(downloadUrl);
        if (!parsed)
            throw new Error('URL inválida');
        const url = new URL(op.input.prepared ? downloadUrl : parsed.url);
        if (url.username || url.password)
            throw new Error('No incluya claves en la URL');
        const filename = op.input.prepared ? String(op.input.filename) : decodeURIComponent(url.pathname.split('/').at(-1) || 'archivo');
        if (!MODEL_EXT.includes(extOf(filename)) && extOf(filename)!=='zip') {
            const meta = await fetchSourceMeta(parsed);
            await db.update(s.libraryOperations).set({ status: 'awaiting_file', result: { url: op.input.url, title: meta.title, author: meta.authorName, license: meta.licenseText, message: 'Descargue el archivo desde el sitio y súbalo; luego asocie esta URL en Origen.' } }).where(eq(s.libraryOperations.id, id));
            return;
        }
        const [existing] = await db.select().from(s.fileVersions).where(eq(s.fileVersions.modelFileId, id));
        if (existing) {
            await saveImportSource(id, op);
            await db.update(s.libraryOperations).set({ status: 'done', result: { modelId: id } }).where(eq(s.libraryOperations.id, id));
            return;
        }
        await db.update(s.libraryOperations).set({ status: 'running', error: null }).where(eq(s.libraryOperations.id, id));
        tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'mf-import-'));
        const file = path.join(tmp, 'original');
        const response = await request(url.toString());
        if (/text\/html|application\/json/i.test(String(response.headers['content-type'])) || Number(response.headers['content-length']) > 500 * 1024 * 1024) {
            response.destroy(); throw new Error('El proveedor devolvió una página/JSON o un archivo mayor de 500 MiB. Obtén un enlace de descarga nuevo.');
        }
        await pipeline(response, byteLimit(500 * 1024 * 1024), fs.createWriteStream(file));
        if(extOf(filename)==='3mf'){
            const handle=await fsp.open(file,'r'); const header=Buffer.alloc(4);try{await handle.read(header,0,4,0);}finally{await handle.close();}
            if(!header.equals(Buffer.from([0x50,0x4b,0x03,0x04])))throw new Error('La respuesta no es un archivo 3MF');
        }
        const [current]=await db.select({status:s.libraryOperations.status}).from(s.libraryOperations).where(eq(s.libraryOperations.id,id));
        if(current?.status==='cancelled')return;
        if(extOf(filename)==='zip'){
          const result=await ingestZip({tmpPath:file,filename,userId:op.createdBy,importId:id});
          for (const model of result.models) await saveImportSource(model.modelFileId, op);
          await db.update(s.libraryOperations).set({status:result.failed.length?'partial':'done',result:{...result,modelId:result.modelFileId},updatedAt:new Date()}).where(eq(s.libraryOperations.id,id));return;
        }
        const preview=op.input.preview;
        await db.insert(s.modelFiles).values({ id, workspaceId: WORKSPACE_ID, name: preview?.title || filename.replace(/\.[^.]+$/, ''), author:preview?.author||null, format: extOf(filename), origin: op.input.url, license: normalizeLicense(preview?.license).code, createdBy: op.createdBy }).onConflictDoNothing();
        await ingestModel({ tmpPath: file, filename, modelFileId: id, userId: op.createdBy });
        await saveImportSource(id, op);
        await db.update(s.libraryOperations).set({ status: 'done', result: { modelId: id }, updatedAt: new Date() }).where(eq(s.libraryOperations.id, id));
    }
    catch (e) {
        const message = (e as any).status===401||(e as any).status===403 ? 'El enlace de descarga caducó o el proveedor rechazó el acceso. Prepara una nueva importación.' : (e as Error).message.replace(/https?:\/\/\S+/g,'[URL]');
        await db.update(s.libraryOperations).set({ status: 'error', error: message }).where(eq(s.libraryOperations.id, id));
        throw new Error(message);
    }
    finally {
        if (tmp)
            await fsp.rm(tmp, { recursive: true, force: true });
    }
}
