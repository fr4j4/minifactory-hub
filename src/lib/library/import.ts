import { eq } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { audit } from '../audit';
import { fetchSourceMeta, normalizeLicense, parseSourceUrl, type CommercialUse } from './source';
import { mergeSuggestions, normalizeTag } from './tags';
import { getT } from '@/i18n/server';

const RAW_MAX = 256 * 1024;

/**
 * Registra el origen de un modelo a partir de su URL: trae los metadatos públicos (mejor esfuerzo), normaliza la licencia, guarda todo en
 * `model_sources` y lo asocia al modelo. Las etiquetas del sitio entran con procedencia «import». Si el sitio no responde, el origen se guarda
 * igual (con el enlace) para completarlo a mano; el estado queda en `fetch_status`.
 */
export async function attachSource(modelFileId: string, urlInput: string, userId?: string | null, getter?: Parameters<typeof fetchSourceMeta>[1]) {
  const t = await getT(); const db = await getDb();
  const p = parseSourceUrl(urlInput); if (!p) throw new Error(t('files.sourceBadUrl'));
  const [mf] = await db.select().from(s.modelFiles).where(eq(s.modelFiles.id, modelFileId)); if (!mf) throw new Error(t('files.fileNotFound'));
  const meta = await fetchSourceMeta(p, getter);
  const lic = normalizeLicense(meta.licenseText);
  const raw = meta.raw && JSON.stringify(meta.raw).length <= RAW_MAX ? meta.raw : null;
  const row = {
    provider: p.provider, url: p.url, externalId: p.externalId, title: meta.title, description: meta.description, authorName: meta.authorName, authorUid: meta.authorUid, authorUrl: meta.authorUrl,
    licenseCode: lic.code, licenseText: meta.licenseText, commercialUse: lic.commercial as CommercialUse, tags: meta.tags, images: meta.imageUrls.map((url) => ({ url })), plates: meta.plates as any, stats: meta.stats as any,
    remoteCreatedAt: meta.remoteCreatedAt, remoteUpdatedAt: meta.remoteUpdatedAt, raw, fetchedAt: new Date(), fetchStatus: meta.status, updatedAt: new Date(),
  };
  const [src] = mf.sourceId ? await db.update(s.modelSources).set(row).where(eq(s.modelSources.id, mf.sourceId)).returning() : await db.insert(s.modelSources).values({ workspaceId: WORKSPACE_ID, createdBy: userId ?? null, ...row }).returning();
  // la ficha del modelo hereda lo que no tenía; las etiquetas del sitio se suman con procedencia «import»
  const vocab = [...new Set((await db.select({ tags: s.modelFiles.tags }).from(s.modelFiles)).flatMap((r) => r.tags ?? []))];
  const imported = mergeSuggestions(meta.tags.map((n) => ({ name: n, confidence: 0.8, source: 'import' as const, via: 'metadatos' as const })), { vocabulary: vocab, existing: mf.tags ?? [], max: 6 });
  const tagMeta = { ...(mf.tagMeta ?? {}) }; for (const c of imported) tagMeta[normalizeTag(c.name)] = { source: 'import', confidence: c.confidence };
  await db.update(s.modelFiles).set({
    sourceId: src.id, origin: p.url, author: mf.author ?? meta.authorName ?? null, license: lic.code === 'desconocida' ? mf.license : lic.code,
    tags: [...(mf.tags ?? []), ...imported.map((c) => c.name)], tagMeta, updatedAt: new Date(),
  }).where(eq(s.modelFiles.id, modelFileId));
  await audit('model_file', modelFileId, 'origen', { provider: p.provider, status: meta.status, license: lic.code }, userId);
  return { sourceId: src.id, status: meta.status, license: lic.code, commercial: lic.commercial, title: meta.title };
}
