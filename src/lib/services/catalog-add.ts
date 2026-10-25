import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { LocalizedError } from '@/i18n/errors';
import { getFilament, getVariant } from '../catalog/ofd';
import { commonSizeOf, lineNameOf, variantKey } from '../catalog/map';
import { applyBulkMaterials, createSpool, defaultCostPerKg, weighSpool, type BulkCommon } from './inventory';

/** Agrega colores del catálogo a «Mis filamentos» sin carretes ni compra: quedan con 0 g hasta que se registre una compra. Repetir no duplica. */
export async function addCatalogColors(key: string, variantIds: string[], userId?: string | null) {
  const db = await getDb();
  const f = await getFilament(key); if (!f) throw new LocalizedError('inventory.catalogLineMissing');
  const ids = [...new Set(variantIds)].slice(0, 200); if (!ids.length) throw new LocalizedError('buy.errNoColors');
  const picked = (await Promise.all(ids.map((id) => getVariant(key, id)))).filter((v): v is NonNullable<typeof v> => !!v);
  if (!picked.length) throw new LocalizedError('buy.errNoColors');
  const size = commonSizeOf(picked); const line = lineNameOf(f.material, f.name);
  // si ya hay colores de esta marca y línea, el nuevo parte con su precio de referencia
  const [peer] = await db.select({ c: s.materials.costPerKg }).from(s.materials).where(and(eq(s.materials.manufacturer, f.brandName), eq(s.materials.line, line), eq(s.materials.generic, false), isNull(s.materials.deletedAt))).orderBy(desc(s.materials.updatedAt)).limit(1);
  const common: BulkCommon = { supplierId: null, manufacturer: f.brandName, line, type: f.material, diameter: size.diameter ?? 1.75, density: f.density, costPerKg: peer?.c || defaultCostPerKg(f.material), netG: size.netG ?? 1000, tareG: size.tareG ?? 200, catalogId: key };
  const res = await applyBulkMaterials(common, picked.map((v) => ({ colorName: v.name, hex: v.hex, spools: 0, variantId: v.id })), userId);
  const rows = await db.select({ id: s.materials.id, variantId: s.materials.variantId }).from(s.materials).where(and(isNull(s.materials.deletedAt), eq(s.materials.generic, false)));
  const want = new Set(picked.map((v) => variantKey(key, v.id)));
  return { ...res, materialIds: rows.filter((r) => r.variantId && want.has(r.variantId)).map((r) => r.id) };
}

/** Lo que se tiene de un color recién agregado desde un selector: nada, carretes cerrados y/o un carrete abierto (gramos netos restantes). */
export interface OwnedInput { fullSpools?: number; openG?: number; costPerKg?: number; stockMinG?: number }

/**
 * Agrega un color de la biblioteca a «Mis filamentos» y, si se indica, carga lo que ya hay en el taller como stock inicial (ajuste, no compra).
 * Sin cantidades queda con 0 g y el sistema avisa que falta. Si el color ya estaba, no lo duplica ni vuelve a cargar stock.
 */
export async function addCatalogColorOwned(key: string, variantId: string, o: OwnedInput = {}, userId?: string | null) {
  const db = await getDb();
  const full = Math.max(0, Math.min(20, Math.floor(o.fullSpools ?? 0))); const open = o.openG != null && o.openG > 0 ? Math.min(o.openG, 20000) : 0;
  const before = await db.select({ id: s.materials.id }).from(s.materials).where(and(isNull(s.materials.deletedAt), eq(s.materials.variantId, variantKey(key, variantId))));
  const res = await addCatalogColors(key, [variantId], userId);
  const materialId = res.materialIds[0]; if (!materialId) throw new LocalizedError('buy.errNoColors');
  const created = before.length === 0;
  if (!created) return { materialId, created: false, spools: 0 };
  const patch: Partial<typeof s.materials.$inferInsert> = {};
  if (o.costPerKg != null && o.costPerKg > 0) patch.costPerKg = Math.round(o.costPerKg);
  if (o.stockMinG != null && o.stockMinG >= 0) patch.stockMinG = Math.round(o.stockMinG);
  if (Object.keys(patch).length) await db.update(s.materials).set({ ...patch, updatedAt: new Date() }).where(eq(s.materials.id, materialId));
  const [m] = await db.select().from(s.materials).where(eq(s.materials.id, materialId));
  const net = m.packG ?? 1000; let spools = 0;
  for (let k = 0; k < full; k++) { await createSpool({ materialId, initialG: net, unitCost: m.costPerKg, userId, initial: true }); spools++; }
  if (open > 0) {
    const sp = await createSpool({ materialId, initialG: net, unitCost: m.costPerKg, userId, initial: true });
    await weighSpool(sp.id, open + sp.tareG, userId); await db.update(s.spools).set({ status: 'abierta' }).where(eq(s.spools.id, sp.id)); spools++;
  }
  return { materialId, created: true, spools };
}
