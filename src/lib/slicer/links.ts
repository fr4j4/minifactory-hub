import { and, eq, inArray, isNull } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';

type Db = Awaited<ReturnType<typeof getDb>>;

/** Perfil de filamento que el taller dejó por defecto para un material (el de esa impresora si lo hay; si no, el general). */
export async function linkedProfileId(materialId: string, machineProfileId?: string | null, db?: Db): Promise<string | null> {
  db ??= await getDb();
  const rows = await db.select().from(s.materialFilamentLinks).where(and(eq(s.materialFilamentLinks.materialId, materialId), isNull(s.materialFilamentLinks.deletedAt)));
  return (machineProfileId ? rows.find((r) => r.machineProfileId === machineProfileId) : undefined)?.filamentProfileId ?? rows.find((r) => !r.machineProfileId)?.filamentProfileId ?? null;
}

/** Fija (o cambia) el perfil por defecto de un material; con `machineProfileId`, solo para esa impresora. */
export async function setMaterialProfile(materialId: string, filamentProfileId: string, machineProfileId: string | null = null, db?: Db, userId?: string | null) {
  db ??= await getDb();
  const rows = await db.select().from(s.materialFilamentLinks).where(and(eq(s.materialFilamentLinks.materialId, materialId), isNull(s.materialFilamentLinks.deletedAt)));
  const cur = rows.find((r) => (r.machineProfileId ?? null) === machineProfileId);
  if (cur) await db.update(s.materialFilamentLinks).set({ filamentProfileId, updatedAt: new Date() }).where(eq(s.materialFilamentLinks.id, cur.id));
  else await db.insert(s.materialFilamentLinks).values({ workspaceId: WORKSPACE_ID, materialId, filamentProfileId, machineProfileId, createdBy: userId ?? null });
}

export async function clearMaterialProfile(materialId: string, db?: Db) {
  db ??= await getDb();
  await db.update(s.materialFilamentLinks).set({ deletedAt: new Date() }).where(and(eq(s.materialFilamentLinks.materialId, materialId), isNull(s.materialFilamentLinks.deletedAt)));
}

/** Materiales (no eliminados) que usan este perfil de filamento por defecto. */
export async function materialsLinkedTo(profileId: string, db?: Db) {
  db ??= await getDb();
  const links = await db.select({ m: s.materialFilamentLinks.materialId }).from(s.materialFilamentLinks).where(and(eq(s.materialFilamentLinks.filamentProfileId, profileId), isNull(s.materialFilamentLinks.deletedAt)));
  const ids = [...new Set(links.map((l) => l.m))]; if (!ids.length) return [];
  return db.select().from(s.materials).where(and(inArray(s.materials.id, ids), isNull(s.materials.deletedAt)));
}

/** Mapa material → perfil general (para pantallas que lo muestran de una vez). */
export async function defaultLinkMap(db?: Db): Promise<Map<string, string>> {
  db ??= await getDb();
  const rows = await db.select().from(s.materialFilamentLinks).where(isNull(s.materialFilamentLinks.deletedAt));
  return new Map(rows.filter((r) => !r.machineProfileId).map((r) => [r.materialId, r.filamentProfileId]));
}
