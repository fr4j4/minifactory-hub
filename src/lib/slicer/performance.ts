import { and, eq, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { effectiveFailCode, type FailCode } from '../production/fail-causes';

/** Umbrales de la alerta de degradación (ver spec-ia §6.9). */
export const HEALTH = { minJobs: 8, minSuccessPct: 85 } as const;

export interface VersionStats {
  version: number;
  jobs: number; ok: number; failed: number;
  successPct: number | null;
  causes: Partial<Record<FailCode, number>>;
  /** Desvío medio del tiempo real respecto del estimado (+10 % = tardó 10 % más). */
  timeDevPct: number | null;
  /** Desvío medio de los gramos reales respecto de los estimados. */
  gramsDevPct: number | null;
}
export interface ProfileHealth { profileId: string; versions: VersionStats[]; total: VersionStats; degraded: boolean }

export interface JobRow { result: string | null; status: string; estH: number; realH: number | null; estG: number; realG: number | null; failCode: string | null; failCause: string | null; version: number }

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Agrega trabajos terminados de una versión. Las fallas parciales cuentan como falla; un trabajo en curso no cuenta. */
export function summarize(version: number, rows: Omit<JobRow, 'version'>[]): VersionStats {
  const done = rows.filter((r) => r.status === 'terminado' || r.status === 'fallido');
  const ok = done.filter((r) => r.result === 'exito' || r.result == null).length;
  const failed = done.length - ok;
  const causes: VersionStats['causes'] = {};
  for (const r of done) if (r.result && r.result !== 'exito') { const c = effectiveFailCode(r) ?? 'otro'; causes[c] = (causes[c] ?? 0) + 1; }
  // el desvío se mide solo en trabajos exitosos: una falla corta no dice nada del estimado
  const good = done.filter((r) => r.result === 'exito');
  const tDev = good.filter((r) => r.estH > 0 && r.realH && r.realH > 0).map((r) => (r.realH! / r.estH - 1) * 100);
  const gDev = good.filter((r) => r.estG > 0 && r.realG && r.realG > 0).map((r) => (r.realG! / r.estG - 1) * 100);
  return { version, jobs: done.length, ok, failed, successPct: done.length ? (ok / done.length) * 100 : null, causes, timeDevPct: mean(tDev), gramsDevPct: mean(gDev) };
}
export const isDegraded = (v: Pick<VersionStats, 'jobs' | 'successPct'>) => v.jobs >= HEALTH.minJobs && v.successPct != null && v.successPct < HEALTH.minSuccessPct;

/** Ficha de desempeño: trabajos reales hechos con laminados de este perfil (proceso o filamento), por versión. */
export async function profileHealth(profileId: string): Promise<ProfileHealth> {
  const db = await getDb();
  const [p] = await db.select().from(s.slicerProfiles).where(eq(s.slicerProfiles.id, profileId));
  const col = p?.type === 'filament' ? s.sliceRuns.filamentProfileId : p?.type === 'machine' ? s.sliceRuns.machineProfileId : s.sliceRuns.processProfileId;
  const rows = await db.select({ job: s.printJobs, run: s.sliceRuns }).from(s.printJobs)
    .innerJoin(s.sliceRuns, eq(s.sliceRuns.id, s.printJobs.sliceRunId)).where(eq(col, profileId));
  const byVersion = new Map<number, Omit<JobRow, 'version'>[]>();
  for (const { job, run } of rows) {
    const v = Number(((run.profileVersions as Record<string, [string, number]>)?.[p?.type ?? 'process'] ?? [])[1] ?? 1);
    const arr = byVersion.get(v) ?? []; arr.push(job); byVersion.set(v, arr);
  }
  const versions = [...byVersion.entries()].sort((a, b) => b[0] - a[0]).map(([v, js]) => summarize(v, js));
  const total = summarize(0, [...byVersion.values()].flat());
  return { profileId, versions, total, degraded: versions.some(isDegraded) };
}

/**
 * Tras cerrar un trabajo fallido: si la versión del perfil con la que se laminó acaba de caer bajo el umbral, avisa una sola vez.
 * Devuelve las versiones avisadas (vacío si no hubo alerta).
 */
export async function checkProfileDegradation(jobId: string): Promise<Array<{ profileId: string; name: string; version: number }>> {
  const db = await getDb();
  const [row] = await db.select({ run: s.sliceRuns }).from(s.printJobs).innerJoin(s.sliceRuns, eq(s.sliceRuns.id, s.printJobs.sliceRunId)).where(eq(s.printJobs.id, jobId));
  if (!row) return [];
  const { notify } = await import('../audit'); const { tDefault } = await import('@/i18n/errors');
  const out: Array<{ profileId: string; name: string; version: number }> = [];
  for (const id of [row.run.processProfileId, row.run.filamentProfileId].filter(Boolean) as string[]) {
    const [p] = await db.select().from(s.slicerProfiles).where(and(eq(s.slicerProfiles.id, id), isNull(s.slicerProfiles.deletedAt)));
    if (!p) continue;
    const h = await profileHealth(id);
    const cur = h.versions.find((v) => v.version === p.version);
    if (!cur || !isDegraded(cur)) continue;
    // solo cuando ESTE fallo es el que lo hizo cruzar el umbral (con el trabajo anterior aún estaba sano)
    const wasOk = cur.jobs - 1 < HEALTH.minJobs || ((cur.ok / (cur.jobs - 1)) * 100) >= HEALTH.minSuccessPct;
    if (!wasOk) continue;
    await notify('perfil_degradado', tDefault('advisor.degradedTitle', { name: p.name }), tDefault('advisor.degradedBody', { pct: Math.round(cur.successPct ?? 0), jobs: cur.jobs, version: cur.version }), `/laminador/perfiles/${id}`);
    out.push({ profileId: id, name: p.name, version: cur.version });
  }
  return out;
}
