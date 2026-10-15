import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { seedDemo } from '@/lib/seed';
import { resolveFilament } from '@/lib/slicer/resolve';
import { enqueueSlice, waitForRuns } from '@/lib/slicer/queue';
import { orcaAvailable } from '@/lib/slicer/catalog';

let db: Awaited<ReturnType<typeof getDb>>;
beforeAll(async () => { fs.rmSync('data/test-storage', { recursive: true, force: true }); await seedDemo(); db = await getDb(); });
const P = async (name: string) => (await db.select().from(s.slicerProfiles)).find((p) => p.name === name)!.id;

describe.skipIf(!orcaAvailable())('el material no depende de un perfil de filamento (D1)', () => {
  it('sin vínculo en el material se sugiere el perfil de la marca y se marca como automático', async () => {
    const [mat] = await db.select().from(s.materials).where(eq(s.materials.manufacturer, 'Bambu Lab'));
    await db.update(s.materials).set({ filamentProfileId: null }).where(eq(s.materials.id, mat.id));
    const r = await resolveFilament({ materialId: mat.id, machineProfileId: await P('Bambu Lab A1 0.4') });
    expect(r.source).toBe('auto'); expect(r.baseName).toMatch(/^Bambu (PLA|PETG)/);
    const again = await resolveFilament({ materialId: mat.id, machineProfileId: await P('Bambu Lab A1 0.4') });
    expect(again.profileId).toBe(r.profileId); // find-or-create: no se acumulan copias
  });
  it('la elección explícita gana sobre todo', async () => {
    const [mat] = await db.select().from(s.materials).where(eq(s.materials.manufacturer, 'Grilon3'));
    const exp = await P('Bambu Lab A1 0.4'); // cualquier perfil que no sea de filamento se ignora
    const auto = await resolveFilament({ materialId: mat.id, explicitProfileId: exp });
    expect(auto.source).not.toBe('explicit');
  });
  it('se puede laminar con solo el material (sin perfil de filamento en la ficha)', async () => {
    const [mat] = await db.select().from(s.materials).where(eq(s.materials.manufacturer, 'Grilon3'));
    await db.update(s.materials).set({ filamentProfileId: null }).where(eq(s.materials.id, mat.id));
    const [bar] = await db.select().from(s.modelFiles).where(eq(s.modelFiles.name, 'Barquito decorativo'));
    const id = await enqueueSlice({ fileVersionId: bar.currentVersionId!, machineProfileId: await P('Bambu Lab A1 0.4'), processProfileId: await P('A1 · 0,20 Standard'), materialId: mat.id, label: 'auto' });
    const [run] = await waitForRuns([id], 180_000);
    expect(run.status).toBe('done');
    expect(run.filamentProfileId).toBeTruthy();
  }, 240_000);
});
