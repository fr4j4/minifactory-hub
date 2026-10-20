import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

/** Migración 0028 (alcance de las fotos) sobre una base con el esquema anterior y fotos ya cargadas. */
const WS = '00000000-0000-4000-8000-000000000001';

function legacyFolder() {
  const dst = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-mig-'));
  fs.cpSync(path.join(process.cwd(), 'drizzle'), dst, { recursive: true });
  const jp = path.join(dst, 'meta', '_journal.json'); const j = JSON.parse(fs.readFileSync(jp, 'utf8'));
  const later = j.entries.filter((e: any) => e.idx >= 28); j.entries = j.entries.filter((e: any) => e.idx < 28); fs.writeFileSync(jp, JSON.stringify(j));
  for (const e of later) fs.rmSync(path.join(dst, `${e.tag}.sql`));
  return dst;
}

describe('migración 0028: alcance de las fotos', () => {
  it('mueve a «model» solo las imágenes importadas de un modelo y deja las fotos de trabajos en la Galería', async () => {
    const client = new PGlite(); const db = drizzle(client);
    await migrate(db, { migrationsFolder: legacyFolder() });
    const cols = (await client.query<{ column_name: string }>(`select column_name from information_schema.columns where table_name='photos'`)).rows.map((r) => r.column_name);
    expect(cols).not.toContain('scope');

    const ins = (caption: string, key: string, tags: string[], extra = '') => client.query(
      `insert into photos (workspace_id, storage_key, caption, tags ${extra ? ', ' + extra.split('=')[0] : ''}) values ($1,$2,$3,$4::jsonb ${extra ? ', ' + extra.split('=')[1] : ''})`, [WS, key, caption, JSON.stringify(tags)]);
    await ins('trabajo', 'photos/original/a.jpg', ['pieza']);
    await ins('trabajo con etiqueta parecida', 'photos/original/b.jpg', ['imagen de origen extra']);
    await ins('importada por etiqueta', 'photos/original/c.webp', ['imagen de origen']);
    await ins('importada por ruta', 'photos/imported/m/x/1600.webp', []);
    await ins('importada borrada', 'photos/imported/m/y/1600.webp', ['imagen de origen'], `deleted_at='2026-02-01T00:00:00Z'`);
    const snap = async () => (await client.query<any>(`select * from photos order by caption`)).rows;
    const before = await snap();

    await migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
    const after = await snap();
    const scope = Object.fromEntries(after.map((r: any) => [r.caption, r.scope]));
    expect(scope).toEqual({ 'trabajo': 'job', 'trabajo con etiqueta parecida': 'job', 'importada por etiqueta': 'model', 'importada por ruta': 'model', 'importada borrada': 'job' });
    // nada más cambió
    const strip = (r: any) => { const { scope: _s, ...rest } = r; return rest; };
    expect(after.map(strip)).toEqual(before.map(strip));
  });
});
