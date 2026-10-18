import { and, eq } from 'drizzle-orm';
import crypto from 'node:crypto';
import { z } from 'zod';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { runTask } from '../ai/run';
import { aiAvailableFor } from '../ai';
import { UNTRUSTED_NOTE, dataBlock } from '../ai/features/shared';
import type { SessionUser } from '../auth';
import { getLocale } from '@/i18n/server';
export const MetadataProposal = z.object({ title: z.string().max(150).optional(), description: z.string().max(1200).optional(), category: z.string().max(80).optional(), tags: z.array(z.string().max(40)).max(12).default([]) });
export async function assertSourceAi(modelId: string, modality:'text'|'images'|'photos'='text') { const db = await getDb(); const rows = await db.select({ config: s.librarySources.config }).from(s.libraryEntries).innerJoin(s.librarySources, eq(s.librarySources.id, s.libraryEntries.sourceId)).where(eq(s.libraryEntries.modelId, modelId)); if (rows.some(r => r.config.allowAi !== true || modality==='images'&&r.config.allowAiImages!==true || modality==='photos'&&r.config.allowAiPhotos!==true))
    throw new Error('La fuente no autoriza enviar metadatos a IA'); }
export async function proposeMetadata(modelId: string, user: SessionUser) {
    if (!await aiAvailableFor(user, 'files.tag'))
        throw new Error('IA desactivada para esta función');
    await assertSourceAi(modelId);
    const db = await getDb();
    const [f] = await db.select().from(s.modelFiles).where(and(eq(s.modelFiles.id, modelId), eq(s.modelFiles.workspaceId, user.workspaceId)));
    if (!f)
        throw new Error('Modelo no encontrado');
    const [v] = f.currentVersionId ? await db.select().from(s.fileVersions).where(eq(s.fileVersions.id, f.currentVersionId)) : [];
    const input = { name: f.name, tags: f.tags, description: v?.meta?.libraryDescription || '', dimensions: [f.dimX, f.dimY, f.dimZ], locale: await getLocale() };
    const previous=await db.select().from(s.libraryOperations).where(and(eq(s.libraryOperations.kind,'metadata.proposal'),eq(s.libraryOperations.createdBy,user.id)));const same=previous.find(p=>p.input.modelId===modelId&&p.input.updatedAt===f.updatedAt.toISOString()&&p.input.versionId===f.currentVersionId);if(same?.status==='rejected')throw new Error('Propuesta rechazada; no cambió la evidencia');if(same?.status==='proposed')return same;
    const result = await runTask({ feature: 'files.tag', tier: 'fast', system: `Propón un título, descripción breve, categoría y etiquetas para catalogar una pieza 3D. No inventes autor, licencia, material ni certificaciones. Si faltan evidencias describe la incertidumbre. Idioma: ${input.locale}. ${UNTRUSTED_NOTE}`, user: dataBlock('catalog', input), schema: MetadataProposal, maxOutputTokens: 700 }, { user, promptVersion: 'library-metadata@1' });
    const [op] = await db.insert(s.libraryOperations).values({ workspaceId: WORKSPACE_ID, kind: 'metadata.proposal', status: 'proposed', createdBy: user.id, input: { modelId, versionId: f.currentVersionId, updatedAt: f.updatedAt.toISOString(), before: input }, result: { ...result.data, providerModel: result.model, costUsd: result.costUsd } }).returning();
    return op;
}
