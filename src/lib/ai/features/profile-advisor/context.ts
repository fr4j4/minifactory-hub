import { and, eq, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { applyChanges, findVendorOf, orcaAvailable, resolveFactory } from '@/lib/slicer/catalog';
import { profileHealth, type ProfileHealth } from '@/lib/slicer/performance';
import { LocalizedError } from '@/i18n/errors';
import { first, numOf } from './params';
import type { ValidateCtx } from './validate';

type Prof = typeof s.slicerProfiles.$inferSelect;
export interface AdvisorSubject {
  machine: Prof; process: Prof; filament: Prof;
  machineRow: typeof s.machines.$inferSelect | null;
  material: typeof s.materials.$inferSelect | null;
  fileVersionId: string; fileName: string;
  analysis: Record<string, any> | null; dims: [number, number, number] | null;
  effective: { process: Record<string, any>; filament: Record<string, any> };
  validate: ValidateCtx;
  health: { process: ProfileHealth; filament: ProfileHealth };
}

function effectiveOf(type: 'process' | 'filament' | 'machine', p: Prof): { eff: Record<string, any>; ok: boolean } {
  try { return { eff: applyChanges(resolveFactory(type, p.baseName, p.vendor ?? findVendorOf(type, p.baseName)), p.changes ?? {}), ok: true }; }
  catch { return { eff: { ...(p.changes ?? {}) }, ok: false }; } // sin OrcaSlicer: solo los cambios del taller
}

/** Reúne, desde la base de datos, todo lo que el asesor necesita saber (solo resúmenes: nunca la malla ni el G-code). */
export async function loadSubject(i: { fileVersionId: string; machineProfileId: string; processProfileId: string; filamentProfileId: string }): Promise<AdvisorSubject> {
  const db = await getDb();
  const get = async (id: string) => { const [p] = await db.select().from(s.slicerProfiles).where(and(eq(s.slicerProfiles.id, id), isNull(s.slicerProfiles.deletedAt))); if (!p) throw new LocalizedError('slicer.profileNotFound'); return p; };
  const [machine, process, filament] = await Promise.all([get(i.machineProfileId), get(i.processProfileId), get(i.filamentProfileId)]);
  const [fv] = await db.select().from(s.fileVersions).where(eq(s.fileVersions.id, i.fileVersionId));
  if (!fv) throw new LocalizedError('slicer.fileNotFound');
  const [mf] = await db.select().from(s.modelFiles).where(eq(s.modelFiles.id, fv.modelFileId));
  const [machineRow] = await db.select().from(s.machines).where(and(eq(s.machines.machineProfileId, machine.id), isNull(s.machines.deletedAt)));
  const [material] = await (await import('@/lib/slicer/links')).materialsLinkedTo(filament.id, db);
  const pe = effectiveOf('process', process), fe = effectiveOf('filament', filament), me = effectiveOf('machine', machine);
  const nozzle = numOf(me.eff.nozzle_diameter) ?? numOf(machineRow?.nozzles?.[0]) ?? 0.4;
  const known = pe.ok && fe.ok && orcaAvailable() ? { process: new Set(Object.keys(pe.eff)), filament: new Set(Object.keys(fe.eff)) } : null;
  return {
    machine, process, filament, machineRow: machineRow ?? null, material: material ?? null,
    fileVersionId: i.fileVersionId, fileName: mf?.name ?? '', analysis: ((fv.meta ?? {}) as any).analysis ?? null,
    dims: mf?.dimX && mf.dimY && mf.dimZ ? [mf.dimX, mf.dimY, mf.dimZ] : null,
    effective: { process: pe.eff, filament: fe.eff },
    validate: { nozzle, process: pe.eff, filament: fe.eff, knownKeys: known, machineMaxSpeed: numOf(me.eff.machine_max_speed_x), machineMaxAccel: numOf(me.eff.machine_max_acceleration_x) },
    health: { process: await profileHealth(process.id), filament: await profileHealth(filament.id) },
  };
}

/** Resumen de lo ocurrido con la versión actual y con las sugerencias previas aplicadas (para que el modelo aprenda del taller). */
export async function priorSuggestions(processProfileId: string) {
  const db = await getDb();
  const rows = await db.select().from(s.aiSuggestions).where(and(eq(s.aiSuggestions.subjectType, 'process_profile'), eq(s.aiSuggestions.subjectId, processProfileId), eq(s.aiSuggestions.status, 'applied')));
  const health = await profileHealth(processProfileId);
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 5).map((r) => {
    const o = (r.outcome ?? {}) as any; const v = health.versions.find((x) => x.version === o.version);
    return { objetivo: (r.proposal as any)?.goal ?? (r.proposal as any)?.symptom ?? null, cambios: o.keys ?? [], version: o.version ?? null, resultado: v ? { trabajos: v.jobs, exito_pct: v.successPct == null ? null : Math.round(v.successPct), causas: v.causes } : 'sin trabajos aún' };
  });
}

export const effFirst = (m: Record<string, any>, k: string) => first(m[k]);
