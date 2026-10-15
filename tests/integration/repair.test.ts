import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { seedDemo } from '@/lib/seed';
import { ingestModel } from '@/lib/files';
import { meshToStl } from '@/lib/mesh/repair';
import { repairFileVersion } from '@/lib/mesh/repair-file';

let db: Awaited<ReturnType<typeof getDb>>;
beforeAll(async () => { await seedDemo(); db = await getDb(); fs.mkdirSync('data/test-storage', { recursive: true }); });

describe('reparar un archivo de la biblioteca', () => {
  it('crea una versión nueva cerrada y deja la original intacta', async () => {
    const v = [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0], [0, 0, 10], [10, 0, 10], [10, 10, 10], [0, 10, 10]];
    const f = [[4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]; // sin la base
    const tmp = 'data/test-storage/roto.stl'; fs.writeFileSync(tmp, meshToStl({ positions: Float32Array.from(f.flatMap((t) => t.flatMap((i) => v[i]))) }));
    const r = await ingestModel({ tmpPath: tmp, filename: 'roto.stl', sync: true });
    const [orig] = await db.select().from(s.fileVersions).where(eq(s.fileVersions.id, r.versionId)); expect((orig.meta as any).analysis.closed).toBe(false);
    const fixed = await repairFileVersion(r.versionId);
    expect(fixed.report.holesFilled).toBe(1); expect(fixed.report.closedAfter).toBe(true);
    const [nv] = await db.select().from(s.fileVersions).where(eq(s.fileVersions.id, fixed.versionId)); expect(nv.number).toBe(2); expect((nv.meta as any).analysis.closed).toBe(true);
    const [still] = await db.select().from(s.fileVersions).where(eq(s.fileVersions.id, r.versionId)); expect((still.meta as any).analysis.closed).toBe(false);
  });
});
