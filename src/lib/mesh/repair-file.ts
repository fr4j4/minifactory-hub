import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { getBuffer } from '../storage';
import { ingestModel } from '../files';
import { parseMesh } from './parse';
import { meshToStl, repairMesh, type RepairReport } from './repair';

/** Repara la malla de una versión y la guarda como versión nueva (STL); la original no se toca. */
export async function repairFileVersion(versionId: string, userId?: string | null): Promise<{ report: RepairReport; versionId: string; modelFileId: string }> {
  const db = await getDb();
  const [v] = await db.select().from(s.fileVersions).where(eq(s.fileVersions.id, versionId)); if (!v) throw new Error('version');
  const [f] = await db.select().from(s.modelFiles).where(eq(s.modelFiles.id, v.modelFileId));
  const mesh = await parseMesh(new Uint8Array(await getBuffer(await (await import('../library/content')).ensureVersionLocal(v.id))), v.format);
  const { mesh: fixed, report } = repairMesh(mesh);
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'mf-repair-')); const tmp = path.join(dir, `${f.name.replace(/[^\w.-]+/g, '_')}-reparado.stl`);
  try {
    await fsp.writeFile(tmp, meshToStl(fixed));
    const r = await ingestModel({ tmpPath: tmp, filename: path.basename(tmp), modelFileId: f.id, userId, comment: `Reparada (v${v.number}): ${report.removed} descartados, ${report.flipped} invertidos, ${report.holesFilled} huecos`, sync: true });
    return { report, versionId: r.versionId, modelFileId: f.id };
  } finally { await fsp.rm(dir, { recursive: true, force: true }); }
}
