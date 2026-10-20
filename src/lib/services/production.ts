import { isFailCode, normalizeFailCause } from '../production/fail-causes';
import { techFits } from '../production/tech';
import { and, asc, desc, eq, gt, inArray, isNull, ne, sql } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID, type Tx } from '@/db';
import { audit, notify } from '../audit';
import { getRates, getSettings, nextNumber } from '../settings';
import { fitsIn } from '../mesh/ops';
import { calcLine } from '../pricing';
import { checkAvailability, consumeFromSpool, materialCostPerKg } from './inventory';
import { machineCostOf } from './quotes';
import { recomputeOrderStatus } from './orders';
import { getT } from '@/i18n/server';
import { LOCALES } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { LocalizedError } from '@/i18n/errors';
import { ymd } from '../format';

type Db = Awaited<ReturnType<typeof getDb>>;

export interface JobSpec {
  kind: 'pedido' | 'stock' | 'prueba'; title: string; materialId?: string | null; qty?: number; estG: number; estH: number;
  orderId?: string | null; orderItemIds?: string[]; productionOrderId?: string | null; machineId?: string | null; fileVersionId?: string | null;
  sliceRunId?: string | null; reprintOfId?: string | null; notes?: string | null; dims?: [number, number, number] | null; userId?: string | null;
}

/** Máquina sugerida: tiene el material cargado, cabe la pieza y queda libre antes. */
export async function suggestMachine(o: { materialId?: string | null; dims?: [number, number, number] | null; hours: number }, db?: Db) {
  const t = await getT();
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
  return { machineId: best.m.id, name: best.m.name, loaded: best.loaded, freeInH: best.free, reason: `${best.loaded ? t('queue.hasTheMaterialLoaded') : t('queue.materialToLoad')}; ${best.free < 0.1 ? t('queue.freeNow') : t('queue.freeInH', { hours: best.free.toFixed(1) })}` };
}

/* ───────── cola global ─────────
 * Hay UNA sola cola: `print_jobs.position` es el orden global (1 = primero) de los trabajos vivos
 * (en_cola / imprimiendo / pausado). `machine_id` es solo la asignación y puede ser NULL («sin asignar»).
 * Reordenar y (des)asignar son operaciones independientes. */
const LIVE_STATUSES = ['en_cola', 'imprimiendo', 'pausado'] as const;
const isLive = () => and(inArray(s.printJobs.status, [...LIVE_STATUSES]), isNull(s.printJobs.deletedAt));
type Q = Db | Tx;

export async function createJob(spec: JobSpec): Promise<string> {
  const db = await getDb();
  let machineId = spec.machineId ?? null;
  // una máquina eliminada, simulada o que no usa la tecnología del material: el trabajo queda sin asignar y la cola le sugiere una
  if (machineId) {
    const [m] = await db.select().from(s.machines).where(eq(s.machines.id, machineId));
    const [mat] = spec.materialId ? await db.select({ tech: s.materials.tech }).from(s.materials).where(eq(s.materials.id, spec.materialId)) : [];
    if (!m || m.deletedAt || m.simulated || !techFits(mat?.tech, m.tech)) machineId = null;
  }
  const number = await nextNumber('job');
  const [mx] = await db.select({ n: sql<number>`coalesce(max(${s.printJobs.position}),0)` }).from(s.printJobs).where(isLive());
  const [job] = await db.insert(s.printJobs).values({
    workspaceId: WORKSPACE_ID, number, kind: spec.kind, title: spec.title, machineId, materialId: spec.materialId ?? null, position: Number(mx.n) + 1, qty: spec.qty ?? 1,
    estG: spec.estG, estH: spec.estH, dims: spec.dims ?? null, orderId: spec.orderId ?? null, productionOrderId: spec.productionOrderId ?? null, fileVersionId: spec.fileVersionId ?? null,
    sliceRunId: spec.sliceRunId ?? null, reprintOfId: spec.reprintOfId ?? null, notes: spec.notes ?? null, createdBy: spec.userId ?? null,
  }).returning({ id: s.printJobs.id });
  for (const oi of spec.orderItemIds ?? []) await db.insert(s.jobItems).values({ workspaceId: WORKSPACE_ID, jobId: job.id, orderItemId: oi, qty: spec.qty ?? 1 });
  await scheduleQueue();
  await audit('print_job', job.id, 'crear', { number, machineId }, spec.userId);
  return job.id;
}

export interface PlannedJob { jobId: string; machineId: string | null; start: number; end: number; /** true = la máquina no está asignada: es la que el sistema sugiere */ projected: boolean }

/**
 * Proyecta la cola completa (sin escribir nada): los trabajos en curso ocupan su máquina hasta que terminen; luego se recorre la cola
 * en orden y cada trabajo va a su máquina asignada o, si no tiene, a la que lo dejaría terminando antes
 * (cabe la pieza, tiene el material cargado y queda libre antes — mismo criterio que `suggestMachine`).
 */
export async function projectQueue(db?: Q): Promise<Map<string, PlannedJob>> {
  const q = db ?? (await getDb());
  const now = Date.now();
  const machines = await q.select().from(s.machines).where(isNull(s.machines.deletedAt));
  const byId = new Map(machines.map((m) => [m.id, m]));
  const spools = await q.select({ machineId: s.spools.machineId, materialId: s.spools.materialId }).from(s.spools).where(and(isNull(s.spools.deletedAt), gt(s.spools.remainingG, 0)));
  const loaded = new Set(spools.filter((x) => x.machineId).map((x) => `${x.machineId}|${x.materialId}`));
  const candidates = machines.filter((m) => m.status !== 'fuera_de_servicio' && !m.simulated);
  const matTech = new Map((await q.select({ id: s.materials.id, tech: s.materials.tech }).from(s.materials)).map((x) => [x.id, x.tech]));
  const rank = (st: string) => (st === 'imprimiendo' ? 0 : st === 'pausado' ? 1 : 2);
  const jobs = (await q.select().from(s.printJobs).where(isLive())).sort((a, b) => rank(a.status) - rank(b.status) || a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1));
  const free = new Map<string, number>();
  const durOf = (j: { estH: number }, m?: { timeFactor: number | null }) => j.estH * (m?.timeFactor || 1) * 3600_000;
  const out = new Map<string, PlannedJob>();
  for (const j of jobs) {
    if (j.status === 'en_cola' || !j.machineId) continue;
    const start = j.realStart ? j.realStart.getTime() : now;
    const end = Math.max(now, start + durOf(j, byId.get(j.machineId)));
    free.set(j.machineId, Math.max(free.get(j.machineId) ?? now, end));
    out.set(j.id, { jobId: j.id, machineId: j.machineId, start, end, projected: false });
  }
  for (const j of jobs) {
    if (j.status !== 'en_cola') continue;
    let machineId = j.machineId; let projected = false;
    if (!machineId) {
      let best: { id: string; score: number } | null = null;
      for (const m of candidates) {
        if (j.dims && !fitsIn(j.dims, [m.volX, m.volY, m.volZ])) continue;
        if (j.materialId && !techFits(matTech.get(j.materialId), m.tech)) continue;
        const score = ((free.get(m.id) ?? now) - now) / 3600_000 - (j.materialId && loaded.has(`${m.id}|${j.materialId}`) ? 3 : 0) + (m.status === 'mantenimiento' ? 24 : 0);
        if (!best || score < best.score) best = { id: m.id, score };
      }
      if (!best) continue;
      machineId = best.id; projected = true;
    }
    const start = free.get(machineId) ?? now; const end = start + durOf(j, byId.get(machineId));
    free.set(machineId, end);
    out.set(j.id, { jobId: j.id, machineId, start, end, projected });
  }
  return out;
}

/** Recalcula y guarda inicio y término planificados de todos los trabajos de la cola (los sin máquina, según la proyección). */
export async function scheduleQueue() {
  const db = await getDb();
  const plan = await projectQueue(db);
  const live = await db.select({ id: s.printJobs.id }).from(s.printJobs).where(isLive());
  for (const { id } of live) {
    const p = plan.get(id);
    await db.update(s.printJobs).set({ plannedStart: p ? new Date(p.start) : null, plannedEnd: p ? new Date(p.end) : null }).where(eq(s.printJobs.id, id));
  }
}

/** Coloca el trabajo justo antes de `beforeJobId` en la cola global (o al final si es null / no existe). No cambia su máquina. */
export async function reorderJob(jobId: string, beforeJobId: string | null, userId?: string | null) {
  const t = await getT();
  const db = await getDb();
  await db.transaction(async (tx) => {
    const rows = await tx.select({ id: s.printJobs.id, status: s.printJobs.status, position: s.printJobs.position }).from(s.printJobs).where(isLive()).orderBy(asc(s.printJobs.position), asc(s.printJobs.createdAt), asc(s.printJobs.id));
    const me = rows.find((r) => r.id === jobId);
    if (!me) throw new Error(t('queue.jobNotFound'));
    if (me.status === 'imprimiendo') throw new Error(t('queue.aJobInProgressCannot'));
    const rest = rows.filter((r) => r.id !== jobId);
    const at = beforeJobId ? rest.findIndex((r) => r.id === beforeJobId) : -1;
    rest.splice(at < 0 ? rest.length : at, 0, me);
    for (let i = 0; i < rest.length; i++) {
      if (rest[i].position === i + 1) continue;
      await tx.update(s.printJobs).set(rest[i].id === jobId ? { position: i + 1, updatedAt: new Date() } : { position: i + 1 }).where(eq(s.printJobs.id, rest[i].id));
    }
  });
  await scheduleQueue();
  await audit('print_job', jobId, 'reordenar', { before: beforeJobId }, userId);
}

/** Asigna el trabajo a una máquina, o lo deja sin asignar (machineId = null). No cambia su lugar en la cola. */
export async function assignJob(jobId: string, machineId: string | null, userId?: string | null) {
  const t = await getT();
  const db = await getDb();
  const [j] = await db.select().from(s.printJobs).where(eq(s.printJobs.id, jobId));
  if (!j || j.deletedAt) throw new Error(t('queue.jobNotFound'));
  if (j.status === 'imprimiendo' || j.status === 'pausado') throw new Error(t('queue.aJobInProgressCannot'));
  if (j.status !== 'en_cola') throw new Error(t('queue.theJobIsAlreadyClosed'));
  if (machineId) {
    const [m] = await db.select({ id: s.machines.id, tech: s.machines.tech }).from(s.machines).where(and(eq(s.machines.id, machineId), isNull(s.machines.deletedAt)));
    if (!m) throw new LocalizedError('machines.machineNotFound');
    const [mat] = j.materialId ? await db.select({ tech: s.materials.tech }).from(s.materials).where(eq(s.materials.id, j.materialId)) : [];
    if (!techFits(mat?.tech, m.tech)) throw new LocalizedError('queue.machineTechMismatch');
  }
  if ((j.machineId ?? null) === machineId) return;
  await db.update(s.printJobs).set({ machineId, updatedAt: new Date() }).where(eq(s.printJobs.id, jobId));
  await scheduleQueue();
  await audit('print_job', jobId, 'asignar_maquina', { from: j.machineId, to: machineId }, userId);
}

export async function pickSpool(materialId: string | null | undefined, grams: number, machineId?: string | null, db?: Db) {
  db = db ?? (await getDb());
  if (!materialId) return null;
  const [mat] = await db.select({ generic: s.materials.generic, type: s.materials.type, tech: s.materials.tech }).from(s.materials).where(eq(s.materials.id, materialId));
  // un material genérico («PLA genérico») usa el carrete de cualquier color real del mismo tipo
  const ids = mat?.generic ? (await db.select({ id: s.materials.id }).from(s.materials).where(and(eq(s.materials.type, mat.type), eq(s.materials.tech, mat.tech), eq(s.materials.generic, false), isNull(s.materials.deletedAt)))).map((x) => x.id) : [materialId];
  if (!ids.length) return null;
  const sp = await db.select().from(s.spools).where(and(inArray(s.spools.materialId, ids), isNull(s.spools.deletedAt), inArray(s.spools.status, ['nueva', 'abierta', 'en_uso'])));
  const rank = (x: typeof sp[number]) => (x.machineId && x.machineId === machineId ? 0 : x.status === 'en_uso' ? 1 : x.status === 'abierta' ? 2 : 3);
  return [...sp].sort((a, b) => rank(a) - rank(b) || a.remainingG - b.remainingG).find((x) => x.remainingG >= grams) ?? [...sp].sort((a, b) => b.remainingG - a.remainingG)[0] ?? null;
}

/** Para iniciar un trabajo sin máquina: una máquina libre ahora donde quepa la pieza (prefiere la que ya tiene el material cargado). */
async function idleMachineFor(db: Q, j: { materialId: string | null; dims: [number, number, number] | null }): Promise<string | undefined> {
  const machines = await db.select().from(s.machines).where(and(isNull(s.machines.deletedAt), ne(s.machines.status, 'fuera_de_servicio'), eq(s.machines.simulated, false)));
  const printing = new Set((await db.select({ id: s.printJobs.machineId }).from(s.printJobs).where(and(eq(s.printJobs.status, 'imprimiendo'), isNull(s.printJobs.deletedAt)))).map((r) => r.id));
  const spools = j.materialId ? await db.select({ machineId: s.spools.machineId }).from(s.spools).where(and(eq(s.spools.materialId, j.materialId), isNull(s.spools.deletedAt), gt(s.spools.remainingG, 0))) : [];
  const loaded = new Set(spools.map((x) => x.machineId));
  const [mat] = j.materialId ? await db.select({ tech: s.materials.tech }).from(s.materials).where(eq(s.materials.id, j.materialId)) : [];
  const rank = (m: { id: string; status: string }) => (loaded.has(m.id) ? 0 : 1) + (m.status === 'mantenimiento' ? 2 : 0);
  return machines.filter((m) => !printing.has(m.id) && techFits(mat?.tech, m.tech) && (!j.dims || fitsIn(j.dims, [m.volX, m.volY, m.volZ]))).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))[0]?.id;
}

/** Lo que startJob exige (el trabajo existe, tiene máquina y la máquina no imprime otro). Enviar a la impresora lo revisa antes de subir el archivo. */
export async function checkJobCanStart(jobId: string, machineId?: string | null, db?: Db) {
  const t = await getT();
  db = db ?? (await getDb());
  const [j] = await db.select().from(s.printJobs).where(eq(s.printJobs.id, jobId));
  if (!j) throw new Error(t('queue.jobNotFound'));
  if (j.status !== 'en_cola') throw new Error(t('queue.jobStatusChanged'));
  const mid = machineId ?? j.machineId ?? (await idleMachineFor(db, j));
  if (!mid) throw new Error(t('queue.assignAMachineBeforeStarting'));
  const [busy] = await db.select({ id: s.printJobs.id }).from(s.printJobs).where(and(eq(s.printJobs.machineId, mid), eq(s.printJobs.status, 'imprimiendo'), ne(s.printJobs.id, jobId))).limit(1);
  if (busy) throw new Error(t('queue.theMachineIsAlreadyPrinting'));
  return { j, machineId: mid };
}

export async function startJob(jobId: string, o: { machineId?: string; spoolId?: string; userId?: string | null } = {}) {
  const t = await getT();
  const db = await getDb();
  const { j, machineId } = await checkJobCanStart(jobId, o.machineId, db);
  const spool = o.spoolId ? (await db.select().from(s.spools).where(eq(s.spools.id, o.spoolId)))[0] : await pickSpool(j.materialId, j.estG, machineId, db);
  const now = new Date();
  // transición condicionada: dos clics (o dos pestañas) no inician el mismo trabajo dos veces
  const [claimed] = await db.update(s.printJobs).set({ status: 'imprimiendo', machineId, spoolId: spool?.id ?? null, realStart: now, updatedAt: now }).where(and(eq(s.printJobs.id, jobId), eq(s.printJobs.status, 'en_cola'))).returning({ id: s.printJobs.id });
  if (!claimed) throw new Error(t('queue.jobStatusChanged'));
  await db.update(s.machines).set({ status: 'imprimiendo', updatedAt: now }).where(eq(s.machines.id, machineId));
  if (spool) await db.update(s.spools).set({ status: 'en_uso', machineId, openedAt: spool.openedAt ?? ymd(now), updatedAt: now }).where(eq(s.spools.id, spool.id));
  if (j.productionOrderId) await db.update(s.productionOrders).set({ status: 'imprimiendo' }).where(eq(s.productionOrders.id, j.productionOrderId));
  const items = await db.select().from(s.jobItems).where(eq(s.jobItems.jobId, jobId));
  if (items.length) await db.update(s.orderItems).set({ status: 'imprimiendo' }).where(inArray(s.orderItems.id, items.map((i) => i.orderItemId!).filter(Boolean)));
  if (j.orderId) await recomputeOrderStatus(j.orderId);
  await scheduleQueue();
  await audit('print_job', jobId, 'iniciar', { machineId, spoolId: spool?.id }, o.userId);
  // solo avisa: el taller puede estar imprimiendo con material que todavía no registró
  const av = await checkAvailability(j.materialId, j.estG, db);
  if (j.materialId && (av.state === 'none' || av.state === 'short' || !spool)) {
    const [mat] = await db.select({ type: s.materials.type, color: s.materials.colorName }).from(s.materials).where(eq(s.materials.id, j.materialId));
    await notify('stock_bajo', t('queue.noStockForJobTitle', { material: `${mat?.type ?? ''} ${mat?.color ?? ''}`.trim() }), t('queue.noStockForJobBody', { job: j.number, needed: Math.round(j.estG), available: Math.round(Math.max(0, av.availableG)) }), '/inventario');
    return { warning: { state: av.state === 'ok' ? ('none' as const) : av.state, availableG: Math.max(0, av.availableG), neededG: j.estG } };
  }
  return { warning: null };
}

export interface FinishInput { result: 'exito' | 'falla_parcial' | 'falla_total'; realG?: number; realH?: number; qtyGood?: number; failCause?: string; failCode?: string; failCharge?: 'taller' | 'pedido'; reprint?: boolean; userId?: string | null; spoolId?: string }

export async function finishJob(jobId: string, o: FinishInput) {
  const t = await getT();
  const db = await getDb();
  const st = await getSettings();
  const [j] = await db.select().from(s.printJobs).where(eq(s.printJobs.id, jobId));
  if (!j) throw new Error(t('queue.jobNotFound'));
  if (j.status === 'terminado' || j.status === 'fallido') throw new Error(t('queue.theJobIsAlreadyClosed'));
  // solo se cierra un trabajo que se está imprimiendo o está en pausa (uno en cola o cancelado no consumió material)
  if (!['imprimiendo', 'pausado'].includes(j.status)) throw new Error(t('queue.jobStatusChanged'));
  const now = new Date();
  const failed = o.result !== 'exito';
  const realH = o.realH ?? (j.realStart ? Math.max(0.01, (now.getTime() - j.realStart.getTime()) / 3600_000) : j.estH);
  const factorOnFail = o.result === 'falla_total' ? 0.5 : 0.75;
  const realG = o.realG ?? (failed ? j.estG * factorOnFail : j.estG * (1 + st.rates.wastePct / 100));
  const qtyGood = o.result === 'exito' ? j.qty : o.result === 'falla_total' ? 0 : Math.max(0, Math.min(j.qty, o.qtyGood ?? Math.floor(j.qty / 2)));
  const spoolId = o.spoolId ?? j.spoolId ?? (await pickSpool(j.materialId, realG, j.machineId, db))?.id ?? null;
  // cierre condicionado antes de cualquier efecto: si otra petición ya lo cerró, no se consume material dos veces
  const [claimed] = await db.update(s.printJobs).set({
    status: failed && qtyGood === 0 ? 'fallido' : 'terminado', realEnd: now, realG, realH, qtyGood, result: o.result, failCause: o.failCause?.trim() || null, failCode: failed ? (isFailCode(o.failCode) ? o.failCode : normalizeFailCause(o.failCause) ?? (o.failCause?.trim() ? 'otro' : null)) : null,
    failCharge: o.failCharge ?? null, spoolId, updatedAt: now,
  }).where(and(eq(s.printJobs.id, jobId), inArray(s.printJobs.status, ['imprimiendo', 'pausado']))).returning({ id: s.printJobs.id });
  if (!claimed) throw new Error(t('queue.theJobIsAlreadyClosed'));
  // consumo de material
  if (spoolId) await consumeFromSpool({ spoolId, grams: realG, kind: failed ? 'falla' : 'consumo', jobId, note: t('queue.job', { job: j.number }), userId: o.userId }, db);
  else if (j.materialId && realG > 0) {
    // sin carrete no hay de dónde descontar, pero el gasto no se pierde: queda como movimiento sin carrete y un aviso para corregir el stock
    const [mat] = await db.select({ type: s.materials.type, color: s.materials.colorName }).from(s.materials).where(eq(s.materials.id, j.materialId));
    const label = `${mat?.type ?? ''} ${mat?.color ?? ''}`.trim();
    await db.insert(s.inventoryMovements).values({ workspaceId: WORKSPACE_ID, kind: failed ? 'falla' : 'consumo', spoolId: null, qty: -realG, jobId, note: t('queue.consumedWithoutSpool', { job: j.number, material: label }), createdBy: o.userId ?? null });
    await notify('stock_bajo', t('queue.noSpoolTitle', { job: j.number }), t('queue.noSpoolBody', { grams: Math.round(realG), material: label }), '/inventario');
  }
  const costPerKg = j.materialId ? await materialCostPerKg(j.materialId, db) : 0;
  const [m] = j.machineId ? await db.select().from(s.machines).where(eq(s.machines.id, j.machineId)) : [];
  const line = calcLine({ qty: Math.max(1, j.qty), gramsTotal: realG, hoursTotal: realH, costPerKg, machine: machineCostOf(m), prepMinutes: 5 }, st.rates);
  // máquina: contadores y factor de corrección de tiempo
  if (m) {
    const recent = await db.select({ e: s.printJobs.estH, r: s.printJobs.realH }).from(s.printJobs).where(and(eq(s.printJobs.machineId, m.id), eq(s.printJobs.result, 'exito'))).orderBy(desc(s.printJobs.realEnd)).limit(20);
    const ratios = recent.filter((x) => x.e > 0 && x.r && x.r > 0).map((x) => x.r! / x.e).sort((a, b) => a - b);
    const factor = ratios.length >= 3 ? ratios[Math.floor(ratios.length / 2)] : m.timeFactor;
    await db.update(s.machines).set({
      status: 'disponible', hoursTotal: sql`${s.machines.hoursTotal} + ${realH}`, jobsOk: sql`${s.machines.jobsOk} + ${failed ? 0 : 1}`, jobsFailed: sql`${s.machines.jobsFailed} + ${failed ? 1 : 0}`, timeFactor: factor, updatedAt: now,
    }).where(eq(s.machines.id, m.id));
    await checkMaintenance(m.id);
  }
  await scheduleQueue();
  // costo real al pedido (incluye fallas)
  if (j.orderId) {
    await db.update(s.orders).set({ costReal: sql`coalesce(${s.orders.costReal}, 0) + ${line.cost}`, updatedAt: now }).where(eq(s.orders.id, j.orderId));
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
        await db.update(s.productVariants).set({ stock: sql`${s.productVariants.stock} + ${qtyGood}`, avgCost: avg, updatedAt: now }).where(eq(s.productVariants.id, v.id));
        await db.insert(s.stockMovements).values({ workspaceId: WORKSPACE_ID, variantId: v.id, kind: 'produccion', qty: qtyGood, unitCost, productionOrderId: po.id, reason: t('queue.job', { job: j.number }), createdBy: o.userId ?? null });
      }
      if (v && j.qty - qtyGood > 0) await db.insert(s.stockMovements).values({ workspaceId: WORKSPACE_ID, variantId: v.id, kind: 'merma', qty: 0, reason: t('queue.failureNote', { n: j.qty - qtyGood, job: j.number }) + (o.failCause ? ': ' + o.failCause : ''), productionOrderId: po.id, createdBy: o.userId ?? null });
      await db.update(s.productionOrders).set({ qtyGood: sql`${s.productionOrders.qtyGood} + ${qtyGood}`, qtyFailed: sql`${s.productionOrders.qtyFailed} + ${j.qty - qtyGood}`, status: o.reprint !== false && failed ? 'en_cola' : 'terminada', updatedAt: now }).where(eq(s.productionOrders.id, po.id));
    }
  }
  // líneas del pedido
  const items = await db.select().from(s.jobItems).where(eq(s.jobItems.jobId, jobId));
  const oiIds = items.map((i) => i.orderItemId).filter(Boolean) as string[];
  if (!failed || o.reprint !== false) { if (oiIds.length) await db.update(s.orderItems).set({ status: failed ? 'en_cola' : 'post_proceso' }).where(inArray(s.orderItems.id, oiIds)); }
  else await settleOrderLines(oiIds);
  // reimpresión
  let reprintId: string | null = null;
  if (failed && o.reprint !== false) {
    reprintId = await createJob({
      kind: j.kind as any, title: t('queue.reprint2', { job: j.title }), materialId: j.materialId, qty: Math.max(1, j.qty - qtyGood), estG: j.estG * (Math.max(1, j.qty - qtyGood) / Math.max(1, j.qty)), estH: j.estH * (Math.max(1, j.qty - qtyGood) / Math.max(1, j.qty)),
      orderId: j.orderId, orderItemIds: oiIds, productionOrderId: j.productionOrderId, machineId: j.machineId, dims: j.dims, reprintOfId: jobId, notes: t('queue.reprintOf', { job: j.number }), userId: o.userId,
    });
    await notify('trabajo_fallido', t('queue.failedJob', { job: j.number }), o.failCause ?? t('queue.noCauseGiven'), '/cola');
  } else await notify('trabajo_terminado', t('queue.finishedJob', { job: j.number }), j.title ?? '', '/cola');
  if (j.orderId) await recomputeOrderStatus(j.orderId);
  if (failed) await import('../slicer/performance').then((m) => m.checkProfileDegradation(jobId)).catch(() => {});
  await audit('print_job', jobId, 'finalizar', { result: o.result, realG, realH, qtyGood, reprintId }, o.userId);
  return { reprintId, realG, realH, qtyGood, cost: line.cost };
}

export async function pauseJob(jobId: string) {
  const db = await getDb();
  const [j] = await db.update(s.printJobs).set({ status: 'pausado' }).where(and(eq(s.printJobs.id, jobId), eq(s.printJobs.status, 'imprimiendo'))).returning();
  if (!j) return;
  if (j.machineId) await db.update(s.machines).set({ status: 'pausada' }).where(eq(s.machines.id, j.machineId));
}
export async function resumeJob(jobId: string) {
  const db = await getDb();
  const [j] = await db.update(s.printJobs).set({ status: 'imprimiendo' }).where(and(eq(s.printJobs.id, jobId), eq(s.printJobs.status, 'pausado'))).returning();
  if (!j) return;
  if (j.machineId) await db.update(s.machines).set({ status: 'imprimiendo' }).where(eq(s.machines.id, j.machineId));
}
export async function cancelJob(jobId: string, userId?: string | null) {
  const db = await getDb();
  const [j] = await db.select().from(s.printJobs).where(eq(s.printJobs.id, jobId));
  if (!j || ['terminado', 'fallido', 'cancelado'].includes(j.status)) return;
  const [claimed] = await db.update(s.printJobs).set({ status: 'cancelado', updatedAt: new Date() }).where(and(eq(s.printJobs.id, jobId), eq(s.printJobs.status, j.status))).returning({ id: s.printJobs.id });
  if (!claimed) return;
  if (j.machineId) { if (j.status === 'imprimiendo' || j.status === 'pausado') await db.update(s.machines).set({ status: 'disponible' }).where(eq(s.machines.id, j.machineId)); }
  await scheduleQueue();
  if (j.productionOrderId) await db.update(s.productionOrders).set({ status: 'cancelada' }).where(eq(s.productionOrders.id, j.productionOrderId));
  if (j.orderId) {
    const its = await db.select().from(s.jobItems).where(eq(s.jobItems.jobId, jobId));
    await settleOrderLines(its.map((i) => i.orderItemId).filter(Boolean) as string[]);
    await recomputeOrderStatus(j.orderId);
  }
  await audit('print_job', jobId, 'cancelar', {}, userId);
}

/** Vuelve a lanzar un trabajo cancelado: crea uno nuevo igual, al final de la cola (sin máquina asignada si no la tenía). */
export async function requeueJob(jobId: string, userId?: string | null): Promise<string> {
  const t = await getT();
  const db = await getDb();
  const [j] = await db.select().from(s.printJobs).where(eq(s.printJobs.id, jobId));
  if (!j || j.deletedAt) throw new Error(t('queue.jobNotFound'));
  if (j.status !== 'cancelado') throw new Error(t('queue.onlyCancelledJobsCanBeRequeued'));
  if (j.orderId) {
    const [o] = await db.select({ status: s.orders.status }).from(s.orders).where(eq(s.orders.id, j.orderId));
    if (o && ['cancelado', 'entregado'].includes(o.status)) throw new Error(t('orders.theOrderIsAlreadyClosed'));
  }
  const lines = (await db.select({ id: s.jobItems.orderItemId }).from(s.jobItems).where(eq(s.jobItems.jobId, jobId))).map((x) => x.id!).filter(Boolean);
  if (lines.length) { // no duplicar: si alguna de sus líneas ya tiene otro trabajo en cola, en curso o terminado, no se relanza
    const [dup] = await db.select({ id: s.printJobs.id }).from(s.jobItems).innerJoin(s.printJobs, eq(s.printJobs.id, s.jobItems.jobId))
      .where(and(inArray(s.jobItems.orderItemId, lines), ne(s.printJobs.id, jobId), isNull(s.printJobs.deletedAt), inArray(s.printJobs.status, [...LIVE_STATUSES, 'terminado']))).limit(1);
    if (dup) throw new Error(t('queue.itemsAlreadyHaveAnActiveJob'));
  }
  // las líneas (pendiente → en_cola) o la orden de producción (cancelada → en_cola) se reclaman antes de crear el trabajo:
  // dos «Relanzar» simultáneos (o «Relanzar» y «Lanzar línea») no crean dos trabajos para lo mismo
  const mine = lines.length ? (await db.update(s.orderItems).set({ status: 'en_cola' }).where(and(inArray(s.orderItems.id, lines), eq(s.orderItems.status, 'pendiente'))).returning({ id: s.orderItems.id })).map((x) => x.id) : [];
  const release = async () => { if (mine.length) await db.update(s.orderItems).set({ status: 'pendiente' }).where(and(inArray(s.orderItems.id, mine), eq(s.orderItems.status, 'en_cola'))); };
  if (mine.length < lines.length) { await release(); throw new Error(t('queue.itemsAlreadyHaveAnActiveJob')); }
  if (j.productionOrderId) {
    const [po] = await db.update(s.productionOrders).set({ status: 'en_cola' }).where(and(eq(s.productionOrders.id, j.productionOrderId), eq(s.productionOrders.status, 'cancelada'))).returning({ id: s.productionOrders.id });
    if (!po && !lines.length) throw new Error(t('queue.jobStatusChanged'));
  }
  let id: string;
  try {
    id = await createJob({
      kind: j.kind as JobSpec['kind'], title: j.title ?? '', materialId: j.materialId, qty: j.qty, estG: j.estG, estH: j.estH, dims: j.dims, orderId: j.orderId, orderItemIds: lines,
      productionOrderId: j.productionOrderId, machineId: j.machineId, fileVersionId: j.fileVersionId, sliceRunId: j.sliceRunId, reprintOfId: j.reprintOfId, notes: t('queue.requeuedFrom', { job: j.number }), userId,
    });
  } catch (e) {
    await release();
    if (j.productionOrderId) await db.update(s.productionOrders).set({ status: 'cancelada' }).where(and(eq(s.productionOrders.id, j.productionOrderId), eq(s.productionOrders.status, 'en_cola')));
    throw e;
  }
  if (j.orderId) await recomputeOrderStatus(j.orderId);
  await audit('print_job', id, 'relanzar', { from: jobId }, userId);
  return id;
}

/**
 * Estado de las líneas cuando su trabajo se cierra sin reimpresión (cancelado o fallido): con otro trabajo abierto no cambian;
 * con un trabajo terminado (piezas buenas de una falla parcial) pasan a post-proceso; si no, vuelven a «pendiente» para planificarlas otra vez.
 */
async function settleOrderLines(oiIds: string[]) {
  const db = await getDb();
  for (const id of oiIds) {
    const jobs = await db.select({ status: s.printJobs.status }).from(s.jobItems).innerJoin(s.printJobs, eq(s.printJobs.id, s.jobItems.jobId)).where(and(eq(s.jobItems.orderItemId, id), isNull(s.printJobs.deletedAt)));
    if (jobs.some((x) => (LIVE_STATUSES as readonly string[]).includes(x.status))) continue;
    await db.update(s.orderItems).set({ status: jobs.some((x) => x.status === 'terminado') ? 'post_proceso' : 'pendiente' }).where(eq(s.orderItems.id, id));
  }
}

/** Alerta de mantenimiento por horas o por días. */
export async function checkMaintenance(machineId: string) {
  const t = await getT();
  const db = await getDb();
  const [m] = await db.select().from(s.machines).where(eq(s.machines.id, machineId));
  const plans = await db.select().from(s.maintenancePlans).where(and(eq(s.maintenancePlans.machineId, machineId), isNull(s.maintenancePlans.deletedAt)));
  for (const p of plans) {
    const dueH = p.intervalHours != null && m.hoursTotal - p.lastDoneHours >= p.intervalHours;
    const dueD = p.intervalDays != null && p.lastDoneAt && (Date.now() - new Date(p.lastDoneAt).getTime()) / 86400_000 >= p.intervalDays;
    if (dueH || dueD) {
      const title = t('queue.maintenanceOverdue', { task: p.task, machine: m.name });
      const [ex] = await db.select({ id: s.notifications.id }).from(s.notifications).where(and(eq(s.notifications.kind, 'mantenimiento'), eq(s.notifications.title, title), eq(s.notifications.read, false))).limit(1);
      if (!ex) await notify('mantenimiento', title, dueH ? t('queue.hHavePassedSinceThe', { hours: (m.hoursTotal - p.lastDoneHours).toFixed(0) }) : t('queue.theDeadlineInDaysHas'), `/maquinas/${m.id}`);
    }
  }
}

export interface MaintDue { planId: string; task: string; machineId: string; dueBy: 'horas' | 'días'; over: number }
export async function maintenanceDue(): Promise<MaintDue[]> {
  const t = await getT();
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
  const t = await getT();
  const db = await getDb();
  const [p] = await db.select().from(s.maintenancePlans).where(eq(s.maintenancePlans.id, o.planId));
  if (!p) throw new Error(t('queue.planNotFound'));
  const [m] = await db.select().from(s.machines).where(eq(s.machines.id, p.machineId));
  const today = ymd();
  const { moveItem } = await import('./inventory');
  for (const part of o.parts ?? []) await moveItem({ itemId: part.itemId, qty: part.qty, kind: 'consumo', note: t('queue.maintenance', { task: p.task, machine: m.name }), userId: o.userId });
  await db.insert(s.maintenanceLogs).values({ workspaceId: WORKSPACE_ID, machineId: m.id, planId: p.id, task: p.task, doneAt: today, atHours: m.hoursTotal, cost: o.cost ?? 0, downtimeH: o.downtimeH ?? 0, parts: o.parts ?? [], notes: o.notes ?? null, createdBy: o.userId ?? null });
  await db.update(s.maintenancePlans).set({ lastDoneHours: m.hoursTotal, lastDoneAt: today }).where(eq(s.maintenancePlans.id, p.id));
  // el aviso "vencida" de este ciclo queda leído: si no, su copia sin leer bloquea el aviso del ciclo siguiente (el título depende del idioma)
  await db.update(s.notifications).set({ read: true }).where(and(eq(s.notifications.kind, 'mantenimiento'), eq(s.notifications.read, false), inArray(s.notifications.title, LOCALES.map((l) => createT(l)('queue.maintenanceOverdue', { task: p.task, machine: m.name })))));
  await audit('machine', m.id, 'mantenimiento', { task: p.task }, o.userId);
}

/* ───────── eliminar máquina ───────── */
const ACTIVE_JOB_STATUSES = ['en_cola', 'imprimiendo', 'pausado'] as const;

/** Qué impide eliminar una máquina, y si tiene una impresora vinculada (se desconecta sola al eliminar). */
export async function machineDeleteInfo(machineId: string) {
  const db = await getDb();
  const activeJobs = await db.select({ id: s.printJobs.id }).from(s.printJobs).where(and(eq(s.printJobs.machineId, machineId), inArray(s.printJobs.status, [...ACTIVE_JOB_STATUSES])));
  const [link] = await db.select({ id: s.printerLinks.id, mode: s.printerLinks.mode, serial: s.printerLinks.serial }).from(s.printerLinks).where(and(eq(s.printerLinks.machineId, machineId), isNull(s.printerLinks.deletedAt)));
  return { canDelete: activeJobs.length === 0, activeJobCount: activeJobs.length, link: link ?? null };
}

/**
 * Elimina (soft-delete) una máquina registrada manualmente o conectada (LAN/Bambu Cloud).
 * - Si tiene una impresora vinculada, la desconecta primero (reutiliza removePrinter; no toca su historial ni la cuenta Bambu Cloud).
 * - Bloquea el borrado si hay trabajos activos en la cola para no perder una impresión en curso.
 * - El historial (trabajos terminados, mantenciones, incidencias) se conserva; solo se oculta la máquina de las listas.
 */
export async function removeMachine(machineId: string, userId?: string | null) {
  const db = await getDb();
  const [m] = await db.select().from(s.machines).where(eq(s.machines.id, machineId));
  if (!m) throw new LocalizedError('machines.machineNotFound');
  const info = await machineDeleteInfo(machineId);
  if (!info.canDelete) throw new LocalizedError('machines.deleteHasJobs', { count: info.activeJobCount });
  if (info.link) { const { removePrinter } = await import('./printers'); await removePrinter(info.link.id, userId); }
  await db.update(s.machines).set({ deletedAt: new Date(), connection: {} }).where(eq(s.machines.id, machineId));
  await audit('machine', machineId, 'eliminar', { name: m.name, hadPrinterLink: !!info.link }, userId);
}

/* ───────── producción para stock ───────── */
export async function createProductionOrder(o: { variantId: string; qty: number; origin?: 'manual' | 'reposicion'; machineId?: string | null; userId?: string | null }) {
  const t = await getT();
  const db = await getDb();
  const [v] = await db.select().from(s.productVariants).where(eq(s.productVariants.id, o.variantId));
  if (!v) throw new Error(t('queue.variantNotFound'));
  const [p] = await db.select().from(s.products).where(eq(s.products.id, v.productId));
  const number = await nextNumber('production');
  const [po] = await db.insert(s.productionOrders).values({ workspaceId: WORKSPACE_ID, number, variantId: o.variantId, qty: o.qty, status: 'en_cola', origin: o.origin ?? 'manual', createdBy: o.userId ?? null }).returning();
  const [mf] = p?.modelFileId ? await db.select().from(s.modelFiles).where(eq(s.modelFiles.id, p.modelFileId)) : [];
  const dims = mf?.dimX ? ([mf.dimX, mf.dimY!, mf.dimZ!] as [number, number, number]) : null;
  const jobId = await createJob({
    kind: 'stock', title: `${p?.name ?? t('queue.product')} ${Object.values(v.attrs ?? {}).join(' ')} ×${o.qty}`.trim(), materialId: v.materialId, qty: o.qty,
    estG: v.weightG * o.qty, estH: v.printH * o.qty, productionOrderId: po.id, machineId: o.machineId, dims, userId: o.userId,
  });
  return { productionOrderId: po.id, jobId, number };
}
