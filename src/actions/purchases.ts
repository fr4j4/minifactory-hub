'use server';
import { requirePerm } from '@/lib/auth';
import { safe } from './common';
import { planPurchase, receivePurchase, voidPurchase, type PurchaseInput } from '@/lib/services/purchases';
import { removeSupplyRule, saveSupplyRule } from '@/lib/services/supplies';
import { addCatalogColors } from '@/lib/services/catalog-add';

/** Vista previa de la compra con el costo real de cada línea. No escribe. */
export async function previewPurchaseAction(i: PurchaseInput) {
  return safe(async () => { await requirePerm('inventario', 'C'); return planPurchase(i); });
}
export async function receivePurchaseAction(i: PurchaseInput) {
  return safe(async () => { const u = await requirePerm('inventario', 'C'); return receivePurchase(i, u.id); }, ['/inventario', '/inventario/compras']);
}
export async function voidPurchaseAction(id: string) {
  return safe(async () => { const u = await requirePerm('inventario', 'X'); await voidPurchase(id, u.id); }, ['/inventario', '/inventario/compras', `/inventario/compras/${id}`]);
}
/** «Tengo este color»: lo agrega a Mis filamentos sin stock. */
export async function addCatalogColorsAction(key: string, variantIds: string[]) {
  return safe(async () => { const u = await requirePerm('inventario', 'C'); return addCatalogColors(key, variantIds, u.id); }, ['/inventario', '/filamentos']);
}
export async function saveSupplyRuleAction(i: { itemId: string; qtyPerOrder: number; active?: boolean }) {
  return safe(async () => { const u = await requirePerm('inventario', 'E'); await saveSupplyRule(i, u.id); }, ['/inventario']);
}
export async function removeSupplyRuleAction(itemId: string) {
  return safe(async () => { const u = await requirePerm('inventario', 'E'); await removeSupplyRule(itemId, u.id); }, ['/inventario']);
}
