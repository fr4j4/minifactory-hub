import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { strToU8, zipSync } from 'fflate';
import { getDb, s } from '@/db';
import { seedDemo } from '@/lib/seed';
import { parsePresetFiles } from '@/lib/slicer/import';
import { createCustomFilament, processesFor, setupFilament, setupMachine, slicingReadiness, suggestFilamentBase, suggestMachineBase } from '@/lib/slicer/setup';
import { enqueueSlice, waitForRuns } from '@/lib/slicer/queue';
import { orcaAvailable } from '@/lib/slicer/catalog';

let db: Awaited<ReturnType<typeof getDb>>;
beforeAll(async () => { fs.rmSync('data/test-storage', { recursive: true, force: true }); await seedDemo(); db = await getDb(); });

describe('importar perfiles de Bambu Studio / OrcaSlicer', () => {
  it('un proyecto .3mf trae impresora, proceso y filamento', () => {
    const c = parsePresetFiles([{ name: 'llavero-a1.3mf', data: fs.readFileSync('samples/llavero-a1.3mf') }]);
    expect(c.map((x) => [x.type, x.baseName])).toEqual([['process', '0.20mm Standard @BBL A1'], ['filament', 'Bambu PLA Basic @BBL A1'], ['machine', 'Bambu Lab A1 0.4 nozzle']]);
    expect(c.every((x) => x.ok && Object.keys(x.changes).length === 0)).toBe(true);
  });
  it('un 3MF con perfiles de usuario conserva solo las claves cambiadas', () => {
    const cfg = { print_settings_id: 'Mi calidad', printer_settings_id: 'Bambu Lab A1 0.4 nozzle', filament_settings_id: ['Mi PETG'], inherits_group: ['0.20mm Standard @BBL A1', 'Bambu PETG Basic @BBL A1', ''], different_settings_to_system: ['wall_loops;sparse_infill_density', 'nozzle_temperature', ''], wall_loops: '4', sparse_infill_density: '25%', nozzle_temperature: ['250'], layer_height: '0.2' };
    const z = zipSync({ 'Metadata/project_settings.config': strToU8(JSON.stringify(cfg)) });
    const c = parsePresetFiles([{ name: 'proyecto.3mf', data: z }]);
    expect(c[0]).toMatchObject({ type: 'process', name: 'Mi calidad', baseName: '0.20mm Standard @BBL A1', changes: { wall_loops: '4', sparse_infill_density: '25%' } });
    expect(c[1]).toMatchObject({ type: 'filament', name: 'Mi PETG', baseName: 'Bambu PETG Basic @BBL A1', changes: { nozzle_temperature: ['250'] } });
    expect(c[2]).toMatchObject({ type: 'machine', baseName: 'Bambu Lab A1 0.4 nozzle', changes: {} });
  });
  it('paquete .bbsflmt con perfiles que heredan entre sí, y JSON suelto', () => {
    const a = { name: 'Mi PETG lento', inherits: 'Bambu PETG Basic @BBL A1', from: 'User', filament_settings_id: ['Mi PETG lento'], nozzle_temperature: ['245'] };
    const b = { name: 'Mi PETG lento negro', inherits: 'Mi PETG lento', from: 'User', filament_settings_id: ['x'], filament_flow_ratio: ['0.96'] };
    const z = zipSync({ 'a.json': strToU8(JSON.stringify(a)), 'sub/b.json': strToU8(JSON.stringify(b)), 'bundle_structure.json': strToU8('{"bundle_id":"x"}') });
    const c = parsePresetFiles([{ name: 'filamentos.bbsflmt', data: z }, { name: 'calidad.json', data: strToU8(JSON.stringify({ name: 'Rápida', inherits: '0.24mm Draft @BBL A1', print_settings_id: 'Rápida', sparse_infill_density: '10%' })) }]);
    expect(c.find((x) => x.name === 'Mi PETG lento negro')).toMatchObject({ baseName: 'Bambu PETG Basic @BBL A1', changes: { nozzle_temperature: ['245'], filament_flow_ratio: ['0.96'] }, note: 'Hereda de Mi PETG lento' });
    expect(c.find((x) => x.name === 'Rápida')).toMatchObject({ type: 'process', baseName: '0.24mm Draft @BBL A1' });
    expect(() => parsePresetFiles([{ name: 'foto.png', data: new Uint8Array([1]) }])).toThrow(/formato no soportado/);
  });
});

describe('configuración guiada', () => {
  it('reconoce la impresora por marca y modelo', () => {
    expect(suggestMachineBase({ brand: 'Bambu Lab', model: 'A1 mini', name: 'Mini' })).toBe('Bambu Lab A1 mini 0.4 nozzle');
    expect(suggestMachineBase({ brand: 'Bambu Lab', model: 'A1', name: 'Taller' })).toBe('Bambu Lab A1 0.4 nozzle');
    expect(suggestMachineBase({ brand: 'Bambu Lab', model: 'P1S', name: 'x', nozzles: ['0.6'] })).toBe('Bambu Lab P1S 0.6 nozzle');
    expect(suggestMachineBase({ brand: null, model: null, name: 'Impresora rara' })).toBeNull();
    expect(suggestFilamentBase({ type: 'PLA', manufacturer: 'Bambu Lab', line: 'Matte' }, 'Bambu Lab A1 0.4 nozzle')).toBe('Bambu PLA Matte @BBL A1');
    expect(suggestFilamentBase({ type: 'PETG', manufacturer: 'Sunlu', line: null }, 'Bambu Lab A1 0.4 nozzle')).toBe('Generic PETG @System');
    expect(suggestFilamentBase({ type: 'TPU', manufacturer: 'Bambu Lab', line: 'TPU 95A' }, 'Bambu Lab A1 0.4 nozzle')).toBe('Bambu TPU 95A @BBL A1');
    // calidades: la más cercana a 0,20 mm primero y solo las de esa impresora (Prusa usa condiciones, no listas)
    expect(processesFor('Bambu Lab A1 0.4 nozzle')[0]).toBe('0.20mm Standard @BBL A1');
    const mk4s = processesFor('Prusa MK4S 0.4 nozzle'); expect(mk4s[0]).toMatch(/^0\.20mm .*@MK4S 0\.4$/); expect(mk4s.some((n) => /MINI|@MK4 |@MK4$|0\.6$/.test(n))).toBe(false);
  });
  it('configura una máquina y un material sin duplicar perfiles', async () => {
    const [m] = await db.insert(s.machines).values({ workspaceId: (await db.select().from(s.machines))[0].workspaceId, name: 'P1S nueva', brand: 'Bambu Lab', model: 'P1S' }).returning();
    let r = await slicingReadiness(); const row = r.machines.find((x) => x.id === m.id)!;
    expect(row.suggestedMachine).toBe('Bambu Lab P1S 0.4 nozzle'); expect(row.processes[0]).toMatch(/Standard/);
    const a = await setupMachine(m.id, row.suggestedMachine!, null); const b = await setupMachine(m.id, row.suggestedMachine!, null);
    expect(a).toEqual(b); // reutiliza los perfiles «de fábrica tal cual»
    r = await slicingReadiness(); expect(r.machines.find((x) => x.id === m.id)!.defaultProcess).not.toBeNull();
    // un material con perfil de otro tipo se marca (TPU con perfil de PLA) y se sugiere el correcto
    const [tpu] = await db.select().from(s.materials).where(eq(s.materials.type, 'TPU')); const pla = r.filamentProfiles.find((p) => p.name === 'PLA Basic')!;
    await setupFilament(tpu.id, { profileId: pla.id });
    const bad = (await slicingReadiness()).materials.find((x) => x.id === tpu.id)!; expect(bad).toMatchObject({ mismatch: true, profileType: 'PLA', suggested: 'Generic TPU @System' }); expect(bad.label).toBe('Sunlu TPU 95A Negro');
    const mat = r.materials[0]; await setupFilament(mat.id, { base: 'Generic PLA @System' });
    expect((await slicingReadiness()).materials.find((x) => x.id === mat.id)!.filamentProfile?.name).toBe('Generic PLA');
  });
});

describe.skipIf(!orcaAvailable())('filamento personalizado (OrcaSlicer real)', () => {
  it('se crea con formulario, se agrega al inventario y lamina con sus valores', async () => {
    const c = await createCustomFilament({ name: 'Sunlu PETG negro', brand: 'Sunlu', type: 'PETG', values: { nozzle_temperature: '245', filament_density: '1.40', filament_flow_ratio: '0,92', textured_plate_temp: '' }, addToInventory: { colorName: 'Negro', hex: '#111111', costPerKg: 15990 } });
    const [p] = await db.select().from(s.slicerProfiles).where(eq(s.slicerProfiles.id, c.profileId));
    expect(p).toMatchObject({ baseName: 'Generic PETG @System', changes: { nozzle_temperature: '245', filament_density: '1.40', filament_flow_ratio: '0.92', filament_vendor: 'Sunlu' } });
    const [mat] = await db.select().from(s.materials).where(eq(s.materials.id, c.materialId!)); expect(mat).toMatchObject({ type: 'PETG', colorName: 'Negro', costPerKg: 15990, filamentProfileId: c.profileId, density: 1.4 });
    await expect(createCustomFilament({ name: 'malo', type: 'PLA', values: { nozzle_temperature: 'caliente' } })).rejects.toThrow(/debe ser un número/);
    const profs = await db.select().from(s.slicerProfiles); const P = (n: string) => profs.find((x) => x.name === n)!.id;
    const [bar] = await db.select().from(s.modelFiles).where(eq(s.modelFiles.name, 'Barquito decorativo'));
    const generic = await createCustomFilament({ name: 'PETG genérico', type: 'PETG', values: {} });
    const [mine, gen] = await waitForRuns([
      await enqueueSlice({ fileVersionId: bar.currentVersionId!, machineProfileId: P('Bambu Lab A1 0.4'), processProfileId: P('A1 · 0,20 Standard'), filamentProfileId: c.profileId, label: 'custom' }),
      await enqueueSlice({ fileVersionId: bar.currentVersionId!, machineProfileId: P('Bambu Lab A1 0.4'), processProfileId: P('A1 · 0,20 Standard'), filamentProfileId: generic.profileId, label: 'generic' }),
    ], 180_000);
    expect(mine.status).toBe('done'); expect(gen.status).toBe('done');
    const g = (r: typeof mine) => (r.filament ?? []).reduce((a, f) => a + f.g, 0);
    // misma pieza: con densidad 1,40 (vs ~1,27 del genérico) y flujo 0,92 los gramos cambian; el G-code usa 245 °C
    expect(g(mine)).not.toBeCloseTo(g(gen), 1);
    const { getBuffer } = await import('@/lib/storage'); const gc = (await getBuffer(mine.gcodeKey!)).toString();
    expect(gc).toMatch(/M10[49] S245/);
  }, 240_000);
});
