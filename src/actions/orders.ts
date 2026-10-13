'use server';
import { and, eq } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { requirePerm } from '@/lib/auth';
import { canSetFinalPrice } from '@/lib/perm';
import { addPayment, cancelOrder, createOrder, planProduction, setOrderStatus, type OrderInput } from '@/lib/services/orders';
import { audit } from '@/lib/audit';
import { safe } from './common';
import { getT } from '@/i18n/server';

export async function createOrderAction(input: OrderInput) {
  const t = await getT();
  return safe(async () => {
    const u = await requirePerm('pedidos', 'C');
    if (!canSetFinalPrice(u)) for (const it of input.items) it.finalUnit = null;
    if (!input.items.length) throw new Error(t('orders.addAtLeastOneItem'));
    if (!input.customerId && !input.customerName?.trim()) throw new Error(t('orders.enterTheCustomerSName'));
    return createOrder(input, u);
  }, ['/pedidos']);
}
export async function planProductionAction(orderId: string) { return safe(async () => { const u = await requirePerm('pedidos', 'E'); return (await planProduction(orderId, u)).length; }, [`/pedidos/${orderId}`, '/cola']); }
export async function setOrderStatusAction(orderId: string, to: 'listo' | 'entregado' | 'post_proceso', o: { tracking?: string; shipMethod?: string } = {}) {
  return safe(async () => { const u = await requirePerm('pedidos', 'E'); await setOrderStatus(orderId, to, u, o); }, [`/pedidos/${orderId}`, '/pedidos', '/catalogo']);
}
export async function cancelOrderAction(orderId: string, reason: string) {
  const t = await getT(); return safe(async () => { const u = await requirePerm('pedidos', 'E'); if (!reason.trim()) throw new Error(t('orders.enterTheReason')); await cancelOrder(orderId, reason, u); }, [`/pedidos/${orderId}`, '/pedidos', '/cola']); }
export async function addPaymentAction(i: { orderId?: string; saleId?: string; amount: number; method: string; note?: string; taxDocType?: string; taxDocFolio?: string; receiptKey?: string }) {
  return safe(async () => { const u = await requirePerm('pagos', 'C'); await addPayment(i, u); }, [i.orderId ? `/pedidos/${i.orderId}` : '/ventas']);
}
export async function addContactAction(i: { orderId?: string; quoteId?: string; customerId?: string | null; channel: string; summary: string }) {
  const t = await getT();
  return safe(async () => {
    const u = await requirePerm('pedidos', 'E'); if (!i.summary.trim()) throw new Error(t('orders.writeWhatWasDiscussedOr'));
    const db = await getDb(); await db.insert(s.contactLog).values({ workspaceId: WORKSPACE_ID, orderId: i.orderId ?? null, quoteId: i.quoteId ?? null, customerId: i.customerId ?? null, channel: i.channel, summary: i.summary, createdBy: u.id });
  }, i.orderId ? [`/pedidos/${i.orderId}`] : []);
}
export async function updateOrderAction(orderId: string, patch: { dueDate?: string | null; priority?: string; notes?: string | null; shipAddress?: string | null; tracking?: string | null; shipMethod?: string | null }) {
  return safe(async () => { const u = await requirePerm('pedidos', 'E'); const db = await getDb(); await db.update(s.orders).set({ ...patch, updatedAt: new Date() }).where(eq(s.orders.id, orderId)); await audit('order', orderId, 'editar', patch, u.id); }, [`/pedidos/${orderId}`]);
}
/** Convierte un cliente ocasional del pedido en una ficha de cliente, sin perder su historial. */
export async function promoteCustomerAction(orderId: string) {
  const t = await getT();
  return safe(async () => {
    const u = await requirePerm('clientes', 'C'); const db = await getDb();
    const [o] = await db.select().from(s.orders).where(eq(s.orders.id, orderId)); if (!o || o.customerId) throw new Error(t('orders.theOrderAlreadyHasA'));
    const [c] = await db.insert(s.customers).values({ workspaceId: WORKSPACE_ID, name: o.customerName || t('common.customer'), phone: o.customerPhone, createdBy: u.id }).returning({ id: s.customers.id });
    await db.update(s.orders).set({ customerId: c.id }).where(eq(s.orders.id, orderId));
    await audit('customer', c.id, 'crear', { fromOrder: orderId }, u.id); return c.id;
  }, [`/pedidos/${orderId}`, '/clientes']);
}
