'use server';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { requirePerm } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { safe } from './common';
import { processVersion } from '@/lib/files';

export async function updateFileAction(id: string, i: { name?: string; folder?: string | null; tags?: string[]; license?: string; origin?: string | null; author?: string | null; customerId?: string | null; favorite?: boolean }) {
  return safe(async () => {
    const u = await requirePerm('archivos', 'E'); const db = await getDb();
    const patch: Record<string, any> = { updatedAt: new Date() };
    for (const k of ['name', 'folder', 'tags', 'license', 'origin', 'author', 'customerId', 'favorite'] as const) if (i[k] !== undefined) patch[k] = i[k];
    await db.update(s.modelFiles).set(patch).where(eq(s.modelFiles.id, id));
    await audit('model_file', id, 'editar', Object.keys(patch), u.id);
  }, ['/archivos', `/archivos/${id}`]);
}
export async function deleteFileAction(id: string) {
  return safe(async () => { const u = await requirePerm('archivos', 'X'); const db = await getDb(); await db.update(s.modelFiles).set({ deletedAt: new Date() }).where(eq(s.modelFiles.id, id)); await audit('model_file', id, 'eliminar', {}, u.id); }, ['/archivos']);
}
export async function setCurrentVersionAction(modelFileId: string, versionId: string) {
  return safe(async () => {
    const u = await requirePerm('archivos', 'E'); const db = await getDb();
    const [v] = await db.select().from(s.fileVersions).where(eq(s.fileVersions.id, versionId));
    const meta: any = v?.meta ?? {};
    await db.update(s.modelFiles).set({ currentVersionId: versionId, dimX: meta.analysis?.dimX ?? null, dimY: meta.analysis?.dimY ?? null, dimZ: meta.analysis?.dimZ ?? null, volumeCm3: meta.analysis?.volumeCm3 ?? null, areaCm2: meta.analysis?.areaCm2 ?? null, triangles: meta.analysis?.triangles ?? null, closed: meta.analysis?.closed ?? null, hash: v?.sha256 ?? null }).where(eq(s.modelFiles.id, modelFileId));
    await audit('model_file', modelFileId, 'version_actual', { versionId }, u.id);
  }, [`/archivos/${modelFileId}`]);
}
export async function reprocessVersionAction(versionId: string) {
  return safe(async () => { await requirePerm('archivos', 'E'); await processVersion(versionId); return true; });
}
