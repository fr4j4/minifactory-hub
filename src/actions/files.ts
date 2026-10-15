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
    const L = await import('@/lib/library/folders');
    if (i.folder !== undefined) patch.folder = await L.ensureFolder(i.folder, db);
    if (i.tags) await L.ensureTags(i.tags, db);
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
        const ai = { ...input, vocabulary: vocab, locale: await getLocale() };
        // con la miniatura, la IA reconoce mejor qué es la pieza; si el taller no permite imágenes o el modelo no ve, se reintenta solo con texto
        let image: { data: Buffer; mime: string } | undefined;
        const [fv] = f.currentVersionId ? await db.select().from(s.fileVersions).where(eq(s.fileVersions.id, f.currentVersionId)) : [];
        if (fv?.thumbKey && (await (await import('@/lib/ai/config')).getAiConfig()).privacy.sendImages) { try { image = { data: await (await import('@/lib/storage')).getBuffer(fv.thumbKey), mime: 'image/webp' }; } catch { /* sin miniatura */ } }
        try { cands = [...cands, ...(await suggestTagsAi({ ...ai, image }, { user: u }))]; }
        catch (e) { if (!image) throw e; cands = [...cands, ...(await suggestTagsAi(ai, { user: u }))]; }
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

export type BulkOp =
  | { kind: 'addTags'; tags: string[] } | { kind: 'removeTag'; tag: string }
  | { kind: 'folder'; folder: string | null } | { kind: 'favorite'; value: boolean } | { kind: 'customer'; customerId: string | null };
/** Acciones masivas sobre varios modelos de la biblioteca (máx. 200). */
export async function bulkFilesAction(ids: string[], op: BulkOp) {
  return safe(async () => {
    const u = await requirePerm('archivos', 'E'); const db = await getDb();
    const list = [...new Set(ids)].slice(0, 200); if (!list.length) return 0;
    const { normalizeTag } = await import('@/lib/library/tags');
    const rows = await db.select().from(s.modelFiles).where(and(inArray(s.modelFiles.id, list), isNull(s.modelFiles.deletedAt)));
    for (const f of rows) {
      const patch: Partial<typeof s.modelFiles.$inferInsert> = { updatedAt: new Date() };
      if (op.kind === 'addTags') {
        const cur = new Set((f.tags ?? []).map(normalizeTag)); const next = [...(f.tags ?? [])]; const meta = { ...(f.tagMeta ?? {}) };
        for (const t of op.tags) { const n = normalizeTag(t); if (n && !cur.has(n)) { cur.add(n); next.push(n); meta[n] = { source: 'manual' }; } }
        patch.tags = next; patch.tagMeta = meta; await (await import('@/lib/library/folders')).ensureTags(next, db);
      } else if (op.kind === 'removeTag') {
        const n = normalizeTag(op.tag); patch.tags = (f.tags ?? []).filter((t) => normalizeTag(t) !== n); const meta = { ...(f.tagMeta ?? {}) }; delete meta[n]; patch.tagMeta = meta;
      } else if (op.kind === 'folder') patch.folder = await (await import('@/lib/library/folders')).ensureFolder(op.folder, db);
      else if (op.kind === 'favorite') patch.favorite = op.value;
      else if (op.kind === 'customer') patch.customerId = op.customerId;
      await db.update(s.modelFiles).set(patch).where(eq(s.modelFiles.id, f.id));
    }
    await audit('model_file', rows[0]?.id ?? list[0], 'masivo', { op: op.kind, n: rows.length }, u.id);
    return rows.length;
  }, ['/archivos']);
}

/** Renombra o combina una etiqueta en toda la biblioteca («llaveros» → «llavero»). */
export async function renameTagAction(from: string, to: string) {
  return safe(async () => {
    const u = await requirePerm('archivos', 'E'); const db = await getDb();
    const { normalizeTag } = await import('@/lib/library/tags'); const a = normalizeTag(from), b = normalizeTag(to);
    if (!a || !b) throw new Error('tag');
    const rows = await db.select().from(s.modelFiles).where(isNull(s.modelFiles.deletedAt)); let n = 0;
    for (const f of rows) {
      if (!(f.tags ?? []).some((t) => normalizeTag(t) === a)) continue;
      const next = [...new Set((f.tags ?? []).map((t) => (normalizeTag(t) === a ? b : t)))]; const meta = { ...(f.tagMeta ?? {}) }; if (meta[a]) { meta[b] = meta[b] ?? meta[a]; delete meta[a]; }
      await db.update(s.modelFiles).set({ tags: next, tagMeta: meta, updatedAt: new Date() }).where(eq(s.modelFiles.id, f.id)); n++;
    }
    { const F = await import('@/lib/library/folders'); await F.ensureTags([b], db); const [old] = await db.select().from(s.tagDefs).where(eq(s.tagDefs.name, a)); if (old?.color) await F.setTagColor(b, old.color, db); await db.delete(s.tagDefs).where(eq(s.tagDefs.name, a)); }
    await audit('model_file', 'tags', 'renombrar_etiqueta', { from: a, to: b, n }, u.id);
    return n;
  }, ['/archivos']);
}

/** Recuerda si este modelo se lamina con orientación automática. */
export async function setAutoOrientAction(modelFileId: string, on: boolean) {
  return safe(async () => { await requirePerm('laminador', 'V'); const db = await getDb(); await db.update(s.modelFiles).set({ autoOrient: on }).where(eq(s.modelFiles.id, modelFileId)); }, []);
}

/** Carpetas de la biblioteca: crear, renombrar/mover y eliminar (los archivos suben a la carpeta madre). */
export async function createFolderAction(path: string) {
  return safe(async () => { await requirePerm('archivos', 'E'); const p = await (await import('@/lib/library/folders')).ensureFolder(path); if (!p) throw new Error('folder'); return p; }, ['/archivos']);
}
export async function renameFolderAction(from: string, to: string) {
  return safe(async () => { const u = await requirePerm('archivos', 'E'); const n = await (await import('@/lib/library/folders')).renameFolder(from, to); await audit('model_file', 'folders', 'renombrar_carpeta', { from, to, n }, u.id); return n; }, ['/archivos']);
}
export async function deleteFolderAction(path: string) {
  return safe(async () => { const u = await requirePerm('archivos', 'E'); const n = await (await import('@/lib/library/folders')).deleteFolder(path); await audit('model_file', 'folders', 'eliminar_carpeta', { path, n }, u.id); return n; }, ['/archivos']);
}
export async function setTagColorAction(name: string, color: string | null) {
  return safe(async () => { await requirePerm('archivos', 'E'); await (await import('@/lib/library/folders')).setTagColor(name, color); }, ['/archivos']);
}

/** Repara la malla de una versión (suelda, orienta, tapa huecos pequeños) y la guarda como versión nueva. */
export async function repairFileAction(versionId: string) {
  return safe(async () => { const u = await requirePerm('archivos', 'E'); const { repairFileVersion } = await import('@/lib/mesh/repair-file'); const r = await repairFileVersion(versionId, u.id); await audit('model_file', r.modelFileId, 'reparar', { ...r.report }, u.id); return r; }, ['/archivos']);
}
