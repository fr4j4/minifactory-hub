import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

/** Base nueva con los datos de demostración (los mismos en cada corrida). */
export default async function globalSetup() {
  const dir = path.resolve('data/visual'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  execSync('npx tsx scripts/seed.ts', { stdio: 'inherit', env: { ...process.env, PGLITE_DIR: path.join(dir, 'pgdata'), STORAGE_DIR: path.join(dir, 'storage'), DATA_DIR: dir } });
}
