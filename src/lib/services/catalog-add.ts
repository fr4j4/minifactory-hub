import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { LocalizedError } from '@/i18n/errors';
import { getFilament, getVariant } from '../catalog/ofd';
import { commonSizeOf, lineNameOf, variantKey } from '../catalog/map';
import { applyBulkMaterials, defaultCostPerKg, type BulkCommon } from './inventory';

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
