import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

/**
 * Migración 0021 (cola global) sobre una base con el esquema ANTERIOR y datos con el formato antiguo
 * (`position` por máquina). Es el camino real de un servidor en producción: migra hasta 0020, hay datos, y arranca con 0021.
 */
const WS = '00000000-0000-4000-8000-000000000001';
const MA = 'aaaaaaaa-0000-4000-8000-00000000000a'; const MB = 'bbbbbbbb-0000-4000-8000-00000000000b';

function legacyFolder() {
  const src = path.join(process.cwd(), 'drizzle'); const dst = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-mig-'));
  fs.cpSync(src, dst, { recursive: true });
  const jp = path.join(dst, 'meta', '_journal.json'); const j = JSON.parse(fs.readFileSync(jp, 'utf8'));
  j.entries = j.entries.filter((e: any) => e.tag !== '0021_cola_global'); fs.writeFileSync(jp, JSON.stringify(j));
  fs.rmSync(path.join(dst, '0021_cola_global.sql'));
  return dst;
}

describe('migración 0021: cola global', () => {
  it('renumera solo la posición de los trabajos vivos, conserva el orden por máquina y no toca nada más', async () => {
    const client = new PGlite(); const db = drizzle(client);
    await migrate(db, { migrationsFolder: legacyFolder() }); // esquema antiguo (sin columna dims)
    const cols = (await client.query<{ column_name: string }>(`select column_name from information_schema.columns where table_name='print_jobs'`)).rows.map((r) => r.column_name);
    expect(cols).not.toContain('dims');

    // formato antiguo: posiciones por máquina (A: en curso + 2 en cola, B: 2 en cola, sin asignar: ambos en 1), más un terminado y uno borrado
    const ins = (n: string, status: string, machine: string | null, pos: number, minute: number, extra = '') => client.query(
      `insert into print_jobs (workspace_id, number, title, status, machine_id, position, created_at ${extra ? ', ' + extra.split('=')[0] : ''}) values ($1,$2,$2,$3,$4,$5, '2026-01-01T10:${String(minute).padStart(2, '0')}:00Z' ${extra ? ', ' + extra.split('=')[1] : ''})`,
      [WS, n, status, machine, pos]);
    await ins('R', 'imprimiendo', MA, 3, 0); await ins('A2', 'en_cola', MA, 1, 1); await ins('A3', 'en_cola', MA, 2, 2);
    await ins('B1', 'en_cola', MB, 1, 3); await ins('B2', 'en_cola', MB, 2, 4);
    await ins('U1', 'en_cola', null, 1, 5); await ins('U2', 'en_cola', null, 1, 6);
    await ins('T', 'terminado', MA, 1, 7); await ins('D', 'en_cola', MB, 7, 8, `deleted_at='2026-02-01T00:00:00Z'`);
    const snap = async () => (await client.query<any>(`select * from print_jobs order by number`)).rows;
    const before = await snap();

    await migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') }); // arranque con la migración nueva
    const after = await snap();
    const pos = Object.fromEntries(after.map((r: any) => [r.number, r.position]));

    // vivos: 1..7 sin repetir; el trabajo en curso primero (aunque tuviera la posición 3), luego por posición antigua y fecha de creación
    expect(pos).toMatchObject({ R: 1, A2: 2, B1: 3, U1: 4, U2: 5, A3: 6, B2: 7 });
    expect(pos.A2).toBeLessThan(pos.A3); expect(pos.B1).toBeLessThan(pos.B2); // el orden relativo de cada máquina se conserva
    // los cerrados y los borrados no se tocan
    expect(pos.T).toBe(1); expect(pos.D).toBe(7);
    // nada más cambió: ni máquina, ni estado, ni títulos, ni fechas; `dims` queda en NULL
    const strip = (r: any) => { const { position, dims, ...rest } = r; return rest; };
    expect(after.map(strip)).toEqual(before.map(strip));
    expect(after.every((r: any) => r.dims === null)).toBe(true);
    // idempotente: reaplicar la sentencia de datos deja exactamente lo mismo
    const sqlText = fs.readFileSync(path.join(process.cwd(), 'drizzle', '0021_cola_global.sql'), 'utf8');
    for (const stmt of sqlText.split('--> statement-breakpoint')) await client.exec(stmt);
    expect((await snap()).map((r: any) => r.position)).toEqual(after.map((r: any) => r.position));
    // y el sistema anterior seguiría ordenando bien cada máquina con estos datos
    const orderOf = (m: string) => after.filter((r: any) => r.machine_id === m && r.deleted_at === null && ['en_cola', 'imprimiendo', 'pausado'].includes(r.status)).sort((a: any, b: any) => a.position - b.position).map((r: any) => r.number);
    expect(orderOf(MA)).toEqual(['R', 'A2', 'A3']); expect(orderOf(MB)).toEqual(['B1', 'B2']);
  });

  it('una base vacía y una base sin trabajos migran sin errores', async () => {
    const client = new PGlite(); const db = drizzle(client);
    await migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
    expect((await client.query<any>(`select count(*)::int as n from print_jobs`)).rows[0].n).toBe(0);
  });
});
