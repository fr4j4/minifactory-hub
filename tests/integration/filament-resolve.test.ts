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

describe.skipIf(!orcaAvailable())('calidad por intención', () => {
  it('«Fino» y «Estándar» se resuelven para la boquilla de la máquina y se reutilizan', async () => {
    const { ensureQuality } = await import('@/lib/slicer/setup');
    const m = await P('Bambu Lab A1 0.4');
    const fino = await ensureQuality({ machineProfileId: m, key: 'fino' });
    const again = await ensureQuality({ machineProfileId: m, key: 'fino' });
    expect(again.id).toBe(fino.id);
    const [row] = await db.select().from(s.slicerProfiles).where(eq(s.slicerProfiles.id, fino.id));
    expect(row.nozzle).toBe('0.4'); expect(String((row.changes as any).layer_height)).toBe('0.12');
    const est = await ensureQuality({ machineProfileId: m, key: 'estandar' });
    const [r2] = await db.select().from(s.slicerProfiles).where(eq(s.slicerProfiles.id, est.id));
    expect(String((r2.changes as any).layer_height ?? '0.2')).toBe('0.2');
  });
});
