import path from 'node:path';
import fs from 'node:fs';
import * as schema from './schema';

type AnyDb = ReturnType<typeof import('drizzle-orm/pglite').drizzle<typeof schema>>;

/** Una sola instancia por proceso (también bajo HMR de `next dev`). */
const g = globalThis as unknown as { __mfDb?: Promise<AnyDb>; __mfDriver?: string };

export const WORKSPACE_ID = process.env.WORKSPACE_ID || '00000000-0000-4000-8000-000000000001';

async function init(): Promise<AnyDb> {
  const migrationsFolder = path.join(process.cwd(), 'drizzle');
  if (process.env.DATABASE_URL) {
    const { Pool } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder });
    g.__mfDriver = 'postgres';
    return db as unknown as AnyDb;
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const dir = process.env.PGLITE_DIR || path.join(process.cwd(), 'data', 'pgdata');
  const mem = dir === 'memory://';
  if (!mem) fs.mkdirSync(path.dirname(dir), { recursive: true });
  const client = new PGlite(mem ? undefined : dir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  g.__mfDriver = 'pglite';
  return db;
}

export function getDb(): Promise<AnyDb> {
  if (!g.__mfDb) g.__mfDb = init();
  return g.__mfDb;
}

export function driverName() { return g.__mfDriver ?? (process.env.DATABASE_URL ? 'postgres' : 'pglite'); }

export * as s from './schema';
export { schema };
