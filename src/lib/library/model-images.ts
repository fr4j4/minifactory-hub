import { eq } from 'drizzle-orm';
import { getDb, s } from '@/db';

/** Enlaza una imagen propia del modelo (scope «model»); la primera que llega queda como portada. */
export async function linkModelImage(user: { id: string; workspaceId: string }, modelId: string, photoId: string) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.select({ id: s.modelFiles.id }).from(s.modelFiles).where(eq(s.modelFiles.id, modelId)).for('update');
    const links = await tx.select().from(s.libraryPhotoLinks).where(eq(s.libraryPhotoLinks.modelId, modelId));
    const order = links.reduce((n, l) => Math.max(n, Number(l.data?.order ?? 0)), 0) + 1;
    await tx.insert(s.libraryPhotoLinks).values({ workspaceId: user.workspaceId, createdBy: user.id, modelId, photoId, data: { type: 'real', origin: 'upload', order, cover: !links.some((l) => l.data?.cover) } }).onConflictDoNothing();
  });
}
