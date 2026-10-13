import { NextResponse } from 'next/server';
import { inArray } from 'drizzle-orm';
import { zipSync } from 'fflate';
import { getDb, s } from '@/db';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/perm';
import { getBuffer } from '@/lib/storage';

/** Descarga en lote (ZIP) de las fotos elegidas, en tamaño 1600 px. */
export async function GET(req: Request) {
  const user = await getSession(); if (!user || !can(user, 'galeria', 'V')) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const ids = (new URL(req.url).searchParams.get('ids') ?? '').split(',').filter(Boolean).slice(0, 200);
  if (!ids.length) return NextResponse.json({ error: 'Sin fotos' }, { status: 400 });
  const db = await getDb(); const rows = await db.select().from(s.photos).where(inArray(s.photos.id, ids));
  const files: Record<string, Uint8Array> = {};
  for (const p of rows) { const key = p.variants?.['1600'] ?? p.storageKey; files[`${p.stage}-${p.id.slice(0, 8)}.${key.split('.').pop()}`] = new Uint8Array(await getBuffer(key)); }
  return new Response(new Uint8Array(zipSync(files, { level: 0 })), { headers: { 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="fotos.zip"' } });
}
