/**
 * Sincroniza el catálogo de filamentos desde un clon de Open Filament Database (MIT).
 * Copia tal cual `data/**.json`, `schemas/`, `stores/*.json` y `LICENSE` a `vendor/open-filament-database/`
 * (sin transformar nada, para que el diff de Git sea el diff del origen) y escribe `SYNC.json`.
 *
 *   git clone --depth 1 https://github.com/OpenFilamentCollective/open-filament-database.git /tmp/ofd
 *   npx tsx scripts/catalog-sync.ts /tmp/ofd
 *
 * Las imágenes no se copian. Falla (sin tocar `vendor/`) si algún JSON no se puede leer o le faltan campos obligatorios.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { z } from 'zod';

const src = process.argv[2];
if (!src || !existsSync(join(src, 'data'))) { console.error('Uso: tsx scripts/catalog-sync.ts <ruta-al-clon-de-open-filament-database>'); process.exit(1); }
const dest = join(process.cwd(), 'vendor', 'open-filament-database');

const shapes: Record<string, z.ZodType> = {
  'brand.json': z.object({ id: z.string(), name: z.string() }).passthrough(),
  'material.json': z.object({ material: z.string() }).passthrough(),
  'filament.json': z.object({ id: z.string(), name: z.string(), density: z.number() }).passthrough(),
  'variant.json': z.object({ id: z.string(), name: z.string(), color_hex: z.union([z.string(), z.array(z.string())]) }).passthrough(),
  'sizes.json': z.array(z.object({ filament_weight: z.number() }).passthrough()),
};

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) { const p = join(dir, e); statSync(p).isDirectory() ? walk(p, out) : out.push(p); }
  return out;
}

const files = walk(join(src, 'data')).filter((f) => f.endsWith('.json'));
const counts = { brands: 0, filaments: 0, variants: 0 };
const errors: string[] = [];
for (const f of files) {
  const name = f.split('/').pop()!;
  try {
    const json = JSON.parse(readFileSync(f, 'utf8'));
    const shape = shapes[name]; if (shape) { const r = shape.safeParse(json); if (!r.success) errors.push(`${relative(src, f)}: ${r.error.issues[0]?.message}`); }
  } catch (e) { errors.push(`${relative(src, f)}: ${(e as Error).message}`); }
  if (name === 'brand.json') counts.brands++; else if (name === 'filament.json') counts.filaments++; else if (name === 'variant.json') counts.variants++;
}
if (errors.length) { console.error(`JSON inválidos (${errors.length}):\n` + errors.slice(0, 20).join('\n')); process.exit(1); }

rmSync(join(dest, 'data'), { recursive: true, force: true });
rmSync(join(dest, 'stores'), { recursive: true, force: true });
rmSync(join(dest, 'schemas'), { recursive: true, force: true });
for (const f of files) { const to = join(dest, relative(src, f)); mkdirSync(dirname(to), { recursive: true }); cpSync(f, to); }
for (const f of walk(join(src, 'stores')).filter((x) => x.endsWith('.json'))) { const to = join(dest, relative(src, f)); mkdirSync(dirname(to), { recursive: true }); cpSync(f, to); }
cpSync(join(src, 'schemas'), join(dest, 'schemas'), { recursive: true });
cpSync(join(src, 'LICENSE'), join(dest, 'LICENSE'));

let commit = 'desconocido', commitDate = '';
try { commit = execFileSync('git', ['-C', src, 'rev-parse', 'HEAD']).toString().trim(); commitDate = execFileSync('git', ['-C', src, 'log', '-1', '--format=%cI']).toString().trim(); } catch { /* sin Git: se deja constancia */ }
writeFileSync(join(dest, 'SYNC.json'), JSON.stringify({ source: 'https://github.com/OpenFilamentCollective/open-filament-database', license: 'MIT', commit, commitDate, ...counts }, null, 2) + '\n');
console.log(`Catálogo sincronizado: ${counts.brands} marcas, ${counts.filaments} filamentos, ${counts.variants} colores (commit ${commit.slice(0, 7)}).`);
