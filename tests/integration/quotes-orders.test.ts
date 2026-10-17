import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { errorText } from '@/i18n/errors';
import { createSpool } from '@/lib/services/inventory';
import { removeRecord } from '@/lib/services/removal';
import { restoreRecord } from '@/lib/services/archive';
import { createT } from '@/i18n/translate';
import { seedDemo } from '@/lib/seed';
import { approveQuote, cancelOrder, createOrder, planProduction, setOrderStatus } from '@/lib/services/orders';
import { getSettings, saveSettings } from '@/lib/settings';
import { cancelJob, createJob, finishJob, moveJob, startJob } from '@/lib/services/production';
import { loadQuote, newQuoteVersion, previewRecalc, rejectQuote, saveQuote, sendQuote } from '@/lib/services/quotes';

let admin: any; let ventas: any; let db: Awaited<ReturnType<typeof getDb>>; let pla: any; let a1: any; let ender: any;
const U = (u: any) => ({ id: u.id, role: u.role, permOverrides: {} });
const line = (o: any = {}) => ({ description: 'Pieza', qty: 1, materialId: pla.id, machineId: a1.id, mode: 'manual' as const, gramsTotal: 40, hoursTotal: 2, ...o });
const order = async (id: string) => (await db.select().from(s.orders).where(eq(s.orders.id, id)))[0];
const job = async (id: string) => (await db.select().from(s.printJobs).where(eq(s.printJobs.id, id)))[0];

beforeAll(async () => {
  fs.rmSync('data/test-storage', { recursive: true, force: true });
  await seedDemo(); db = await getDb();
  const users = await db.select().from(s.users);
  admin = U(users.find((u) => u.role === 'admin')); ventas = U(users.find((u) => u.role === 'ventas'));
  pla = (await db.select().from(s.materials).where(eq(s.materials.colorName, 'Negro'))).find((m) => m.type === 'PLA');
  const ms = await db.select().from(s.machines); a1 = ms.find((m) => m.name.startsWith('Bambu')); ender = ms.find((m) => m.name.startsWith('Ender'));
});

describe('cola de impresión', () => {
  it('mover un trabajo deja posiciones enteras 1..n en la máquina destino', async () => {
    const a = await createJob({ kind: 'prueba', title: 'A', estG: 5, estH: 0.5, machineId: ender.id });
    const b = await createJob({ kind: 'prueba', title: 'B', estG: 5, estH: 0.5, machineId: ender.id });
    await moveJob(b, ender.id, 1, admin.id);
    const rows = await db.select().from(s.printJobs).where(and(eq(s.printJobs.machineId, ender.id), inArray(s.printJobs.status, ['en_cola', 'pausado', 'imprimiendo']))).orderBy(asc(s.printJobs.position));
    expect(rows.map((r) => r.position)).toEqual(rows.map((_, i) => i + 1));
    expect(rows.findIndex((r) => r.id === b)).toBeLessThan(rows.findIndex((r) => r.id === a));
  });
  it('un trabajo para una máquina simulada se asigna a una máquina real', async () => {
    const sim = (await db.select().from(s.machines).where(eq(s.machines.simulated, true)))[0];
    expect(sim).toBeTruthy();
    const j = await createJob({ kind: 'prueba', title: 'Sim', estG: 5, estH: 0.5, machineId: sim.id });
    expect((await job(j)).machineId).not.toBe(sim.id);
  });
  it('cerrar dos veces un trabajo no consume material dos veces; uno en cola no se cierra', async () => {
    const queued = await createJob({ kind: 'prueba', title: 'Q', estG: 5, estH: 0.5, materialId: pla.id, machineId: ender.id });
    await expect(finishJob(queued, { result: 'exito', userId: admin.id })).rejects.toThrow();
    await startJob(queued, { userId: admin.id });
    await expect(startJob(queued, { userId: admin.id })).rejects.toThrow();
    await finishJob(queued, { result: 'exito', realG: 7, userId: admin.id });
    await expect(finishJob(queued, { result: 'exito', realG: 7, userId: admin.id })).rejects.toThrow();
    expect((await db.select().from(s.inventoryMovements).where(eq(s.inventoryMovements.jobId, queued))).length).toBe(1);
  });
});

describe('estados del pedido', () => {
  it('falla total sin reimpresión: el pedido no pasa a post-proceso y la línea se puede planificar otra vez', async () => {
    const oid = await createOrder({ customerName: 'Falla', items: [line()] }, admin);
    const [j] = await planProduction(oid, admin); await startJob(j, { userId: admin.id });
    await finishJob(j, { result: 'falla_total', failCause: 'Despegue', reprint: false, userId: admin.id });
    expect((await order(oid)).status).not.toBe('post_proceso');
    expect((await db.select().from(s.orderItems).where(eq(s.orderItems.orderId, oid)))[0].status).toBe('pendiente');
    expect((await planProduction(oid, admin)).length).toBe(1);
  });
  it('cancelar el único trabajo devuelve la línea a pendiente y el pedido a recibido', async () => {
    const oid = await createOrder({ customerName: 'Cancela trabajo', items: [line()] }, admin);
    const [j] = await planProduction(oid, admin); expect((await order(oid)).status).toBe('en_produccion');
    await cancelJob(j, admin.id);
    expect((await order(oid)).status).toBe('recibido');
    expect((await db.select().from(s.orderItems).where(eq(s.orderItems.orderId, oid)))[0].status).toBe('pendiente');
  });
  it('falla parcial con reimpresión y reimpresión cancelada: la línea pasa a post-proceso y el pedido avanza', async () => {
    const oid = await createOrder({ customerName: 'Parcial', items: [line({ qty: 4 })] }, admin);
    const [j] = await planProduction(oid, admin); await startJob(j, { userId: admin.id });
    const f = await finishJob(j, { result: 'falla_parcial', qtyGood: 2, reprint: true, userId: admin.id });
    await cancelJob(f.reprintId!, admin.id);
    expect((await db.select().from(s.orderItems).where(eq(s.orderItems.orderId, oid)))[0].status).toBe('post_proceso');
    expect((await order(oid)).status).toBe('post_proceso');
    expect((await job(j)).qtyGood).toBe(2);
  });
  it('solo avances válidos de estado: no se marca listo con líneas sin imprimir ni se retrocede', async () => {
    const oid = await createOrder({ customerName: 'Transiciones', items: [line()] }, admin);
    await expect(setOrderStatus(oid, 'listo', admin)).rejects.toThrow();
    const [j] = await planProduction(oid, admin); await startJob(j, { userId: admin.id }); await finishJob(j, { result: 'exito', userId: admin.id });
    await setOrderStatus(oid, 'listo', admin);
    await expect(setOrderStatus(oid, 'post_proceso', admin)).rejects.toThrow();
  });
  it('planificar dos veces a la vez no duplica los trabajos', async () => {
    const oid = await createOrder({ customerName: 'Doble plan', items: [line()] }, admin);
    const [r1, r2] = await Promise.all([planProduction(oid, admin), planProduction(oid, admin)]);
    expect(r1.length + r2.length).toBe(1);
  });
  it('entregar o cancelar dos veces no mueve el stock dos veces', async () => {
    const [v] = await db.select().from(s.productVariants).where(eq(s.productVariants.active, true)).limit(1);
    await db.update(s.productVariants).set({ stock: 10, reserved: 0 }).where(eq(s.productVariants.id, v.id));
    const oid = await createOrder({ customerName: 'Entrega', items: [{ description: 'Stock', qty: 2, variantId: v.id, kind: 'producto' as const }] }, admin);
    expect((await order(oid)).status).toBe('listo');
    await setOrderStatus(oid, 'entregado', admin);
    await expect(setOrderStatus(oid, 'entregado', admin)).rejects.toThrow();
    const [after] = await db.select().from(s.productVariants).where(eq(s.productVariants.id, v.id));
    expect(after.stock).toBe(8); expect(after.reserved).toBe(0);
    const c = await createOrder({ customerName: 'Cancela', items: [{ description: 'Stock', qty: 3, variantId: v.id, kind: 'producto' as const }] }, admin);
    const other = await createOrder({ customerName: 'Otro', items: [{ description: 'Stock', qty: 2, variantId: v.id, kind: 'producto' as const }] }, admin);
    await cancelOrder(c, 'x', admin);
    await expect(cancelOrder(c, 'x', admin)).rejects.toThrow();
    expect((await db.select().from(s.productVariants).where(eq(s.productVariants.id, v.id)))[0].reserved).toBe(2);
    expect(other).toBeTruthy();
  });
});

describe('guardar presupuestos', () => {
  const count = async () => (await db.select({ id: s.quotes.id }).from(s.quotes)).length;
  it('un guardado rechazado (bajo el costo) no deja presupuesto ni líneas a medias', async () => {
    const n0 = await count();
    await expect(saveQuote({ items: [line({ finalUnit: 500 })] }, ventas)).rejects.toThrow(/bajo el costo/);
    expect(await count()).toBe(n0);
    const id = await saveQuote({ items: [line({ finalUnit: 30000 })] }, ventas);
    const before = (await loadQuote(id))!;
    await expect(saveQuote({ id, items: [{ ...line({ finalUnit: 500 }), id: before.items[0].id }] }, ventas)).rejects.toThrow(/bajo el costo/);
    const after = (await loadQuote(id))!;
    expect(after.items[0].finalUnit).toBe(30000); expect(after.quote.total).toBe(before.quote.total);
  });
  it('las líneas conservan su id entre guardados y el historial de precio no se repite', async () => {
    const id = await saveQuote({ items: [line({ finalUnit: 25000 })] }, admin);
    const it0 = (await loadQuote(id))!.items[0];
    for (let k = 0; k < 2; k++) await saveQuote({ id, items: [{ ...line({ finalUnit: 25000 }), id: it0.id }] }, admin);
    const d = (await loadQuote(id))!;
    expect(d.items[0].id).toBe(it0.id);
    expect((await db.select().from(s.priceAdjustments).where(eq(s.priceAdjustments.ownerId, it0.id))).length).toBe(1);
    expect((d.quote.calc as any).lines[0].id).toBe(it0.id);
  });
  it('una versión nueva conserva el IVA y la vista previa usa la urgencia', async () => {
    const id = await saveQuote({ applyTax: true, urgency: '48h', items: [line()] }, admin); await sendQuote(id, admin.id);
    const v2 = await newQuoteVersion(id, admin);
    expect((await loadQuote(v2))!.quote.applyTax).toBe(true);
    const id3 = await saveQuote({ urgency: '48h', items: [line({ gramsTotal: 100, hoursTotal: 3 })] }, admin); await sendQuote(id3, admin.id);
    expect((await previewRecalc(id3))!.delta).toBe(0);
  });
  it('un total fijado menor que el envío se rechaza', async () => {
    await expect(saveQuote({ finalTotal: 3000, items: [line({ shipping: 5000 })] }, admin)).rejects.toThrow(/envío/);
  });
});

describe('aprobar presupuestos', () => {
  const ap = { by: 'Cliente', channel: 'whatsapp' };
  it('dos aprobaciones simultáneas crean un solo pedido', async () => {
    const id = await saveQuote({ items: [line()] }, admin); await sendQuote(id, admin.id);
    const r = await Promise.allSettled([approveQuote(id, ap, admin), approveQuote(id, ap, admin)]);
    expect(r.filter((x) => x.status === 'fulfilled').length).toBe(1);
    expect((await db.select().from(s.orders).where(eq(s.orders.quoteId, id))).length).toBe(1);
    await expect(rejectQuote(id, 'tarde', admin.id)).rejects.toThrow();
  });
  it('una versión nueva de un presupuesto con pedido vigente no crea otro pedido', async () => {
    const id = await saveQuote({ items: [line()] }, admin); await sendQuote(id, admin.id);
    const oid = await approveQuote(id, ap, admin);
    const v2 = await newQuoteVersion(id, admin);
    await expect(approveQuote(v2, ap, admin)).rejects.toThrow(/Otra versión/);
    await cancelOrder(oid, 'cambio', admin);
    expect(await approveQuote(v2, ap, admin)).toBeTruthy();
  });
  it('si crear el pedido falla, no queda pedido ni reserva y el presupuesto se puede aprobar otra vez', async () => {
    const [v] = await db.select().from(s.productVariants).where(eq(s.productVariants.active, true)).limit(1);
    await db.update(s.productVariants).set({ stock: 10, reserved: 0 }).where(eq(s.productVariants.id, v.id));
    const id = await saveQuote({ items: [{ description: 'Stock', qty: 2, variantId: v.id, kind: 'producto' as const }] }, admin); await sendQuote(id, admin.id);
    await expect(approveQuote(id, { ...ap, deposit: { amount: 3_000_000_000, method: 'efectivo' } }, admin)).rejects.toThrow(/abono/);
    expect((await db.select().from(s.orders).where(eq(s.orders.quoteId, id))).length).toBe(0);
    expect((await db.select().from(s.productVariants).where(eq(s.productVariants.id, v.id)))[0].reserved).toBe(0);
    expect((await loadQuote(id))!.quote.status).toBe('enviado');
    await approveQuote(id, ap, admin);
    expect((await db.select().from(s.orders).where(eq(s.orders.quoteId, id))).length).toBe(1);
  });
  it('un guardado que coincide con la aprobación no reescribe el presupuesto aprobado', async () => {
    const id = await saveQuote({ items: [line({ finalUnit: 4000 })] }, admin); await sendQuote(id, admin.id);
    await db.update(s.quotes).set({ status: 'borrador', frozen: false }).where(eq(s.quotes.id, id));
    const it0 = (await loadQuote(id))!.items[0];
    await Promise.allSettled([saveQuote({ id, items: [{ ...line({ qty: 9, finalUnit: 400 }), id: it0.id }] }, admin), approveQuote(id, ap, admin)]);
    // gane quien gane, el presupuesto aprobado y su pedido coinciden; si el guardado ganó, no hay pedido
    const d = (await loadQuote(id))!; const [o] = await db.select().from(s.orders).where(eq(s.orders.quoteId, id));
    if (!o) { expect(d.quote.status).toBe('borrador'); return; }
    const [oi] = await db.select().from(s.orderItems).where(eq(s.orderItems.orderId, o.id));
    expect(d.quote.status).toBe('aprobado'); expect(d.items[0].qty).toBe(oi.qty); expect(d.quote.total).toBe(o.total);
  });
  it('un costo «congelado» enviado desde el navegador se ignora', async () => {
    const oid = await createOrder({ customerName: 'Falso', items: [{ ...line(), frozen: { suggestedUnit: 1, costTotal: 0, breakdown: {} } } as any] }, ventas);
    const [oi] = await db.select().from(s.orderItems).where(eq(s.orderItems.orderId, oid));
    expect(oi.suggestedUnit).toBeGreaterThan(1); expect(oi.costUnit).toBeGreaterThan(0);
  });
  it('el pedido usa los costos congelados del presupuesto aunque las tarifas suban', async () => {
    const id = await saveQuote({ items: [line({ gramsTotal: 200, hoursTotal: 10 })] }, ventas); await sendQuote(id, admin.id);
    const q = (await loadQuote(id))!.quote; const st = await getSettings();
    await saveSettings({ rates: { ...st.rates, kwh: st.rates.kwh * 50, laborHour: st.rates.laborHour * 50 } });
    try {
      const oid = await approveQuote(id, ap, ventas);
      expect((await order(oid)).costEstimated).toBe(q.costTotal);
    } finally { await saveSettings({ rates: st.rates }); }
  });
});

describe('errores de la base', () => {
  it('un valor repetido se avisa traducido y sin el SQL', async () => {
    await db.insert(s.tagDefs).values({ workspaceId: WORKSPACE_ID, name: 'repetida' });
    const e = await db.insert(s.tagDefs).values({ workspaceId: WORKSPACE_ID, name: 'repetida' }).then(() => null, (x) => x);
    expect(errorText(e, createT('es'))).toBe('Ya existe uno con ese nombre.');
  });
});

describe('eliminar y restaurar', () => {
  it('restaurar un material no revive una bobina eliminada antes', async () => {
    const [m] = await db.insert(s.materials).values({ workspaceId: WORKSPACE_ID, type: 'PLA', colorName: 'Prueba restaurar' }).returning();
    const a = await createSpool({ materialId: m.id, initialG: 1000 }); const b = await createSpool({ materialId: m.id, initialG: 1000 });
    await removeRecord('spool', a.id, admin.id);
    await db.update(s.spools).set({ remainingG: 0, status: 'agotada' }).where(eq(s.spools.id, b.id));
    await removeRecord('material', m.id, admin.id); await restoreRecord('material', m.id, admin.id);
    const [ra] = await db.select().from(s.spools).where(eq(s.spools.id, a.id)); const [rb] = await db.select().from(s.spools).where(eq(s.spools.id, b.id));
    expect(ra.deletedAt).not.toBeNull(); expect(ra.code.split('~').length).toBe(2);
    expect(rb.deletedAt).toBeNull(); expect(rb.code).toBe(b.code);
  });
});
