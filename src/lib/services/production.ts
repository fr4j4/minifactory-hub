import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { audit, notify } from '../audit';
import { getSettings, nextNumber } from '../settings';
import { fitsIn } from '../mesh/ops';
import { calcLine } from '../pricing';
import { consumeFromSpool, materialCostPerKg } from './inventory';
import { machineCostOf } from './quotes';
import { recomputeOrderStatus } from './orders';

type Db = Awaited<ReturnType<typeof getDb>>;

export interface JobSpec {
  kind: 'pedido' | 'stock' | 'prueba'; title: string; materialId?: string | null; qty?: number; estG: number; estH: number;
  orderId?: string | null; orderItemIds?: string[]; productionOrderId?: string | null; machineId?: string | null; fileVersionId?: string | null;
  sliceRunId?: string | null; reprintOfId?: string | null; notes?: string | null; dims?: [number, number, number] | null; userId?: string | null;
}

/** Máquina sugerida: tiene el material cargado, cabe la pieza y queda libre antes. */
export async function suggestMachine(o: { materialId?: string | null; dims?: [number, number, number] | null; hours: number }, db?: Db) {
  db = db ?? (await getDb());
  const machines = await db.select().from(s.machines).where(and(isNull(s.machines.deletedAt), ne(s.machines.status, 'fuera_de_servicio'), eq(s.machines.simulated, false)));
  const spools = o.materialId ? await db.select().from(s.spools).where(and(eq(s.spools.materialId, o.materialId), isNull(s.spools.deletedAt))) : [];
  const jobs = await db.select().from(s.printJobs).where(and(inArray(s.printJobs.status, ['en_cola', 'imprimiendo', 'pausado']), isNull(s.printJobs.deletedAt)));
  const now = Date.now();
  const rows = machines.map((m) => {
    const fits = !o.dims || fitsIn(o.dims, [m.volX, m.volY, m.volZ]);
    const loaded = spools.some((x) => x.machineId === m.id && x.remainingG > 0);
    const mine = jobs.filter((j) => j.machineId === m.id);
    const endMs = Math.max(now, ...mine.map((j) => (j.plannedEnd ? j.plannedEnd.getTime() : now)));
    const free = (endMs - now) / 3600_000;
    const matOk = !o.materialId || (m.materialsOk ?? []).length === 0 || true;
    return { m, fits, loaded, free, score: (fits ? 0 : 1e6) + free - (loaded ? 3 : 0) + (m.status === 'mantenimiento' ? 24 : 0), matOk };
  }).filter((r) => r.fits).sort((a, b) => a.score - b.score);
  const best = rows[0];
  if (!best) return null;
  return { machineId: best.m.id, name: best.m.name, loaded: best.loaded, freeInH: best.free, reason: `${best.loaded ? 'Tiene el material cargado' : 'Material por cargar'}; ${best.free < 0.1 ? 'libre ahora' : `libre en ${best.free.toFixed(1)} h`}` };
}

export async function createJob(spec: JobSpec): Promise<string> {
  const db = await getDb();
  let machineId = spec.machineId ?? null;
  if (!machineId) { const sug = await suggestMachine({ materialId: spec.materialId, dims: spec.dims, hours: spec.estH }, db); machineId = sug?.machineId ?? null; }
  const number = await nextNumber('job');
  const [mx] = machineId ? await db.select({ n: sql<number>`coalesce(max(${s.printJobs.position}),0)` }).from(s.printJobs).where(and(eq(s.printJobs.machineId, machineId), inArray(s.printJobs.status, ['en_cola', 'imprimiendo', 'pausado']))) : [{ n: 0 }];
  const [job] = await db.insert(s.printJobs).values({
    workspaceId: WORKSPACE_ID, number, kind: spec.kind, title: spec.title, machineId, materialId: spec.materialId ?? null, position: Number(mx.n) + 1, qty: spec.qty ?? 1,
    estG: spec.estG, estH: spec.estH, orderId: spec.orderId ?? null, productionOrderId: spec.productionOrderId ?? null, fileVersionId: spec.fileVersionId ?? null,
    sliceRunId: spec.sliceRunId ?? null, reprintOfId: spec.reprintOfId ?? null, notes: spec.notes ?? null, createdBy: spec.userId ?? null,
  }).returning({ id: s.printJobs.id });
  for (const oi of spec.orderItemIds ?? []) await db.insert(s.jobItems).values({ workspaceId: WORKSPACE_ID, jobId: job.id, orderItemId: oi, qty: spec.qty ?? 1 });
  if (machineId) await scheduleMachine(machineId);
  await audit('print_job', job.id, 'crear', { number, machineId }, spec.userId);
  return job.id;
}

/** Recalcula inicio y término planificados de la cola de una máquina. */
export async function scheduleMachine(machineId: string) {
  const db = await getDb();
  const [m] = await db.select().from(s.machines).where(eq(s.machines.id, machineId));
  if (!m) return;
  const jobs = await db.select().from(s.printJobs).where(and(eq(s.printJobs.machineId, machineId), inArray(s.printJobs.status, ['en_cola', 'imprimiendo', 'pausado']), isNull(s.printJobs.deletedAt))).orderBy(asc(s.printJobs.position), asc(s.printJobs.createdAt));
  let cursor = Date.now();
  for (const j of jobs) {
    const dur = (j.estH * (m.timeFactor || 1)) * 3600_000;
    let start = cursor; let end = start + dur;
    if (j.status === 'imprimiendo' && j.realStart) { start = j.realStart.getTime(); end = Math.max(Date.now(), start + dur); }
    await db.update(s.printJobs).set({ plannedStart: new Date(start), plannedEnd: new Date(end) }).where(eq(s.printJobs.id, j.id));
    cursor = Math.max(cursor, end);
  }
}

export async function moveJob(jobId: string, machineId: string, position: number, userId?: string | null) {
  const db = await getDb();
  const [j] = await db.select().from(s.printJobs).where(eq(s.printJobs.id, jobId));
  if (!j || j.status === 'imprimiendo') throw new Error('No se puede mover un trabajo en curso');
  const old = j.machineId;
  await db.update(s.printJobs).set({ machineId, position: position - 0.5, updatedAt: new Date() }).where(eq(s.printJobs.id, jobId));
  // normalizar posiciones
  const rows = await db.select().from(s.printJobs).where(and(eq(s.printJobs.machineId, machineId), inArray(s.printJobs.status, ['en_cola', 'pausado', 'imprimiendo']))).orderBy(asc(s.printJobs.position));
  let p = 1; for (const r of rows) await db.update(s.printJobs).set({ position: p++ }).where(eq(s.printJobs.id, r.id));
  await scheduleMachine(machineId); if (old && old !== machineId) await scheduleMachine(old);
  await audit('print_job', jobId, 'mover', { from: old, to: machineId, position }, userId);
}

export async function pickSpool(materialId: string | null | undefined, grams: number, machineId?: string | null, db?: Db) {
  db = db ?? (await getDb());
  if (!materialId) return null;
  const sp = await db.select().from(s.spools).where(and(eq(s.spools.materialId, materialId), isNull(s.spools.deletedAt), inArray(s.spools.status, ['nueva', 'abierta', 'en_uso'])));
  const rank = (x: typeof sp[number]) => (x.machineId && x.machineId === machineId ? 0 : x.status === 'en_uso' ? 1 : x.status === 'abierta' ? 2 : 3);
  return [...sp].sort((a, b) => rank(a) - rank(b) || a.remainingG - b.remainingG).find((x) => x.remainingG >= grams) ?? [...sp].sort((a, b) => b.remainingG - a.remainingG)[0] ?? null;
}

export async function startJob(jobId: string, o: { machineId?: string; spoolId?: string; userId?: string | null } = {}) {
  const db = await getDb();
  const [j] = await db.select().from(s.printJobs).where(eq(s.printJobs.id, jobId));
  if (!j) throw new Error('Trabajo no encontrado');
  const machineId = o.machineId ?? j.machineId;
  if (!machineId) throw new Error('Asigna una máquina antes de iniciar');
  const [busy] = await db.select({ id: s.printJobs.id }).from(s.printJobs).where(and(eq(s.printJobs.machineId, machineId), eq(s.printJobs.status, 'imprimiendo'), ne(s.printJobs.id, jobId))).limit(1);
  if (busy) throw new Error('La máquina ya está imprimiendo otro trabajo');
  const spool = o.spoolId ? (await db.select().from(s.spools).where(eq(s.spools.id, o.spoolId)))[0] : await pickSpool(j.materialId, j.estG, machineId, db);
  const now = new Date();
  await db.update(s.printJobs).set({ status: 'imprimiendo', machineId, spoolId: spool?.id ?? null, realStart: now, updatedAt: now }).where(eq(s.printJobs.id, jobId));
  await db.update(s.machines).set({ status: 'imprimiendo', updatedAt: now }).where(eq(s.machines.id, machineId));
  if (spool) await db.update(s.spools).set({ status: 'en_uso', machineId, openedAt: spool.openedAt ?? now.toISOString().slice(0, 10), updatedAt: now }).where(eq(s.spools.id, spool.id));
  if (j.productionOrderId) await db.update(s.productionOrders).set({ status: 'imprimiendo' }).where(eq(s.productionOrders.id, j.productionOrderId));
  const items = await db.select().from(s.jobItems).where(eq(s.jobItems.jobId, jobId));
  if (items.length) await db.update(s.orderItems).set({ status: 'imprimiendo' }).where(inArray(s.orderItems.id, items.map((i) => i.orderItemId!).filter(Boolean)));
  if (j.orderId) await recomputeOrderStatus(j.orderId);
  await scheduleMachine(machineId);
  await audit('print_job', jobId, 'iniciar', { machineId, spoolId: spool?.id }, o.userId);
}

export interface FinishInput { result: 'exito' | 'falla_parcial' | 'falla_total'; realG?: number; realH?: number; qtyGood?: number; failCause?: string; failCharge?: 'taller' | 'pedido'; reprint?: boolean; userId?: string | null; spoolId?: string }

export async function finishJob(jobId: string, o: FinishInput) {
  const db = await getDb();
  const st = await getSettings();
  const [j] = await db.select().from(s.printJobs).where(eq(s.printJobs.id, jobId));
  if (!j) throw new Error('Trabajo no encontrado');
  if (j.status === 'terminado' || j.status === 'fallido') throw new Error('El trabajo ya está cerrado');
  const now = new Date();
  const failed = o.result !== 'exito';
  const realH = o.realH ?? (j.realStart ? Math.max(0.01, (now.getTime() - j.realStart.getTime()) / 3600_000) : j.estH);
  const factorOnFail = o.result === 'falla_total' ? 0.5 : 0.75;
  const realG = o.realG ?? (failed ? j.estG * factorOnFail : j.estG * (1 + st.rates.wastePct / 100));
  const qtyGood = o.result === 'exito' ? j.qty : o.result === 'falla_total' ? 0 : Math.max(0, Math.min(j.qty, o.qtyGood ?? Math.floor(j.qty / 2)));
  // consumo de material
  const spoolId = o.spoolId ?? j.spoolId ?? (await pickSpool(j.materialId, realG, j.machineId, db))?.id ?? null;
  if (spoolId) await consumeFromSpool({ spoolId, grams: realG, kind: failed ? 'falla' : 'consumo', jobId, note: `Trabajo ${j.number}`, userId: o.userId }, db);
  const costPerKg = j.materialId ? await materialCostPerKg(j.materialId, db) : 0;
  const [m] = j.machineId ? await db.select().from(s.machines).where(eq(s.machines.id, j.machineId)) : [];
  const line = calcLine({ qty: Math.max(1, j.qty), gramsTotal: realG, hoursTotal: realH, costPerKg, machine: machineCostOf(m), prepMinutes: 5 }, st.rates);
  await db.update(s.printJobs).set({
    status: failed && o.result === 'falla_total' ? 'fallido' : 'terminado', realEnd: now, realG, realH, result: o.result, failCause: o.failCause ?? null,
    failCharge: o.failCharge ?? null, spoolId, updatedAt: now,
  }).where(eq(s.printJobs.id, jobId));
  // máquina: contadores y factor de corrección de tiempo
  if (m) {
    const recent = await db.select({ e: s.printJobs.estH, r: s.printJobs.realH }).from(s.printJobs).where(and(eq(s.printJobs.machineId, m.id), eq(s.printJobs.result, 'exito'))).orderBy(desc(s.printJobs.realEnd)).limit(20);
    const ratios = recent.filter((x) => x.e > 0 && x.r && x.r > 0).map((x) => x.r! / x.e).sort((a, b) => a - b);
    const factor = ratios.length >= 3 ? ratios[Math.floor(ratios.length / 2)] : m.timeFactor;
    await db.update(s.machines).set({
      status: 'disponible', hoursTotal: m.hoursTotal + realH, jobsOk: m.jobsOk + (failed ? 0 : 1), jobsFailed: m.jobsFailed + (failed ? 1 : 0), timeFactor: factor, updatedAt: now,
    }).where(eq(s.machines.id, m.id));
    await checkMaintenance(m.id);
    await scheduleMachine(m.id);
  }
  // costo real al pedido (incluye fallas)
  if (j.orderId) {
    const [od] = await db.select().from(s.orders).where(eq(s.orders.id, j.orderId));
    await db.update(s.orders).set({ costReal: (od?.costReal ?? 0) + line.cost, updatedAt: now }).where(eq(s.orders.id, j.orderId));
  }
  // producción para stock
  if (j.productionOrderId) {
    const [po] = await db.select().from(s.productionOrders).where(eq(s.productionOrders.id, j.productionOrderId));
    if (po) {
      const unitCost = qtyGood > 0 ? Math.round(line.cost / qtyGood) : 0;
      const [v] = await db.select().from(s.productVariants).where(eq(s.productVariants.id, po.variantId));
      if (v && qtyGood > 0) {
        const newStock = v.stock + qtyGood;
        const avg = newStock > 0 ? Math.round((v.stock * v.avgCost + qtyGood * unitCost) / newStock) : v.avgCost;
        await db.update(s.productVariants).set({ stock: newStock, avgCost: avg, updatedAt: now }).where(eq(s.productVariants.id, v.id));
        await db.insert(s.stockMovements).values({ workspaceId: WORKSPACE_ID, variantId: v.id, kind: 'produccion', qty: qtyGood, unitCost, productionOrderId: po.id, reason: `Trabajo ${j.number}`, createdBy: o.userId ?? null });
      }
      if (v && j.qty - qtyGood > 0) await db.insert(s.stockMovements).values({ workspaceId: WORKSPACE_ID, variantId: v.id, kind: 'merma', qty: 0, reason: `Falla ${j.qty - qtyGood} u. en ${j.number}${o.failCause ? ': ' + o.failCause : ''}`, productionOrderId: po.id, createdBy: o.userId ?? null });
      await db.update(s.productionOrders).set({ qtyGood: po.qtyGood + qtyGood, qtyFailed: po.qtyFailed + (j.qty - qtyGood), status: o.reprint !== false && failed ? 'en_cola' : 'terminada', updatedAt: now }).where(eq(s.productionOrders.id, po.id));
    }
  }
  // líneas del pedido
  const items = await db.select().from(s.jobItems).where(eq(s.jobItems.jobId, jobId));
  const oiIds = items.map((i) => i.orderItemId).filter(Boolean) as string[];
  if (oiIds.length) await db.update(s.orderItems).set({ status: failed ? 'en_cola' : 'post_proceso' }).where(inArray(s.orderItems.id, oiIds));
  // reimpresión
  let reprintId: string | null = null;
  if (failed && o.reprint !== false) {
    reprintId = await createJob({
      kind: j.kind as any, title: `${j.title} (reimpresión)`, materialId: j.materialId, qty: Math.max(1, j.qty - qtyGood), estG: j.estG * (Math.max(1, j.qty - qtyGood) / Math.max(1, j.qty)), estH: j.estH * (Math.max(1, j.qty - qtyGood) / Math.max(1, j.qty)),
      orderId: j.orderId, orderItemIds: oiIds, productionOrderId: j.productionOrderId, machineId: j.machineId, reprintOfId: jobId, notes: `Reimpresión de ${j.number}`, userId: o.userId,
    });
    await notify('trabajo_fallido', `Trabajo fallido: ${j.number}`, o.failCause ?? 'Sin causa indicada', '/cola');
  } else await notify('trabajo_terminado', `Trabajo terminado: ${j.number}`, j.title ?? '', '/cola');
  if (j.orderId) await recomputeOrderStatus(j.orderId);
  await audit('print_job', jobId, 'finalizar', { result: o.result, realG, realH, qtyGood, reprintId }, o.userId);
  return { reprintId, realG, realH, qtyGood, cost: line.cost };
}

export async function pauseJob(jobId: string) {
  const db = await getDb();
  const [j] = await db.select().from(s.printJobs).where(eq(s.printJobs.id, jobId));
  if (!j) return;
  await db.update(s.printJobs).set({ status: 'pausado' }).where(eq(s.printJobs.id, jobId));
  if (j.machineId) await db.update(s.machines).set({ status: 'pausada' }).where(eq(s.machines.id, j.machineId));
}
export async function resumeJob(jobId: string) {
  const db = await getDb();
  const [j] = await db.select().from(s.printJobs).where(eq(s.printJobs.id, jobId));
  if (!j) return;
  await db.update(s.printJobs).set({ status: 'imprimiendo' }).where(eq(s.printJobs.id, jobId));
  if (j.machineId) await db.update(s.machines).set({ status: 'imprimiendo' }).where(eq(s.machines.id, j.machineId));
}
export async function cancelJob(jobId: string, userId?: string | null) {
  const db = await getDb();
  const [j] = await db.select().from(s.printJobs).where(eq(s.printJobs.id, jobId));
  if (!j || ['terminado', 'fallido', 'cancelado'].includes(j.status)) return;
  await db.update(s.printJobs).set({ status: 'cancelado', updatedAt: new Date() }).where(eq(s.printJobs.id, jobId));
  if (j.machineId) { if (j.status === 'imprimiendo' || j.status === 'pausado') await db.update(s.machines).set({ status: 'disponible' }).where(eq(s.machines.id, j.machineId)); await scheduleMachine(j.machineId); }
  if (j.productionOrderId) await db.update(s.productionOrders).set({ status: 'cancelada' }).where(eq(s.productionOrders.id, j.productionOrderId));
  await audit('print_job', jobId, 'cancelar', {}, userId);
}

/** Alerta de mantenimiento por horas o por días. */
export async function checkMaintenance(machineId: string) {
  const db = await getDb();
  const [m] = await db.select().from(s.machines).where(eq(s.machines.id, machineId));
  const plans = await db.select().from(s.maintenancePlans).where(and(eq(s.maintenancePlans.machineId, machineId), isNull(s.maintenancePlans.deletedAt)));
  for (const p of plans) {
    const dueH = p.intervalHours != null && m.hoursTotal - p.lastDoneHours >= p.intervalHours;
    const dueD = p.intervalDays != null && p.lastDoneAt && (Date.now() - new Date(p.lastDoneAt).getTime()) / 86400_000 >= p.intervalDays;
    if (dueH || dueD) {
      const title = `Mantenimiento vencido: ${p.task} (${m.name})`;
      const [ex] = await db.select({ id: s.notifications.id }).from(s.notifications).where(and(eq(s.notifications.kind, 'mantenimiento'), eq(s.notifications.title, title), eq(s.notifications.read, false))).limit(1);
      if (!ex) await notify('mantenimiento', title, dueH ? `Han pasado ${(m.hoursTotal - p.lastDoneHours).toFixed(0)} h desde la última vez.` : 'Se cumplió el plazo en días.', `/maquinas/${m.id}`);
    }
  }
}

export interface MaintDue { planId: string; task: string; machineId: string; dueBy: 'horas' | 'días'; over: number }
export async function maintenanceDue(): Promise<MaintDue[]> {
  const db = await getDb();
  const machines = await db.select().from(s.machines).where(isNull(s.machines.deletedAt));
  const plans = await db.select().from(s.maintenancePlans).where(isNull(s.maintenancePlans.deletedAt));
  const out: MaintDue[] = [];
  for (const p of plans) {
    const m = machines.find((x) => x.id === p.machineId); if (!m) continue;
    if (p.intervalHours != null) { const over = m.hoursTotal - p.lastDoneHours - p.intervalHours; if (over >= 0) out.push({ planId: p.id, task: p.task, machineId: m.id, dueBy: 'horas', over }); }
    if (p.intervalDays != null && p.lastDoneAt) { const over = (Date.now() - new Date(p.lastDoneAt).getTime()) / 86400_000 - p.intervalDays; if (over >= 0) out.push({ planId: p.id, task: p.task, machineId: m.id, dueBy: 'días', over }); }
  }
  return out;
}

export async function completeMaintenance(o: { planId: string; cost?: number; downtimeH?: number; notes?: string; parts?: Array<{ itemId: string; qty: number; name: string }>; userId?: string | null }) {
  const db = await getDb();
  const [p] = await db.select().from(s.maintenancePlans).where(eq(s.maintenancePlans.id, o.planId));
  if (!p) throw new Error('Plan no encontrado');
  const [m] = await db.select().from(s.machines).where(eq(s.machines.id, p.machineId));
  const today = new Date().toISOString().slice(0, 10);
  const { moveItem } = await import('./inventory');
  for (const part of o.parts ?? []) await moveItem({ itemId: part.itemId, qty: part.qty, kind: 'consumo', note: `Mantenimiento: ${p.task} (${m.name})`, userId: o.userId });
  await db.insert(s.maintenanceLogs).values({ workspaceId: WORKSPACE_ID, machineId: m.id, planId: p.id, task: p.task, doneAt: today, atHours: m.hoursTotal, cost: o.cost ?? 0, downtimeH: o.downtimeH ?? 0, parts: o.parts ?? [], notes: o.notes ?? null, createdBy: o.userId ?? null });
  await db.update(s.maintenancePlans).set({ lastDoneHours: m.hoursTotal, lastDoneAt: today }).where(eq(s.maintenancePlans.id, p.id));
  await audit('machine', m.id, 'mantenimiento', { task: p.task }, o.userId);
}

/* ───────── producción para stock ───────── */
export async function createProductionOrder(o: { variantId: string; qty: number; origin?: 'manual' | 'reposicion'; machineId?: string | null; userId?: string | null }) {
  const db = await getDb();
  const [v] = await db.select().from(s.productVariants).where(eq(s.productVariants.id, o.variantId));
  if (!v) throw new Error('Variante no encontrada');
  const [p] = await db.select().from(s.products).where(eq(s.products.id, v.productId));
  const number = await nextNumber('production');
  const [po] = await db.insert(s.productionOrders).values({ workspaceId: WORKSPACE_ID, number, variantId: o.variantId, qty: o.qty, status: 'en_cola', origin: o.origin ?? 'manual', createdBy: o.userId ?? null }).returning();
  const [mf] = p?.modelFileId ? await db.select().from(s.modelFiles).where(eq(s.modelFiles.id, p.modelFileId)) : [];
  const dims = mf?.dimX ? ([mf.dimX, mf.dimY!, mf.dimZ!] as [number, number, number]) : null;
  const jobId = await createJob({
    kind: 'stock', title: `${p?.name ?? 'Producto'} ${Object.values(v.attrs ?? {}).join(' ')} ×${o.qty}`.trim(), materialId: v.materialId, qty: o.qty,
    estG: v.weightG * o.qty, estH: v.printH * o.qty, productionOrderId: po.id, machineId: o.machineId, dims, userId: o.userId,
  });
  return { productionOrderId: po.id, jobId, number };
}
