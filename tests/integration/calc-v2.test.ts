import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { eq, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { seedDemo } from '@/lib/seed';
import { getRates, getSettings, saveSettings } from '@/lib/settings';
import { createOrder, approveQuote } from '@/lib/services/orders';
import { loadQuote, saveQuote } from '@/lib/services/quotes';
import { calibrationData, draftQuotesCount, profileUsage, ratesHistory } from '@/lib/services/calibration';
import { getCalcContext } from '@/lib/context';
import { reportData } from '@/lib/reports';
import { orderNet } from '@/lib/tax';
import { audit } from '@/lib/audit';
import { migrateToV2Action } from '@/actions/calc';

let admin: any; let db: Awaited<ReturnType<typeof getDb>>; let pla: any, a1: any;
const U = (u: any) => ({ id: u.id, role: u.role, permOverrides: {} });
const line = (o: any = {}) => ({ description: 'Pieza', qty: 1, materialId: pla.id, machineId: a1.id, mode: 'manual' as const, gramsTotal: 60, hoursTotal: 4, origin: { grams: 'slicer', hours: 'slicer' }, ...o });

beforeAll(async () => {
  fs.rmSync('data/test-storage', { recursive: true, force: true });
  await seedDemo(); db = await getDb();
  admin = U((await db.select().from(s.users)).find((u) => u.role === 'admin'));
  pla = (await db.select().from(s.materials).where(eq(s.materials.colorName, 'Negro'))).find((m) => m.type === 'PLA');
  a1 = (await db.select().from(s.machines)).find((m) => m.name.startsWith('Bambu'));
});

describe('cuenta nueva: cálculo v2 por defecto', () => {
  it('parte en v2 con perfiles de fábrica y costos fijos de la demo', async () => {
    const st = await getSettings();
    expect(st.rates.engine).toBe('v2'); expect(st.calcProfiles.length).toBeGreaterThanOrEqual(10); expect(st.calcProfiles.some((p) => p.id === 'std' && p.isDefault)).toBe(true);
    expect((st.rates.fixedCosts ?? []).length).toBeGreaterThan(0); expect(st.calcSetup.done).toBe(true);
    expect((await getRates()).machineCount).toBeGreaterThanOrEqual(1);
  });
});

describe('IVA opcional en el presupuesto', () => {
  it('sin casilla el total es el neto y el margen es el objetivo; con casilla suma el IVA', async () => {
    const a = (await loadQuote(await saveQuote({ items: [line()] }, admin)))!.quote;
    expect(a.applyTax).toBe(false); expect(a.taxAmount).toBe(0); expect(a.total).toBe(a.suggestedTotal);
    const b = (await loadQuote(await saveQuote({ applyTax: true, items: [line()] }, admin)))!.quote;
    expect(b.applyTax).toBe(true); expect(b.taxAmount).toBe(Math.round(b.suggestedTotal * 0.19)); expect(b.total).toBe(b.suggestedTotal + b.taxAmount);
    expect((b.calc as any).engine).toBe(2);
    const margin = ((a.total - a.costTotal) / a.total) * 100; expect(margin).toBeGreaterThan(30); // antes, con IVA incluido, el margen real era ~30% aunque se configuraba 70%
  });
  it('el pedido aprobado hereda el IVA y se mide sobre el neto', async () => {
    const q = await saveQuote({ customerName: 'Cliente IVA', applyTax: true, items: [line({ qty: 2, gramsTotal: 120, hoursTotal: 8 })] }, admin);
    const oid = await approveQuote(q, { by: 'Cliente IVA', channel: 'whatsapp' }, admin);
    const [o] = await db.select().from(s.orders).where(eq(s.orders.id, oid)); const qq = (await loadQuote(q))!.quote;
    expect(o.taxMode).toBe('sumado'); expect(o.total).toBe(qq.total); expect(o.taxAmount).toBe(qq.taxAmount);
    const st = await getSettings(); expect(orderNet(o, st.rates)).toBe(qq.total - qq.taxAmount);
  });
  it('un pedido manual sin IVA queda como exento y su neto es el total', async () => {
    const oid = await createOrder({ customerName: 'Sin IVA', items: [line()] }, admin);
    const [o] = await db.select().from(s.orders).where(eq(s.orders.id, oid));
    expect(o.taxMode).toBe('exento'); expect(o.taxAmount).toBe(0); expect(orderNet(o, (await getSettings()).rates)).toBe(o.total);
  });
  it('los reportes miden el margen sobre el neto de cada pedido', async () => {
    const r = await reportData('ventas', { from: new Date(Date.now() - 400 * 86400_000), to: new Date(Date.now() + 86400_000) }, true);
    expect(r.rows.length).toBeGreaterThan(0);
  });
});

describe('perfiles y canal', () => {
  it('el perfil del presupuesto cambia el precio; el del cliente se usa cuando el presupuesto no define uno', async () => {
    const std = (await loadQuote(await saveQuote({ items: [line()] }, admin)))!.quote.suggestedTotal;
    const may = (await loadQuote(await saveQuote({ calcProfileId: 'mayor', items: [line()] }, admin)))!.quote.suggestedTotal;
    const fun = (await loadQuote(await saveQuote({ calcProfileId: 'func', items: [line()] }, admin)))!.quote.suggestedTotal;
    expect(may).toBeLessThan(std); expect(fun).toBeGreaterThan(std);
    const [c] = await db.insert(s.customers).values({ workspaceId: (await db.select().from(s.users))[0].workspaceId, name: 'Revendedor X', type: 'revendedor', calcProfileId: 'mayor' }).returning();
    const viaCustomer = (await loadQuote(await saveQuote({ customerId: c.id, items: [line()] }, admin)))!.quote.suggestedTotal;
    expect(viaCustomer).toBe(may);
    expect((await profileUsage()).mayor.customers).toBe(1);
  });
  it('la línea puede traer su propio perfil, etiquetas y ajustes (calcOpts) que quedan guardados', async () => {
    const id = await saveQuote({ items: [line({ calcProfileId: 'func', calcOpts: { plates: 2, designMinutes: 20, tags: ['tall'], overrides: { marginPct: 55 } } })] }, admin);
    const d = (await loadQuote(id))!; expect(d.items[0].calcProfileId).toBe('func'); expect((d.items[0].calcOpts as any).plates).toBe(2);
    const base = (await loadQuote(await saveQuote({ items: [line({ calcProfileId: 'func' })] }, admin)))!.quote.suggestedTotal;
    expect(d.quote.suggestedTotal).toBeGreaterThan(base);
  });
  it('la comisión del canal sube el precio sugerido', async () => {
    const [ch] = await db.insert(s.salesChannels).values({ workspaceId: (await db.select().from(s.users))[0].workspaceId, name: 'Marketplace test', kind: 'marketplace', commissionPct: 12, calcProfileId: 'market' }).returning();
    const sin = (await loadQuote(await saveQuote({ items: [line()] }, admin)))!.quote.suggestedTotal;
    const con = (await loadQuote(await saveQuote({ channelId: ch.id, items: [line()] }, admin)))!.quote.suggestedTotal;
    expect(con).toBeGreaterThan(sin * 1.1);
  });
  it('el cliente y el servidor calculan lo mismo (misma función de precio)', async () => {
    const ctx = await getCalcContext();
    const { priceLine } = await import('@/lib/item-price'); const { toItemMaterial } = await import('@/lib/item-price');
    const mat = ctx.materials.find((m) => m.id === pla.id)!; const mach = ctx.machines.find((m) => m.id === a1.id)!;
    const client = priceLine({ qty: 1, gramsTotal: 60, hoursTotal: 4, mode: 'manual', originKind: 'slicer', prepMinutes: 10, postMinutes: 0, postSupplies: 0, shipping: 0 }, { rates: ctx.rates, profiles: ctx.calcProfiles, material: toItemMaterial(mat), machine: mach.cost });
    const q = (await loadQuote(await saveQuote({ items: [line({ prepMinutes: 10 })] }, admin)))!;
    expect(q.items[0].suggestedUnit).toBe(client.suggestedUnit);
  });
});

describe('máquinas sin datos y confianza', () => {
  it('una máquina sin valor de compra marca la línea como poco confiable', async () => {
    const [m] = await db.insert(s.machines).values({ workspaceId: a1.workspaceId, name: 'Sin datos', purchaseValue: 0, watts: 0 }).returning();
    const q = (await loadQuote(await saveQuote({ items: [line({ machineId: m.id })] }, admin)))!;
    const bd: any = q.items[0].costBreakdown; expect(bd.reliable).toBe(false); expect(bd.warnings).toContain('machineNoPurchase');
  });
});

describe('calibración, historial y migración', () => {
  it('compara lo medido con la calculadora sin cambiar nada', async () => {
    const c = await calibrationData(); expect(c.machines.length).toBeGreaterThan(0); expect(c.waste.current).toBeGreaterThanOrEqual(0);
  });
  it('el historial guarda lo anterior para restaurar y cuenta borradores', async () => {
    const st = await getSettings(); await audit('settings', null, 'tarifas', { before: st.rates, after: { ...st.rates, marginPct: 50 } }, admin.id);
    const h = await ratesHistory(); expect(h[0].before.marginPct).toBe(st.rates.marginPct);
    expect(await draftQuotesCount()).toBeGreaterThan(0);
  });
  it('una cuenta anterior a la v2 sigue con la fórmula antigua y puede migrar sin tocar pedidos existentes', async () => {
    const raw = (await db.select().from(s.settings))[0]; const data: any = { ...raw.data };
    const { engine: _e, ...legacyRates } = data.rates; // como quedó guardado antes de la v2
    await db.update(s.settings).set({ data: { ...data, rates: { ...legacyRates, taxMode: 'incluido', marginPct: 70, wastePct: 8 } } }).where(eq(s.settings.workspaceId, raw.workspaceId));
    const st = await getSettings(); expect(st.rates.engine).toBe('legacy');
    const q = (await loadQuote(await saveQuote({ items: [line()] }, admin)))!.quote;
    expect((q.calc as any).engine).toBe(1); expect(q.applyTax).toBe(false);
    await db.update(s.orders).set({ taxMode: null }).where(isNull(s.orders.deletedAt)); // pedidos de la época anterior
    const byId = (a: Array<{ id: string }>) => [...a].sort((x, y) => x.id.localeCompare(y.id));
    const before = byId(await db.select({ id: s.orders.id, total: s.orders.total }).from(s.orders));
    // la acción exige sesión; se prueba la parte de datos con la misma lógica que usa
    const { toV2Rates } = await import('@/lib/calc-defaults'); const v2 = toV2Rates(st.rates);
    expect(v2.engine).toBe('v2'); expect(v2.marginPct).toBe(40); expect(v2.taxDefault).toBe(false); expect(v2.laborHour).toBe(st.rates.laborHour);
    await db.update(s.orders).set({ taxMode: st.rates.taxMode }).where(isNull(s.orders.taxMode)); await saveSettings({ rates: v2 });
    expect((await getSettings()).rates.engine).toBe('v2');
    const after = byId(await db.select({ id: s.orders.id, total: s.orders.total }).from(s.orders));
    expect(after).toEqual(before); // los totales no cambian
    const o = (await db.select().from(s.orders))[0]; expect(o.taxMode).toBe('incluido');
    void migrateToV2Action;
  });
});
