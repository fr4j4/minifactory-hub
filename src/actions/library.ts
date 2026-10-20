'use server';
import {assertModelAccess,assertVersionAccess,assertPhotoAccess,modelAccess} from '@/lib/library/access';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { requirePerm } from '@/lib/auth';
import { safe } from './common';
import { saveSource, testSource, startScan, getSource } from '@/lib/library/catalog';
import { enqueueJob } from '@/lib/jobs';
import { planOperation } from '@/lib/library/operations';
import { seal } from '@/lib/secret';
import { audit } from '@/lib/audit';
import { z } from 'zod';
const paths = ['/archivos', '/archivos/fuentes'];
async function admin() { const u = await requirePerm('config', 'E'); if (u.role !== 'admin' || u.workspaceId !== WORKSPACE_ID)
    throw new Error('Solo administradores del taller'); return u; }
export async function createLibrarySource(input: unknown) { return safe(async () => { const u = await admin(); const id = await saveSource(input, u.id); await audit('library_source', id, 'crear', {}, u.id); return id; }, paths); }
export async function sourceCommand(id: string, command: 'test' | 'scan' | 'pause' | 'resume' | 'write' | 'readonly') { return safe(async () => { const u = await admin(); z.uuid().parse(id); const src=await getSource(id); if(src.kind==='managed-local'&&command==='write')throw new Error('Los originales administrados se editan creando versiones'); const db = await getDb(); if (command === 'test')
    return testSource(id); if (command === 'scan')
    return startScan(id, u.id); const patch = command === 'write' ? { writable: true } : command === 'readonly' ? { writable: false } : command === 'pause' ? { enabled: false, status: 'paused' } : command === 'resume' ? { enabled: true, status: 'new' } : null; if (!patch)
    throw new Error('Acción inválida'); await db.update(s.librarySources).set({ ...patch, updatedAt: new Date() }).where(eq(s.librarySources.id, id)); await audit('library_source', id, command, {}, u.id); }, paths); }
export async function reconnectSource(id: string, secret: Record<string, string>) { return safe(async () => { await admin(); await getSource(id); if (JSON.stringify(secret).length > 20000)
    throw new Error('Credencial demasiado grande'); const db = await getDb(); await db.update(s.librarySources).set({ secret: seal(JSON.stringify(secret)), enabled: true, status: 'new', error: null }).where(eq(s.librarySources.id, id)); return testSource(id); }, paths); }
export async function cancelLibraryScan(id: string) { return safe(async () => { await admin(); const db = await getDb(); await db.update(s.libraryScans).set({ status: 'cancelled' }).where(and(eq(s.libraryScans.id, id), eq(s.libraryScans.workspaceId, WORKSPACE_ID), inArray(s.libraryScans.status, ['queued', 'running']))); }, paths); }
export async function planLibraryOperation(input: unknown) { return safe(async () => { const u = await admin(); return planOperation(input, u.id); }); }
export async function confirmLibraryOperation(id: string) { return safe(async () => { const u = await admin(); const db = await getDb(); const [op] = await db.update(s.libraryOperations).set({ status: 'queued' }).where(and(eq(s.libraryOperations.id, id), eq(s.libraryOperations.workspaceId, WORKSPACE_ID), eq(s.libraryOperations.status, 'planned'))).returning(); if (!op)
    throw new Error('Plan ya ejecutado o no disponible'); return enqueueJob('library.operation', { operationId: id }, { userId: u.id, maxAttempts: 1 }); }, paths); }
function safeImportDisplayUrl(raw: string) {
  const shown = new URL(raw);
  for (const key of [...shown.searchParams.keys()]) if (/token|secret|key|signature|credential|password|authorization/i.test(key)) shown.searchParams.set(key, '[redacted]');
  if (!/^#profileId-\d+$/.test(shown.hash)) shown.hash = '';
  return shown.toString();
}
export async function processLibraryVersion(id: string) { return safe(async () => { const u = await requirePerm('archivos', 'E'); await assertVersionAccess(u,id); const db = await getDb(); const [v] = await db.select().from(s.fileVersions).where(and(eq(s.fileVersions.id, id), eq(s.fileVersions.workspaceId, u.workspaceId))); if (!v)
    throw new Error('Versión no encontrada'); await db.update(s.fileVersions).set({ meta: { ...v.meta, status: 'processing' } }).where(eq(s.fileVersions.id, id)); return enqueueJob('file.process', { versionId: id }, { userId: u.id }); }, paths); }
export async function importLibraryUrl(url: string) { return safe(async () => { const u = await requirePerm('archivos', 'C'); const parsed = z.string().url().max(2048).parse(url); const target = new URL(parsed); if (target.protocol !== 'https:' || target.username || target.password)
    throw new Error('Use una URL HTTPS sin credenciales'); (await import('@/lib/library/providers')).assertSupportedProvider(parsed); const db = await getDb(); const [op] = await db.insert(s.libraryOperations).values({ workspaceId: WORKSPACE_ID, kind: 'url.import', status: 'queued', createdBy: u.id, input: { url: safeImportDisplayUrl(parsed), secretUrl:seal(parsed) } }).returning(); await enqueueJob('url.import', { operationId: op.id }, { userId: u.id }); return op.id; }, paths); }
export async function associateLibraryPhoto(modelId: string, photoId: string) { return safe(async () => { const u = await requirePerm('galeria', 'E'); const fileUser=await requirePerm('archivos', 'E'); await assertModelAccess(fileUser,modelId); await assertPhotoAccess(u,photoId); const db = await getDb(); const [m] = await db.select().from(s.modelFiles).where(and(eq(s.modelFiles.id, z.uuid().parse(modelId)), eq(s.modelFiles.workspaceId, u.workspaceId))); if (!m)
    throw new Error('Modelo no encontrado'); await db.update(s.photos).set({ modelFileId: modelId }).where(and(eq(s.photos.id, z.uuid().parse(photoId)), eq(s.photos.workspaceId, u.workspaceId), isNull(s.photos.deletedAt))); await audit('model_file', modelId, 'asociar_foto', { photoId }, u.id); }, paths); }
export async function collectionModels(name: string, modelIds: string[]) { return safe(async () => { const u = await requirePerm('archivos', 'E'); const clean = z.string().trim().min(1).max(100).parse(name); const ids = z.array(z.uuid()).max(200).parse(modelIds);for(const id of ids)await assertModelAccess(u,id); const db = await getDb(); await db.transaction(async (tx) => { await tx.insert(s.libraryCollections).values({ workspaceId: WORKSPACE_ID, name: clean, createdBy: u.id }).onConflictDoNothing(); const [c] = await tx.select().from(s.libraryCollections).where(and(eq(s.libraryCollections.name, clean), eq(s.libraryCollections.workspaceId, WORKSPACE_ID))); const models = ids.length ? await tx.select({ id: s.modelFiles.id }).from(s.modelFiles).where(and(inArray(s.modelFiles.id, ids), eq(s.modelFiles.workspaceId, u.workspaceId))) : []; for (const m of models)
    await tx.insert(s.libraryCollectionModels).values({ collectionId: c.id, modelId: m.id }).onConflictDoNothing(); }); }, paths); }
export async function suggestLibraryMetadata(modelId: string) { return safe(async () => { const u = await requirePerm('archivos', 'E'); await assertModelAccess(u,modelId);return (await import('@/lib/library/metadata')).proposeMetadata(z.uuid().parse(modelId), u); }); }
export async function reviewLibraryMetadata(id: string, accept: boolean) { return safe(async () => { const u = await requirePerm('archivos', 'E'); const db = await getDb(); await db.transaction(async (tx) => { const [op] = await tx.select().from(s.libraryOperations).where(and(eq(s.libraryOperations.id, z.uuid().parse(id)), eq(s.libraryOperations.workspaceId, u.workspaceId), eq(s.libraryOperations.kind, 'metadata.proposal'), eq(s.libraryOperations.status, 'proposed'))).for('update'); if (!op || op.createdBy!==u.id&&u.role!=='admin')
    throw new Error('Propuesta no disponible'); const [visible]=await tx.select({id:s.modelFiles.id}).from(s.modelFiles).where(and(eq(s.modelFiles.id,op.input.modelId),modelAccess(u)));if(!visible)throw new Error('Modelo no disponible'); if (accept) {
    const [f] = await tx.select().from(s.modelFiles).where(eq(s.modelFiles.id, op.input.modelId)).for('update');
    if (f.updatedAt.toISOString() !== op.input.updatedAt || f.currentVersionId !== op.input.versionId)
        throw new Error('El modelo cambió; genere otra propuesta');
    const proposal = (await import('@/lib/library/metadata')).MetadataProposal.parse(op.result);
    await tx.update(s.modelFiles).set({ name: proposal.title || f.name, tags: [...new Set([...(f.tags || []), ...proposal.tags])], tagMeta: { ...f.tagMeta, ...Object.fromEntries(proposal.tags.map(tag => [tag, { source: 'ia' }])) }, updatedAt: new Date() }).where(eq(s.modelFiles.id, f.id));
    if (f.currentVersionId) {
        const [v] = await tx.select().from(s.fileVersions).where(eq(s.fileVersions.id, f.currentVersionId));
        await tx.update(s.fileVersions).set({ meta: { ...v.meta, libraryDescription: proposal.description || v.meta?.libraryDescription, libraryCategory: proposal.category || v.meta?.libraryCategory } }).where(eq(s.fileVersions.id, v.id));
    }
} await tx.update(s.libraryOperations).set({ status: accept ? 'applied' : 'rejected' }).where(eq(s.libraryOperations.id, id)); }); await audit('library_operation', id, accept ? 'aceptar_ia' : 'rechazar_ia', {}, u.id); }, paths); }
export async function linkLibraryDuplicate(modelId: string, targetId: string) { return safe(async () => { const u = await requirePerm('archivos', 'X');await assertModelAccess(u,modelId);await assertModelAccess(u,targetId); const db = await getDb(); const rows = await db.select().from(s.modelFiles).where(and(inArray(s.modelFiles.id, [z.uuid().parse(modelId), z.uuid().parse(targetId)]), eq(s.modelFiles.workspaceId, u.workspaceId), isNull(s.modelFiles.deletedAt))); const a = rows.find(r => r.id === modelId), b = rows.find(r => r.id === targetId); if (!a || !b || a.id === b.id || !a.hash || a.hash !== b.hash || a.license !== b.license || a.customerId !== b.customerId || a.author !== b.author)
    throw new Error('Solo se vinculan duplicados binarios confirmados'); await db.transaction(async (tx) => { const refs = await tx.select().from(s.quoteItemModels).where(eq(s.quoteItemModels.modelFileId, a.id)).limit(1); const photos = await tx.select().from(s.photos).where(eq(s.photos.modelFileId, a.id)).limit(1); if (refs.length || photos.length)
    throw new Error('El modelo tiene referencias; conserve ambas fichas'); await tx.update(s.libraryEntries).set({ modelId: b.id, versionId: b.currentVersionId }).where(eq(s.libraryEntries.modelId, a.id)); await tx.update(s.modelFiles).set({ deletedAt: new Date() }).where(eq(s.modelFiles.id, a.id)); }); await audit('model_file', targetId, 'vincular_ubicacion', { from: modelId }, u.id); }, paths); }
