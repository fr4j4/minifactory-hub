import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { seedDemo } from '@/lib/seed';
import { orcaProfilesAvailable } from '@/lib/slicer/catalog';
import { ensurePresets, loadPresets, removePreset, resolveProfileRef, savePreset } from '@/lib/slicer/presets';
import { qualityTemplates } from '@/lib/slicer/nozzle';
import { createQualityFromTemplates } from '@/lib/slicer/setup';

let db: Awaited<ReturnType<typeof getDb>>;
beforeAll(async () => { await seedDemo(); db = await getDb(); });

describe.skipIf(!orcaProfilesAvailable())('calidades por intención (quality_presets)', () => {
  it('el backfill es idempotente y reproduce las plantillas de fábrica', async () => {
    const first = await ensurePresets(db); expect(first).toBeGreaterThanOrEqual(0);
    expect(await ensurePresets(db)).toBe(0);
    const presets = await loadPresets(db); expect(presets.map((p) => p.key)).toEqual(['borrador', 'estandar', 'fino', 'resistente', 'funcional']);
    expect(qualityTemplates('0.4', undefined, presets)).toEqual(qualityTemplates('0.4'));
  });

  it('una calidad propia se materializa como perfil de proceso con su nombre y su capa', async () => {
    const id = await savePreset({ label: 'Miniaturas', layerFactor: 0.25, wallMm: 1.2, topMm: 1.2, bottomMm: 1, infill: '10%' });
    const presets = await loadPresets(db); const mine = presets.find((p) => p.label === 'Miniaturas')!; expect(mine.key).toBe('miniaturas');
    const [machine] = await db.select().from(s.slicerProfiles).where(eq(s.slicerProfiles.name, 'Bambu Lab A1 0.4'));
    const [r] = await createQualityFromTemplates({ machineBase: machine.baseName, machineChanges: machine.changes, nozzle: '0.4', keys: ['miniaturas'], reuse: true }, db);
    expect(r.name).toContain('Miniaturas'); const [row] = await db.select().from(s.slicerProfiles).where(eq(s.slicerProfiles.id, r.id)); expect((row.changes as any).layer_height).toBe('0.1');
    expect(await resolveProfileRef({ kind: 'quality', key: 'miniaturas', machineProfileId: machine.id }, null, db)).toBe(r.id);
    expect(await resolveProfileRef({ kind: 'profile', id: r.id })).toBe(r.id);
    await removePreset(id, db); expect((await loadPresets(db)).some((p) => p.key === 'miniaturas')).toBe(false);
  });

  it('las de fábrica solo se desactivan y se validan los rangos', async () => {
    const [b] = await db.select().from(s.qualityPresets).where(eq(s.qualityPresets.key, 'funcional'));
    await removePreset(b.id, db); expect((await loadPresets(db)).some((p) => p.key === 'funcional')).toBe(false);
    await db.update(s.qualityPresets).set({ active: true }).where(eq(s.qualityPresets.id, b.id));
    await expect(savePreset({ label: 'X', layerFactor: 2, wallMm: 1, topMm: 1, bottomMm: 1, infill: '10%' })).rejects.toThrow();
    await expect(savePreset({ label: 'X', layerFactor: 0.4, wallMm: 1, topMm: 1, bottomMm: 1, infill: 'mucho' })).rejects.toThrow();
  });
});
