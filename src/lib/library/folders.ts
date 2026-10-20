import { and, asc, eq, isNull, like, or, sql, type SQL } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { normalizeTag } from './tags';
import { LocalizedError } from '@/i18n/errors';

type Db = Awaited<ReturnType<typeof getDb>>;

/** Normaliza una ruta de carpeta: sin espacios sobrantes ni barras repetidas («Clientes / Ana» → «Clientes/Ana»). */
export function normPath(raw: string | null | undefined): string | null {
  const p = (raw ?? '').split('/').map((x) => x.trim()).filter(Boolean).join('/');
  return p ? p.slice(0, 160) : null;
}
/** «A/B/C» → [«A», «A/B», «A/B/C»] */
export const ancestors = (path: string) => path.split('/').map((_, i, a) => a.slice(0, i + 1).join('/'));

/** Crea la carpeta y las que la contienen. Devuelve la ruta normalizada. */
export async function ensureFolder(raw: string | null | undefined, db?: Db): Promise<string | null> {
  const path = normPath(raw); if (!path) return null;
  db ??= await getDb();
  for (const p of ancestors(path)) await db.insert(s.folders).values({ workspaceId: WORKSPACE_ID, path: p }).onConflictDoNothing();
  return path;
}

export interface FolderRow { path: string; count: number }
/** Todas las carpetas, con la cantidad de archivos que hay directamente en cada una. */
export async function listFolders(db?: Db, access?: SQL): Promise<FolderRow[]> {
  db ??= await getDb();
  const rows = await db.select({ path: s.folders.path }).from(s.folders).where(isNull(s.folders.deletedAt)).orderBy(asc(s.folders.path));
  const counts = await db.select({ f: s.modelFiles.folder, n: sql<number>`count(*)::int` }).from(s.modelFiles).where(and(access,isNull(s.modelFiles.deletedAt), sql`${s.modelFiles.folder} is not null`)).groupBy(s.modelFiles.folder);
  const by = new Map(counts.map((c) => [c.f as string, Number(c.n)]));
  return rows.map((r) => ({ path: r.path, count: by.get(r.path) ?? 0 }));
}

/** Condición para listar una carpeta con todo lo que hay dentro. */
export const inFolder = (path: string) => or(eq(s.modelFiles.folder, path), like(s.modelFiles.folder, `${path.replace(/[%_\\]/g, '\\$&')}/%`))!;

/** Cambia el nombre o mueve una carpeta: arrastra sus subcarpetas y los archivos. Falla si el destino ya existe. */
export async function renameFolder(fromRaw: string, toRaw: string, db?: Db, access?: SQL): Promise<number> {
  db ??= await getDb();
  const from = normPath(fromRaw), to = normPath(toRaw); if (!from || !to) throw new LocalizedError('files.errFolderInvalid');
  if (from === to) return 0;
  if(access){const [hidden]=await db.select({id:s.modelFiles.id}).from(s.modelFiles).where(and(inFolder(from),sql`not (${access})`)).limit(1);if(hidden)throw new Error('La carpeta contiene modelos restringidos');}
  if (to.startsWith(from + '/')) throw new LocalizedError('files.errFolderIntoItself');
  const [clash] = await db.select({ id: s.folders.id }).from(s.folders).where(and(eq(s.folders.path, to), isNull(s.folders.deletedAt)));
  if (clash) throw new LocalizedError('files.errFolderExists');
  const subs = (await db.select().from(s.folders).where(isNull(s.folders.deletedAt))).filter((f) => f.path === from || f.path.startsWith(from + '/'));
  if (!subs.length) throw new LocalizedError('files.errFolderNotFound');
  let moved = 0;
  for (const f of subs) {
    const next = to + f.path.slice(from.length);
    await ensureFolder(next.split('/').slice(0, -1).join('/'), db);
    await db.update(s.folders).set({ path: next, updatedAt: new Date() }).where(eq(s.folders.id, f.id));
    moved += (await db.update(s.modelFiles).set({ folder: next, updatedAt: new Date() }).where(and(eq(s.modelFiles.folder, f.path), isNull(s.modelFiles.deletedAt))).returning({ id: s.modelFiles.id })).length;
  }
  return moved;
}

/** Elimina la carpeta (y sus subcarpetas); los archivos suben a la carpeta madre (o quedan sin carpeta). */
export async function deleteFolder(pathRaw: string, db?: Db, access?: SQL): Promise<number> {
  db ??= await getDb();
  const path = normPath(pathRaw); if (!path) return 0;
  if(access){const [hidden]=await db.select({id:s.modelFiles.id}).from(s.modelFiles).where(and(inFolder(path),sql`not (${access})`)).limit(1);if(hidden)throw new Error('La carpeta contiene modelos restringidos');}
  const parent = path.includes('/') ? path.split('/').slice(0, -1).join('/') : null;
  const moved = (await db.update(s.modelFiles).set({ folder: parent, updatedAt: new Date() }).where(and(isNull(s.modelFiles.deletedAt), inFolder(path))).returning({ id: s.modelFiles.id })).length;
  await db.delete(s.folders).where(or(eq(s.folders.path, path), like(s.folders.path, `${path.replace(/[%_\\]/g, '\\$&')}/%`)));
  return moved;
}

/** Registra las etiquetas (por nombre) para que existan con su color. */
export async function ensureTags(names: string[], db?: Db) {
  db ??= await getDb();
  for (const n of [...new Set(names.map(normalizeTag).filter(Boolean))]) await db.insert(s.tagDefs).values({ workspaceId: WORKSPACE_ID, name: n }).onConflictDoNothing();
}
export async function setTagColor(name: string, color: string | null, db?: Db) {
  db ??= await getDb(); const n = normalizeTag(name); if (!n) return;
  if (color && !/^#[0-9a-f]{6}$/i.test(color)) throw new LocalizedError('files.errTagColor');
  await ensureTags([n], db); await db.update(s.tagDefs).set({ color: color?.toLowerCase() ?? null, updatedAt: new Date() }).where(eq(s.tagDefs.name, n));
}
export async function tagColors(db?: Db): Promise<Map<string, string>> {
  db ??= await getDb();
  return new Map((await db.select().from(s.tagDefs).where(and(isNull(s.tagDefs.deletedAt), sql`${s.tagDefs.color} is not null`))).map((t) => [t.name, t.color!]));
}
