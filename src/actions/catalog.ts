'use server';
import { eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { requirePerm } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { adjustStock, createSale, saveProduct, setSaleStatus, type ProductInput, type QuickSaleInput } from '@/lib/services/catalog';
import { createProductionOrder } from '@/lib/services/production';
import { addPayment } from '@/lib/services/orders';
import { checkNum, safe } from './common';
import { getT } from '@/i18n/server';
import { LocalizedError } from '@/i18n/errors';

export async function saveProductAction(i: ProductInput) {
  const t = await getT(); return safe(async () => { const u = await requirePerm('catalogo', i.id ? 'E' : 'C'); if (!i.name.trim()) throw new Error(t('catalog.theProductNeedsAName')); return saveProduct(i, u); }, ['/catalogo']); }
export async function updateVariantAction(id: string, p: { price?: number; minStock?: number; location?: string | null; weightG?: number; printH?: number; materialId?: string | null; active?: boolean; priceByChannel?: Record<string, number>; barcode?: string | null }) {
  return safe(async () => {
    const u = await requirePerm('catalogo', 'E'); const db = await getDb();
    // solo los campos declarados: antes el objeto del cliente iba entero a set() (productId, stock, deletedAt…)
    const v: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of ['price', 'minStock', 'location', 'weightG', 'printH', 'materialId', 'active', 'priceByChannel', 'barcode'] as const) if (p[k] !== undefined) v[k] = p[k];
    for (const k of ['price', 'minStock', 'weightG', 'printH'] as const) if (p[k] !== undefined) checkNum(p[k]);
    for (const x of Object.values(p.priceByChannel ?? {})) checkNum(x);
    await db.update(s.productVariants).set(v).where(eq(s.productVariants.id, id)); await audit('variant', id, 'editar', p, u.id);
  }, ['/catalogo']);
}
export async function adjustStockAction(i: Parameters<typeof adjustStock>[0]) { return safe(async () => { const u = await requirePerm('catalogo', 'E'); return adjustStock(i, u); }, ['/catalogo']); }
export async function produceAction(variantId: string, qty: number) {
  const t = await getT(); return safe(async () => { const u = await requirePerm('cola', 'C'); if (qty < 1) throw new Error(t('catalog.enterTheQuantityToProduce')); return createProductionOrder({ variantId, qty, userId: u.id }); }, ['/catalogo', '/cola']); }
export async function createSaleAction(i: QuickSaleInput) {
  const t = await getT(); return safe(async () => { const u = await requirePerm('ventas', 'C'); if (!i.items.length) throw new Error(t('catalog.addAtLeastOneProduct')); return createSale(i, u); }, ['/ventas', '/catalogo']); }
export async function setSaleStatusAction(id: string, status: Parameters<typeof setSaleStatus>[1], o: { tracking?: string; returnToStock?: boolean; reason?: string } = {}) { return safe(async () => { const u = await requirePerm('ventas', 'E'); await setSaleStatus(id, status, u, o); }, ['/ventas', '/catalogo']); }
export async function saleToggleChannelAction(i: { id?: string; name: string; kind: string; commissionPct: number; commissionFixed: number; avgShipping: number; active: boolean }) {
  return safe(async () => {
    const u = await requirePerm('config', 'E'); const db = await getDb();
    if (!i.name?.trim()) throw new LocalizedError('edit.required');
    checkNum(i.commissionPct, 0, 100); checkNum(i.commissionFixed); checkNum(i.avgShipping);
    if (i.id) await db.update(s.salesChannels).set({ name: i.name, kind: i.kind, commissionPct: i.commissionPct, commissionFixed: i.commissionFixed, avgShipping: i.avgShipping, active: i.active, updatedAt: new Date() }).where(eq(s.salesChannels.id, i.id));
    else await db.insert(s.salesChannels).values({ workspaceId: u.workspaceId, name: i.name, kind: i.kind, commissionPct: i.commissionPct, commissionFixed: i.commissionFixed, avgShipping: i.avgShipping, active: i.active });
  }, ['/configuracion', '/ventas']);
}
