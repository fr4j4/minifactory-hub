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

/** Registra el origen del modelo a partir de un enlace (trae metadatos públicos, normaliza licencia). */
export async function attachSourceAction(modelFileId: string, url: string) {
  return safe(async () => {
    const u = await requirePerm('archivos', 'E');
    const { attachSource } = await import('@/lib/library/import');
    return attachSource(modelFileId, url, u.id);
  }, [`/archivos/${modelFileId}`, '/archivos']);
}

/** Etiquetas sugeridas (reglas siempre; IA si está disponible y se pide). No aplica nada. */
export async function suggestTagsAction(modelFileId: string, withAi: boolean) {
  return safe(async () => {
    const u = await requirePerm('archivos', 'V'); const db = await getDb();
    const [f] = await db.select().from(s.modelFiles).where(eq(s.modelFiles.id, modelFileId)); if (!f) throw new Error('not found');
    const [src] = f.sourceId ? await db.select().from(s.modelSources).where(eq(s.modelSources.id, f.sourceId)) : [];
    const { ruleCandidates, mergeSuggestions } = await import('@/lib/library/tags');
    const vocab = [...new Set((await db.select({ tags: s.modelFiles.tags }).from(s.modelFiles)).flatMap((r) => r.tags ?? []))];
    const input = { name: f.name, folder: f.folder, origin: f.origin, sourceTags: src?.tags ?? [], geom: { dimX: f.dimX, dimY: f.dimY, dimZ: f.dimZ, volumeCm3: f.volumeCm3, closed: f.closed } };
    let cands = ruleCandidates(input);
    if (withAi) {
      const { aiAvailableFor } = await import('@/lib/ai'); const { getLocale } = await import('@/i18n/server');
      if (await aiAvailableFor(u, 'files.tag')) {
        const { suggestTagsAi } = await import('@/lib/ai/features/file-tags');
        cands = [...cands, ...(await suggestTagsAi({ ...input, vocabulary: vocab, locale: await getLocale() }, { user: u }))];
      }
    }
    return mergeSuggestions(cands, { vocabulary: vocab, existing: f.tags ?? [] });
  });
}

/** Agrega etiquetas con su procedencia (regla, IA, sitio o manual). */
export async function addTagsAction(modelFileId: string, tags: Array<{ name: string; source: 'manual' | 'ia' | 'import' | 'regla'; confidence?: number }>) {
  return safe(async () => {
    const u = await requirePerm('archivos', 'E'); const db = await getDb();
    const [f] = await db.select().from(s.modelFiles).where(eq(s.modelFiles.id, modelFileId)); if (!f) throw new Error('not found');
    const { normalizeTag } = await import('@/lib/library/tags');
    const cur = new Set((f.tags ?? []).map(normalizeTag)); const next = [...(f.tags ?? [])]; const meta = { ...(f.tagMeta ?? {}) };
    for (const t of tags.slice(0, 12)) { const n = normalizeTag(t.name); if (!n || cur.has(n)) continue; cur.add(n); next.push(n); meta[n] = { source: t.source, confidence: t.confidence }; }
    await db.update(s.modelFiles).set({ tags: next, tagMeta: meta, updatedAt: new Date() }).where(eq(s.modelFiles.id, modelFileId));
    await audit('model_file', modelFileId, 'etiquetas', { added: tags.map((t) => t.name) }, u.id);
    return next;
  }, [`/archivos/${modelFileId}`, '/archivos']);
}
