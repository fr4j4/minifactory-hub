'use server';
import { and, desc, eq, ilike, isNull, notInArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, s } from '@/db';
import { requirePerm } from '@/lib/auth';
import { assertModelAccess, assertPhotoAccess, photoAccess } from '@/lib/library/access';
import { audit } from '@/lib/audit';
import { safe } from './common';

/**
 * Imágenes de un modelo 3D. Viven aparte de la Galería: una imagen subida o importada para el modelo
 * tiene scope «model»; una foto de un trabajo (scope «job») solo se enlaza, sigue en su trabajo y en Galería.
 */
const pathsFor = (modelId: string) => ['/archivos', `/archivos/${modelId}`];

export interface JobPhotoOption { id: string; caption: string | null; thumb: string | null; takenAt: string; order: string | null; customer: string | null }

/** Fotos de trabajos que se pueden usar en un modelo (las ya enlazadas a ese modelo no se ofrecen). */
export async function listJobPhotos(modelId: string, input: { q?: string; offset?: number } = {}) {
  return safe(async () => {
    const u = await requirePerm('archivos', 'E'); await requirePerm('galeria', 'V'); await assertModelAccess(u, z.uuid().parse(modelId));
    const q = z.string().trim().max(100).optional().parse(input.q) || '', offset = z.number().int().min(0).max(10_000).optional().parse(input.offset) ?? 0;
    const db = await getDb();
    const linked = await db.select({ id: s.libraryPhotoLinks.photoId }).from(s.libraryPhotoLinks).where(eq(s.libraryPhotoLinks.modelId, modelId));
    const conds = [photoAccess(u), isNull(s.photos.deletedAt), eq(s.photos.scope, 'job'), eq(s.photos.kind, 'foto')];
    if (linked.length) conds.push(notInArray(s.photos.id, linked.map((x) => x.id)));
    if (q) { const like = `%${q}%`; conds.push(or(ilike(s.photos.caption, like), ilike(s.orders.number, like), ilike(s.customers.name, like), sql`${s.photos.tags}::text ilike ${like}`)!); }
    const rows = await db.select({ p: s.photos, order: s.orders.number, customer: s.customers.name }).from(s.photos)
      .leftJoin(s.orders, eq(s.orders.id, s.photos.orderId)).leftJoin(s.customers, eq(s.customers.id, s.photos.customerId))
      .where(and(...conds)).orderBy(desc(s.photos.takenAt)).limit(37).offset(offset);
    const photos: JobPhotoOption[] = rows.slice(0, 36).map(({ p, order, customer }) => ({ id: p.id, caption: p.caption, thumb: p.variants?.['320'] ?? null, takenAt: p.takenAt.toISOString(), order, customer }));
    return { photos, more: rows.length > 36 };
  });
}

/** Usa una foto de un trabajo como imagen del modelo (queda enlazada; la foto no se mueve ni se copia). */
export async function useJobPhotoForModel(modelId: string, photoIds: string[], cover = false) {
  return safe(async () => {
    const u = await requirePerm('archivos', 'E'); await requirePerm('galeria', 'V'); await assertModelAccess(u, z.uuid().parse(modelId));
    const ids = z.array(z.uuid()).min(1).max(24).parse(photoIds);
    const db = await getDb();
    for (const id of ids) { const p = await assertPhotoAccess(u, id); if (p.scope !== 'job' || p.deletedAt) throw new Error('Foto no disponible'); }
    await db.transaction(async (tx) => {
      await tx.select({ id: s.modelFiles.id }).from(s.modelFiles).where(eq(s.modelFiles.id, modelId)).for('update');
      const links = await tx.select().from(s.libraryPhotoLinks).where(eq(s.libraryPhotoLinks.modelId, modelId));
      let order = links.reduce((n, l) => Math.max(n, Number(l.data?.order ?? 0)), 0), hasCover = links.some((l) => l.data?.cover);
      if (cover && hasCover) { for (const l of links.filter((x) => x.data?.cover)) await tx.update(s.libraryPhotoLinks).set({ data: { ...l.data, cover: false }, updatedAt: new Date() }).where(eq(s.libraryPhotoLinks.id, l.id)); hasCover = false; }
      for (const [i, photoId] of ids.entries()) {
        await tx.insert(s.libraryPhotoLinks).values({ workspaceId: u.workspaceId, createdBy: u.id, modelId, photoId, data: { type: 'real', origin: 'job', order: ++order, cover: !hasCover && (i === 0) } }).onConflictDoNothing();
        hasCover = true;
      }
    });
    await audit('model_file', modelId, 'usar_foto_trabajo', { photoIds: ids }, u.id);
    return ids.length;
  }, pathsFor(modelId));
}

async function ownLink(linkId: string) {
  const u = await requirePerm('archivos', 'E'); const db = await getDb();
  const [link] = await db.select().from(s.libraryPhotoLinks).where(and(eq(s.libraryPhotoLinks.id, z.uuid().parse(linkId)), eq(s.libraryPhotoLinks.workspaceId, u.workspaceId)));
  if (!link) throw new Error('Foto no disponible');
  await assertModelAccess(u, link.modelId); await assertPhotoAccess(u, link.photoId);
  return { u, db, link };
}

export async function setModelCover(linkId: string) {
  return safe(async () => {
    const { db, link } = await ownLink(linkId);
    await db.transaction(async (tx) => {
      await tx.select({ id: s.modelFiles.id }).from(s.modelFiles).where(eq(s.modelFiles.id, link.modelId)).for('update');
      for (const l of await tx.select().from(s.libraryPhotoLinks).where(eq(s.libraryPhotoLinks.modelId, link.modelId))) {
        const cover = l.id === link.id;
        if (!!l.data?.cover !== cover) await tx.update(s.libraryPhotoLinks).set({ data: { ...l.data, cover }, updatedAt: new Date() }).where(eq(s.libraryPhotoLinks.id, l.id));
      }
    });
  }, ['/archivos']);
}

/** Quita la imagen del modelo. Una foto de trabajo solo se desenlaza; una imagen propia del modelo se elimina. */
export async function removeModelImage(linkId: string) {
  return safe(async () => {
    const { u, db, link } = await ownLink(linkId);
    await db.transaction(async (tx) => {
      await tx.delete(s.libraryPhotoLinks).where(eq(s.libraryPhotoLinks.id, link.id));
      const [photo] = await tx.select().from(s.photos).where(eq(s.photos.id, link.photoId));
      if (photo?.scope === 'model') {
        const [other] = await tx.select({ id: s.libraryPhotoLinks.id }).from(s.libraryPhotoLinks).where(eq(s.libraryPhotoLinks.photoId, photo.id)).limit(1);
        if (!other) await tx.update(s.photos).set({ deletedAt: new Date() }).where(eq(s.photos.id, photo.id));
      }
      // si era la portada, la siguiente imagen pasa a serlo
      if (link.data?.cover) {
        const [next] = await tx.select().from(s.libraryPhotoLinks).where(eq(s.libraryPhotoLinks.modelId, link.modelId)).limit(1);
        if (next) await tx.update(s.libraryPhotoLinks).set({ data: { ...next.data, cover: true }, updatedAt: new Date() }).where(eq(s.libraryPhotoLinks.id, next.id));
      }
    });
    await audit('model_file', link.modelId, 'quitar_imagen', { photoId: link.photoId }, u.id);
  }, ['/archivos']);
}
