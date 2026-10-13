'use server';
import { eq } from 'drizzle-orm';
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
export async function saveMachineAction(i: MachineInput) {
  return safe(async () => {
    const u = await requirePerm('maquinas', i.id ? 'E' : 'C'); const db = await getDb(); if (!i.name.trim()) throw new Error('La máquina necesita un nombre');
    const v = { ...i, machineProfileId: i.machineProfileId || null, defaultProcessProfileId: i.defaultProcessProfileId || null, updatedAt: new Date() }; delete (v as any).id;
    if (i.id) { await db.update(s.machines).set(v).where(eq(s.machines.id, i.id)); await audit('machine', i.id, 'editar', {}, u.id); return i.id; }
    const [m] = await db.insert(s.machines).values({ workspaceId: WORKSPACE_ID, createdBy: u.id, ...v }).returning({ id: s.machines.id }); await audit('machine', m.id, 'crear', { name: i.name }, u.id); return m.id;
  }, ['/maquinas', '/cola']);
}
export async function setMachineStatusAction(id: string, status: string) { return safe(async () => { const u = await requirePerm('maquinas', 'E'); const db = await getDb(); await db.update(s.machines).set({ status, updatedAt: new Date() }).where(eq(s.machines.id, id)); await audit('machine', id, 'estado', { to: status }, u.id); await scheduleMachine(id); }, ['/maquinas', `/maquinas/${id}`, '/cola']); }
export async function addPlanAction(i: { machineId: string; task: string; intervalHours?: number | null; intervalDays?: number | null }) {
  return safe(async () => { const u = await requirePerm('maquinas', 'E'); const db = await getDb(); if (!i.task.trim() || (!i.intervalHours && !i.intervalDays)) throw new Error('Indica la tarea y su intervalo (horas o días)'); const [m] = await db.select().from(s.machines).where(eq(s.machines.id, i.machineId)); await db.insert(s.maintenancePlans).values({ workspaceId: WORKSPACE_ID, machineId: i.machineId, task: i.task, intervalHours: i.intervalHours || null, intervalDays: i.intervalDays || null, lastDoneHours: m?.hoursTotal ?? 0, lastDoneAt: new Date().toISOString().slice(0, 10), createdBy: u.id }); }, [`/maquinas/${i.machineId}`]);
}
export async function completeMaintenanceAction(i: Parameters<typeof completeMaintenance>[0] & { machineId: string }) { return safe(async () => { const u = await requirePerm('maquinas', 'E'); await completeMaintenance({ ...i, userId: u.id }); }, [`/maquinas/${i.machineId}`, '/']); }
export async function addIncidentAction(i: { machineId: string; kind: string; description: string }) { return safe(async () => { const u = await requirePerm('maquinas', 'E'); const db = await getDb(); if (!i.description.trim()) throw new Error('Describe la incidencia'); await db.insert(s.incidents).values({ workspaceId: WORKSPACE_ID, machineId: i.machineId, kind: i.kind, description: i.description, createdBy: u.id }); }, [`/maquinas/${i.machineId}`]); }
