import { and, eq, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { lookupGtin } from '../catalog/ofd';

export type ScanResult = { kind: 'spool'; href: string } | { kind: 'material'; href: string } | { kind: 'catalog'; href: string } | null;

/** Lo que significa un código leído: una bobina del taller (código propio), un material con ese GTIN, o un producto del catálogo que aún no está en el inventario. */
export async function resolveScan(raw: string): Promise<ScanResult> {
  const db = await getDb(); const c = raw.trim().replace(/^MF:/i, '').toUpperCase();
  const [sp] = await db.select({ id: s.spools.id }).from(s.spools).where(eq(s.spools.code, c)).limit(1);
  if (sp) return { kind: 'spool', href: `/inventario/bobinas/${sp.id}` };
  const digits = c.replace(/\D/g, ''); if (digits.length < 8 || digits.length !== c.length) return null;
  const variants = [digits, digits.replace(/^0+/, '')];
  const mats = await db.select({ id: s.materials.id, gtin: s.materials.gtin, name: s.materials.colorName }).from(s.materials).where(and(isNull(s.materials.deletedAt)));
  const mat = mats.find((m) => m.gtin && variants.includes(m.gtin.replace(/\D/g, '').replace(/^0+/, '')) || m.gtin === digits);
  if (mat) return { kind: 'material', href: `/inventario?q=${encodeURIComponent(mat.name)}` };
  const hit = await lookupGtin(digits);
  return hit ? { kind: 'catalog', href: `/inventario/alta-rapida?catalog=${encodeURIComponent(hit.filament)}&variant=${encodeURIComponent(hit.variant)}` } : null;
}
