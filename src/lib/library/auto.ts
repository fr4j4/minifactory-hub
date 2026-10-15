import { eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { getSettingsRaw } from '../settings';
import { mergeSuggestions, normalizeTag, ruleCandidates, MAX_TAGS } from './tags';

export const AUTO_TAG_MIN_CONFIDENCE = 0.8;

/** Aplica las etiquetas por reglas con confianza alta (sin IA) si el taller lo activó. Devuelve las etiquetas agregadas. */
export async function autoTagFile(modelFileId: string): Promise<string[]> {
  if (!(await getSettingsRaw()).library?.autoTag) return [];
  const db = await getDb();
  const [f] = await db.select().from(s.modelFiles).where(eq(s.modelFiles.id, modelFileId)); if (!f) return [];
  const [src] = f.sourceId ? await db.select().from(s.modelSources).where(eq(s.modelSources.id, f.sourceId)) : [];
  const cands = ruleCandidates({ name: f.name, folder: f.folder, origin: f.origin, sourceTags: src?.tags ?? [], geom: { dimX: f.dimX, dimY: f.dimY, dimZ: f.dimZ, volumeCm3: f.volumeCm3, closed: f.closed } });
  const vocab = [...new Set((await db.select({ tags: s.modelFiles.tags }).from(s.modelFiles)).flatMap((r) => r.tags ?? []))];
  const picked = mergeSuggestions(cands, { vocabulary: vocab, existing: f.tags ?? [] }).filter((c) => c.confidence >= AUTO_TAG_MIN_CONFIDENCE);
  const cur = new Set((f.tags ?? []).map(normalizeTag)); const next = [...(f.tags ?? [])]; const meta = { ...(f.tagMeta ?? {}) }; const added: string[] = [];
  for (const c of picked) { const n = normalizeTag(c.name); if (!n || cur.has(n) || next.length >= MAX_TAGS) continue; cur.add(n); next.push(n); meta[n] = { source: 'regla', confidence: c.confidence }; added.push(n); }
  if (added.length) await db.update(s.modelFiles).set({ tags: next, tagMeta: meta, updatedAt: new Date() }).where(eq(s.modelFiles.id, modelFileId));
  return added;
}
