import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import { and, eq, inArray, asc, desc, sql } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { config } from '../config';
import { absPath, newKey, putFile } from '../storage';
import { buildCliProfile } from './catalog';
import { cleanup, engineVersion, runOrca } from './run';
import { extOf } from '../mesh/parse';
import { getT } from '@/i18n/server';

/**
 * Cola de laminado respaldada por la base de datos (tabla slice_runs) con un worker dentro del proceso.
 * Límite de concurrencia (ORCA_CONCURRENCY) y de tiempo por trabajo (ORCA_TIMEOUT_S).
 * Para escalar, el mismo código puede correr en varios procesos: cada uno toma trabajos con `FOR UPDATE SKIP LOCKED` en Postgres.
 */
const g = globalThis as unknown as { __sliceWorker?: { running: number; timer?: NodeJS.Timeout } };

export interface EnqueueInput {
  fileVersionId: string; machineProfileId: string; processProfileId: string; filamentProfileId: string;
  copies?: number; label?: string; groupId?: string; userId?: string; force?: boolean;
}

async function loadProfiles(db: Awaited<ReturnType<typeof getDb>>, ids: string[]) {
  const rows = await db.select().from(s.slicerProfiles).where(inArray(s.slicerProfiles.id, ids));
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}

export async function enqueueSlice(i: EnqueueInput): Promise<string> {
  const t = await getT();
  const db = await getDb();
  const copies = Math.max(1, Math.min(200, i.copies ?? 1));
  const [fv] = await db.select().from(s.fileVersions).where(eq(s.fileVersions.id, i.fileVersionId));
  if (!fv) throw new Error(t('slicer.fileNotFound'));
  const P = await loadProfiles(db, [i.machineProfileId, i.processProfileId, i.filamentProfileId]);
  const m = P[i.machineProfileId], p = P[i.processProfileId], f = P[i.filamentProfileId];
  if (!m || !p || !f) throw new Error(t('slicer.machineProcessOrFilamentProfiles'));
  const engine = await engineVersion();
  const cacheKey = crypto.createHash('sha256').update(JSON.stringify([fv.sha256 ?? fv.id, engine, copies,
    [m, p, f].map((x) => [x.id, x.version, x.baseName, x.changes])])).digest('hex');
  const profileVersions = { machine: [m.name, m.version], process: [p.name, p.version], filament: [f.name, f.version] };
  if (!i.force) {
    const [hit] = await db.select().from(s.sliceRuns).where(and(eq(s.sliceRuns.cacheKey, cacheKey), eq(s.sliceRuns.status, 'done'))).limit(1);
    if (hit) {
      const [row] = await db.insert(s.sliceRuns).values({
        workspaceId: WORKSPACE_ID, fileVersionId: i.fileVersionId, machineProfileId: i.machineProfileId, processProfileId: i.processProfileId,
        filamentProfileId: i.filamentProfileId, profileVersions, cacheKey, copies, engineVersion: hit.engineVersion, status: 'done', timeS: hit.timeS,
        filament: hit.filament, layers: hit.layers, plates: hit.plates, durationMs: 0, gcodeKey: hit.gcodeKey, threemfKey: hit.threemfKey,
        label: i.label, groupId: i.groupId, createdBy: i.userId ?? null, result: { ...(hit.result ?? {}), cached: true },
      }).returning({ id: s.sliceRuns.id });
      return row.id;
    }
  }
  const [row] = await db.insert(s.sliceRuns).values({
    workspaceId: WORKSPACE_ID, fileVersionId: i.fileVersionId, machineProfileId: i.machineProfileId, processProfileId: i.processProfileId,
    filamentProfileId: i.filamentProfileId, profileVersions, cacheKey, copies, engineVersion: engine, status: 'queued', label: i.label, groupId: i.groupId,
    createdBy: i.userId ?? null,
  }).returning({ id: s.sliceRuns.id });
  ensureWorker();
  return row.id;
}

async function execute(runId: string) {
  const t = await getT();
  const db = await getDb();
  const [run] = await db.select().from(s.sliceRuns).where(eq(s.sliceRuns.id, runId));
  if (!run) return;
  let tmpDir: string | null = null;
  try {
    const [fv] = await db.select().from(s.fileVersions).where(eq(s.fileVersions.id, run.fileVersionId));
    const P = await loadProfiles(db, [run.machineProfileId!, run.processProfileId!, run.filamentProfileId!]);
    const m = P[run.machineProfileId!], p = P[run.processProfileId!], f = P[run.filamentProfileId!];
    if (!fv || !m || !p || !f) throw new Error(t('slicer.incompleteDataForSlicing'));
    const machine = buildCliProfile('machine', { name: m.name, vendor: m.vendor ?? undefined, baseName: m.baseName, changes: m.changes });
    const proc = buildCliProfile('process', { name: p.name, vendor: p.vendor ?? undefined, baseName: p.baseName, changes: p.changes, machineName: m.name });
    const fil = buildCliProfile('filament', { name: f.name, vendor: f.vendor ?? undefined, baseName: f.baseName, changes: f.changes, machineName: m.name });
    // el filamento debe ser compatible con el tipo de placa: se elige una placa en la que el filamento tenga temperatura de cama
    if (!p.changes?.curr_bed_type && !m.changes?.curr_bed_type) {
      const temp = (k: string) => Number(Array.isArray(fil[k]) ? fil[k][0] : fil[k] ?? 0);
      const bed = temp('textured_plate_temp') > 0 ? 'Textured PEI Plate' : temp('hot_plate_temp') > 0 ? 'Smooth PEI Plate / High Temp Plate' : temp('cool_plate_temp') > 0 ? 'Cool Plate' : temp('eng_plate_temp') > 0 ? 'Engineering Plate' : null;
      if (bed) proc.curr_bed_type = bed;
    }
    const r = await runOrca({ inputPath: absPath(fv.storageKey), ext: extOf(fv.storageKey) || fv.format, machine, process: proc, filament: fil, copies: run.copies });
    tmpDir = r.tmpDir;
    if (!r.ok) {
      await db.update(s.sliceRuns).set({ status: 'error', error: r.error, durationMs: r.durationMs, engineVersion: r.engine, updatedAt: new Date() }).where(eq(s.sliceRuns.id, runId));
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
    await db.update(s.sliceRuns).set({
      status: 'done', timeS, filament: Object.values(fil2).map((x) => ({ g: +x.g.toFixed(2), mm: +x.mm.toFixed(1), cm3: +x.cm3.toFixed(2) })),
      layers, plates: r.plates.length, durationMs: r.durationMs, engineVersion: r.engine, gcodeKey: gcodeKeys[0], threemfKey,
      result: { gcodeKeys, slicer: r.plates[0].meta.slicer }, error: null, updatedAt: new Date(),
    }).where(eq(s.sliceRuns.id, runId));
  } catch (e) {
    await db.update(s.sliceRuns).set({ status: 'error', error: (e as Error).message, updatedAt: new Date() }).where(eq(s.sliceRuns.id, runId));
  } finally {
    if (tmpDir) await cleanup(tmpDir).catch(() => {});
  }
}

async function tick() {
  const w = g.__sliceWorker!;
  if (w.running >= config.orcaConcurrency) return;
  const db = await getDb();
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
  if (g.__sliceWorker?.timer) return;
  g.__sliceWorker = { running: 0 };
  getDb().then(async (db) => {
    // trabajos que quedaron "running" por un reinicio vuelven a la cola
    await db.update(s.sliceRuns).set({ status: 'queued' }).where(eq(s.sliceRuns.status, 'running'));
  }).catch(() => {});
  const tt = setInterval(() => { tick().catch(() => {}); }, 800);
  tt.unref?.();
  g.__sliceWorker.timer = tt;
}

export async function waitForRuns(ids: string[], timeoutMs = 120_000) {
  const db = await getDb(); const t0 = Date.now();
  for (;;) {
    const rows = await db.select().from(s.sliceRuns).where(inArray(s.sliceRuns.id, ids));
    if (rows.every((r) => r.status === 'done' || r.status === 'error')) return rows;
    if (Date.now() - t0 > timeoutMs) return rows;
    await new Promise((r) => setTimeout(r, 400));
  }
}
