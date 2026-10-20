import { and, eq, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { audit } from '../audit';
import { matchMaterial, type CatalogMatch, type MatMini } from '../catalog/match';
import type { CatalogVariant } from '../catalog/ofd';

type Db = Awaited<ReturnType<typeof getDb>>;
const mini = (m: typeof s.materials.$inferSelect): MatMini => ({ id: m.id, manufacturer: m.manufacturer, line: m.line, type: m.type, colorName: m.colorName, hex: m.hex, density: m.density, diameter: m.diameter, tempNozzle: m.tempNozzle, tempBed: m.tempBed, gtin: m.gtin, traits: m.traits, variantId: m.variantId });

/** Materiales de filamento sin vínculo con el catálogo y lo que se les completaría. No escribe. */
export async function previewCatalogFill(db?: Db): Promise<Array<CatalogMatch & { label: string }>> {
  db ??= await getDb();
  const mats = await db.select().from(s.materials).where(and(isNull(s.materials.deletedAt), isNull(s.materials.variantId), eq(s.materials.tech, 'fdm'))).limit(600);
  const cache = new Map<string, CatalogVariant[]>(); const out: Array<CatalogMatch & { label: string }> = [];
  for (const m of mats) { const r = await matchMaterial(mini(m), undefined, cache); if (r) out.push({ ...r, label: `${m.manufacturer ? m.manufacturer + ' ' : ''}${m.line ? m.line + ' ' : ''}${m.type} ${m.colorName}`.trim() }); }
  return out;
}

/** Aplica solo las elegidas. Se recalcula en el servidor y se comprueba que el emparejamiento siga siendo el mismo: el cliente no manda los valores. Nunca pisa datos ya escritos. */
export async function applyCatalogFill(picks: Array<{ materialId: string; filamentKey: string; variantId: string | null }>, userId?: string | null, db?: Db) {
  db ??= await getDb(); const cache = new Map<string, CatalogVariant[]>(); let updated = 0, skipped = 0;
  for (const p of picks.slice(0, 600)) {
    const [m] = await db.select().from(s.materials).where(and(eq(s.materials.id, p.materialId), isNull(s.materials.deletedAt)));
    const r = m && !m.variantId ? await matchMaterial(mini(m), undefined, cache) : null;
    if (!r || r.filamentKey !== p.filamentKey || (r.variantId ?? null) !== (p.variantId ?? null)) { skipped++; continue; }
    const f = r.fill; const set: Partial<typeof s.materials.$inferInsert> = { updatedAt: new Date() };
    if (f.tempNozzle) set.tempNozzle = f.tempNozzle; if (f.tempBed) set.tempBed = f.tempBed; if (f.gtin) set.gtin = f.gtin; if (f.traits) set.traits = f.traits;
    if (f.variantId) set.variantId = f.variantId; if (f.diameter != null) set.diameter = f.diameter; if (f.density != null) set.density = f.density;
    await db.update(s.materials).set(set).where(eq(s.materials.id, m.id));
    await (await import('./lines')).syncMaterialLine(m.id, db, r.filamentKey);
    await audit('material', m.id, 'editar', { catalogo: r.filamentKey, campos: Object.keys(f) }, userId); updated++;
  }
  return { updated, skipped };
}
