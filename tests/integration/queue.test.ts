import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { seedDemo } from '@/lib/seed';
import { assignJob, cancelJob, createJob, projectQueue, reorderJob, startJob } from '@/lib/services/production';

let db: Awaited<ReturnType<typeof getDb>>; let pla: any, a1: any, other: any;
const LIVE = ['en_cola', 'imprimiendo', 'pausado'];
const mk = (title: string, o: any = {}) => createJob({ kind: 'prueba', title, materialId: pla.id, estG: 20, estH: 1, ...o });
const live = async () => db.select().from(s.printJobs).where(and(inArray(s.printJobs.status, LIVE), isNull(s.printJobs.deletedAt))).orderBy(asc(s.printJobs.position));
const titles = async () => (await live()).map((j) => j.title);
const get = async (id: string) => (await db.select().from(s.printJobs).where(eq(s.printJobs.id, id)))[0];

beforeAll(async () => {
  await seedDemo(); db = await getDb();
  pla = (await db.select().from(s.materials).where(eq(s.materials.colorName, 'Negro'))).find((m) => m.type === 'PLA');
  const ms = (await db.select().from(s.machines)).filter((m) => !m.simulated && m.status !== 'fuera_de_servicio');
  a1 = ms.find((m) => m.name.startsWith('Bambu')); other = ms.find((m) => m.id !== a1.id);
});
beforeEach(async () => { for (const j of await live()) await cancelJob(j.id); });

describe('cola global', () => {
  it('un trabajo nuevo entra al final de la cola única y queda sin asignar (con horario proyectado)', async () => {
    const a = await mk('A'); const b = await mk('B', { machineId: a1.id }); const c = await mk('C');
    expect((await live()).map((j) => [j.title, j.position, j.machineId])).toEqual([['A', 1, null], ['B', 2, a1.id], ['C', 3, null]]);
    const ja = await get(a); expect(ja.plannedStart).toBeTruthy(); expect(ja.plannedEnd!.getTime()).toBeGreaterThan(ja.plannedStart!.getTime());
    void b; void c;
  });

  it('reorderJob coloca antes de otro trabajo o al final, solo con posiciones enteras y sin cambiar la máquina', async () => {
    const a = await mk('A', { machineId: a1.id }); const b = await mk('B'); const c = await mk('C', { machineId: other.id }); const d = await mk('D');
    await reorderJob(d, a); expect(await titles()).toEqual(['D', 'A', 'B', 'C']);
    await reorderJob(a, null); expect(await titles()).toEqual(['D', 'B', 'C', 'A']);
    await reorderJob(c, b); expect(await titles()).toEqual(['D', 'C', 'B', 'A']);
    await reorderJob(c, '00000000-0000-4000-8000-00000000dead'); expect(await titles()).toEqual(['D', 'B', 'A', 'C']); // destino inexistente = al final
    expect((await live()).map((j) => j.position)).toEqual([1, 2, 3, 4]);
    expect((await get(a)).machineId).toBe(a1.id); expect((await get(c)).machineId).toBe(other.id); expect((await get(b)).machineId).toBeNull();
    await expect(reorderJob('00000000-0000-4000-8000-00000000dead', null)).rejects.toThrow();
  });

  it('assignJob asigna, cambia de impresora y desasigna sin mover el lugar en la cola (el caso que fallaba)', async () => {
    const a = await mk('A', { machineId: a1.id }); const b = await mk('B', { machineId: a1.id });
    await assignJob(b, other.id); expect((await get(b)).machineId).toBe(other.id);
    expect(await titles()).toEqual(['A', 'B']); expect((await live()).map((j) => j.position)).toEqual([1, 2]);
    await assignJob(b, null); expect((await get(b)).machineId).toBeNull(); expect((await get(a)).machineId).toBe(a1.id);
    await assignJob(b, null); // repetir no falla
    await expect(assignJob(b, '00000000-0000-4000-8000-00000000dead')).rejects.toThrow();
    await db.update(s.machines).set({ deletedAt: new Date() }).where(eq(s.machines.id, other.id));
    await expect(assignJob(b, other.id)).rejects.toThrow(); // máquina eliminada
    await db.update(s.machines).set({ deletedAt: null }).where(eq(s.machines.id, other.id));
  });

  it('la proyección manda un trabajo sin asignar a la máquina que queda libre antes y respeta si la pieza cabe', async () => {
    await mk('Largo', { machineId: a1.id, estH: 6 });
    const libre = await mk('Libre', { estH: 1 }); const enorme = await mk('Enorme', { dims: [99999, 99999, 99999] });
    const plan = await projectQueue();
    const p = plan.get(libre)!; expect(p.projected).toBe(true); expect(p.machineId).not.toBe(a1.id);
    expect(plan.has(enorme)).toBe(false); expect((await get(enorme)).plannedStart).toBeNull(); // no cabe en ninguna
  });

  it('iniciar un trabajo sin asignar usa la máquina sugerida (o la indicada); si no cabe en ninguna, falla; en curso no se puede reordenar ni reasignar', async () => {
    const a = await mk('A'); const b = await mk('B'); const enorme = await mk('Enorme', { dims: [99999, 99999, 99999] });
    await expect(startJob(enorme)).rejects.toThrow(); // no cabe en ninguna máquina
    await startJob(a, { machineId: a1.id });
    const ja = await get(a); expect(ja.status).toBe('imprimiendo'); expect(ja.machineId).toBe(a1.id);
    await startJob(b); const jb = await get(b); expect(jb.status).toBe('imprimiendo'); expect(jb.machineId).not.toBeNull(); expect(jb.machineId).not.toBe(a1.id); // la sugerida: a1 ya está ocupada
    await expect(reorderJob(a, null)).rejects.toThrow(); await expect(assignJob(a, other.id)).rejects.toThrow();
    const c = await mk('C'); await reorderJob(c, a); expect((await titles())[0]).toBe('C'); // se puede poner un trabajo en cola delante de uno en curso
    const plan = await projectQueue(); expect(plan.get(a)!.machineId).toBe(a1.id); expect(plan.get(a)!.projected).toBe(false);
  });
});
