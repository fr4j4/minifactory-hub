import { beforeAll, describe, expect, it } from 'vitest';
import { getDb, s } from '@/db';
import { seedDemo } from '@/lib/seed';
import { clearMaterialProfile, defaultLinkMap, linkedProfileId, materialsLinkedTo, setMaterialProfile } from '@/lib/slicer/links';

let db: Awaited<ReturnType<typeof getDb>>;
beforeAll(async () => { await seedDemo(); db = await getDb(); });

describe('perfil por defecto del material (material_filament_links)', () => {
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
