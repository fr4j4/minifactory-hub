import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { audit } from '../audit';
import { getT } from '@/i18n/server';
import { LocalizedError } from '@/i18n/errors';
import { moveItem } from './inventory';

/** Reglas «cada pedido entregado gasta N de este ítem» (cajas, bolsas, etiquetas…). */
export async function listSupplyRules() {
  const db = await getDb();
  return db.select({ rule: s.supplyRules, name: s.inventoryItems.name, unit: s.inventoryItems.unit, category: s.inventoryItems.category, unitCost: s.inventoryItems.unitCost })
    .from(s.supplyRules).innerJoin(s.inventoryItems, eq(s.inventoryItems.id, s.supplyRules.itemId))
    .where(and(isNull(s.supplyRules.deletedAt), isNull(s.inventoryItems.deletedAt)));
}

export async function saveSupplyRule(i: { itemId: string; qtyPerOrder: number; active?: boolean }, userId?: string | null) {
  const db = await getDb();
  if (!(i.qtyPerOrder > 0) || i.qtyPerOrder > 1000) throw new LocalizedError('buy.errRuleQty');
  const [it] = await db.select({ id: s.inventoryItems.id }).from(s.inventoryItems).where(and(eq(s.inventoryItems.id, i.itemId), isNull(s.inventoryItems.deletedAt)));
  if (!it) throw new Error((await getT())('inventory.itemNotFound'));
  await db.insert(s.supplyRules).values({ workspaceId: WORKSPACE_ID, createdBy: userId ?? null, itemId: i.itemId, qtyPerOrder: i.qtyPerOrder, active: i.active ?? true })
    .onConflictDoUpdate({ target: [s.supplyRules.workspaceId, s.supplyRules.itemId], set: { qtyPerOrder: i.qtyPerOrder, active: i.active ?? true, deletedAt: null, updatedAt: new Date() } });
  await audit('supply_rule', i.itemId, 'guardar', { qtyPerOrder: i.qtyPerOrder, active: i.active ?? true }, userId);
}

export async function removeSupplyRule(itemId: string, userId?: string | null) {
  const db = await getDb();
  await db.update(s.supplyRules).set({ deletedAt: new Date() }).where(eq(s.supplyRules.itemId, itemId));
  await audit('supply_rule', itemId, 'quitar', {}, userId);
}

/** Al entregar un pedido: descuenta los insumos de las reglas activas y suma su costo al costo real del pedido. Devuelve lo gastado. */
export async function applySupplyRules(orderId: string, orderNumber: string, userId?: string | null) {
  const t = await getT(); const db = await getDb();
  const rules = (await listSupplyRules()).filter((r) => r.rule.active);
  let cost = 0; const used: Array<{ itemId: string; qty: number }> = [];
  for (const r of rules) {
    await moveItem({ itemId: r.rule.itemId, qty: r.rule.qtyPerOrder, kind: 'consumo', note: t('buy.supplyNote', { order: orderNumber }), userId });
    cost += Math.round(r.rule.qtyPerOrder * r.unitCost); used.push({ itemId: r.rule.itemId, qty: r.rule.qtyPerOrder });
  }
  if (cost > 0) await db.update(s.orders).set({ costReal: sql`coalesce(${s.orders.costReal}, 0) + ${cost}`, updatedAt: new Date() }).where(eq(s.orders.id, orderId));
  if (used.length) await audit('order', orderId, 'insumos', { used, cost }, userId);
  return { cost, used };
}
