'use server';
import { and, eq, isNull } from 'drizzle-orm';
import { profileNozzle } from '@/lib/slicer/catalog';
import { normNozzle } from '@/lib/slicer/nozzle';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { requirePerm } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { cancelJob, completeMaintenance, createJob, finishJob, moveJob, pauseJob, resumeJob, scheduleMachine, startJob, type FinishInput } from '@/lib/services/production';
import { safe } from './common';

export async function startJobAction(id: string, o: { machineId?: string; spoolId?: string } = {}) { return safe(async () => { const u = await requirePerm('cola', 'E'); await startJob(id, { ...o, userId: u.id }); }, ['/cola', '/pedidos']); }
export async function pauseJobAction(id: string) { return safe(async () => { await requirePerm('cola', 'E'); await pauseJob(id); }, ['/cola']); }
export async function resumeJobAction(id: string) { return safe(async () => { await requirePerm('cola', 'E'); await resumeJob(id); }, ['/cola']); }
export async function cancelJobAction(id: string) { return safe(async () => { const u = await requirePerm('cola', 'E'); await cancelJob(id, u.id); }, ['/cola', '/pedidos']); }
export async function finishJobAction(id: string, i: Omit<FinishInput, 'userId'>) { return safe(async () => { const u = await requirePerm('cola', 'E'); return finishJob(id, { ...i, userId: u.id }); }, ['/cola', '/pedidos', '/inventario', '/catalogo', '/maquinas']); }
export async function moveJobAction(id: string, machineId: string, position: number) { return safe(async () => { const u = await requirePerm('cola', 'E'); await moveJob(id, machineId, position, u.id); }, ['/cola']); }
export async function createTestJobAction(i: { title: string; machineId?: string | null; materialId?: string | null; grams: number; hours: number; qty?: number }) {
  return safe(async () => { const u = await requirePerm('cola', 'C'); return createJob({ kind: 'prueba', title: i.title || 'Trabajo de prueba', machineId: i.machineId, materialId: i.materialId, estG: i.grams, estH: i.hours, qty: i.qty ?? 1, userId: u.id }); }, ['/cola']);
}

export interface MachineInput { id?: string; name: string; brand?: string; model?: string; tech: string; serial?: string; volX: number; volY: number; volZ: number; nozzles: string[]; materialsOk: string[]; multicolorSlots: number; heatedBed: boolean; enclosed: boolean; purchaseValue: number; residualValue: number; lifeHours: number; watts: number; maintCostHour: number; feedGph: number; simulated: boolean; machineProfileId?: string | null; defaultProcessProfileId?: string | null }
/** Valida y deja solo los campos de la ficha (el cliente no puede escribir horas, estado, borrado, etc.). */
function cleanMachine(i: MachineInput) {
  const name = String(i.name ?? '').trim(); if (!name) throw new Error('La máquina necesita un nombre');
  const tech = ['FDM', 'SLA', 'SLS'].includes(i.tech) ? i.tech : 'FDM';
  const num = (v: unknown, label: string, o: { min?: number; max?: number; int?: boolean } = {}) => {
    const n = Number(String(v ?? '').replace(',', '.')); const { min = 0, max = 1e9 } = o;
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`«${label}» debe ser un número entre ${min} y ${max}`);
    return o.int ? Math.round(n) : n;
  };
  const nozzles = [...new Set((Array.isArray(i.nozzles) ? i.nozzles : []).map((x) => normNozzle(x)).filter(Boolean) as string[])].sort((a, b) => Number(a) - Number(b));
  if (tech === 'FDM' && !nozzles.length) throw new Error('Indica al menos una boquilla (ej. 0.4)');
  const list = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean))];
  return {
    name, brand: i.brand?.trim() || null, model: i.model?.trim() || null, tech, serial: i.serial?.trim() || null,
    volX: num(i.volX, 'Volumen X', { min: 10, max: 5000 }), volY: num(i.volY, 'Volumen Y', { min: 10, max: 5000 }), volZ: num(i.volZ, 'Volumen Z', { min: 10, max: 5000 }),
    nozzles, materialsOk: list(i.materialsOk), multicolorSlots: num(i.multicolorSlots, 'Ranuras multicolor', { min: 1, max: 32, int: true }),
    heatedBed: !!i.heatedBed, enclosed: !!i.enclosed, simulated: !!i.simulated,
    purchaseValue: num(i.purchaseValue, 'Valor de compra', { int: true }), residualValue: num(i.residualValue, 'Valor residual', { int: true }), lifeHours: num(i.lifeHours, 'Vida útil', { min: 1, int: true }),
    watts: num(i.watts, 'Consumo', { max: 20000, int: true }), maintCostHour: num(i.maintCostHour, 'Mantención por hora', { int: true }), feedGph: num(i.feedGph, 'Caudal típico', { min: 0.1, max: 5000 }),
  };
}
export async function saveMachineAction(i: MachineInput) {
  return safe(async () => {
    const u = await requirePerm('maquinas', i.id ? 'E' : 'C'); const db = await getDb();
    const v = cleanMachine(i);
    // los perfiles del laminador deben existir y ser del tipo correcto
    const profile = async (id: string | null | undefined, type: 'machine' | 'process') => {
      if (!id) return null; const [p] = await db.select().from(s.slicerProfiles).where(and(eq(s.slicerProfiles.id, id), isNull(s.slicerProfiles.deletedAt)));
      if (!p || p.type !== type) throw new Error(type === 'machine' ? 'El perfil de impresora elegido no existe' : 'El perfil de calidad elegido no existe'); return p;
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
export async function setMachineStatusAction(id: string, status: string) { return safe(async () => { const u = await requirePerm('maquinas', 'E'); const db = await getDb(); await db.update(s.machines).set({ status, updatedAt: new Date() }).where(eq(s.machines.id, id)); await audit('machine', id, 'estado', { to: status }, u.id); await scheduleMachine(id); }, ['/maquinas', `/maquinas/${id}`, '/cola']); }
export async function addPlanAction(i: { machineId: string; task: string; intervalHours?: number | null; intervalDays?: number | null }) {
  return safe(async () => { const u = await requirePerm('maquinas', 'E'); const db = await getDb(); if (!i.task.trim() || (!i.intervalHours && !i.intervalDays)) throw new Error('Indica la tarea y su intervalo (horas o días)'); const [m] = await db.select().from(s.machines).where(eq(s.machines.id, i.machineId)); await db.insert(s.maintenancePlans).values({ workspaceId: WORKSPACE_ID, machineId: i.machineId, task: i.task, intervalHours: i.intervalHours || null, intervalDays: i.intervalDays || null, lastDoneHours: m?.hoursTotal ?? 0, lastDoneAt: new Date().toISOString().slice(0, 10), createdBy: u.id }); }, [`/maquinas/${i.machineId}`]);
}
export async function completeMaintenanceAction(i: Parameters<typeof completeMaintenance>[0] & { machineId: string }) { return safe(async () => { const u = await requirePerm('maquinas', 'E'); await completeMaintenance({ ...i, userId: u.id }); }, [`/maquinas/${i.machineId}`, '/']); }
export async function addIncidentAction(i: { machineId: string; kind: string; description: string }) { return safe(async () => { const u = await requirePerm('maquinas', 'E'); const db = await getDb(); if (!i.description.trim()) throw new Error('Describe la incidencia'); await db.insert(s.incidents).values({ workspaceId: WORKSPACE_ID, machineId: i.machineId, kind: i.kind, description: i.description, createdBy: u.id }); }, [`/maquinas/${i.machineId}`]); }
