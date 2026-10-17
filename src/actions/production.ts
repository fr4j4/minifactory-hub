'use server';
import { and, eq, isNull } from 'drizzle-orm';
import { profileNozzle } from '@/lib/slicer/catalog';
import { normNozzle } from '@/lib/slicer/nozzle';
import { canonicalMaterialTypes, KNOWN_MATERIAL_TYPES } from '@/lib/slicer/material-types';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { requirePerm } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { assignJob, cancelJob, completeMaintenance, createJob, finishJob, machineDeleteInfo, pauseJob, removeMachine, reorderJob, requeueJob, resumeJob, scheduleQueue, startJob, type FinishInput } from '@/lib/services/production';
import { safe } from './common';
import type { MessageKey, TFn } from '@/i18n/translate';
import { getT } from '@/i18n/server';

export async function startJobAction(id: string, o: { machineId?: string; spoolId?: string } = {}) { return safe(async () => { const u = await requirePerm('cola', 'E'); await startJob(id, { ...o, userId: u.id }); }, ['/cola', '/pedidos']); }
export async function pauseJobAction(id: string) { return safe(async () => { await requirePerm('cola', 'E'); await pauseJob(id); }, ['/cola']); }
export async function resumeJobAction(id: string) { return safe(async () => { await requirePerm('cola', 'E'); await resumeJob(id); }, ['/cola']); }
/** Vuelve a lanzar un trabajo cancelado (se usa desde el pedido y desde la cola). */
export async function requeueJobAction(id: string) { return safe(async () => { const u = await requirePerm('pedidos', 'E'); return requeueJob(id, u.id); }, ['/cola', '/pedidos']); }
export async function cancelJobAction(id: string) { return safe(async () => { const u = await requirePerm('cola', 'E'); await cancelJob(id, u.id); }, ['/cola', '/pedidos']); }
export async function finishJobAction(id: string, i: Omit<FinishInput, 'userId'>) { return safe(async () => { const u = await requirePerm('cola', 'E'); return finishJob(id, { ...i, userId: u.id }); }, ['/cola', '/pedidos', '/inventario', '/catalogo', '/maquinas']); }
/** Coloca el trabajo antes de `beforeJobId` en la cola global (al final si es null). No cambia la máquina. */
export async function reorderJobAction(id: string, beforeJobId: string | null) { return safe(async () => { const u = await requirePerm('cola', 'E'); await reorderJob(id, beforeJobId, u.id); }, ['/cola']); }
/** Asigna el trabajo a una máquina; `null` lo deja sin asignar. No cambia su lugar en la cola. */
export async function assignJobAction(id: string, machineId: string | null) { return safe(async () => { const u = await requirePerm('cola', 'E'); await assignJob(id, machineId, u.id); }, ['/cola', '/maquinas']); }
export async function createTestJobAction(i: { title: string; machineId?: string | null; materialId?: string | null; grams: number; hours: number; qty?: number }) {
  const t = await getT();
  return safe(async () => { const u = await requirePerm('cola', 'C'); return createJob({ kind: 'prueba', title: i.title || t('machines.testJob'), machineId: i.machineId, materialId: i.materialId, estG: i.grams, estH: i.hours, qty: i.qty ?? 1, userId: u.id }); }, ['/cola']);
}

export interface MachineInput { id?: string; name: string; brand?: string; model?: string; tech: string; serial?: string; volX: number; volY: number; volZ: number; nozzles: string[]; materialsOk: string[]; multicolorSlots: number; heatedBed: boolean; enclosed: boolean; purchaseValue: number; residualValue: number; lifeHours: number; watts: number; maintCostHour: number; feedGph: number; simulated: boolean; machineProfileId?: string | null; defaultProcessProfileId?: string | null }
/** Valida y deja solo los campos de la ficha (el cliente no puede escribir horas, estado, borrado, etc.). */
function cleanMachine(i: MachineInput, t: TFn, knownTypes: string[]) {
  const name = String(i.name ?? '').trim(); if (!name) throw new Error(t('machines.theMachineNeedsAName'));
  const tech = ['FDM', 'SLA', 'SLS'].includes(i.tech) ? i.tech : 'FDM';
  const num = (v: unknown, label: MessageKey, o: { min?: number; max?: number; int?: boolean } = {}) => {
    const n = Number(String(v ?? '').replace(',', '.')); const { min = 0, max = 1e9 } = o;
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(t('nozzle.errMachineNumber', { field: t(label), min, max }));
    return o.int ? Math.round(n) : n;
  };
  const nozzles = [...new Set((Array.isArray(i.nozzles) ? i.nozzles : []).map((x) => normNozzle(x)).filter(Boolean) as string[])].sort((a, b) => Number(a) - Number(b));
  if (tech === 'FDM' && !nozzles.length) throw new Error(t('nozzle.errNeedNozzle'));
  const list = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean))];
  return {
    name, brand: i.brand?.trim() || null, model: i.model?.trim() || null, tech, serial: i.serial?.trim() || null,
    volX: num(i.volX, 'nozzle.fldVolX', { min: 10, max: 5000 }), volY: num(i.volY, 'nozzle.fldVolY', { min: 10, max: 5000 }), volZ: num(i.volZ, 'nozzle.fldVolZ', { min: 10, max: 5000 }),
    nozzles, materialsOk: canonicalMaterialTypes(list(i.materialsOk), knownTypes), multicolorSlots: num(i.multicolorSlots, 'nozzle.fldSlots', { min: 1, max: 32, int: true }),
    heatedBed: !!i.heatedBed, enclosed: !!i.enclosed, simulated: !!i.simulated,
    purchaseValue: num(i.purchaseValue, 'nozzle.fldPurchase', { int: true }), residualValue: num(i.residualValue, 'nozzle.fldResidual', { int: true }), lifeHours: num(i.lifeHours, 'nozzle.fldLife', { min: 1, int: true }),
    watts: num(i.watts, 'nozzle.fldWatts', { max: 20000, int: true }), maintCostHour: num(i.maintCostHour, 'nozzle.fldMaint', { int: true }), feedGph: num(i.feedGph, 'nozzle.fldFeed', { min: 0.1, max: 5000 }),
  };
}
export async function saveMachineAction(i: MachineInput) {
  const t = await getT();
  return safe(async () => {
    const u = await requirePerm('maquinas', i.id ? 'E' : 'C'); const db = await getDb();
    const inv = await db.selectDistinct({ t: s.materials.type }).from(s.materials).where(isNull(s.materials.deletedAt));
    const v = cleanMachine(i, t, [...new Set([...KNOWN_MATERIAL_TYPES, ...inv.map((x) => x.t.trim().toUpperCase())])]);
    // el número de serie identifica un equipo: no se repite entre máquinas activas
    if (v.serial) {
      const same = (await db.select({ id: s.machines.id, serial: s.machines.serial, name: s.machines.name }).from(s.machines).where(isNull(s.machines.deletedAt))).find((x) => x.id !== i.id && x.serial?.trim().toLowerCase() === v.serial!.toLowerCase());
      if (same) throw new Error(t('nozzle.errSerialDup', { name: same.name }));
    }
    // los perfiles del laminador deben existir y ser del tipo correcto
    const profile = async (id: string | null | undefined, type: 'machine' | 'process') => {
      if (!id) return null; const [p] = await db.select().from(s.slicerProfiles).where(and(eq(s.slicerProfiles.id, id), isNull(s.slicerProfiles.deletedAt)));
      if (!p || p.type !== type) throw new Error(t(type === 'machine' ? 'nozzle.errPrinterProfileMissing' : 'nozzle.errQualityProfileMissing')); return p;
    };
    const mp = await profile(i.machineProfileId, 'machine'); const pp = await profile(i.defaultProcessProfileId, 'process');
    // la boquilla del perfil de impresora queda registrada: así «boquilla puesta» y perfil nunca se contradicen
    const nozzle = mp ? profileNozzle('machine', mp.baseName, mp.changes) : null;
    if (nozzle && !v.nozzles.includes(nozzle)) v.nozzles = [...v.nozzles, nozzle].sort((a, b) => Number(a) - Number(b));
    const [prev] = i.id ? await db.select({ n: s.machines.nozzleSetups }).from(s.machines).where(eq(s.machines.id, i.id)) : [];
    const nozzleSetups = { ...(prev?.n ?? {}), ...(mp && nozzle ? { [nozzle]: { machineProfileId: mp.id, processProfileId: pp?.id ?? null } } : {}) };
    const row = { ...v, machineProfileId: mp?.id ?? null, defaultProcessProfileId: pp?.id ?? null, nozzleSetups, updatedAt: new Date() };
    if (i.id) { await db.update(s.machines).set(row).where(eq(s.machines.id, i.id)); await audit('machine', i.id, 'editar', {}, u.id); return i.id; }
    const [m] = await db.insert(s.machines).values({ workspaceId: WORKSPACE_ID, createdBy: u.id, ...row }).returning({ id: s.machines.id }); await audit('machine', m.id, 'crear', { name: v.name }, u.id); return m.id;
  }, ['/maquinas', '/cola', '/laminador']);
}
export async function setMachineStatusAction(id: string, status: string) { return safe(async () => { const u = await requirePerm('maquinas', 'E'); const db = await getDb(); await db.update(s.machines).set({ status, updatedAt: new Date() }).where(eq(s.machines.id, id)); await audit('machine', id, 'estado', { to: status }, u.id); await scheduleQueue(); }, ['/maquinas', `/maquinas/${id}`, '/cola']); }
export async function addPlanAction(i: { machineId: string; task: string; intervalHours?: number | null; intervalDays?: number | null }) {
  const t = await getT();
  return safe(async () => { const u = await requirePerm('maquinas', 'E'); const db = await getDb(); if (!i.task.trim() || (!i.intervalHours && !i.intervalDays)) throw new Error(t('machines.enterTheTaskAndIts')); const [m] = await db.select().from(s.machines).where(eq(s.machines.id, i.machineId)); await db.insert(s.maintenancePlans).values({ workspaceId: WORKSPACE_ID, machineId: i.machineId, task: i.task, intervalHours: i.intervalHours || null, intervalDays: i.intervalDays || null, lastDoneHours: m?.hoursTotal ?? 0, lastDoneAt: new Date().toISOString().slice(0, 10), createdBy: u.id }); }, [`/maquinas/${i.machineId}`]);
}
export async function completeMaintenanceAction(i: Parameters<typeof completeMaintenance>[0] & { machineId: string }) { return safe(async () => { const u = await requirePerm('maquinas', 'E'); await completeMaintenance({ ...i, userId: u.id }); }, [`/maquinas/${i.machineId}`, '/']); }
export async function addIncidentAction(i: { machineId: string; kind: string; description: string }) {
  const t = await getT(); return safe(async () => { const u = await requirePerm('maquinas', 'E'); const db = await getDb(); if (!i.description.trim()) throw new Error(t('machines.describeTheIncident')); await db.insert(s.incidents).values({ workspaceId: WORKSPACE_ID, machineId: i.machineId, kind: i.kind, description: i.description, createdBy: u.id }); }, [`/maquinas/${i.machineId}`]); }
export async function machineDeleteInfoAction(id: string) { return safe(async () => { await requirePerm('maquinas', 'V'); return machineDeleteInfo(id); }); }
export async function removeMachineAction(id: string) { return safe(async () => { const u = await requirePerm('maquinas', 'X'); await removeMachine(id, u.id); }, ['/maquinas', '/maquinas/conectores', '/cola']); }

/** Crea un trabajo de prueba en la cola a partir de un laminado terminado (máquina y material del laminado). */
export async function enqueueFromRunAction(runId: string, machineId: string | null, materialId: string | null) {
  return safe(async () => {
    const u = await requirePerm('cola', 'C'); const db = await getDb();
    const [r] = await db.select().from(s.sliceRuns).where(eq(s.sliceRuns.id, runId));
    if (!r || r.status !== 'done') throw new Error((await getT())('slicer.incompleteDataForSlicing'));
    const grams = (r.filament ?? []).reduce((a, f) => a + (f.g ?? 0), 0);
    return createJob({ kind: 'prueba', title: r.label ?? 'Laminado', materialId, machineId, estG: grams, estH: (r.timeS ?? 0) / 3600, qty: r.copies, sliceRunId: r.id, fileVersionId: r.fileVersionId, userId: u.id });
  }, ['/cola']);
}
