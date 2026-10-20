import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

/**
 * Migración 0031 (calculadora v2) sobre una base con el esquema ANTERIOR y datos reales: clientes, materiales, canales,
 * presupuestos y líneas. Es el camino de un servidor en producción: migra hasta 0030, hay datos, y arranca con 0031.
 */
const WS = '00000000-0000-4000-8000-000000000001';

function legacyFolder() {
  const dst = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-mig-'));
  fs.cpSync(path.join(process.cwd(), 'drizzle'), dst, { recursive: true });
  const jp = path.join(dst, 'meta', '_journal.json'); const j = JSON.parse(fs.readFileSync(jp, 'utf8'));
  const later = j.entries.filter((e: any) => e.idx >= 31); j.entries = j.entries.filter((e: any) => e.idx < 31); fs.writeFileSync(jp, JSON.stringify(j));
  for (const e of later) fs.rmSync(path.join(dst, `${e.tag}.sql`));
  return dst;
}
const cols = async (client: PGlite, table: string) => (await client.query<{ column_name: string }>(`select column_name from information_schema.columns where table_name='${table}'`)).rows.map((r) => r.column_name);

describe('migración 0031: calculadora v2', () => {
  it('agrega solo columnas opcionales y deja intactos los datos que ya había', async () => {
    const client = new PGlite(); const db = drizzle(client);
    await migrate(db, { migrationsFolder: legacyFolder() });
    expect(await cols(client, 'quotes')).not.toContain('calc_profile_id');

    // datos como los de un taller que ya cotiza
    await client.query(`insert into customers (workspace_id, name) values ($1,'Cliente Antiguo')`, [WS]);
    await client.query(`insert into materials (workspace_id, type, color_name, cost_per_kg) values ($1,'PLA','Negro',17000)`, [WS]);
    await client.query(`insert into sales_channels (workspace_id, name, commission_pct) values ($1,'Marketplace',8)`, [WS]);
    await client.query(`insert into quotes (workspace_id, number, apply_tax, total, tax_amount) values ($1,'P-2026-0001',true,119000,19000)`, [WS]);
    const [q] = (await client.query<{ id: string }>(`select id from quotes`)).rows;
    await client.query(`insert into quote_items (workspace_id, quote_id, position, description, qty, suggested_unit) values ($1,$2,0,'Pieza',2,5000)`, [WS, q.id]);
    const snap = async () => ({
      customers: (await client.query<any>(`select * from customers`)).rows, materials: (await client.query<any>(`select * from materials`)).rows,
      channels: (await client.query<any>(`select * from sales_channels`)).rows, quotes: (await client.query<any>(`select * from quotes`)).rows, items: (await client.query<any>(`select * from quote_items`)).rows,
    });
    const before = await snap();

    await migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
    const after = await snap();

    for (const [t, c] of [['customers', 'calc_profile_id'], ['materials', 'risk_factor'], ['materials', 'waste_pct'], ['quotes', 'calc_profile_id'], ['quotes', 'channel_id'], ['quote_items', 'calc_profile_id'], ['quote_items', 'calc_opts'], ['sales_channels', 'calc_profile_id']])
      expect(await cols(client, t)).toContain(c);
    // los datos existentes no cambian: solo aparecen las columnas nuevas, vacías (calc_opts parte en {})
    const strip = (rows: any[], keys: string[]) => rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !keys.includes(k))));
    expect(strip(after.customers, ['calc_profile_id'])).toEqual(before.customers);
    expect(strip(after.materials, ['risk_factor', 'waste_pct'])).toEqual(before.materials);
    expect(strip(after.channels, ['calc_profile_id'])).toEqual(before.channels);
    expect(strip(after.quotes, ['calc_profile_id', 'channel_id'])).toEqual(before.quotes);
    expect(strip(after.items, ['calc_profile_id', 'calc_opts'])).toEqual(before.items);
    expect(after.quotes[0]).toMatchObject({ apply_tax: true, total: 119000, tax_amount: 19000, calc_profile_id: null, channel_id: null });
    expect(after.items[0]).toMatchObject({ calc_profile_id: null, calc_opts: {} }); expect(after.materials[0]).toMatchObject({ risk_factor: null, waste_pct: null });
  });

  it('se puede aplicar dos veces sin error (columnas con IF NOT EXISTS)', async () => {
    const client = new PGlite();
    await migrate(drizzle(client), { migrationsFolder: path.join(process.cwd(), 'drizzle') });
    const sql = fs.readFileSync(path.join(process.cwd(), 'drizzle', '0031_calculadora_v2.sql'), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint')) await client.exec(stmt);
  });
});
