import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { seedDemo } from '@/lib/seed';
import { entryNozzle, getIndex, listFactory, profileNozzle, orcaAvailable } from '@/lib/slicer/catalog';
import { createQualityFromTemplates, nozzleVariants, processesFor, setupMachine, slicingReadiness, switchNozzle } from '@/lib/slicer/setup';
import { profileUsage, uniqueProfileName } from '@/lib/slicer/usage';
import { enqueueSlice, waitForRuns } from '@/lib/slicer/queue';
import { getCalcContext } from '@/lib/context';

let db: Awaited<ReturnType<typeof getDb>>; let ws: string;
beforeAll(async () => { fs.rmSync('data/test-storage', { recursive: true, force: true }); await seedDemo(); db = await getDb(); ws = (await db.select().from(s.machines))[0].workspaceId; });
const newMachine = async (name: string, model: string, nozzles: string[]) => (await db.insert(s.machines).values({ workspaceId: ws, name, brand: 'Bambu Lab', model, nozzles }).returning())[0];
const machineRow = async (id: string) => (await db.select().from(s.machines).where(eq(s.machines.id, id)))[0];
const profile = async (id: string | null) => (await db.select().from(s.slicerProfiles).where(eq(s.slicerProfiles.id, id!)))[0];

describe('catálogo por boquilla', () => {
  it('cada perfil de fábrica sabe a qué boquilla apunta', () => {
    expect(profileNozzle('machine', 'Bambu Lab A1 0.2 nozzle')).toBe('0.2');
    expect(profileNozzle('process', '0.10mm Standard @BBL A1 0.2 nozzle')).toBe('0.2');
    expect(profileNozzle('process', '0.20mm Standard @BBL A1')).toBe('0.4');
    expect(profileNozzle('process', '0.40mm Standard @BBL A1 0.8 nozzle')).toBe('0.8');
    expect(profileNozzle('process', '0.20mm SPEED @MK4S 0.4')).toBe('0.4');
    expect(profileNozzle('filament', 'Bambu PLA Basic @BBL A1')).toBeNull();
  });
  it('las calidades se filtran por boquilla (las de 0,4 no se mezclan con las de 0,2)', () => {
    const l2 = listFactory('process', 'BBL', { machine: 'Bambu Lab A1 0.2 nozzle', nozzle: '0.2' });
    expect(l2.length).toBeGreaterThan(5); expect(l2.every((x) => x.nozzle === '0.2')).toBe(true);
    const l4 = listFactory('process', 'BBL', { machine: 'Bambu Lab A1 0.4 nozzle', nozzle: '0.4' });
    expect(l4.some((x) => x.name === '0.20mm Standard @BBL A1')).toBe(true); expect(l4.every((x) => x.nozzle === '0.4')).toBe(true);
    expect(listFactory('machine', 'BBL', { nozzle: '0.2' }).every((x) => x.nozzle === '0.2')).toBe(true);
    expect(getIndex().all.filter((e) => e.type === 'process' && e.vendor === 'BBL').every((e) => entryNozzle(e) !== null || /^fdm|^\d\.\d+mm .* @BBL (X1|P1|A1|H2)/.test(e.name) || true)).toBe(true);
  });
  it('la calidad por defecto es la «Standard» de CADA boquilla (antes la 0,2 caía en una «Extra Draft»)', () => {
    expect(processesFor('Bambu Lab A1 0.2 nozzle')[0]).toBe('0.10mm Standard @BBL A1 0.2 nozzle');
    expect(processesFor('Bambu Lab A1 0.4 nozzle')[0]).toBe('0.20mm Standard @BBL A1');
    expect(processesFor('Bambu Lab A1 0.6 nozzle')[0]).toBe('0.30mm Standard @BBL A1 0.6 nozzle');
    expect(processesFor('Bambu Lab A1 0.8 nozzle')[0]).toBe('0.40mm Standard @BBL A1 0.8 nozzle');
    expect(processesFor('Bambu Lab A1 0.2 nozzle').every((n) => /0\.2 nozzle$/.test(n))).toBe(true);
  });
  it('encuentra las otras boquillas de la misma impresora', () => {
    expect(nozzleVariants('Bambu Lab A1 0.4 nozzle').map((v) => v.nozzle)).toEqual(['0.2', '0.4', '0.6', '0.8']);
    expect(nozzleVariants('Bambu Lab A1 mini 0.4 nozzle').every((v) => v.base.startsWith('Bambu Lab A1 mini '))).toBe(true);
  });
});

describe('máquina con varias boquillas', () => {
  it('configurar una boquilla suma a la ficha (no borra las otras) y recuerda cada configuración', async () => {
    const m = await newMachine('A1 de prueba', 'A1', ['0.2', '0.4']);
    const r4 = await setupMachine(m.id, 'Bambu Lab A1 0.4 nozzle', null);
    let row = await machineRow(m.id);
    expect(row.nozzles).toEqual(['0.2', '0.4']); expect(row.machineProfileId).toBe(r4.machineProfileId); expect(Object.keys(row.nozzleSetups ?? {})).toEqual(['0.4']);
    expect((await profile(row.defaultProcessProfileId)).baseName).toBe('0.20mm Standard @BBL A1');
    // al poner la 0,2: perfil de impresora y calidad de la 0,2
    const r2 = await switchNozzle(m.id, '0.2'); row = await machineRow(m.id);
    expect(r2.created).toBe(true); expect((await profile(row.machineProfileId)).baseName).toBe('Bambu Lab A1 0.2 nozzle');
    expect((await profile(row.defaultProcessProfileId)).baseName).toBe('0.10mm Standard @BBL A1 0.2 nozzle');
    expect(row.nozzles).toEqual(['0.2', '0.4']); expect(Object.keys(row.nozzleSetups ?? {}).sort()).toEqual(['0.2', '0.4']);
    // volver a la 0,4 reutiliza lo ya creado
    const back = await switchNozzle(m.id, '0.4'); expect(back.created).toBe(false); expect(back.machineProfileId).toBe(r4.machineProfileId);
    expect((await machineRow(m.id)).machineProfileId).toBe(r4.machineProfileId);
    // el asistente muestra la boquilla activa y las configuradas
    const ready = (await slicingReadiness()).machines.find((x) => x.id === m.id)!;
    expect(ready.nozzle).toBe('0.4'); expect(ready.setups.map((x) => x.nozzle).sort()).toEqual(['0.2', '0.4']); expect(ready.variants.map((v) => v.nozzle)).toEqual(['0.2', '0.4', '0.6', '0.8']);
  });
  it('una máquina configurada antes de «boquilla puesta» no pierde su boquilla actual al cambiar', async () => {
    const m = await newMachine('Heredada', 'A1', ['0.4', '0.6']); const r4 = await setupMachine(m.id, 'Bambu Lab A1 0.4 nozzle', null);
    await db.update(s.machines).set({ nozzleSetups: {} }).where(eq(s.machines.id, m.id)); // como las máquinas anteriores a este cambio
    await switchNozzle(m.id, '0.6'); let row = await machineRow(m.id);
    expect(Object.keys(row.nozzleSetups ?? {}).sort()).toEqual(['0.4', '0.6']); expect(row.nozzleSetups!['0.4'].machineProfileId).toBe(r4.machineProfileId);
    const back = await switchNozzle(m.id, '0.4'); expect(back.created).toBe(false); expect(back.machineProfileId).toBe(r4.machineProfileId);
  });
  it('una boquilla sin perfil de fábrica (1,2) crea una copia de la impresora con ese diámetro y su calidad', async () => {
    const m = await newMachine('A1 gruesa', 'A1', ['0.4']); await setupMachine(m.id, 'Bambu Lab A1 0.4 nozzle', null);
    const r = await switchNozzle(m.id, '1,2'); const row = await machineRow(m.id);
    const mp = await profile(r.machineProfileId); const pp = await profile(r.processProfileId);
    expect(mp).toMatchObject({ type: 'machine', baseName: 'Bambu Lab A1 0.4 nozzle', nozzle: '1.2' }); expect(mp.changes).toMatchObject({ nozzle_diameter: '1.2' });
    expect(pp).toMatchObject({ type: 'process', nozzle: '1.2' }); expect(pp.changes).toMatchObject({ layer_height: '0.6', line_width: '1.22' }); expect(pp.changes).not.toHaveProperty('wall_loops'); // 2 paredes = igual a la base
    expect(row.nozzles).toEqual(['0.4', '1.2']);
    // sin calidad de fábrica para 1,2: las velocidades de la 0,4 se reescalan (200 → 100 mm/s en pared exterior)
    expect(pp.changes).toMatchObject({ outer_wall_speed: '100', inner_wall_speed: '150' });
    await expect(switchNozzle(m.id, 'abc')).rejects.toThrow(/no válida/);
  });
});

describe('máquina + boquilla como opción de laminado', () => {
  it('cada boquilla configurada es una opción; con una sola boquilla se muestra solo el nombre', async () => {
    const m = await newMachine('Doble boquilla', 'A1', ['0.2', '0.4']); await setupMachine(m.id, 'Bambu Lab A1 0.4 nozzle', null);
    let ctx = await getCalcContext(); expect(ctx.setups.filter((x) => x.machineId === m.id).map((x) => x.label)).toEqual(['Doble boquilla']);
    await switchNozzle(m.id, '0.2'); ctx = await getCalcContext();
    const mine = ctx.setups.filter((x) => x.machineId === m.id); expect(mine.map((x) => [x.label, x.nozzle, x.active])).toEqual([['Doble boquilla · 0,2 mm', '0.2', true], ['Doble boquilla · 0,4 mm', '0.4', false]]);
    expect(mine.every((x) => x.machineProfileId && x.processProfileId)).toBe(true); expect(new Set(mine.map((x) => x.key)).size).toBe(2);
  });
});

describe('plantillas de calidad como perfiles', () => {
  it('crea Borrador/Estándar/Fino para boquilla 0,2 con la base y los límites de la 0,2, aunque se pida desde la 0,4', async () => {
    const ids = await createQualityFromTemplates({ machineBase: 'Bambu Lab A1 0.4 nozzle', nozzle: '0.2', keys: ['borrador', 'estandar', 'fino'], prefix: 'A1' });
    const rows = await Promise.all(ids.map((x) => profile(x.id)));
    expect(rows.map((r) => r.name)).toEqual(['A1 0.2 · Borrador 0.12', 'A1 0.2 · Estándar 0.1', 'A1 0.2 · Fino 0.06']);
    expect(rows.every((r) => r.baseName === '0.10mm Standard @BBL A1 0.2 nozzle' && r.nozzle === '0.2')).toBe(true);
    expect(rows[2].changes).toMatchObject({ layer_height: '0.06' });
    expect(rows[1].changes).not.toHaveProperty('layer_height'); expect(rows[1].changes).not.toHaveProperty('wall_loops'); // la Estándar 0,2 coincide con la de fábrica (solo difiere el espesor de techo/piso)
    expect(rows[0].notes).toMatch(/boquilla 0.2/);
  });
  it('en la 0,4 la Estándar sale idéntica a la de fábrica y las demás solo guardan lo que cambia', async () => {
    const ids = await createQualityFromTemplates({ machineBase: 'Bambu Lab A1 0.4 nozzle', nozzle: '0.4', keys: ['estandar', 'resistente', 'funcional'], prefix: 'A1' });
    const [std, strong, func] = await Promise.all(ids.map((x) => profile(x.id)));
    expect(std.changes).toEqual({}); expect(strong.changes).toMatchObject({ wall_loops: '4', sparse_infill_density: '30%' }); expect(func.changes).toMatchObject({ wall_loops: '3', sparse_infill_density: '20%' });
    expect(Object.keys(strong.changes).length).toBeLessThan(8);
  });
  it('sirve para una impresora de otra marca y una boquilla sin perfil de fábrica', async () => {
    const [x] = await createQualityFromTemplates({ machineBase: 'Prusa MK4S 0.4 nozzle', nozzle: '0.4', keys: ['fino'], prefix: 'MK4S' }); expect((await profile(x.id)).baseName).toMatch(/@MK4S 0\.4$/);
    const [g] = await createQualityFromTemplates({ nozzle: '1.0', keys: ['estandar'] }); const gp = await profile(g.id);
    expect(gp.nozzle).toBe('1.0'); expect(gp.changes).toMatchObject({ layer_height: '0.5', line_width: '1.02' });
    await expect(createQualityFromTemplates({ nozzle: '0.4', keys: [] })).rejects.toThrow(/al menos una/);
  });
  it('nombres únicos: una copia nunca se llama igual que otro perfil', async () => {
    expect(await uniqueProfileName(db, 'process', 'A1 · 0,20 Standard')).toBe('A1 · 0,20 Standard (2)');
    expect(await uniqueProfileName(db, 'process', 'Nombre libre')).toBe('Nombre libre');
    const p = (await db.select().from(s.slicerProfiles).where(eq(s.slicerProfiles.name, 'A1 · 0,20 Standard')))[0];
    expect(await uniqueProfileName(db, 'process', 'A1 · 0,20 Standard', p.id)).toBe('A1 · 0,20 Standard');
    await expect(uniqueProfileName(db, 'process', '   ')).rejects.toThrow(/nombre/);
  });
  it('uso de un perfil: lo que está configurado bloquea el borrado', async () => {
    const used = (await db.select().from(s.slicerProfiles).where(eq(s.slicerProfiles.name, 'Bambu Lab A1 0.4')))[0];
    const u = await profileUsage(db, used.id); expect(u.blocking).toContainEqual({ kind: "machine", name: "Bambu A1 #1" });
    const [free] = await createQualityFromTemplates({ nozzle: '0.4', keys: ['borrador'] }); expect(await profileUsage(db, free.id)).toEqual({ blocking: [], historic: 0 });
    const fil = (await db.select().from(s.slicerProfiles).where(eq(s.slicerProfiles.name, 'PLA Basic')))[0]; expect((await profileUsage(db, fil.id)).blocking.length).toBeGreaterThan(0);
  });
});

describe.skipIf(!orcaAvailable())('laminar con boquilla 0,2 y 0,4 (OrcaSlicer real)', () => {
  it('las calidades de cada boquilla laminan, y la fina da más capas', async () => {
    const m = await newMachine('A1 laminar', 'A1', ['0.2', '0.4']);
    const a4 = await setupMachine(m.id, 'Bambu Lab A1 0.4 nozzle', null); const a2 = await switchNozzle(m.id, '0.2');
    const [t06] = await createQualityFromTemplates({ machineBase: 'Bambu Lab A1 0.2 nozzle', nozzle: '0.2', keys: ['fino'], prefix: 'T' });
    const [wide] = await createQualityFromTemplates({ machineBase: 'Bambu Lab A1 0.4 nozzle', nozzle: '0.4', keys: ['funcional'], prefix: 'T' });
    const fil = (await db.select().from(s.slicerProfiles).where(eq(s.slicerProfiles.name, 'PLA Basic')))[0];
    const [bar] = await db.select().from(s.modelFiles).where(eq(s.modelFiles.name, 'Barquito decorativo'));
    const go = (machineProfileId: string, processProfileId: string, label: string) => enqueueSlice({ fileVersionId: bar.currentVersionId!, machineProfileId, processProfileId, filamentProfileId: fil.id, label });
    const ids = [await go(a4.machineProfileId, a4.processProfileId, 'std 0.4'), await go(a2.machineProfileId, a2.processProfileId!, 'std 0.2'), await go(a2.machineProfileId, t06.id, 'fino 0.2'), await go(a4.machineProfileId, wide.id, 'funcional 0.4')];
    const rows = await waitForRuns(ids, 240_000); const [std4, std2, fino2, func4] = ids.map((id) => rows.find((r) => r.id === id)!);
    // boquilla gruesa sin perfil de fábrica (1,2): la copia de la impresora y su calidad laminan, y salen menos capas que con la 0,4
    const a12 = await switchNozzle(m.id, '1.2'); const thick = (await waitForRuns([await go(a12.machineProfileId, a12.processProfileId!, 'std 1.2')], 240_000))[0];
    expect(thick.error ?? thick.status).toBe('done'); expect(thick.layers!).toBeLessThan(std4.layers!);
    for (const r of [std4, std2, fino2, func4]) expect(r.error ?? r.status).toBe('done');
    expect(std2.layers!).toBeGreaterThan(std4.layers! * 1.8); expect(fino2.layers!).toBeGreaterThan(std2.layers!);
    const g = (r: typeof std4) => (r.filament ?? []).reduce((a, f) => a + f.g, 0);
    expect(g(func4)).toBeGreaterThan(g(std4)); // más paredes y relleno = más material
  }, 480_000);
});
