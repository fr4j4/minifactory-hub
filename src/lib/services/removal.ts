import { and, count, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { audit } from '../audit';
import { LocalizedError } from '@/i18n/errors';
import type { MessageKey, Params } from '@/i18n/translate';
import type { Module } from '../perm';
import { recomputePaid } from './orders';

/**
 * Eliminar / archivar registros. Siempre es un borrado lógico (`deletedAt`): el historial (pedidos, ventas, reportes,
 * movimientos) se conserva y solo desaparece de las listas. Cada tipo define cuándo se bloquea para no dejar datos
 * a medias (stock disponible, pedidos abiertos, la última cuenta de administrador…).
 */
export const REMOVABLE = ['material', 'spool', 'item', 'product', 'variant', 'customer', 'quote', 'order', 'priceList', 'channel', 'user', 'collection', 'plan', 'incident', 'contact', 'payment', 'file'] as const;
export type RemovableKind = (typeof REMOVABLE)[number];
export const isRemovable = (k: string): k is RemovableKind => (REMOVABLE as readonly string[]).includes(k);

/** Módulo de permisos que se exige (acción «X» = eliminar). */
export const REMOVAL_MODULE: Record<RemovableKind, Module> = {
  material: 'inventario', spool: 'inventario', item: 'inventario', product: 'catalogo', variant: 'catalogo', customer: 'clientes', quote: 'presupuestos', order: 'pedidos',
  priceList: 'config', channel: 'config', user: 'config', collection: 'galeria', plan: 'maquinas', incident: 'maquinas', contact: 'pedidos', payment: 'pagos', file: 'archivos',
};

export interface RemovalInfo { canDelete: boolean; block?: { key: MessageKey; params?: Params } }
const ok: RemovalInfo = { canDelete: true };
const blocked = (key: MessageKey, params?: Params): RemovalInfo => ({ canDelete: false, block: { key, params } });

const OPEN_ORDER = ['recibido', 'en_produccion', 'post_proceso', 'listo'];
const ACTIVE_JOB = ['en_cola', 'imprimiendo', 'pausado'];
const stamp = () => Date.now().toString(36);

async function n(q: Promise<Array<{ n: number }>>): Promise<number> { return Number((await q)[0]?.n ?? 0); }

/** Presupuestos abiertos, pedidos abiertos y variantes activas que todavía usan un material (se reemplaza o se cierra antes de eliminarlo). */
export async function materialUsage(materialId: string): Promise<number> {
  const db = await getDb();
  const q = await n(db.select({ n: sql<number>`count(distinct ${s.quoteItems.quoteId})::int` }).from(s.quoteItems).innerJoin(s.quotes, eq(s.quotes.id, s.quoteItems.quoteId)).where(and(eq(s.quoteItems.materialId, materialId), isNull(s.quoteItems.deletedAt), isNull(s.quotes.deletedAt), inArray(s.quotes.status, ['borrador', 'enviado']))));
  const o = await n(db.select({ n: sql<number>`count(distinct ${s.orderItems.orderId})::int` }).from(s.orderItems).innerJoin(s.orders, eq(s.orders.id, s.orderItems.orderId)).where(and(eq(s.orderItems.materialId, materialId), isNull(s.orders.deletedAt), inArray(s.orders.status, OPEN_ORDER))));
  const v = await n(db.select({ n: count() }).from(s.productVariants).where(and(eq(s.productVariants.materialId, materialId), isNull(s.productVariants.deletedAt), eq(s.productVariants.active, true))));
  return q + o + v;
}

/** Cambia el material en presupuestos abiertos, pedidos abiertos y variantes activas, y después elimina el original. */
export async function replaceAndRemoveMaterial(fromId: string, toId: string, userId?: string | null) {
  if (fromId === toId) throw new LocalizedError('remove.block.replaceSame');
  const db = await getDb();
  const [to] = await db.select({ id: s.materials.id }).from(s.materials).where(and(eq(s.materials.id, toId), isNull(s.materials.deletedAt)));
  if (!to) throw new LocalizedError('remove.notFound');
  const openQuotes = db.select({ id: s.quotes.id }).from(s.quotes).where(and(isNull(s.quotes.deletedAt), inArray(s.quotes.status, ['borrador', 'enviado'])));
  await db.update(s.quoteItems).set({ materialId: toId }).where(and(eq(s.quoteItems.materialId, fromId), inArray(s.quoteItems.quoteId, openQuotes)));
  const openOrders = db.select({ id: s.orders.id }).from(s.orders).where(and(isNull(s.orders.deletedAt), inArray(s.orders.status, OPEN_ORDER)));
  await db.update(s.orderItems).set({ materialId: toId }).where(and(eq(s.orderItems.materialId, fromId), inArray(s.orderItems.orderId, openOrders)));
  await db.update(s.productVariants).set({ materialId: toId }).where(and(eq(s.productVariants.materialId, fromId), isNull(s.productVariants.deletedAt)));
  await audit('material', fromId, 'reemplazar', { por: toId }, userId);
  await removeRecord('material', fromId, userId);
}

/** Dice si un registro se puede eliminar y, si no, por qué (clave de mensaje + parámetros). */
export async function removalInfo(kind: RemovableKind, id: string, actorId?: string | null): Promise<RemovalInfo> {
  const db = await getDb();
  switch (kind) {
    case 'material': {
      const c = await n(db.select({ n: count() }).from(s.spools).where(and(eq(s.spools.materialId, id), isNull(s.spools.deletedAt), inArray(s.spools.status, ['nueva', 'abierta', 'en_uso']), gt(s.spools.remainingG, 0))));
      if (c) return blocked('remove.block.materialSpools', { count: c });
      const jobs = await n(db.select({ n: count() }).from(s.printJobs).where(and(eq(s.printJobs.materialId, id), inArray(s.printJobs.status, ACTIVE_JOB), isNull(s.printJobs.deletedAt))));
      if (jobs) return blocked('remove.block.activeJobs', { count: jobs });
      const used = await materialUsage(id);
      return used ? blocked('remove.block.materialUsed', { count: used }) : ok;
    }
    case 'spool': {
      const [sp] = await db.select().from(s.spools).where(eq(s.spools.id, id));
      return sp?.machineId || sp?.status === 'en_uso' ? blocked('remove.block.spoolLoaded') : ok;
    }
    case 'product': {
      const vs = await db.select().from(s.productVariants).where(and(eq(s.productVariants.productId, id), isNull(s.productVariants.deletedAt)));
      if (vs.some((v) => v.stock > 0 || v.reserved > 0)) return blocked('remove.block.productStock');
      for (const v of vs) { const i = await removalInfo('variant', v.id); if (!i.canDelete) return i; }
      return ok;
    }
    case 'variant': {
      const [v] = await db.select().from(s.productVariants).where(eq(s.productVariants.id, id));
      if (v && (v.stock > 0 || v.reserved > 0)) return blocked('remove.block.variantStock', { stock: v.stock });
      const open = await n(db.select({ n: count() }).from(s.orderItems).innerJoin(s.orders, eq(s.orders.id, s.orderItems.orderId)).where(and(eq(s.orderItems.variantId, id), inArray(s.orders.status, OPEN_ORDER), isNull(s.orders.deletedAt))));
      if (open) return blocked('remove.block.variantOrders', { count: open });
      const jobs = await n(db.select({ n: count() }).from(s.productionOrders).where(and(eq(s.productionOrders.variantId, id), inArray(s.productionOrders.status, ['planificada', 'en_cola', 'imprimiendo']), isNull(s.productionOrders.deletedAt))));
      return jobs ? blocked('remove.block.activeJobs', { count: jobs }) : ok;
    }
    case 'customer': {
      const c = await n(db.select({ n: count() }).from(s.orders).where(and(eq(s.orders.customerId, id), inArray(s.orders.status, OPEN_ORDER), isNull(s.orders.deletedAt))));
      return c ? blocked('remove.block.customerOrders', { count: c }) : ok;
    }
    case 'quote': {
      const [q] = await db.select().from(s.quotes).where(eq(s.quotes.id, id));
      if (q?.status === 'aprobado') return blocked('remove.block.quoteApproved');
      if (q?.status === 'enviado') return blocked('remove.block.quoteSent');
      return ok;
    }
    case 'order': {
      const [o] = await db.select().from(s.orders).where(eq(s.orders.id, id));
      return o && o.status !== 'cancelado' ? blocked('remove.block.orderNotCancelled') : ok;
    }
    case 'priceList': {
      const c = await n(db.select({ n: count() }).from(s.customers).where(and(eq(s.customers.priceListId, id), isNull(s.customers.deletedAt))));
      return c ? blocked('remove.block.priceListCustomers', { count: c }) : ok;
    }
    case 'channel': {
      const c = await n(db.select({ n: count() }).from(s.sales).where(and(eq(s.sales.channelId, id), eq(s.sales.status, 'por_despachar'), isNull(s.sales.deletedAt))));
      return c ? blocked('remove.block.channelPending', { count: c }) : ok;
    }
    case 'user': {
      if (id === actorId) return blocked('remove.block.userSelf');
      const [u] = await db.select().from(s.users).where(eq(s.users.id, id));
      if (u?.role === 'admin' && u.active) {
        const others = await n(db.select({ n: count() }).from(s.users).where(and(eq(s.users.role, 'admin'), eq(s.users.active, true), isNull(s.users.deletedAt), ne(s.users.id, id))));
        if (!others) return blocked('remove.block.lastAdmin');
      }
      return ok;
    }
    default: return ok;
  }
}

export async function nameOf(kind: RemovableKind, id: string): Promise<string | null> {
  const db = await getDb();
  const pick = async (q: Promise<Array<{ v: string | null }>>) => (await q)[0]?.v ?? null;
  switch (kind) {
    case 'material': return pick(db.select({ v: sql<string>`${s.materials.type} || ' ' || ${s.materials.colorName}` }).from(s.materials).where(eq(s.materials.id, id)));
    case 'spool': return pick(db.select({ v: s.spools.code }).from(s.spools).where(eq(s.spools.id, id)));
    case 'item': return pick(db.select({ v: s.inventoryItems.name }).from(s.inventoryItems).where(eq(s.inventoryItems.id, id)));
    case 'product': return pick(db.select({ v: s.products.name }).from(s.products).where(eq(s.products.id, id)));
    case 'variant': return pick(db.select({ v: s.productVariants.sku }).from(s.productVariants).where(eq(s.productVariants.id, id)));
    case 'customer': return pick(db.select({ v: s.customers.name }).from(s.customers).where(eq(s.customers.id, id)));
    case 'quote': return pick(db.select({ v: s.quotes.number }).from(s.quotes).where(eq(s.quotes.id, id)));
    case 'order': return pick(db.select({ v: s.orders.number }).from(s.orders).where(eq(s.orders.id, id)));
    case 'priceList': return pick(db.select({ v: s.priceLists.name }).from(s.priceLists).where(eq(s.priceLists.id, id)));
    case 'channel': return pick(db.select({ v: s.salesChannels.name }).from(s.salesChannels).where(eq(s.salesChannels.id, id)));
    case 'user': return pick(db.select({ v: s.users.name }).from(s.users).where(eq(s.users.id, id)));
    case 'collection': return pick(db.select({ v: s.collections.name }).from(s.collections).where(eq(s.collections.id, id)));
    case 'plan': return pick(db.select({ v: s.maintenancePlans.task }).from(s.maintenancePlans).where(eq(s.maintenancePlans.id, id)));
    case 'incident': return pick(db.select({ v: s.incidents.description }).from(s.incidents).where(eq(s.incidents.id, id)));
    case 'contact': return pick(db.select({ v: s.contactLog.summary }).from(s.contactLog).where(eq(s.contactLog.id, id)));
    case 'payment': return pick(db.select({ v: sql<string>`${s.payments.amount}::text` }).from(s.payments).where(eq(s.payments.id, id)));
    case 'file': return pick(db.select({ v: s.modelFiles.name }).from(s.modelFiles).where(eq(s.modelFiles.id, id)));
  }
}

/** Elimina (borrado lógico) un registro. Lanza `LocalizedError` si está bloqueado o no existe. */
export async function removeRecord(kind: RemovableKind, id: string, userId?: string | null) {
  const name = await nameOf(kind, id);
  if (name == null) throw new LocalizedError('remove.notFound');
  const info = await removalInfo(kind, id, userId);
  if (!info.canDelete) throw new LocalizedError(info.block!.key, info.block!.params);
  const db = await getDb(); const now = new Date(); const tag = stamp();
  switch (kind) {
    case 'material': {
      await db.update(s.spools).set({ deletedAt: now }).where(eq(s.spools.materialId, id));
      await db.update(s.spools).set({ code: sql`${s.spools.code} || ${'~' + tag}` }).where(eq(s.spools.materialId, id));
      await db.update(s.materials).set({ deletedAt: now }).where(eq(s.materials.id, id)); break;
    }
    case 'spool': await db.update(s.spools).set({ deletedAt: now, code: sql`${s.spools.code} || ${'~' + tag}` }).where(eq(s.spools.id, id)); break;
    case 'item': await db.update(s.inventoryItems).set({ deletedAt: now }).where(eq(s.inventoryItems.id, id)); break;
    case 'product': {
      await db.update(s.productVariants).set({ deletedAt: now, active: false, sku: sql`${s.productVariants.sku} || ${'~' + tag}` }).where(eq(s.productVariants.productId, id));
      await db.update(s.products).set({ deletedAt: now }).where(eq(s.products.id, id)); break;
    }
    case 'variant': await db.update(s.productVariants).set({ deletedAt: now, active: false, sku: sql`${s.productVariants.sku} || ${'~' + tag}` }).where(eq(s.productVariants.id, id)); break;
    case 'customer': await db.update(s.customers).set({ deletedAt: now }).where(eq(s.customers.id, id)); break;
    case 'quote': await db.update(s.quotes).set({ deletedAt: now }).where(eq(s.quotes.id, id)); break;
    case 'order': await db.update(s.orders).set({ deletedAt: now }).where(eq(s.orders.id, id)); break;
    case 'priceList': await db.update(s.priceLists).set({ deletedAt: now }).where(eq(s.priceLists.id, id)); break;
    case 'channel': await db.update(s.salesChannels).set({ deletedAt: now, active: false }).where(eq(s.salesChannels.id, id)); break;
    case 'user': {
      await db.update(s.users).set({ deletedAt: now, active: false, email: sql`${s.users.email} || ${'.eliminado.' + tag}` }).where(eq(s.users.id, id));
      await db.delete(s.sessions).where(eq(s.sessions.userId, id)); break;
    }
    case 'collection': await db.update(s.collections).set({ deletedAt: now }).where(eq(s.collections.id, id)); break;
    case 'plan': await db.update(s.maintenancePlans).set({ deletedAt: now }).where(eq(s.maintenancePlans.id, id)); break;
    case 'incident': await db.update(s.incidents).set({ deletedAt: now }).where(eq(s.incidents.id, id)); break;
    case 'contact': await db.update(s.contactLog).set({ deletedAt: now }).where(eq(s.contactLog.id, id)); break;
    case 'file': await db.update(s.modelFiles).set({ deletedAt: now }).where(eq(s.modelFiles.id, id)); break;
    case 'payment': {
      const [p] = await db.select().from(s.payments).where(eq(s.payments.id, id));
      await db.update(s.payments).set({ deletedAt: now }).where(eq(s.payments.id, id));
      await recomputePaid(db, { orderId: p.orderId, saleId: p.saleId }); break;
    }
  }
  await audit(kind, id, 'eliminar', { name }, userId);
}
