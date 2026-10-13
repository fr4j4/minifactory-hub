import fs from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { getSession } from '@/lib/auth';

/** Recibe un trozo en el offset indicado. Si el offset no coincide, responde cuánto lleva recibido para reanudar. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { id } = await params;
  const offset = Number(new URL(req.url).searchParams.get('offset') ?? 0);
  const db = await getDb();
  const [u] = await db.select().from(s.uploadSessions).where(eq(s.uploadSessions.id, id));
  if (!u) return NextResponse.json({ error: 'Subida no encontrada' }, { status: 404 });
  if (offset !== u.received) return NextResponse.json({ error: 'offset', received: u.received }, { status: 409 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (u.received + buf.length > u.size) return NextResponse.json({ error: 'El trozo excede el tamaño declarado' }, { status: 400 });
  await fs.appendFile(u.tmpPath, buf);
  await db.update(s.uploadSessions).set({ received: u.received + buf.length, chunks: u.chunks + 1 }).where(eq(s.uploadSessions.id, id));
  return NextResponse.json({ received: u.received + buf.length });
}
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { id } = await params; const db = await getDb();
  const [u] = await db.select().from(s.uploadSessions).where(eq(s.uploadSessions.id, id));
  return u ? NextResponse.json({ received: u.received, size: u.size }) : NextResponse.json({ error: 'No existe' }, { status: 404 });
}
