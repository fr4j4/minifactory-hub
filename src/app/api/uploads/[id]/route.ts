import fs from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { getSession } from '@/lib/auth';
import { getT } from '@/i18n/server';

/** Recibe un trozo en el offset indicado. Si el offset no coincide, responde cuánto lleva recibido para reanudar. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const user = await getSession();
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 });
  const { id } = await params;
  const offset = Number(new URL(req.url).searchParams.get('offset') ?? 0);
  const db = await getDb();
  const [u] = await db.select().from(s.uploadSessions).where(eq(s.uploadSessions.id, id));
  if (!u || u.workspaceId !== user.workspaceId || (u.createdBy && u.createdBy !== user.id)) return NextResponse.json({ error: t('api.uploadNotFound') }, { status: 404 });
  if (offset !== u.received) return NextResponse.json({ error: 'offset', received: u.received }, { status: 409 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (u.received + buf.length > u.size) return NextResponse.json({ error: t('api.theChunkExceedsTheDeclared') }, { status: 400 });
  await fs.appendFile(u.tmpPath, buf);
  await db.update(s.uploadSessions).set({ received: u.received + buf.length, chunks: u.chunks + 1 }).where(eq(s.uploadSessions.id, id));
  return NextResponse.json({ received: u.received + buf.length });
}
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const user = await getSession();
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 });
  const { id } = await params; const db = await getDb();
  const [u] = await db.select().from(s.uploadSessions).where(eq(s.uploadSessions.id, id));
  return u && u.workspaceId === user.workspaceId && (!u.createdBy || u.createdBy === user.id) ? NextResponse.json({ received: u.received, size: u.size }) : NextResponse.json({ error: t('common.doesNotExist') }, { status: 404 });
}
