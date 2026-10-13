import { NextResponse } from 'next/server';
import { zipSync } from 'fflate';
import fs from 'node:fs';
import path from 'node:path';
import { getDb, schema } from '@/db';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/perm';
import { config } from '@/lib/config';

function walk(dir: string, base: string, out: Record<string, Uint8Array>, limit: { n: number }) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, f.name); if (f.isDirectory()) walk(p, base, out, limit); else if (limit.n > 0) { const buf = fs.readFileSync(p); limit.n -= buf.length; out['archivos/' + path.relative(base, p)] = new Uint8Array(buf); } }
}

/** Respaldo y exportación completa: todos los datos en JSON + los archivos (ZIP). Solo administradores. */
export async function GET(req: Request) {
  const user = await getSession(); if (!user || !can(user, 'config', 'E') || user.role !== 'admin') return NextResponse.json({ error: 'Solo el administrador puede exportar' }, { status: 403 });
  const db = await getDb(); const files: Record<string, Uint8Array> = {}; const enc = new TextEncoder();
  for (const [name, table] of Object.entries(schema)) { if (name === 'sessions' || typeof table !== 'object' || !(table as any)?._?.name) continue; try { const rows = await (db as any).select().from(table); files[`datos/${(table as any)._.name}.json`] = enc.encode(JSON.stringify(rows)); } catch { /* tabla no exportable */ } }
  if (new URL(req.url).searchParams.get('archivos') !== '0') walk(config.storageDir, config.storageDir, files, { n: 400 * 1024 * 1024 });
  files['LEEME.txt'] = enc.encode(`Respaldo MiniFactory ${new Date().toISOString()}\ndatos/*.json: una tabla por archivo.\narchivos/: modelos, G-code y fotos.`);
  return new Response(new Uint8Array(zipSync(files, { level: 0 })), { headers: { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="respaldo-minifactory-${new Date().toISOString().slice(0, 10)}.zip"` } });
}
