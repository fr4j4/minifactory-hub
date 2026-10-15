import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { audit } from '../audit';

type Db = Awaited<ReturnType<typeof getDb>>;

/** Busca la línea (marca + nombre) o la crea. Devuelve null si el material no tiene nombre de línea. */
export async function ensureLine(i: { manufacturer?: string | null; line?: string | null; type?: string | null }, db?: Db): Promise<string | null> {
  const name = i.line?.trim(); if (!name) return null;
  db ??= await getDb();
  const man = i.manufacturer?.trim() || null;
  const [ex] = await db.select({ id: s.filamentLines.id }).from(s.filamentLines).where(and(isNull(s.filamentLines.deletedAt), eq(s.filamentLines.name, name), man ? eq(s.filamentLines.manufacturer, man) : isNull(s.filamentLines.manufacturer)));
  if (ex) return ex.id;
  const [r] = await db.insert(s.filamentLines).values({ workspaceId: WORKSPACE_ID, manufacturer: man, name, type: i.type ?? null }).returning({ id: s.filamentLines.id });
  return r.id;
}

/** Enlaza un material con su línea (según marca y línea del propio material). */
export async function syncMaterialLine(materialId: string, db?: Db) {
  db ??= await getDb();
  const [m] = await db.select().from(s.materials).where(eq(s.materials.id, materialId)); if (!m) return null;
  const id = await ensureLine({ manufacturer: m.manufacturer, line: m.line, type: m.type }, db);
  if (id !== m.lineId) await db.update(s.materials).set({ lineId: id }).where(eq(s.materials.id, materialId));
  return id;
}

export interface LineSummary { id: string; manufacturer: string | null; name: string; type: string | null; costPerKg: number | null; stockMinG: number | null; filamentProfileId: string | null; count: number }

export async function listLines(db?: Db): Promise<LineSummary[]> {
  db ??= await getDb();
  const lines = await db.select().from(s.filamentLines).where(isNull(s.filamentLines.deletedAt)).orderBy(asc(s.filamentLines.manufacturer), asc(s.filamentLines.name));
  const counts = await db.select({ id: s.materials.lineId, n: sql<number>`count(*)::int` }).from(s.materials).where(isNull(s.materials.deletedAt)).groupBy(s.materials.lineId);
  const by = new Map(counts.map((c) => [c.id, Number(c.n)]));
  return lines.map((l) => ({ id: l.id, manufacturer: l.manufacturer, name: l.name, type: l.type, costPerKg: l.costPerKg, stockMinG: l.stockMinG, filamentProfileId: l.filamentProfileId, count: by.get(l.id) ?? 0 })).filter((l) => l.count > 0);
}

/** Edita la línea y aplica costo y stock mínimo a todos sus colores; el perfil de filamento queda como valor por defecto de la línea. */
export async function updateLine(id: string, patch: { costPerKg?: number | null; stockMinG?: number | null; filamentProfileId?: string | null }, userId?: string | null, db?: Db): Promise<number> {
  db ??= await getDb();
  const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  const lineSet: Record<string, unknown> = { updatedAt: new Date() }; const matSet: Record<string, unknown> = {};
  if (ok(patch.costPerKg)) { lineSet.costPerKg = Math.round(patch.costPerKg); matSet.costPerKg = Math.round(patch.costPerKg); }
  if (ok(patch.stockMinG)) { lineSet.stockMinG = Math.round(patch.stockMinG); matSet.stockMinG = Math.round(patch.stockMinG); }
  if (patch.filamentProfileId !== undefined) lineSet.filamentProfileId = patch.filamentProfileId || null;
  await db.update(s.filamentLines).set(lineSet).where(eq(s.filamentLines.id, id));
  let n = 0;
  if (Object.keys(matSet).length) n = (await db.update(s.materials).set({ ...matSet, updatedAt: new Date() }).where(and(eq(s.materials.lineId, id), isNull(s.materials.deletedAt))).returning({ id: s.materials.id })).length;
  await audit('filament_line', id, 'editar', { ...lineSet, count: n }, userId);
  return n;
}

/** Perfil de filamento por defecto de la línea de un material (si lo tiene). */
export async function lineProfileOf(materialId: string, db?: Db): Promise<string | null> {
  db ??= await getDb();
  const [r] = await db.select({ p: s.filamentLines.filamentProfileId }).from(s.materials).innerJoin(s.filamentLines, eq(s.filamentLines.id, s.materials.lineId)).where(eq(s.materials.id, materialId));
  return r?.p ?? null;
}
