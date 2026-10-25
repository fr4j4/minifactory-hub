import { beforeAll, describe, expect, it } from 'vitest';
import { getDb, s } from '@/db';
import { seedDemo } from '@/lib/seed';
import { orcaProfilesAvailable } from '@/lib/slicer/catalog';
import { clearMaterialProfile, defaultLinkMap, linkedProfileId, materialsLinkedTo, setMaterialProfile } from '@/lib/slicer/links';

let db: Awaited<ReturnType<typeof getDb>>;
beforeAll(async () => { await seedDemo(); db = await getDb(); });

describe.skipIf(!orcaProfilesAvailable())('perfil por defecto del material (material_filament_links)', () => {
  it('el de la impresora gana sobre el general; limpiar los quita', async () => {
    const [mat] = await db.select().from(s.materials).limit(1);
    const profs = await db.select().from(s.slicerProfiles);
    const fil = profs.filter((p) => p.type === 'filament').slice(0, 2); const machine = profs.find((p) => p.type === 'machine')!;
    await setMaterialProfile(mat.id, fil[0].id, null, db);
    expect(await linkedProfileId(mat.id, machine.id, db)).toBe(fil[0].id);
    await setMaterialProfile(mat.id, fil[1].id, machine.id, db);
    expect(await linkedProfileId(mat.id, machine.id, db)).toBe(fil[1].id); expect(await linkedProfileId(mat.id, null, db)).toBe(fil[0].id);
    await setMaterialProfile(mat.id, fil[1].id, null, db); // actualiza, no duplica
    expect((await defaultLinkMap(db)).get(mat.id)).toBe(fil[1].id); expect((await materialsLinkedTo(fil[1].id, db)).some((m) => m.id === mat.id)).toBe(true);
    await clearMaterialProfile(mat.id, db); expect(await linkedProfileId(mat.id, machine.id, db)).toBeNull();
  });
});

describe.skipIf(!orcaProfilesAvailable())('líneas de filamento (filament_lines)', () => {
  it('el seed enlaza cada material con su línea y la edición masiva actualiza a todos sus colores', async () => {
    const { listLines, updateLine, lineProfileOf, syncMaterialLine } = await import('@/lib/services/lines');
    const lines = await listLines(db); const bambuPla = lines.find((l) => l.manufacturer === 'Bambu Lab' && l.name === 'PLA Basic')!;
    expect(bambuPla.count).toBeGreaterThanOrEqual(2);
    const n = await updateLine(bambuPla.id, { costPerKg: 21000, stockMinG: 900 });
    expect(n).toBe(bambuPla.count);
    const rows = await db.select().from(s.materials);
    expect(rows.filter((m) => m.lineId === bambuPla.id).every((m) => m.costPerKg === 21000 && m.stockMinG === 900)).toBe(true);
  });
  it('un material sin perfil propio usa el de su línea', async () => {
    const { listLines, updateLine, lineProfileOf } = await import('@/lib/services/lines'); const { resolveFilament } = await import('@/lib/slicer/resolve');
    const profs = await db.select().from(s.slicerProfiles); const fil = profs.find((p) => p.type === 'filament')!;
    const lines = await listLines(db); const line = lines.find((l) => l.name === 'PLA')!;
    const [mat] = (await db.select().from(s.materials)).filter((m) => m.lineId === line.id);
    await clearMaterialProfile(mat.id, db); await updateLine(line.id, { filamentProfileId: fil.id });
    expect(await lineProfileOf(mat.id, db)).toBe(fil.id);
    const r = await resolveFilament({ materialId: mat.id }, db); expect(r.profileId).toBe(fil.id); expect(r.source).toBe('material');
    await updateLine(line.id, { filamentProfileId: null });
  });
});
