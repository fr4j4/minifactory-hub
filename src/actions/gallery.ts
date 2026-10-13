'use server';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { requirePerm } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { safe } from './common';

export async function updatePhotoAction(id: string, p: { stage?: string; featured?: boolean; tags?: string[]; caption?: string | null; publish?: Record<string, { status: string; url?: string }>; suggestedText?: string | null; internalOnly?: boolean }) {
  return safe(async () => {
    const u = await requirePerm('galeria', 'E'); const db = await getDb();
    if (p.internalOnly === false) { const [ph] = await db.select().from(s.photos).where(eq(s.photos.id, id)); if (ph?.customerId) { const [c] = await db.select().from(s.customers).where(eq(s.customers.id, ph.customerId)); if (c && (c.photoConsent === 'no' || c.photoConsent === 'unknown')) throw new Error('El cliente no dio permiso para publicar sus fotos: actualiza el consentimiento en su ficha.'); } }
    await db.update(s.photos).set(p).where(eq(s.photos.id, id)); await audit('photo', id, 'editar', Object.keys(p), u.id);
  }, ['/galeria']);
}
export async function deletePhotoAction(id: string) { return safe(async () => { const u = await requirePerm('galeria', 'X'); const db = await getDb(); await db.update(s.photos).set({ deletedAt: new Date() }).where(eq(s.photos.id, id)); await audit('photo', id, 'eliminar', {}, u.id); }, ['/galeria']); }
export async function createCollectionAction(name: string, photoIds: string[]) {
  return safe(async () => {
    const u = await requirePerm('galeria', 'C'); const db = await getDb(); if (!name.trim()) throw new Error('Ponle nombre a la colección');
    const [ex] = await db.select().from(s.collections).where(and(eq(s.collections.name, name.trim()))).limit(1);
    const id = ex?.id ?? (await db.insert(s.collections).values({ workspaceId: WORKSPACE_ID, name: name.trim(), createdBy: u.id }).returning({ id: s.collections.id }))[0].id;
    for (const pid of photoIds) await db.insert(s.collectionPhotos).values({ collectionId: id, photoId: pid }).onConflictDoNothing();
    return id;
  }, ['/galeria']);
}
export async function suggestTextAction(id: string) {
  return safe(async () => {
    await requirePerm('galeria', 'V'); const db = await getDb(); const [p] = await db.select().from(s.photos).where(eq(s.photos.id, id)); if (!p) throw new Error('Foto no encontrada');
    const [m] = p.materialId ? await db.select().from(s.materials).where(eq(s.materials.id, p.materialId)) : []; const [pr] = p.productId ? await db.select().from(s.products).where(eq(s.products.id, p.productId)) : []; const [mf] = p.modelFileId ? await db.select().from(s.modelFiles).where(eq(s.modelFiles.id, p.modelFileId)) : []; const [j] = p.jobId ? await db.select().from(s.printJobs).where(eq(s.printJobs.id, p.jobId)) : [];
    const name = pr?.name ?? mf?.name ?? 'Nueva pieza'; const parts = [`✨ ${name}`, m ? `Impreso en ${m.type} ${m.colorName.toLowerCase()}` : null, j?.realH ? `${j.realH.toFixed(1)} h de impresión` : null, 'Hecho en nuestro taller de impresión 3D 🛠️', '#impresion3d #3dprinting #hechoencasa'].filter(Boolean);
    return parts.join('\n');
  });
}
