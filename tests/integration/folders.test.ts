import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { seedDemo } from '@/lib/seed';
import { deleteFolder, ensureFolder, listFolders, normPath, renameFolder, setTagColor, tagColors } from '@/lib/library/folders';

let db: Awaited<ReturnType<typeof getDb>>;
beforeAll(async () => { await seedDemo(); db = await getDb(); });

describe('carpetas y etiquetas de la biblioteca', () => {
  it('normaliza rutas y crea las carpetas madre', async () => {
    expect(normPath(' Clientes / Ana //Lote 1 ')).toBe('Clientes/Ana/Lote 1'); expect(normPath('  / ')).toBeNull();
    await ensureFolder('Clientes/Ana/Lote 1', db);
    const paths = (await listFolders(db)).map((f) => f.path); expect(paths).toEqual(expect.arrayContaining(['Clientes', 'Clientes/Ana', 'Clientes/Ana/Lote 1']));
  });
  it('renombrar arrastra subcarpetas y archivos; no se puede mover dentro de sí misma ni pisar otra', async () => {
    const [f] = await db.select().from(s.modelFiles).where(isNull(s.modelFiles.deletedAt)).limit(1);
    await db.update(s.modelFiles).set({ folder: 'Clientes/Ana/Lote 1' }).where(eq(s.modelFiles.id, f.id));
    await renameFolder('Clientes/Ana', 'Clientes/Beatriz', db);
    const [after] = await db.select().from(s.modelFiles).where(eq(s.modelFiles.id, f.id)); expect(after.folder).toBe('Clientes/Beatriz/Lote 1');
    expect((await listFolders(db)).map((x) => x.path)).toEqual(expect.arrayContaining(['Clientes/Beatriz', 'Clientes/Beatriz/Lote 1'])); expect((await listFolders(db)).some((x) => x.path === 'Clientes/Ana')).toBe(false);
    await expect(renameFolder('Clientes/Beatriz', 'Clientes/Beatriz/Dentro', db)).rejects.toThrow();
    await ensureFolder('Otra', db); await expect(renameFolder('Otra', 'Clientes', db)).rejects.toThrow();
  });
  it('eliminar una carpeta sube sus archivos a la madre', async () => {
    const moved = await deleteFolder('Clientes/Beatriz/Lote 1', db); expect(moved).toBeGreaterThanOrEqual(1);
    const rows = await db.select().from(s.modelFiles).where(and(isNull(s.modelFiles.deletedAt), eq(s.modelFiles.folder, 'Clientes/Beatriz'))); expect(rows.length).toBeGreaterThanOrEqual(1);
  });
  it('el color de una etiqueta se guarda y se valida', async () => {
    await setTagColor('Llavero', '#FF8800', db); expect((await tagColors(db)).get('llavero')).toBe('#ff8800');
    await expect(setTagColor('llavero', 'rojo', db)).rejects.toThrow(); await setTagColor('llavero', null, db); expect((await tagColors(db)).has('llavero')).toBe(false);
  });
});
