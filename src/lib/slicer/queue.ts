import { runsQueues } from '../worker-mode';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import { and, eq, inArray, asc, desc, isNotNull, lt, sql } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { config } from '../config';
import { absPath, newKey, putFile, remove } from '../storage';
import { buildCliProfile } from './catalog';
import { resolveFilament } from './resolve';
import { cleanup, engineVersion, runOrca } from './run';
import { extOf } from '../mesh/parse';
import { getT } from '@/i18n/server';

/**
 * Cola de laminado respaldada por la base de datos (tabla slice_runs) con un worker dentro del proceso.
 * Límite de concurrencia (ORCA_CONCURRENCY) y de tiempo por trabajo (ORCA_TIMEOUT_S).
 * Para escalar, el mismo código puede correr en varios procesos: cada uno toma trabajos con `FOR UPDATE SKIP LOCKED` en Postgres.
 */
const g = globalThis as unknown as { __sliceWorker?: { running: number; timer?: NodeJS.Timeout }; __sliceAbort?: Map<string, AbortController> };
const aborts = () => (g.__sliceAbort ??= new Map());

const EXTRA_COLOURS = ['#00AA00', '#E02020', '#2060E0', '#F0C020', '#A020C0', '#20C0C0'];
export type Overrides = { machine?: Record<string, any>; process?: Record<string, any>; filament?: Record<string, any> };
const cleanOverrides = (o?: Overrides): Overrides => { const out: Overrides = {}; for (const k of ['machine', 'process', 'filament'] as const) if (o?.[k] && Object.keys(o[k]!).length) out[k] = o[k]; return out; };

export interface EnqueueInput {
  fileVersionId: string; machineProfileId: string; processProfileId: string;
  /** Perfil de filamento explícito; si falta se resuelve desde `materialId` (ver resolveFilament). */
  filamentProfileId?: string | null; materialId?: string | null;
  /** Ajustes de sesión sobre los perfiles (no crean perfiles; forman parte de la clave de caché). */
  overrides?: Overrides;
  /** Orientar la pieza automáticamente (--orient de OrcaSlicer) antes de acomodar. */
  orient?: boolean;
  /** Material (o perfil) de los extrusores 2…n de un proyecto multicolor. */
  extra?: Array<{ materialId?: string | null; filamentProfileId?: string | null }>;
  copies?: number; label?: string; groupId?: string; userId?: string; force?: boolean;
}

async function loadProfiles(db: Awaited<ReturnType<typeof getDb>>, ids: string[]) {
  const rows = await db.select().from(s.slicerProfiles).where(inArray(s.slicerProfiles.id, ids));
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}

export async function enqueueSlice(input: EnqueueInput): Promise<string> {
  const t = await getT();
  const db = await getDb();
  const i = { ...input, filamentProfileId: (await resolveFilament({ materialId: input.materialId, explicitProfileId: input.filamentProfileId, machineProfileId: input.machineProfileId, userId: input.userId }, db)).profileId };
  const extraIds: string[] = [];
  for (const e of input.extra ?? []) extraIds.push((await resolveFilament({ materialId: e.materialId, explicitProfileId: e.filamentProfileId, machineProfileId: input.machineProfileId, userId: input.userId }, db)).profileId);
  const copies = Math.max(1, Math.min(200, i.copies ?? 1));
  const [fv] = await db.select().from(s.fileVersions).where(eq(s.fileVersions.id, i.fileVersionId));
  if (!fv) throw new Error(t('slicer.fileNotFound'));
  const P = await loadProfiles(db, [i.machineProfileId, i.processProfileId, i.filamentProfileId, ...extraIds]);
  const m = P[i.machineProfileId], p = P[i.processProfileId], f = P[i.filamentProfileId];
  if (!m || !p || !f) throw new Error(t('slicer.machineProcessOrFilamentProfiles'));
  const engine = await engineVersion();
  const overrides = cleanOverrides(i.overrides);
  const cacheKey = crypto.createHash('sha256').update(JSON.stringify([fv.sha256 ?? fv.id, engine, copies,
    [m, p, f].map((x) => [x.id, x.version, x.baseName, x.changes]), sortKeys(overrides), ...(i.orient ? ['orient'] : []), ...(extraIds.length ? [extraIds.map((id) => [id, P[id]?.version, P[id]?.changes])] : [])])).digest('hex');
  const profileVersions = { machine: [m.name, m.version], process: [p.name, p.version], filament: [f.name, f.version] };
  if (!i.force) {
    const [hit] = await db.select().from(s.sliceRuns).where(and(eq(s.sliceRuns.cacheKey, cacheKey), eq(s.sliceRuns.status, 'done'))).limit(1);
    if (hit) {
      const [row] = await db.insert(s.sliceRuns).values({
        workspaceId: WORKSPACE_ID, fileVersionId: i.fileVersionId, machineProfileId: i.machineProfileId, processProfileId: i.processProfileId,
        filamentProfileId: i.filamentProfileId, profileVersions, cacheKey, copies, inputs: { overrides, ...(i.orient ? { orient: true } : {}), ...(extraIds.length ? { extraFilaments: extraIds } : {}) }, engineVersion: hit.engineVersion, status: 'done', timeS: hit.timeS,
        filament: hit.filament, layers: hit.layers, plates: hit.plates, durationMs: 0, gcodeKey: hit.gcodeKey, threemfKey: hit.threemfKey,
        label: i.label, groupId: i.groupId, createdBy: i.userId ?? null, result: { ...(hit.result ?? {}), cached: true },
      }).returning({ id: s.sliceRuns.id });
      return row.id;
    }
  }
  const [row] = await db.insert(s.sliceRuns).values({
    workspaceId: WORKSPACE_ID, fileVersionId: i.fileVersionId, machineProfileId: i.machineProfileId, processProfileId: i.processProfileId,
    filamentProfileId: i.filamentProfileId, profileVersions, cacheKey, copies, inputs: { overrides, ...(i.orient ? { orient: true } : {}), ...(extraIds.length ? { extraFilaments: extraIds } : {}) }, engineVersion: engine, status: 'queued', label: i.label, groupId: i.groupId,
    createdBy: i.userId ?? null,
  }).returning({ id: s.sliceRuns.id });
  ensureWorker();
  return row.id;
}

/** Las escrituras finales solo valen si el laminado sigue "running": una cancelación (de otro proceso) no se pisa. */
const stillRunning = (runId: string) => and(eq(s.sliceRuns.id, runId), eq(s.sliceRuns.status, 'running'));

async function execute(runId: string) {
  const t = await getT();
  const db = await getDb();
  const [run] = await db.select().from(s.sliceRuns).where(eq(s.sliceRuns.id, runId));
  if (!run) return;
  let tmpDir: string | null = null;
  try {
    const [fv] = await db.select().from(s.fileVersions).where(eq(s.fileVersions.id, run.fileVersionId));
    const extraIds: string[] = ((run.inputs as any)?.extraFilaments ?? []) as string[];
    const P = await loadProfiles(db, [run.machineProfileId!, run.processProfileId!, run.filamentProfileId!, ...extraIds]);
    const m = P[run.machineProfileId!], p = P[run.processProfileId!], f = P[run.filamentProfileId!];
    if (!fv || !m || !p || !f) throw new Error(t('slicer.incompleteDataForSlicing'));
    const ov = cleanOverrides(run.inputs?.overrides);
    const machine = buildCliProfile('machine', { name: m.name, vendor: m.vendor ?? undefined, baseName: m.baseName, changes: { ...m.changes, ...ov.machine } });
    const proc = buildCliProfile('process', { name: p.name, vendor: p.vendor ?? undefined, baseName: p.baseName, changes: { ...p.changes, ...ov.process }, machineName: m.name });
    const fil = buildCliProfile('filament', { name: f.name, vendor: f.vendor ?? undefined, baseName: f.baseName, changes: { ...f.changes, ...ov.filament }, machineName: m.name });
    // el filamento debe ser compatible con el tipo de placa: se elige una placa en la que el filamento tenga temperatura de cama
    if (!proc.curr_bed_type && !p.changes?.curr_bed_type && !m.changes?.curr_bed_type) {
      const temp = (k: string) => Number(Array.isArray(fil[k]) ? fil[k][0] : fil[k] ?? 0);
      const bed = temp('textured_plate_temp') > 0 ? 'Textured PEI Plate' : temp('hot_plate_temp') > 0 ? 'Smooth PEI Plate / High Temp Plate' : temp('cool_plate_temp') > 0 ? 'Cool Plate' : temp('eng_plate_temp') > 0 ? 'Engineering Plate' : null;
      if (bed) proc.curr_bed_type = bed;
    }
    const ctl = new AbortController(); aborts().set(runId, ctl);
    const r = await runOrca({ inputPath: absPath(await (await import('../library/content')).ensureVersionLocal(fv.id)), ext: extOf(fv.storageKey) || fv.format, machine, process: proc, filament: fil, copies: run.copies, orient: !!(run.inputs as any)?.orient, signal: ctl.signal,
      // OrcaSlicer falla (-100) si dos filamentos cargados no se distinguen por color: cada extrusor extra recibe uno distinto
      extraFilaments: extraIds.filter((id) => P[id]).map((id, k) => buildCliProfile('filament', { name: P[id].name, vendor: P[id].vendor ?? undefined, baseName: P[id].baseName, changes: { filament_colour: [EXTRA_COLOURS[k % EXTRA_COLOURS.length]], ...P[id].changes }, machineName: m.name })),
      onProgress: (() => { let last = 0; let lastPct = -1; return (p: { pct: number; message: string }) => {
        const now = Date.now(); if (p.pct === lastPct || now - last < 700) return; last = now; lastPct = p.pct;
        void db.update(s.sliceRuns).set({ result: { progress: p } }).where(and(eq(s.sliceRuns.id, runId), eq(s.sliceRuns.status, 'running'))).catch(() => {});
      }; })() });
    tmpDir = r.tmpDir;
    if (r.errorCode === 'cancelled') { await db.update(s.sliceRuns).set({ status: 'cancelado', error: null, result: { errorCode: 'cancelled' }, durationMs: r.durationMs, updatedAt: new Date() }).where(eq(s.sliceRuns.id, runId)); return; }
    if (!r.ok) {
      await db.update(s.sliceRuns).set({ status: 'error', error: r.error, result: { errorCode: r.errorCode ?? 'other', ...(r.logTail ? { log: r.logTail } : {}) }, durationMs: r.durationMs, engineVersion: r.engine, updatedAt: new Date() }).where(stillRunning(runId));
      return;
    }
    // sumar todas las placas (si las copias no caben en una)
    let timeS = 0; const fil2: Record<number, { g: number; mm: number; cm3: number }> = {}; let layers = 0;
    for (const pl of r.plates) {
      timeS += pl.meta.timeS ?? 0; layers = Math.max(layers, pl.meta.layers ?? 0);
      pl.meta.filaments.forEach((x, idx) => { const e = (fil2[idx] ??= { g: 0, mm: 0, cm3: 0 }); e.g += x.g ?? 0; e.mm += x.mm ?? 0; e.cm3 += x.cm3 ?? 0; });
    }
    const gcodeKeys: string[] = [];
    for (const pl of r.plates) gcodeKeys.push(await putFile(newKey('gcode', 'gcode'), pl.gcodePath, false));
    const threemfKey = r.threemfPath ? await putFile(newKey('gcode', '3mf'), r.threemfPath, false) : null;
    const done = await db.update(s.sliceRuns).set({
      status: 'done', timeS, filament: Object.values(fil2).map((x) => ({ g: +x.g.toFixed(2), mm: +x.mm.toFixed(1), cm3: +x.cm3.toFixed(2) })),
      layers, plates: r.plates.length, durationMs: r.durationMs, engineVersion: r.engine, gcodeKey: gcodeKeys[0], threemfKey,
      result: { gcodeKeys, slicer: r.plates[0].meta.slicer, platesInfo: r.plates.map((pl) => ({ index: pl.index, timeS: pl.meta.timeS, layers: pl.meta.layers, filament: pl.meta.filaments.map((f) => ({ g: f.g ?? 0, mm: f.mm ?? 0 })) })) }, error: null, updatedAt: new Date(),
    }).where(stillRunning(runId)).returning({ id: s.sliceRuns.id });
    // cancelado mientras se guardaban los archivos: nadie los referencia, se borran
    if (!done.length) for (const k of [...gcodeKeys, threemfKey]) if (k) await remove(k).catch(() => {});
  } catch (e) {
    await db.update(s.sliceRuns).set({ status: 'error', error: (e as Error).message, result: { errorCode: 'other' }, updatedAt: new Date() }).where(stillRunning(runId));
  } finally {
    aborts().delete(runId);
    if (tmpDir && !process.env.MF_KEEP_TMP) await cleanup(tmpDir).catch(() => {});
  }
}

async function tick() {
  const w = g.__sliceWorker!;
  const db = await getDb();
  // cancelaciones hechas desde otro proceso (la web con MF_EXTERNAL_WORKER=1) o antes de registrar el AbortController: matar OrcaSlicer aquí
  if (aborts().size) for (const r of await db.select({ id: s.sliceRuns.id }).from(s.sliceRuns).where(and(inArray(s.sliceRuns.id, [...aborts().keys()]), eq(s.sliceRuns.status, 'cancelado')))) aborts().get(r.id)?.abort();
  if (w.running >= config.orcaConcurrency) return;
  const free = config.orcaConcurrency - w.running;
  const rows = await db.select({ id: s.sliceRuns.id }).from(s.sliceRuns).where(eq(s.sliceRuns.status, 'queued')).orderBy(asc(s.sliceRuns.createdAt)).limit(free);
  for (const r of rows) {
    // reclamar atómicamente
    const upd = await db.update(s.sliceRuns).set({ status: 'running', updatedAt: new Date() }).where(and(eq(s.sliceRuns.id, r.id), eq(s.sliceRuns.status, 'queued'))).returning({ id: s.sliceRuns.id });
    if (!upd.length) continue;
    w.running++;
    execute(r.id).catch(() => {}).finally(() => { w.running--; });
  }
}

export function ensureWorker() {
  if (!runsQueues() || g.__sliceWorker?.timer) return;
  g.__sliceWorker = { running: 0 };
  getDb().then(async (db) => {
    await (await import('../settings')).getSettingsRaw().catch(() => {}); // zona horaria del taller antes de que las colas usen ymd() (vencimientos, numeración)
    // trabajos que quedaron "running" por un reinicio vuelven a la cola
    await db.update(s.sliceRuns).set({ status: 'queued' }).where(eq(s.sliceRuns.status, 'running'));
    // análisis de archivos interrumpidos por el reinicio
    const { recoverPendingVersions } = await import('../files'); await recoverPendingVersions().catch(() => {});
    (await import('../jobs')).ensureJobWorker();
  }).catch(() => {});
  const tt = setInterval(() => { tick().catch(() => {}); }, 800);
  tt.unref?.();
  g.__sliceWorker.timer = tt;
  // limpieza diaria de G-code/3MF viejos (la primera, un minuto después de arrancar)
  setTimeout(() => { void gcSliceOutputs().catch(() => {}); setInterval(() => { void gcSliceOutputs().catch(() => {}); }, 86400_000).unref?.(); }, 60_000).unref?.();
}

const keysOf = (r: { gcodeKey: string | null; threemfKey: string | null; result: any }) => [r.gcodeKey, r.threemfKey, ...((r.result?.gcodeKeys as string[] | undefined) ?? [])].filter((k): k is string => !!k);

/** Borra los laminados terminados de más de `days` días que nada usa (línea de presupuesto o pedido, trabajo de cola, envío a impresora, propuesta abierta de la IA) y sus archivos.
 *  Un archivo que otra corrida comparte (los aciertos de caché copian las claves) se conserva.
 *  ponytail: lee todas las corridas con archivos en memoria; paginar si llegan a ser cientos de miles. */
export async function gcSliceOutputs(days = 30) {
  const db = await getDb();
  const old = await db.select({ id: s.sliceRuns.id }).from(s.sliceRuns).where(and(eq(s.sliceRuns.status, 'done'), lt(s.sliceRuns.createdAt, new Date(Date.now() - days * 86400_000))));
  if (!old.length) return 0;
  const used = new Set<string>();
  for (const tb of [s.quoteItems, s.orderItems, s.printJobs]) for (const r of await db.select({ id: tb.sliceRunId }).from(tb).where(isNotNull(tb.sliceRunId))) used.add(r.id!);
  for (const r of await db.select({ c: s.activityLog.changes }).from(s.activityLog).where(eq(s.activityLog.action, 'enviar_impresion'))) if ((r.c as any)?.runId) used.add((r.c as any).runId);
  // propuestas de la IA aún abiertas: sus laminados base y candidatos se vuelven a evaluar sin relaminar
  for (const r of await db.select({ p: s.aiSuggestions.proposal }).from(s.aiSuggestions).where(eq(s.aiSuggestions.status, 'proposed'))) for (const id of [r.p?.baselineRunId, ...((r.p?.candidates as any[] | undefined) ?? []).map((c) => c?.runId)]) if (id) used.add(id);
  const gone = new Set(old.map((r) => r.id).filter((id) => !used.has(id)));
  if (!gone.size) return 0;
  const withFiles = await db.select({ id: s.sliceRuns.id, gcodeKey: s.sliceRuns.gcodeKey, threemfKey: s.sliceRuns.threemfKey, result: s.sliceRuns.result }).from(s.sliceRuns).where(isNotNull(s.sliceRuns.gcodeKey));
  const keep = new Set(withFiles.filter((r) => !gone.has(r.id)).flatMap(keysOf));
  const ids = [...gone];
  await db.delete(s.sliceRuns).where(inArray(s.sliceRuns.id, ids));
  for (const r of withFiles) if (gone.has(r.id)) for (const k of keysOf(r)) if (!keep.has(k)) await remove(k).catch(() => {});
  return ids.length;
}

export async function waitForRuns(ids: string[], timeoutMs = 120_000) {
  const db = await getDb(); const t0 = Date.now();
  for (;;) {
    const rows = await db.select().from(s.sliceRuns).where(inArray(s.sliceRuns.id, ids));
    if (rows.every((r) => ['done', 'error', 'cancelado'].includes(r.status))) return rows;
    if (Date.now() - t0 > timeoutMs) return rows;
    await new Promise((r) => setTimeout(r, 400));
  }
}

const sortKeys = (v: any): any => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);

/** Cancela un laminado: lo marca en la base (en cola o corriendo). Si corre en este proceso mata OrcaSlicer ya; si corre en el worker, su tick lo mata. */
export async function cancelRun(runId: string): Promise<'cancelado' | 'noop'> {
  const db = await getDb();
  const done = await db.update(s.sliceRuns).set({ status: 'cancelado', updatedAt: new Date() }).where(and(eq(s.sliceRuns.id, runId), inArray(s.sliceRuns.status, ['queued', 'running']))).returning({ id: s.sliceRuns.id });
  aborts().get(runId)?.abort();
  return done.length ? 'cancelado' : 'noop';
}
