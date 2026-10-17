import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { audit, notify } from '../audit';
import { nextNumber } from '../settings';
import { addPayment, recomputePaid } from './orders';
import { ymd } from '../format';
import { canSellBelowCost, canSetFinalPrice, type PermUser } from '../perm';
import { LocalizedError } from '@/i18n/errors';
import { getT } from '@/i18n/server';

type User = PermUser & { id: string };

const slug = (tt: string) => tt.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 8) || 'PRD';

export interface ProductInput {
  id?: string; name: string; category?: string | null; description?: string | null; mode: 'simple' | 'variantes'; status?: string; modelFileId?: string | null;
  tags?: string[]; attributes?: Array<{ name: string; values: string[] }>; price?: number; materialId?: string | null; weightG?: number; printH?: number; minStock?: number; location?: string | null;
}

function cartesian(attrs: Array<{ name: string; values: string[] }>): Array<Record<string, string>> {
  return attrs.filter((a) => a.values.length).reduce<Array<Record<string, string>>>((acc, a) => acc.flatMap((c) => a.values.map((v) => ({ ...c, [a.name]: v }))), [{}]);
}

/** Crea o actualiza un producto. En modo "variantes" genera las combinaciones de atributos (las ya existentes se conservan). */
export async function saveProduct(i: ProductInput, user: User): Promise<string> {
  const db = await getDb();
  const attributes = i.mode === 'variantes' ? (i.attributes ?? []).filter((a) => a.name && a.values.length) : [];
  const vals = { name: i.name, category: i.category ?? null, description: i.description ?? null, mode: i.mode, status: i.status ?? 'activo', modelFileId: i.modelFileId ?? null, tags: i.tags ?? [], attributes, updatedAt: new Date() };
  // todo o nada: si falla una variante no queda un producto a medias. Dentro solo se usa `tx` (PGlite se bloquea si se consulta `db` a la vez).
  const id = await db.transaction(async (tx) => {
    let id = i.id;
    if (id) await tx.update(s.products).set(vals).where(eq(s.products.id, id));
    else { const [p] = await tx.insert(s.products).values({ workspaceId: WORKSPACE_ID, createdBy: user.id, ...vals }).returning({ id: s.products.id }); id = p.id; }
    const existing = await tx.select().from(s.productVariants).where(and(eq(s.productVariants.productId, id), isNull(s.productVariants.deletedAt)));
    const combos = i.mode === 'variantes' ? cartesian(attributes) : [{}];
    const key = (a: Record<string, string>) => JSON.stringify(Object.entries(a).sort());
    const prefix = slug(i.name);
    for (const c of combos) {
      const old = existing.find((e) => key(e.attrs ?? {}) === key(c));
      // un valor que se quitó y se vuelve a agregar reactiva su variante (conserva stock y movimientos)
      if (old) { if (!old.active) await tx.update(s.productVariants).set({ active: true, updatedAt: new Date() }).where(eq(s.productVariants.id, old.id)); continue; }
      const suffix = Object.values(c).map((v) => slug(v).slice(0, 3)).join('-');
      const base = `${prefix}${suffix ? '-' + suffix : ''}`;
      let sku = base;
      // slug() corta a 8 letras: "Maceta Grande" y "Maceta Gato" chocan; se prueba -1, -2… hasta encontrar uno libre
      for (let k = 1; (await tx.select({ id: s.productVariants.id }).from(s.productVariants).where(and(eq(s.productVariants.workspaceId, WORKSPACE_ID), eq(s.productVariants.sku, sku))).limit(1)).length; k++) sku = `${base}-${k}`;
      await tx.insert(s.productVariants).values({
        workspaceId: WORKSPACE_ID, productId: id, sku, attrs: c, price: i.price ?? 0, materialId: i.materialId ?? null, weightG: i.weightG ?? 0, printH: i.printH ?? 0,
        minStock: i.minStock ?? 0, location: i.location ?? null, createdBy: user.id,
      });
    }
    // variantes que ya no existen en la grilla se desactivan (nunca se borran si tienen movimientos)
    for (const e of existing) if (e.active && !combos.some((c) => key(c) === key(e.attrs ?? {}))) await tx.update(s.productVariants).set({ active: false }).where(eq(s.productVariants.id, e.id));
    return id;
  });
  await audit('product', id, i.id ? 'editar' : 'crear', { name: i.name, mode: i.mode }, user.id);
  return id;
}

export async function adjustStock(o: { variantId: string; kind: 'ajuste' | 'merma' | 'muestra' | 'uso_interno' | 'devolucion'; qty: number; reason?: string; returnToStock?: boolean }, user: User) {
  const t = await getT();
  const db = await getDb();
  const [v] = await db.select().from(s.productVariants).where(eq(s.productVariants.id, o.variantId));
  if (!v) throw new Error(t('catalog.variantNotFound'));
  let delta = o.qty;
  if (o.kind === 'merma' || o.kind === 'muestra' || o.kind === 'uso_interno') delta = -Math.abs(o.qty);
  if (o.kind === 'devolucion') delta = o.returnToStock === false ? 0 : Math.abs(o.qty);
  if (o.kind === 'ajuste') delta = o.qty - v.stock; // conteo físico: qty = cantidad contada
  if (!o.reason && ['ajuste', 'merma', 'devolucion'].includes(o.kind)) throw new Error(t('catalog.enterTheReason'));
  const stock = v.stock + delta;
  if (stock < 0) throw new Error(t('catalog.stockCannotGoNegative'));
  await db.update(s.productVariants).set({ stock, updatedAt: new Date() }).where(eq(s.productVariants.id, v.id));
  await db.insert(s.stockMovements).values({ workspaceId: WORKSPACE_ID, variantId: v.id, kind: o.kind === 'devolucion' && delta === 0 ? 'merma' : o.kind, qty: delta, unitCost: v.avgCost, reason: o.reason ?? null, createdBy: user.id });
  await audit('variant', v.id, 'stock', { kind: o.kind, delta, stock }, user.id);
  if (stock <= v.minStock && delta < 0) await notify('stock_bajo', t('catalog.lowProductStock', { sku: v.sku }), t('catalog.unitsLeftMinimum', { stock, min: v.minStock }), '/catalogo');
  return stock;
}

export interface QuickSaleInput {
  channelId?: string | null; customerId?: string | null; customerName?: string | null; date?: string;
  items: Array<{ variantId: string; qty: number; unitPrice?: number; description?: string }>;
  shipping?: number; commissionOverride?: number | null; paid?: boolean; method?: string; externalOrder?: string | null; status?: string; shipBy?: string | null; notes?: string | null;
}

/** Venta rápida (mostrador, feria o marketplace): descuenta stock y calcula el margen neto con la comisión del canal. */
export async function createSale(i: QuickSaleInput, user: User) {
  const t = await getT();
  const db = await getDb();
  // cantidades enteras ≥ 1, precios ≥ 0 y cada variante una sola vez (dos filas iguales descontarían de la misma foto del stock)
  if (i.items.some((it) => !Number.isInteger(it.qty) || it.qty < 1 || (it.unitPrice != null && !(it.unitPrice >= 0)))) throw new Error(t('catalog.invalidSaleQuantity'));
  if (new Set(i.items.map((it) => it.variantId)).size !== i.items.length) throw new Error(t('catalog.duplicateSaleItem'));
  const [ch] = i.channelId ? await db.select().from(s.salesChannels).where(eq(s.salesChannels.id, i.channelId)) : [];
  const vs = await db.select().from(s.productVariants).where(inArray(s.productVariants.id, i.items.map((x) => x.variantId)));
  const byId = new Map(vs.map((v) => [v.id, v]));
  let subtotal = 0, cost = 0; const shortages: string[] = [];
  const rows = i.items.map((it) => {
    const v = byId.get(it.variantId); if (!v) throw new Error(t('catalog.variantNotFound'));
    const list = (ch && v.priceByChannel?.[ch.id]) || v.price;
    it.qty = Math.max(1, Math.floor(it.qty || 1)); // una cantidad negativa sumaría stock
    // precio a mano: solo quien fija precios finales; bajo el costo, solo el Administrador (como en presupuestos y pedidos)
    const own = it.unitPrice != null && canSetFinalPrice(user);
    const unit = own ? Math.round(it.unitPrice!) : list;
    if (!(unit >= 0)) throw new LocalizedError('edit.invalid');
    if (own && unit < v.avgCost && !canSellBelowCost(user)) throw new Error(t('orders.theFinalPriceIsBelow'));
    subtotal += unit * it.qty; cost += v.avgCost * it.qty;
    if (v.stock - v.reserved < it.qty) shortages.push(t('catalog.shortageUnits', { sku: v.sku, n: it.qty - (v.stock - v.reserved) }));
    return { v, it, unit, list };
  });
  const commission = i.commissionOverride ?? (ch ? Math.round(subtotal * (ch.commissionPct / 100) + ch.commissionFixed) : 0);
  const shipping = i.shipping ?? ch?.avgShipping ?? 0;
  const number = await nextNumber('sale');
  const isMarket = ch?.kind === 'marketplace';
  // todo o nada: la venta, sus líneas y el stock. Dentro de la transacción solo se usa `tx` (PGlite se bloquea si se consulta `db` a la vez).
  const { sale, left } = await db.transaction(async (tx) => {
    const [sale] = await tx.insert(s.sales).values({
      workspaceId: WORKSPACE_ID, number, channelId: i.channelId ?? null, customerId: i.customerId ?? null, customerName: i.customerName ?? null,
      date: i.date ?? ymd(), subtotal, commission, shipping, total: subtotal, costTotal: cost, netMargin: subtotal - commission - shipping - cost,
      status: i.status ?? (isMarket ? 'por_despachar' : 'entregada'), externalOrder: i.externalOrder ?? null, shipBy: i.shipBy ?? null, notes: i.notes ?? null, createdBy: user.id,
    }).returning();
    const left: Array<{ v: (typeof rows)[number]['v']; stock: number }> = [];
    for (const { v, it, unit, list } of rows) {
      await tx.insert(s.saleItems).values({ workspaceId: WORKSPACE_ID, saleId: sale.id, variantId: v.id, description: it.description ?? null, qty: it.qty, listPrice: list, unitPrice: unit, frozenCost: v.avgCost });
      // sin piso en 0: el stock siempre es la suma de sus movimientos (si se vende de más queda negativo y la anulación lo devuelve exacto)
      const [u] = await tx.update(s.productVariants).set({ stock: sql`${s.productVariants.stock} - ${it.qty}`, updatedAt: new Date() }).where(eq(s.productVariants.id, v.id)).returning({ stock: s.productVariants.stock });
      await tx.insert(s.stockMovements).values({ workspaceId: WORKSPACE_ID, variantId: v.id, kind: 'venta', qty: -it.qty, unitCost: v.avgCost, saleId: sale.id, reason: t('catalog.sale', { number }), createdBy: user.id });
      left.push({ v, stock: u.stock });
    }
    return { sale, left };
  });
  for (const { v, stock } of left) if (stock <= v.minStock) await notify('stock_bajo', t('catalog.lowProductStock', { sku: v.sku }), t('catalog.unitsLeftMinimumSuggestionProduc', { stock, min: v.minStock }), '/catalogo');
  if (i.paid !== false && subtotal > 0) await addPayment({ saleId: sale.id, amount: subtotal, method: i.method ?? (isMarket ? 'marketplace' : 'efectivo'), note: t('catalog.salePayment') }, user);
  if (isMarket) await notify('marketplace', t('catalog.saleReadyToShip', { number }), `${ch!.name}${i.externalOrder ? ' · ' + i.externalOrder : ''}`, '/ventas');
  await audit('sale', sale.id, 'crear', { number, subtotal, commission, net: sale.netMargin, shortages }, user.id);
  return { id: sale.id, number, subtotal, commission, shipping, netMargin: sale.netMargin, shortages };
}

export async function setSaleStatus(saleId: string, status: 'por_despachar' | 'despachada' | 'entregada' | 'anulada', user: User, o: { tracking?: string; returnToStock?: boolean; reason?: string } = {}) {
  const t = await getT();
  const db = await getDb();
  const [sale] = await db.select().from(s.sales).where(eq(s.sales.id, saleId));
  if (!sale) throw new Error(t('catalog.saleNotFound'));
  if (sale.status === 'anulada') throw new Error(t('catalog.theSaleIsAlreadyVoided'));
  // anular es condicionado: dos anulaciones simultáneas no reingresan el stock dos veces
  if (status === 'anulada') {
    if (!o.reason) throw new Error(t('catalog.enterTheReasonForVoiding'));
    const [claimed] = await db.update(s.sales).set({ status }).where(and(eq(s.sales.id, saleId), ne(s.sales.status, 'anulada'))).returning({ id: s.sales.id });
    if (!claimed) throw new Error(t('catalog.theSaleIsAlreadyVoided'));
    const items = await db.select().from(s.saleItems).where(eq(s.saleItems.saleId, saleId));
    await db.transaction(async (tx) => {
      for (const it of items) {
        if (o.returnToStock !== false) {
          const [v] = await tx.update(s.productVariants).set({ stock: sql`${s.productVariants.stock} + ${it.qty}`, updatedAt: new Date() }).where(eq(s.productVariants.id, it.variantId)).returning({ id: s.productVariants.id });
          if (v) await tx.insert(s.stockMovements).values({ workspaceId: WORKSPACE_ID, variantId: it.variantId, kind: 'devolucion', qty: it.qty, unitCost: it.frozenCost, saleId, reason: t('catalog.voidLabel', { sale: sale.number, reason: o.reason }), createdBy: user.id });
        } else await tx.insert(s.stockMovements).values({ workspaceId: WORKSPACE_ID, variantId: it.variantId, kind: 'merma', qty: 0, saleId, reason: t('catalog.voidWithoutRestock', { sale: sale.number, reason: o.reason }), createdBy: user.id });
      }
      // la venta anulada no deja dinero cobrado: sus pagos se dan de baja y se recalcula lo pagado
      await tx.update(s.payments).set({ deletedAt: new Date() }).where(and(eq(s.payments.saleId, saleId), isNull(s.payments.deletedAt)));
      await recomputePaid(tx as any, { orderId: null, saleId });
    });
  }
  await db.update(s.sales).set({ status, tracking: o.tracking ?? sale.tracking, notes: status === 'anulada' ? `${sale.notes ?? ''}\n${(await getT())('sales.voidedPrefix')} ${o.reason}`.trim() : sale.notes }).where(eq(s.sales.id, saleId));
  await audit('sale', saleId, 'estado', { from: sale.status, to: status }, user.id);
}
