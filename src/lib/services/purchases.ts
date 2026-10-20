import { and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { audit } from '../audit';
import { getSettings } from '../settings';
import { getT } from '@/i18n/server';
import { LocalizedError } from '@/i18n/errors';
import { ymd } from '../format';
import { nextSpoolCode, TARE_DEFAULT_G } from './inventory';

type Db = Awaited<ReturnType<typeof getDb>>;

export interface PurchaseLineInput {
  kind: 'filamento' | 'item';
  materialId?: string | null; itemId?: string | null;
  /** carretes/botellas (filamento) o unidades (ítem) */
  qty: number;
  /** gramos netos de cada carrete (solo filamento) */
  netG?: number; tareG?: number;
  /** pagado por carrete/unidad, con IVA */
  unitPrice: number;
  lot?: string; location?: string;
}
export interface PurchaseInput { supplierId?: string | null; supplierText?: string; boughtAt?: string; docNumber?: string; shipping?: number; discount?: number; notes?: string; lines: PurchaseLineInput[] }

export interface PlannedLine extends PurchaseLineInput { label: string; gross: number; /** parte del envío menos descuento que le toca (con IVA) */ extra: number; unitCost: number; costPerKg: number | null }
export interface PurchasePlan { lines: PlannedLine[]; subtotal: number; shipping: number; discount: number; total: number; recoversVat: boolean; vatPct: number; /** total sin IVA si el proveedor permite recuperarlo, si no igual al total */ netTotal: number; supplierText: string | null; spools: number }

const MAX_LINES = 100, MAX_SPOOLS_PER_LINE = 50;
const int = (n: unknown) => Math.round(Number(n) || 0);

/** Costo real de cada línea: lo pagado más su parte proporcional del envío, menos la del descuento, y sin IVA cuando el proveedor permite recuperarlo. No escribe nada. */
export async function planPurchase(input: PurchaseInput, db?: Db): Promise<PurchasePlan> {
  const t = await getT(); db ??= await getDb();
  const lines = input.lines ?? [];
  if (!lines.length) throw new LocalizedError('buy.errNoLines');
  if (lines.length > MAX_LINES) throw new LocalizedError('buy.errTooManyLines');
  const shipping = int(input.shipping), discount = int(input.discount);
  if (shipping < 0 || discount < 0) throw new LocalizedError('buy.errNegative');
  let sup: { name: string; recoversVat: boolean } | undefined;
  if (input.supplierId) [sup] = await db.select({ name: s.suppliers.name, recoversVat: s.suppliers.recoversVat }).from(s.suppliers).where(eq(s.suppliers.id, input.supplierId));
  const vatPct = (await getSettings()).rates.taxPct; const recoversVat = !!sup?.recoversVat;
  const f = recoversVat ? 1 / (1 + vatPct / 100) : 1;

  const matIds = [...new Set(lines.map((l) => l.materialId).filter((x): x is string => !!x))];
  const itemIds = [...new Set(lines.map((l) => l.itemId).filter((x): x is string => !!x))];
  const mats = matIds.length ? await db.select().from(s.materials).where(and(inArray(s.materials.id, matIds), isNull(s.materials.deletedAt))) : [];
  const items = itemIds.length ? await db.select().from(s.inventoryItems).where(and(inArray(s.inventoryItems.id, itemIds), isNull(s.inventoryItems.deletedAt))) : [];

  const base = lines.map((l) => {
    const qty = Number(l.qty); const unitPrice = int(l.unitPrice);
    if (!(qty > 0) || unitPrice < 0) throw new LocalizedError('buy.errLine');
    if (l.kind === 'filamento') {
      const m = mats.find((x) => x.id === l.materialId);
      if (!m || m.generic) throw new Error(t('inventory.materialNotFound'));
      if (!Number.isInteger(qty) || qty > MAX_SPOOLS_PER_LINE) throw new LocalizedError('buy.errSpoolQty', { max: MAX_SPOOLS_PER_LINE });
      const netG = Number(l.netG ?? m.packG ?? 1000); if (!(netG > 0)) throw new LocalizedError('buy.errNet');
      return { ...l, qty, unitPrice, netG, tareG: Math.max(0, Number(l.tareG ?? (m.tech === 'resina' ? 0 : TARE_DEFAULT_G)) || 0), label: `${m.manufacturer ? m.manufacturer + ' ' : ''}${m.type} ${m.colorName}`, gross: qty * unitPrice };
    }
    const it = items.find((x) => x.id === l.itemId);
    if (!it) throw new Error(t('inventory.itemNotFound'));
    return { ...l, qty, unitPrice, label: it.name, gross: qty * unitPrice };
  });
  const subtotal = base.reduce((a, l) => a + l.gross, 0);
  const extraTotal = shipping - discount;
  if (discount > subtotal + shipping) throw new LocalizedError('buy.errDiscount');
  const planned: PlannedLine[] = base.map((l) => {
    const extra = subtotal > 0 ? (extraTotal * l.gross) / subtotal : extraTotal / base.length;
    const unitCost = Math.round(((l.gross + extra) / l.qty) * f);
    return { ...l, extra: Math.round(extra), unitCost, costPerKg: l.kind === 'filamento' ? Math.round(unitCost / ((l.netG ?? 1000) / 1000)) : null };
  });
  const total = subtotal + extraTotal;
  return { lines: planned, subtotal, shipping, discount, total, recoversVat, vatPct, netTotal: Math.round(total * f), supplierText: input.supplierText?.trim() || sup?.name || null, spools: planned.filter((l) => l.kind === 'filamento').reduce((a, l) => a + l.qty, 0) };
}

/** Número correlativo propio de las compras (C-2026-0001); no depende de la numeración configurable del taller. */
async function nextPurchaseNumber(tx: any) {
  const year = Number(ymd().slice(0, 4));
  const res = await tx.execute(sql`insert into sequences (workspace_id, key, year, value) values (${WORKSPACE_ID}, 'purchase', ${year}, 1) on conflict (workspace_id, key, year) do update set value = sequences.value + 1 returning value`);
  const n = Number(((res as any).rows ?? res)[0].value);
  return `C-${year}-${String(n).padStart(4, '0')}`;
}

/** Recibe la compra: guarda el documento, crea un carrete por cada unidad de filamento y suma los ítems. Todo o nada. */
export async function receivePurchase(input: PurchaseInput, userId?: string | null) {
  const t = await getT(); const db = await getDb();
  const plan = await planPurchase(input, db);
  const boughtAt = input.boughtAt || ymd();
  const spoolIds: string[] = []; let purchaseId = ''; let number = '';
  // en PGlite una consulta fuera de la transacción queda esperando: todo lo que lee otro servicio se resolvió antes
  await db.transaction(async (tx) => {
    number = await nextPurchaseNumber(tx);
    const [p] = await tx.insert(s.purchases).values({ workspaceId: WORKSPACE_ID, createdBy: userId ?? null, number, supplierId: input.supplierId || null, supplierText: plan.supplierText, boughtAt, docNumber: input.docNumber?.trim() || null, shipping: plan.shipping, discount: plan.discount, total: plan.total, recoversVat: plan.recoversVat, vatPct: plan.vatPct, notes: input.notes?.trim() || null }).returning({ id: s.purchases.id });
    purchaseId = p.id;
    const note = plan.supplierText ? t('buy.movementNoteSupplier', { number, supplier: plan.supplierText }) : t('buy.movementNote', { number });
    for (const l of plan.lines) {
      const [pl] = await tx.insert(s.purchaseLines).values({ workspaceId: WORKSPACE_ID, createdBy: userId ?? null, purchaseId, kind: l.kind, materialId: l.kind === 'filamento' ? l.materialId! : null, itemId: l.kind === 'item' ? l.itemId! : null, qty: l.qty, netG: l.kind === 'filamento' ? l.netG! : null, tareG: l.kind === 'filamento' ? l.tareG! : null, unitPrice: l.unitPrice, unitCost: l.unitCost, costPerKg: l.costPerKg, lot: l.lot?.trim() || null, location: l.location?.trim() || null }).returning({ id: s.purchaseLines.id });
      if (l.kind === 'filamento') {
        for (let k = 0; k < l.qty; k++) {
          const code = await nextSpoolCode(tx);
          const [sp] = await tx.insert(s.spools).values({ workspaceId: WORKSPACE_ID, createdBy: userId ?? null, materialId: l.materialId!, code, lot: l.lot?.trim() || null, initialG: l.netG!, tareG: l.tareG!, remainingG: l.netG!, unitCost: l.costPerKg, location: l.location?.trim() || null, boughtAt, status: 'nueva', supplierId: input.supplierId || null, purchaseLineId: pl.id }).returning({ id: s.spools.id });
          spoolIds.push(sp.id);
          await tx.insert(s.inventoryMovements).values({ workspaceId: WORKSPACE_ID, createdBy: userId ?? null, kind: 'entrada', spoolId: sp.id, qty: l.netG!, unitCost: l.costPerKg, purchaseId, note });
        }
        // el precio de referencia sigue a la última compra; el peso habitual se aprende de la primera
        await tx.update(s.materials).set({ costPerKg: l.costPerKg!, packG: sql`coalesce(${s.materials.packG}, ${Math.round(l.netG!)})`, updatedAt: new Date() }).where(eq(s.materials.id, l.materialId!));
      } else {
        const [it] = await tx.select().from(s.inventoryItems).where(eq(s.inventoryItems.id, l.itemId!));
        const stock = it.stock + l.qty;
        const unitCost = stock > 0 ? Math.round((Math.max(0, it.stock) * it.unitCost + l.qty * l.unitCost) / stock) : l.unitCost;
        await tx.update(s.inventoryItems).set({ stock: sql`${s.inventoryItems.stock} + ${l.qty}`, unitCost, updatedAt: new Date() }).where(eq(s.inventoryItems.id, l.itemId!));
        await tx.insert(s.inventoryMovements).values({ workspaceId: WORKSPACE_ID, createdBy: userId ?? null, kind: 'entrada', itemId: l.itemId!, qty: l.qty, unitCost: l.unitCost, purchaseId, note });
      }
    }
  });
  await audit('purchase', purchaseId, 'crear', { number, total: plan.total, lines: plan.lines.length, spools: spoolIds.length }, userId);
  return { id: purchaseId, number, total: plan.total, spools: spoolIds.length, spoolIds };
}

/** Anula una compra equivocada si nada de lo que trajo se usó: da de baja sus carretes y devuelve los ítems. */
export async function voidPurchase(id: string, userId?: string | null) {
  const t = await getT(); const db = await getDb();
  const [p] = await db.select().from(s.purchases).where(eq(s.purchases.id, id));
  if (!p) throw new LocalizedError('buy.errNotFound');
  if (p.status === 'anulada') throw new LocalizedError('buy.errAlreadyVoid');
  const lines = await db.select().from(s.purchaseLines).where(eq(s.purchaseLines.purchaseId, id));
  const spools = lines.length ? await db.select().from(s.spools).where(and(inArray(s.spools.purchaseLineId, lines.map((l) => l.id)), isNull(s.spools.deletedAt))) : [];
  if (spools.some((x) => x.status !== 'nueva' || x.remainingG !== x.initialG)) throw new LocalizedError('buy.errUsed');
  for (const l of lines.filter((x) => x.kind === 'item')) {
    const [it] = await db.select().from(s.inventoryItems).where(eq(s.inventoryItems.id, l.itemId!));
    if (it && it.stock < l.qty) throw new LocalizedError('buy.errUsed');
  }
  const note = t('buy.voidNote', { number: p.number });
  await db.transaction(async (tx) => {
    const [claimed] = await tx.update(s.purchases).set({ status: 'anulada', updatedAt: new Date() }).where(and(eq(s.purchases.id, id), eq(s.purchases.status, 'recibida'))).returning({ id: s.purchases.id });
    if (!claimed) throw new LocalizedError('buy.errAlreadyVoid');
    for (const sp of spools) {
      await tx.update(s.spools).set({ deletedAt: new Date(), status: 'descartada', remainingG: 0, updatedAt: new Date() }).where(eq(s.spools.id, sp.id));
      await tx.insert(s.inventoryMovements).values({ workspaceId: WORKSPACE_ID, createdBy: userId ?? null, kind: 'ajuste', spoolId: sp.id, qty: -sp.initialG, purchaseId: id, note });
    }
    for (const l of lines.filter((x) => x.kind === 'item')) {
      await tx.update(s.inventoryItems).set({ stock: sql`${s.inventoryItems.stock} - ${l.qty}`, updatedAt: new Date() }).where(eq(s.inventoryItems.id, l.itemId!));
      await tx.insert(s.inventoryMovements).values({ workspaceId: WORKSPACE_ID, createdBy: userId ?? null, kind: 'ajuste', itemId: l.itemId!, qty: -l.qty, purchaseId: id, note });
    }
  });
  await audit('purchase', id, 'anular', { number: p.number }, userId);
}

export async function listPurchases(o: { from?: string; to?: string; q?: string; limit?: number } = {}, db?: Db) {
  db ??= await getDb();
  const conds = [isNull(s.purchases.deletedAt)];
  if (o.from) conds.push(gte(s.purchases.boughtAt, o.from));
  if (o.to) conds.push(lte(s.purchases.boughtAt, o.to));
  const rows = await db.select().from(s.purchases).where(and(...conds)).orderBy(desc(s.purchases.boughtAt), desc(s.purchases.createdAt)).limit(o.limit ?? 200);
  const needle = o.q?.trim().toLowerCase();
  const list = needle ? rows.filter((r) => [r.number, r.supplierText, r.docNumber].some((v) => v?.toLowerCase().includes(needle))) : rows;
  const lines = list.length ? await db.select().from(s.purchaseLines).where(inArray(s.purchaseLines.purchaseId, list.map((r) => r.id))) : [];
  return list.map((p) => { const ls = lines.filter((l) => l.purchaseId === p.id); return { ...p, lineCount: ls.length, spools: ls.filter((l) => l.kind === 'filamento').reduce((a, l) => a + l.qty, 0), kg: ls.filter((l) => l.kind === 'filamento').reduce((a, l) => a + (l.qty * (l.netG ?? 0)) / 1000, 0) }; });
}

export async function getPurchase(id: string, db?: Db) {
  db ??= await getDb();
  const [p] = await db.select().from(s.purchases).where(eq(s.purchases.id, id)); if (!p) return null;
  const lines = await db.select().from(s.purchaseLines).where(eq(s.purchaseLines.purchaseId, id));
  const mats = lines.some((l) => l.materialId) ? await db.select().from(s.materials).where(inArray(s.materials.id, lines.map((l) => l.materialId).filter((x): x is string => !!x))) : [];
  const items = lines.some((l) => l.itemId) ? await db.select().from(s.inventoryItems).where(inArray(s.inventoryItems.id, lines.map((l) => l.itemId).filter((x): x is string => !!x))) : [];
  const spools = lines.length ? await db.select().from(s.spools).where(inArray(s.spools.purchaseLineId, lines.map((l) => l.id))) : [];
  return {
    purchase: p,
    lines: lines.map((l) => { const m = mats.find((x) => x.id === l.materialId); const it = items.find((x) => x.id === l.itemId); return { ...l, label: m ? `${m.manufacturer ? m.manufacturer + ' ' : ''}${m.type} ${m.colorName}` : it?.name ?? '—', hex: m?.hex ?? null, type: m?.type ?? null, spools: spools.filter((x) => x.purchaseLineId === l.id).sort((a, b) => a.code.localeCompare(b.code)) }; }),
  };
}
