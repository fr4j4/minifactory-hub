import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { seedDemo } from '@/lib/seed';
import { createJob, finishJob, jobExtras, requeueJob, cancelJob, startJob } from '@/lib/services/production';
import { materialStock } from '@/lib/services/inventory';

let db: Awaited<ReturnType<typeof getDb>>; let negro: any, blanco: any, rojo: any, machine: any;
const stockOf = async (id: string) => (await materialStock(db)).find((x) => x.materialId === id)!;
const spoolOf = async (materialId: string, code: string, g: number) => {
  const [sp] = await db.insert(s.spools).values({ workspaceId: WORKSPACE_ID, materialId, code, initialG: g, remainingG: g, status: 'nueva' }).returning();
  return sp;
};

beforeAll(async () => {
  await seedDemo(); db = await getDb();
  const pla = (await db.select().from(s.materials).where(and(eq(s.materials.type, 'PLA'), isNull(s.materials.deletedAt)))).filter((m) => !m.generic);
  negro = pla.find((m) => m.colorName === 'Negro'); blanco = pla.find((m) => m.colorName === 'Blanco') ?? pla.find((m) => m.id !== negro.id); rojo = pla.find((m) => m.id !== negro.id && m.id !== blanco.id);
  machine = (await db.select().from(s.machines)).find((m) => !m.simulated && m.tech === 'FDM');
  for (const m of [negro, blanco, rojo]) await db.update(s.spools).set({ deletedAt: new Date() }).where(eq(s.spools.materialId, m.id));
});

describe('colores adicionales en el trabajo (job_materials)', () => {
  it('reserva por color: el principal con el resto y cada color adicional lo suyo; la referencia no reserva', async () => {
    await spoolOf(negro.id, 'JC-N1', 1000); await spoolOf(blanco.id, 'JC-B1', 1000); await spoolOf(rojo.id, 'JC-R1', 1000);
    const before = { n: (await stockOf(negro.id)).reservedG, b: (await stockOf(blanco.id)).reservedG, r: (await stockOf(rojo.id)).reservedG };
    const id = await createJob({ kind: 'prueba', title: 'Multicolor', materialId: negro.id, estG: 100, estH: 2, machineId: machine.id, extras: [{ materialId: blanco.id, estG: 30 }, { materialId: rojo.id, estG: 0, color: 'Rojo' }] });
    expect((await stockOf(negro.id)).reservedG - before.n).toBeCloseTo(70);
    expect((await stockOf(blanco.id)).reservedG - before.b).toBeCloseTo(30);
    expect((await stockOf(rojo.id)).reservedG - before.r).toBeCloseTo(0);
    expect((await jobExtras(id)).map((x) => [x.materialId, x.estG])).toEqual([[blanco.id, 30], [rojo.id, 0]]);
    await cancelJob(id);
    expect((await stockOf(blanco.id)).reservedG - before.b).toBeCloseTo(0); // cancelado: se libera todo
  });

  it('al terminar descuenta cada color de su bobina, en proporción a lo estimado, y deja el consumo en el trabajo', async () => {
    const sn = (await db.select().from(s.spools).where(eq(s.spools.code, 'JC-N1')))[0]; const sb = (await db.select().from(s.spools).where(eq(s.spools.code, 'JC-B1')))[0];
    const id = await createJob({ kind: 'prueba', title: 'Dos colores', materialId: negro.id, estG: 100, estH: 2, machineId: machine.id, extras: [{ materialId: blanco.id, estG: 40 }] });
    await startJob(id, { machineId: machine.id });
    expect((await jobExtras(id))[0].spoolId).toBe(sb.id); // la bobina del color adicional se toma al iniciar
    await finishJob(id, { result: 'exito', realG: 110 });
    const n = (await db.select().from(s.spools).where(eq(s.spools.id, sn.id)))[0]; const b = (await db.select().from(s.spools).where(eq(s.spools.id, sb.id)))[0];
    expect(sn.remainingG - n.remainingG).toBeCloseTo(66); // 110 × 60/100
    expect(sb.remainingG - b.remainingG).toBeCloseTo(44); // 110 × 40/100
    expect((await jobExtras(id))[0].realG).toBeCloseTo(44);
  });

  it('sin bobina del color adicional el gasto no se pierde: movimiento sin carrete y aviso', async () => {
    await db.update(s.spools).set({ deletedAt: new Date() }).where(eq(s.spools.materialId, rojo.id));
    const id = await createJob({ kind: 'prueba', title: 'Sin rojo', materialId: negro.id, estG: 50, estH: 1, machineId: machine.id, extras: [{ materialId: rojo.id, estG: 10 }] });
    await startJob(id, { machineId: machine.id });
    await finishJob(id, { result: 'exito', realG: 50 });
    const mv = await db.select().from(s.inventoryMovements).where(eq(s.inventoryMovements.jobId, id));
    expect(mv.some((x) => x.spoolId === null && Math.abs(x.qty + 10) < 0.01)).toBe(true);
  });

  it('relanzar un trabajo cancelado conserva los colores', async () => {
    const id = await createJob({ kind: 'prueba', title: 'Relanzar', materialId: negro.id, estG: 60, estH: 1, extras: [{ materialId: blanco.id, estG: 15, color: 'Blanco' }] });
    await cancelJob(id);
    const nid = await requeueJob(id);
    expect((await jobExtras(nid)).map((x) => [x.materialId, x.estG, x.color])).toEqual([[blanco.id, 15, 'Blanco']]);
  });
});
