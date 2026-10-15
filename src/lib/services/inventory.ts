import { and, eq, inArray, isNull, ne, sql, desc } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { audit, notify } from '../audit';
import { getT } from '@/i18n/server';

type Db = Awaited<ReturnType<typeof getDb>>;

export const TARE_DEFAULT_G = 200;

/** Costo por kg del material: promedio ponderado por peso restante de las bobinas vivas (cae al costo del catálogo). */
export async function materialCostPerKg(materialId: string, db?: Db): Promise<number> {
  db = db ?? (await getDb());
  const [m] = await db.select().from(s.materials).where(eq(s.materials.id, materialId));
  if (!m) return 0;
  const sp = await db.select().from(s.spools).where(and(eq(s.spools.materialId, materialId), isNull(s.spools.deletedAt), inArray(s.spools.status, ['nueva', 'abierta', 'en_uso'])));
  let w = 0, acc = 0;
  for (const x of sp) { const c = x.unitCost ?? m.costPerKg; const g = Math.max(x.remainingG, 1); w += g; acc += c * g; }
  return w > 0 ? Math.round(acc / w) : m.costPerKg;
}

export interface MaterialStock { materialId: string; physicalG: number; reservedG: number; availableG: number; minG: number; low: boolean; spools: number }

/** Stock por material: físico (suma de bobinas vivas), reservado (trabajos en cola/imprimiendo) y disponible. */
export async function materialStock(db?: Db): Promise<MaterialStock[]> {
  db = db ?? (await getDb());
  const mats = await db.select().from(s.materials).where(isNull(s.materials.deletedAt));
  const sp = await db.select().from(s.spools).where(and(isNull(s.spools.deletedAt), inArray(s.spools.status, ['nueva', 'abierta', 'en_uso'])));
  const jobs = await db.select({ materialId: s.printJobs.materialId, estG: s.printJobs.estG }).from(s.printJobs)
    .where(and(inArray(s.printJobs.status, ['en_cola', 'imprimiendo', 'pausado']), isNull(s.printJobs.deletedAt)));
  return mats.map((m) => {
    const physical = sp.filter((x) => x.materialId === m.id).reduce((a, x) => a + x.remainingG, 0);
    const reserved = jobs.filter((j) => j.materialId === m.id).reduce((a, j) => a + j.estG, 0);
    return { materialId: m.id, physicalG: physical, reservedG: reserved, availableG: physical - reserved, minG: m.stockMinG, low: physical - reserved < m.stockMinG, spools: sp.filter((x) => x.materialId === m.id).length };
  });
}

export async function createSpool(o: { materialId: string; initialG?: number; tareG?: number; lot?: string; unitCost?: number; location?: string; boughtAt?: string; supplierText?: string; userId?: string | null }, db?: Db) {
  const t = await getT();
  db = db ?? (await getDb());
  const [m] = await db.select().from(s.materials).where(eq(s.materials.id, o.materialId));
  if (!m) throw new Error(t('inventory.materialNotFound'));
  const code = await nextSpoolCode(db);
  const initial = o.initialG ?? 1000;
  const [sp] = await db.insert(s.spools).values({
    workspaceId: WORKSPACE_ID, materialId: o.materialId, code, lot: o.lot ?? null, initialG: initial, tareG: o.tareG ?? TARE_DEFAULT_G, remainingG: initial,
    unitCost: o.unitCost ?? m.costPerKg, location: o.location ?? null, boughtAt: o.boughtAt ?? new Date().toISOString().slice(0, 10), status: 'nueva', createdBy: o.userId ?? null,
  }).returning();
  await db.insert(s.inventoryMovements).values({ workspaceId: WORKSPACE_ID, kind: 'entrada', spoolId: sp.id, qty: initial, unitCost: o.unitCost ?? m.costPerKg, note: o.supplierText ? t('inventory.purchase', { supplier: o.supplierText }) : t('inventory.purchase2'), createdBy: o.userId ?? null });
  await audit('spool', sp.id, 'entrada', { initialG: initial, unitCost: o.unitCost ?? m.costPerKg }, o.userId);
  return sp;
}

async function nextSpoolCode(db: Db) {
  const res = await db.execute(sql`select count(*)::int as n from spools where workspace_id = ${WORKSPACE_ID}`);
  const rows = (res as any).rows ?? res;
  return `B-${String(Number(rows[0].n) + 1).padStart(4, '0')}`;
}

/** Ajuste por pesaje: el usuario pesa la bobina con su carrete, el sistema resta la tara. */
export async function weighSpool(spoolId: string, grossG: number, userId?: string | null) {
  const t = await getT();
  const db = await getDb();
  const [sp] = await db.select().from(s.spools).where(eq(s.spools.id, spoolId));
  if (!sp) throw new Error(t('common.spoolNotFound'));
  const net = Math.max(0, grossG - sp.tareG);
  const delta = net - sp.remainingG;
  await db.update(s.spools).set({ remainingG: net, status: net <= 0 ? 'agotada' : sp.status === 'nueva' ? 'abierta' : sp.status, updatedAt: new Date() }).where(eq(s.spools.id, spoolId));
  await db.insert(s.inventoryMovements).values({ workspaceId: WORKSPACE_ID, kind: 'ajuste', spoolId, qty: delta, note: t('inventory.weighingGrossGTareG', { grossG, tare: sp.tareG, net }), createdBy: userId ?? null });
  await audit('spool', spoolId, 'pesaje', { before: sp.remainingG, after: net }, userId);
  await checkLowStock(sp.materialId);
  return { before: sp.remainingG, after: net, delta };
}

export async function consumeFromSpool(o: { spoolId: string; grams: number; kind: 'consumo' | 'falla'; jobId?: string; note?: string; userId?: string | null }, db?: Db) {
  db = db ?? (await getDb());
  const [sp] = await db.select().from(s.spools).where(eq(s.spools.id, o.spoolId));
  if (!sp) return null;
  const left = Math.max(0, sp.remainingG - o.grams);
  await db.update(s.spools).set({ remainingG: left, status: left <= 0 ? 'agotada' : sp.status === 'nueva' ? 'abierta' : sp.status, updatedAt: new Date() }).where(eq(s.spools.id, o.spoolId));
  await db.insert(s.inventoryMovements).values({ workspaceId: WORKSPACE_ID, kind: o.kind, spoolId: o.spoolId, qty: -Math.min(o.grams, sp.remainingG), unitCost: sp.unitCost, jobId: o.jobId ?? null, note: o.note ?? null, createdBy: o.userId ?? null });
  await checkLowStock(sp.materialId);
  return { before: sp.remainingG, after: left, depleted: left <= 0 };
}

/** Alerta de stock bajo (por peso total del material/color). */
export async function checkLowStock(materialId: string) {
  const t = await getT();
  const all = await materialStock();
  const st = all.find((x) => x.materialId === materialId);
  if (!st || !st.low) return;
  const db = await getDb();
  const [m] = await db.select().from(s.materials).where(eq(s.materials.id, materialId));
  const title = t('inventory.lowStock', { type: m.type, color: m.colorName });
  const [exists] = await db.select({ id: s.notifications.id }).from(s.notifications).where(and(eq(s.notifications.kind, 'stock_bajo'), eq(s.notifications.title, title), eq(s.notifications.read, false))).limit(1);
  if (!exists) await notify('stock_bajo', title, t('inventory.gAvailableMinimumG', { grams: Math.round(st.availableG), min: st.minG }), '/inventario');
}

/** Lista de compras sugerida: lo que falta para llegar al doble del mínimo. */
export async function shoppingList() {
  const t = await getT(); const db = await getDb();
  const st = await materialStock(db);
  const mats = await db.select().from(s.materials).where(isNull(s.materials.deletedAt));
  const items = await db.select().from(s.inventoryItems).where(isNull(s.inventoryItems.deletedAt));
  const out: Array<{ kind: string; name: string; missing: string; supplier: string | null }> = [];
  for (const x of st.filter((y) => y.low)) {
    const m = mats.find((q) => q.id === x.materialId)!;
    const target = x.minG * 2; const miss = Math.max(0, target - x.availableG);
    out.push({ kind: t('inventory.kindMaterial'), name: `${m.manufacturer ?? ''} ${m.type} ${m.colorName}`.trim(), missing: t('inventory.missingSpools', { count: Math.ceil(miss / 1000), grams: Math.round(miss) }), supplier: m.supplierText });
  }
  for (const it of items.filter((i) => i.stock <= i.minStock)) out.push({ kind: it.category, name: it.name, missing: `${Math.max(1, Math.ceil(it.minStock * 2 - it.stock))} ${it.unit}`, supplier: it.supplierText });
  return out;
}

export async function moveItem(o: { itemId: string; qty: number; kind: 'entrada' | 'consumo' | 'ajuste' | 'descarte'; unitCost?: number; note?: string; userId?: string | null }) {
  const t = await getT();
  const db = await getDb();
  const [it] = await db.select().from(s.inventoryItems).where(eq(s.inventoryItems.id, o.itemId));
  if (!it) throw new Error(t('inventory.itemNotFound'));
  const delta = o.kind === 'entrada' ? Math.abs(o.qty) : o.kind === 'ajuste' ? o.qty : -Math.abs(o.qty);
  const stock = it.stock + delta;
  let unitCost = it.unitCost;
  if (o.kind === 'entrada' && o.unitCost != null && stock > 0) unitCost = Math.round((it.stock * it.unitCost + Math.abs(o.qty) * o.unitCost) / stock);
  await db.update(s.inventoryItems).set({ stock, unitCost, updatedAt: new Date() }).where(eq(s.inventoryItems.id, o.itemId));
  await db.insert(s.inventoryMovements).values({ workspaceId: WORKSPACE_ID, kind: o.kind, itemId: o.itemId, qty: delta, unitCost: o.unitCost ?? it.unitCost, note: o.note ?? null, createdBy: o.userId ?? null });
  if (stock <= it.minStock) await notify('stock_bajo', t('inventory.lowStock2', { name: it.name }), t('inventory.leftMinimum', { stock, unit: it.unit, min: it.minStock }), '/inventario?tab=otros');
  return stock;
}

/* ── Alta masiva de filamentos (N4) ─────────────────────────────────────── */
export interface BulkCommon { manufacturer: string; line: string; type: string; diameter: number; density: number; costPerKg: number; netG: number; tareG: number; stockMinG?: number; supplierText?: string }
export interface BulkRow { colorName: string; hex: string; spools: number; lot?: string; location?: string }
const key = (m: string | null | undefined, l: string | null | undefined, ty: string, c: string) => [m, l, ty, c].map((x) => String(x ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()).join('|');

/** Vista previa: qué se crearía, qué ya existe (duplicado por marca + línea + tipo + color) y cuántas bobinas se ingresarían. No escribe nada. */
export async function planBulkMaterials(common: BulkCommon, rows: BulkRow[], db?: Db) {
  db ??= await getDb();
  const existing = await db.select().from(s.materials).where(isNull(s.materials.deletedAt));
  const have = new Map(existing.map((m) => [key(m.manufacturer, m.line, m.type, m.colorName), m]));
  const seen = new Set<string>(); const items = rows.filter((r) => r.colorName.trim()).map((r) => {
    const k = key(common.manufacturer, common.line, common.type, r.colorName); const dupInBatch = seen.has(k); seen.add(k);
    const ex = have.get(k);
    return { ...r, status: dupInBatch ? ('repeat' as const) : ex ? ('exists' as const) : ('new' as const), existingId: ex?.id ?? null };
  });
  return { items, newMaterials: items.filter((i) => i.status === 'new').length, spools: items.filter((i) => i.status !== 'repeat').reduce((a, i) => a + Math.max(0, Math.min(50, i.spools)), 0) };
}

/** Crea los materiales nuevos y registra la entrada de compra (bobinas con código) también para los que ya existían. */
export async function applyBulkMaterials(common: BulkCommon, rows: BulkRow[], userId?: string | null) {
  const t = await getT(); const db = await getDb();
  if (!common.type.trim()) throw new Error(t('inventory.enterTheTypeAndColor'));
  const plan = await planBulkMaterials(common, rows, db); const created: string[] = []; const spoolIds: string[] = [];
  for (const it of plan.items) {
    if (it.status === 'repeat') continue;
    let id = it.existingId;
    if (!id) {
      const [m] = await db.insert(s.materials).values({ workspaceId: WORKSPACE_ID, createdBy: userId ?? null, tech: 'fdm', manufacturer: common.manufacturer || null, line: common.line || null, type: common.type, colorName: it.colorName.trim(), hex: it.hex || '#888888', diameter: common.diameter, density: common.density, costPerKg: Math.round(common.costPerKg), stockMinG: common.stockMinG ?? 1000, supplierText: common.supplierText || null }).returning({ id: s.materials.id });
      id = m.id; created.push(id); await audit('material', id, 'crear', { bulk: true }, userId);
    }
    for (let k = 0; k < Math.max(0, Math.min(50, it.spools)); k++) spoolIds.push((await createSpool({ materialId: id, initialG: common.netG, tareG: common.tareG, lot: it.lot, location: it.location, unitCost: Math.round(common.costPerKg), supplierText: common.supplierText, userId }, db)).id);
  }
  return { created: created.length, existing: plan.items.filter((i) => i.status === 'exists').length, spools: spoolIds.length, spoolIds };
}
