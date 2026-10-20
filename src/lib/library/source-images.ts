import crypto from 'node:crypto';
import sharp from 'sharp';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { request } from './connectors/http';
import { putBuffer } from '../storage';

const MAX_BYTES = 8 * 1024 * 1024;

/** Public source photos only: no provider credentials, bounded downloads and raster decoding. */
export async function importSourceImages(modelId: string, sourceId: string) {
  const db = await getDb();
  const [model] = await db.select().from(s.modelFiles).where(and(eq(s.modelFiles.id, modelId), eq(s.modelFiles.workspaceId, WORKSPACE_ID), isNull(s.modelFiles.deletedAt)));
  const [source] = await db.select().from(s.modelSources).where(and(eq(s.modelSources.id, sourceId), eq(s.modelSources.workspaceId, WORKSPACE_ID)));
  if (!model || !source || model.sourceId !== sourceId) return;
  const images = [...new Map((source.images ?? []).map(x => [x.url, x])).values()].slice(0, 12);
  let failed = 0;
  for (const [index, entry] of images.entries()) {
    if (entry.storageKey) continue;
    try {
      const res = await request(entry.url, { timeoutMs: 15000 });
      if (Number(res.headers['content-length']) > MAX_BYTES) { res.destroy(); throw new Error('size'); }
      const chunks: Buffer[] = []; let bytes = 0;
      for await (const chunk of res) {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) { res.destroy(); throw new Error('size'); }
        chunks.push(Buffer.from(chunk));
      }
      const base = sharp(Buffer.concat(chunks), { limitInputPixels: 24_000_000 }).rotate();
      const meta = await base.metadata();
      if (!['jpeg', 'png', 'webp', 'avif', 'gif'].includes(meta.format ?? '')) throw new Error('format');
      const compressed = await base.resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
      const hash = crypto.createHash('sha256').update(modelId).update(compressed).digest('hex');
      const photoId = `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
      const variants: Record<string, string> = {};
      for (const size of [320, 800, 1600]) {
        const buffer = size === 1600 ? compressed : await sharp(compressed).resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
        variants[String(size)] = await putBuffer(`photos/imported/${modelId}/${photoId}/${size}.webp`, buffer);
      }
      const dimensions = await sharp(compressed).metadata();
      await db.transaction(async tx => {
        // Serialize cover selection with other source image jobs for this model.
        await tx.select({ id: s.modelFiles.id }).from(s.modelFiles).where(eq(s.modelFiles.id, modelId)).for('update');
        const links = await tx.select().from(s.libraryPhotoLinks).where(eq(s.libraryPhotoLinks.modelId, modelId));
        await tx.insert(s.photos).values({ id: photoId, workspaceId: WORKSPACE_ID, createdBy: model.createdBy, modelFileId: modelId, scope: 'model', storageKey: variants['1600'], variants, width: dimensions.width, height: dimensions.height, caption: source.title, tags: ['imagen de origen'] }).onConflictDoNothing();
        await tx.insert(s.libraryPhotoLinks).values({ workspaceId: WORKSPACE_ID, createdBy: model.createdBy, modelId, photoId, data: { type: 'author', cover: !links.some(x => x.data?.cover), order: index, sourceId, sourceUrl: source.url, author: source.authorName, license: source.licenseText } }).onConflictDoNothing();
      });
      entry.photoId = photoId; entry.storageKey = variants['320']; delete entry.error;
    } catch {
      failed++;
      entry.error = 'No se pudo guardar esta imagen (acceso, tamaño o formato).';
    }
    await db.update(s.modelSources).set({ images, updatedAt: new Date() }).where(eq(s.modelSources.id, sourceId));
  }
  if (failed) throw new Error(`${failed} imágenes de origen pendientes. Las demás imágenes y el modelo están guardados.`);
}
