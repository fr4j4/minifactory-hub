'use server';
import { eq } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { requirePerm } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { bulkUpdateLine, createSpool, moveItem, weighSpool } from '@/lib/services/inventory';
import { checkNum, safe } from './common';
import { getT } from '@/i18n/server';
import { LocalizedError } from '@/i18n/errors';

export interface MaterialInput { id?: string; tech: string; manufacturer?: string; line?: string; type: string; colorName: string; hex: string; diameter?: number | null; density: number; costPerKg: number; stockMinG: number; tempNozzle?: string; tempBed?: string; supplierText?: string; filamentProfileId?: string | null }
export async function saveMaterialAction(i: MaterialInput) {
  const t = await getT();
  return safe(async () => {
    const u = await requirePerm('inventario', i.id ? 'E' : 'C'); const db = await getDb();
    if (!i.type.trim() || !i.colorName.trim()) throw new Error(t('inventory.enterTheTypeAndColor'));
    checkNum(i.density, 0.01); checkNum(i.costPerKg); checkNum(i.stockMinG); // densidad 0 deja el costo del material en 0
    const v = { tech: i.tech, manufacturer: i.manufacturer || null, line: i.line || null, type: i.type, colorName: i.colorName, hex: i.hex, diameter: i.diameter ?? null, density: i.density, costPerKg: Math.round(i.costPerKg), stockMinG: Math.round(i.stockMinG), tempNozzle: i.tempNozzle || null, tempBed: i.tempBed || null, supplierText: i.supplierText || null, updatedAt: new Date() };
    const link = async (id: string) => { const L = await import('@/lib/slicer/links'); if (i.filamentProfileId === undefined) return; if (i.filamentProfileId) await L.setMaterialProfile(id, i.filamentProfileId, null, db, u.id); else await L.clearMaterialProfile(id, db); };
    if (i.id) { await db.update(s.materials).set(v).where(eq(s.materials.id, i.id)); await link(i.id); await (await import('@/lib/services/lines')).syncMaterialLine(i.id, db); await audit('material', i.id, 'editar', { costPerKg: v.costPerKg }, u.id); return i.id; }
    const [m] = await db.insert(s.materials).values({ workspaceId: WORKSPACE_ID, createdBy: u.id, ...v }).returning({ id: s.materials.id }); await link(m.id); await (await import('@/lib/services/lines')).syncMaterialLine(m.id, db); return m.id;
  }, ['/inventario']);
}
export async function addSpoolAction(i: { materialId: string; initialG: number; tareG: number; unitCost: number; lot?: string; location?: string; supplierText?: string; supplierId?: string | null; count?: number }) {
  return safe(async () => { const u = await requirePerm('inventario', 'C'); const out: string[] = []; for (let k = 0; k < Math.max(1, Math.min(20, i.count ?? 1)); k++) { const sp = await createSpool({ materialId: i.materialId, initialG: i.initialG, tareG: i.tareG, unitCost: i.unitCost, lot: i.lot, location: i.location, supplierText: i.supplierText, supplierId: i.supplierId || null, userId: u.id }); out.push(sp.id); } return out; }, ['/inventario']);
}
export async function weighSpoolAction(id: string, grossG: number) {
  const t = await getT(); return safe(async () => { const u = await requirePerm('inventario', 'E'); if (!(grossG >= 0)) throw new Error(t('inventory.invalidWeight')); return weighSpool(id, grossG, u.id); }, ['/inventario', `/inventario/bobinas/${id}`]); }
export async function updateSpoolAction(id: string, p: { location?: string | null; machineId?: string | null; slot?: string | null; status?: string; lastDriedAt?: string | null; tareG?: number }) {
  const t = await getT();
  return safe(async () => {
    const u = await requirePerm('inventario', 'E'); const db = await getDb();
    const [sp] = await db.select().from(s.spools).where(eq(s.spools.id, id)); if (!sp) throw new Error(t('common.spoolNotFound'));
    // solo los campos editables (antes se copiaba el objeto del cliente entero: podía tocar remainingG, unitCost o deletedAt); los gramos y el costo cambian por pesaje o consumo, que dejan movimiento
    const patch: Record<string, any> = { updatedAt: new Date() };
    for (const k of ['location', 'machineId', 'slot', 'status', 'lastDriedAt', 'tareG'] as const) if (p[k] !== undefined) patch[k] = p[k];
    if (p.status !== undefined && !['nueva', 'abierta', 'en_uso', 'agotada', 'descartada'].includes(p.status)) throw new Error(t('inventory.invalidSpoolStatus'));
    if (p.tareG !== undefined) checkNum(p.tareG);
    if (p.machineId) { patch.status = sp.status === 'agotada' ? sp.status : 'en_uso'; const [m] = await db.select().from(s.machines).where(eq(s.machines.id, p.machineId)); patch.location = t('inventory.loadedIn', { machine: m?.name ?? '' }) + (p.slot ? ' · ' + p.slot : ''); }
    if (p.machineId === null) { patch.machineId = null; }
    await db.update(s.spools).set(patch).where(eq(s.spools.id, id));
    if (p.location !== undefined || p.machineId !== undefined) await db.insert(s.inventoryMovements).values({ workspaceId: WORKSPACE_ID, kind: p.status === 'descartada' ? 'descarte' : 'transferencia', spoolId: id, qty: 0, note: t('inventory.locationNote', { location: patch.location ?? p.location ?? '—' }), createdBy: u.id });
    if (p.status === 'descartada') await db.insert(s.inventoryMovements).values({ workspaceId: WORKSPACE_ID, kind: 'descarte', spoolId: id, qty: -sp.remainingG, note: t('inventory.discarded'), createdBy: u.id });
    await audit('spool', id, 'editar', p, u.id);
  }, ['/inventario', `/inventario/bobinas/${id}`]);
}
export async function saveItemAction(i: { id?: string; category: string; sku?: string; name: string; unit: string; stock: number; minStock: number; unitCost: number; supplierText?: string; location?: string }) {
  const t = await getT();
  return safe(async () => {
    const u = await requirePerm('inventario', i.id ? 'E' : 'C'); const db = await getDb(); if (!i.name.trim()) throw new Error(t('inventory.theItemNeedsAName'));
    checkNum(i.minStock); checkNum(i.unitCost); if (!i.id) checkNum(i.stock);
    const v = { category: i.category, sku: i.sku || null, name: i.name, unit: i.unit, minStock: i.minStock, unitCost: Math.round(i.unitCost), supplierText: i.supplierText || null, location: i.location || null, updatedAt: new Date() };
    if (i.id) { await db.update(s.inventoryItems).set(v).where(eq(s.inventoryItems.id, i.id)); return i.id; }
    const [r] = await db.insert(s.inventoryItems).values({ workspaceId: WORKSPACE_ID, stock: i.stock, createdBy: u.id, ...v }).returning({ id: s.inventoryItems.id }); return r.id;
  }, ['/inventario']);
}
export async function moveItemAction(i: { itemId: string; qty: number; kind: 'entrada' | 'consumo' | 'ajuste' | 'descarte'; unitCost?: number; note?: string }) { return safe(async () => { const u = await requirePerm('inventario', 'E'); return moveItem({ ...i, userId: u.id }); }, ['/inventario']); }
export async function findSpoolByCodeAction(code: string) {
  const t = await getT();
  return safe(async () => { await requirePerm('inventario', 'V'); const db = await getDb(); const c = code.trim().replace(/^MF:/i, '').toUpperCase(); const [sp] = await db.select().from(s.spools).where(eq(s.spools.code, c)); if (!sp) throw new Error(t('inventory.spoolDoesNotExist', { code: c})); return sp.id; });
}

import { applyBulkMaterials, planBulkMaterials, type BulkCommon, type BulkRow } from '@/lib/services/inventory';
const bulkCheck = (c: BulkCommon, rows: BulkRow[], t: Awaited<ReturnType<typeof getT>>) => {
  if (!c.type?.trim()) throw new Error(t('inventory.enterTheTypeAndColor'));
  if (!(c.costPerKg >= 0) || !(c.netG > 0) || !(c.tareG >= 0) || !(c.density > 0)) throw new Error(t('inventory.bulkBadNumbers'));
  if (!rows.some((r) => r.colorName.trim())) throw new Error(t('inventory.bulkNoColors'));
  if (rows.length > 100) throw new Error(t('inventory.bulkTooMany'));
};
/** Vista previa del alta masiva: no escribe. */
export async function previewBulkAction(c: BulkCommon, rows: BulkRow[]) {
  const t = await getT();
  return safe(async () => { await requirePerm('inventario', 'C'); bulkCheck(c, rows, t); return planBulkMaterials(c, rows); });
}
export async function applyBulkAction(c: BulkCommon, rows: BulkRow[]) {
  const t = await getT();
  return safe(async () => { const u = await requirePerm('inventario', 'C'); bulkCheck(c, rows, t); return applyBulkMaterials(c, rows, u.id); }, ['/inventario']);
}

/** Cambia costo por kg y/o stock mínimo de todos los colores de una marca + línea. */
export async function bulkUpdateLineAction(line: { manufacturer: string | null; line: string | null }, patch: { costPerKg?: number; stockMinG?: number }) {
  return safe(async () => { const u = await requirePerm('inventario', 'E'); return bulkUpdateLine(line, patch, u.id); }, ['/inventario']);
}

/** Edita una línea de filamento: costo y stock mínimo para todos sus colores y el perfil de laminado por defecto de la línea. */
export async function updateLineAction(id: string, patch: { costPerKg?: number | null; stockMinG?: number | null; filamentProfileId?: string | null }) {
  return safe(async () => { const u = await requirePerm('inventario', 'E'); const { updateLine } = await import('@/lib/services/lines'); return updateLine(id, patch, u.id); }, ['/inventario']);
}
