import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { audit } from '../audit';
import { LocalizedError } from '@/i18n/errors';
import { REMOVABLE, nameOf, type RemovableKind } from './removal';
import { recomputePaid } from './orders';

/** Tablas de cada tipo eliminable. */
const TABLE = {
  material: s.materials, spool: s.spools, item: s.inventoryItems, product: s.products, variant: s.productVariants, customer: s.customers, quote: s.quotes, order: s.orders,
  priceList: s.priceLists, channel: s.salesChannels, user: s.users, collection: s.collections, plan: s.maintenancePlans, incident: s.incidents, contact: s.contactLog, payment: s.payments,
} as const satisfies Record<RemovableKind, any>;

/** Quita el sufijo que se agrega al eliminar para liberar códigos, SKU y correos únicos. */
const stripSuffix = (v: string) => v.replace(/~[0-9a-z]+$/, '').replace(/\.eliminado\.[0-9a-z]+$/, '');

export interface ArchivedRow { kind: RemovableKind; id: string; name: string; deletedAt: Date }

/** Registros eliminados (los más recientes primero), opcionalmente de un solo tipo. */
export async function listArchived(kind?: RemovableKind, limit = 50): Promise<ArchivedRow[]> {
  const db = await getDb(); const out: ArchivedRow[] = [];
  for (const k of kind ? [kind] : REMOVABLE) {
    const table = TABLE[k] as any;
    const rows = await db.select({ id: table.id, deletedAt: table.deletedAt }).from(table).where(isNotNull(table.deletedAt)).orderBy(desc(table.deletedAt)).limit(limit);
    for (const r of rows) out.push({ kind: k, id: r.id, name: stripSuffix((await nameOf(k, r.id)) ?? r.id), deletedAt: r.deletedAt });
  }
  return out.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime()).slice(0, limit);
}

async function alive(table: any, id: string | null | undefined) {
  if (!id) return true;
  const db = await getDb(); const [r] = await db.select({ d: table.deletedAt }).from(table).where(eq(table.id, id));
  return !!r && r.d == null;
}

/** Devuelve un registro eliminado a las listas. Falla si su padre sigue eliminado o si su código/SKU/correo ya lo usa otro. */
export async function restoreRecord(kind: RemovableKind, id: string, userId?: string | null) {
  const db = await getDb(); const table = TABLE[kind] as any;
  const [row] = await db.select().from(table).where(and(eq(table.id, id), isNotNull(table.deletedAt)));
  if (!row) throw new LocalizedError('remove.notFound');
  const parentOk =
    kind === 'variant' ? await alive(s.products, row.productId)
    : kind === 'spool' ? await alive(s.materials, row.materialId)
    : kind === 'plan' || kind === 'incident' ? await alive(s.machines, row.machineId)
    : kind === 'contact' ? await alive(s.orders, row.orderId) && await alive(s.customers, row.customerId)
    : kind === 'payment' ? await alive(s.orders, row.orderId) && await alive(s.sales, row.saleId)
    : true;
  if (!parentOk) throw new LocalizedError('restore.parentDeleted');
  const at = row.deletedAt as Date;
  const fix = async (tbl: any, col: any, name: string) => {
    const clean = stripSuffix(String(row[name]));
    const [dup] = await db.select({ id: tbl.id }).from(tbl).where(and(eq(col, clean), isNull(tbl.deletedAt)));
    if (dup) throw new LocalizedError('restore.conflict', { value: clean });
    return clean;
  };
  switch (kind) {
    case 'spool': { const code = await fix(s.spools, s.spools.code, 'code'); await db.update(s.spools).set({ deletedAt: null, code }).where(eq(s.spools.id, id)); break; }
    case 'variant': { const sku = await fix(s.productVariants, s.productVariants.sku, 'sku'); await db.update(s.productVariants).set({ deletedAt: null, sku }).where(eq(s.productVariants.id, id)); break; }
    case 'user': { const email = await fix(s.users, s.users.email, 'email'); await db.update(s.users).set({ deletedAt: null, email }).where(eq(s.users.id, id)); break; }
    case 'product': {
      await db.update(s.products).set({ deletedAt: null }).where(eq(s.products.id, id));
      const vs = await db.select().from(s.productVariants).where(and(eq(s.productVariants.productId, id), eq(s.productVariants.deletedAt, at)));
      for (const v of vs) {
        const sku = stripSuffix(v.sku); const [dup] = await db.select({ id: s.productVariants.id }).from(s.productVariants).where(and(eq(s.productVariants.sku, sku), isNull(s.productVariants.deletedAt)));
        if (!dup) await db.update(s.productVariants).set({ deletedAt: null, active: true, sku }).where(eq(s.productVariants.id, v.id));
      }
      break;
    }
    case 'material': {
      await db.update(s.materials).set({ deletedAt: null }).where(eq(s.materials.id, id));
      const sps = await db.select().from(s.spools).where(and(eq(s.spools.materialId, id), eq(s.spools.deletedAt, at)));
      for (const sp of sps) {
        const code = stripSuffix(sp.code); const [dup] = await db.select({ id: s.spools.id }).from(s.spools).where(and(eq(s.spools.code, code), isNull(s.spools.deletedAt)));
        if (!dup) await db.update(s.spools).set({ deletedAt: null, code }).where(eq(s.spools.id, sp.id));
      }
      break;
    }
    case 'channel': await db.update(s.salesChannels).set({ deletedAt: null, active: true }).where(eq(s.salesChannels.id, id)); break;
    case 'payment': await db.update(s.payments).set({ deletedAt: null }).where(eq(s.payments.id, id)); await recomputePaid(db, { orderId: row.orderId, saleId: row.saleId }); break;
    default: await db.update(table).set({ deletedAt: null }).where(eq(table.id, id));
  }
  await audit(kind, id, 'restaurar', {}, userId);
}
