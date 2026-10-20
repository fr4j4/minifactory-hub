import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { getSession } from '@/lib/auth';
import { config } from '@/lib/config';
import { getT } from '@/i18n/server';

/** Inicia una subida por partes (reanudable). */
export async function POST(req: Request) {
  const t = await getT();
  const user = await getSession();
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 });
  const { filename, size } = await req.json();
  if (!filename || !(size >= 0)) return NextResponse.json({ error: t('api.invalidData') }, { status: 400 });
  if (size > config.maxUploadBytes) return NextResponse.json({ error: t('api.theFileExceedsTheMaximum', { mb: Math.round(config.maxUploadBytes / 1024 / 1024) }) }, { status: 413 });
  const dir = path.join(config.dataDir, 'tmp'); await fs.mkdir(dir, { recursive: true });
  const tmpPath = path.join(dir, `${crypto.randomUUID()}.part`);
  await fs.writeFile(tmpPath, '');
  const db = await getDb();
  const [u] = await db.insert(s.uploadSessions).values({ workspaceId: WORKSPACE_ID, createdBy: user.id, filename: String(filename).slice(0, 200), size, tmpPath }).returning();
  return NextResponse.json({ id: u.id, chunkSize: 4 * 1024 * 1024 });
}
