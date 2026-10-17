'use server';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { requirePerm } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { removeRecord } from '@/lib/services/removal';
import { safe } from './common';
import { getT } from '@/i18n/server';
import { noPhotoConsent } from '@/lib/photos';

export async function updatePhotoAction(id: string, p: { stage?: string; featured?: boolean; tags?: string[]; caption?: string | null; publish?: Record<string, { status: string; url?: string }>; suggestedText?: string | null; internalOnly?: boolean }) {
  const t = await getT();
  return safe(async () => {
    const u = await requirePerm('galeria', 'E'); const db = await getDb();
    if (p.internalOnly === false) { const [ph] = await db.select().from(s.photos).where(eq(s.photos.id, id)); if (ph?.customerId) { const [c] = await db.select().from(s.customers).where(eq(s.customers.id, ph.customerId)); if (c && noPhotoConsent(c.photoConsent)) throw new Error(t('gallery.theCustomerHasNotGiven')); } }
    await db.update(s.photos).set(p).where(eq(s.photos.id, id)); await audit('photo', id, 'editar', Object.keys(p), u.id);
  }, ['/galeria']);
}
export async function deletePhotoAction(id: string) { return safe(async () => { const u = await requirePerm('galeria', 'X'); await removeRecord('photo', id, u.id); }, ['/galeria']); }
export async function createCollectionAction(name: string, photoIds: string[]) {
  const t = await getT();
  return safe(async () => {
    const u = await requirePerm('galeria', 'C'); const db = await getDb(); if (!name.trim()) throw new Error(t('gallery.giveTheCollectionAName'));
    const [ex] = await db.select().from(s.collections).where(and(eq(s.collections.name, name.trim()), isNull(s.collections.deletedAt))).limit(1);
    const id = ex?.id ?? (await db.insert(s.collections).values({ workspaceId: WORKSPACE_ID, name: name.trim(), createdBy: u.id }).returning({ id: s.collections.id }))[0].id;
    for (const pid of photoIds) await db.insert(s.collectionPhotos).values({ collectionId: id, photoId: pid }).onConflictDoNothing();
    return id;
  }, ['/galeria']);
}
export async function suggestTextAction(id: string) {
  const t = await getT();
  return safe(async () => {
    await requirePerm('galeria', 'V'); const db = await getDb(); const [p] = await db.select().from(s.photos).where(eq(s.photos.id, id)); if (!p) throw new Error(t('gallery.photoNotFound'));
    const [m] = p.materialId ? await db.select().from(s.materials).where(eq(s.materials.id, p.materialId)) : []; const [pr] = p.productId ? await db.select().from(s.products).where(eq(s.products.id, p.productId)) : []; const [mf] = p.modelFileId ? await db.select().from(s.modelFiles).where(eq(s.modelFiles.id, p.modelFileId)) : []; const [j] = p.jobId ? await db.select().from(s.printJobs).where(eq(s.printJobs.id, p.jobId)) : [];
    const name = pr?.name ?? mf?.name ?? t('gallery.newPiece'); const parts = [`✨ ${name}`, m ? t('gallery.printedOn', { type: m.type, color: m.colorName.toLowerCase() }) : null, j?.realH ? t('gallery.hOfPrinting', { hours: j.realH.toFixed(1) }) : null, t('gallery.madeInOur3dPrinting'), '#impresion3d #3dprinting #hechoencasa'].filter(Boolean);
    return parts.join('\n');
  });
}
