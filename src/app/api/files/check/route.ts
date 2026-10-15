import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { getSession } from '@/lib/auth';
import { getT } from '@/i18n/server';

/** ¿Ya hay en la biblioteca un archivo con este SHA-256? Se consulta antes de subir para avisar del duplicado. */
export async function GET(req: Request) {
  const t = await getT(); const user = await getSession();
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 });
  const hash = new URL(req.url).searchParams.get('hash') ?? '';
  if (!/^[0-9a-f]{64}$/.test(hash)) return NextResponse.json({ error: t('api.invalidData') }, { status: 400 });
  const db = await getDb();
  const [dup] = await db.select({ id: s.modelFiles.id, name: s.modelFiles.name }).from(s.modelFiles).where(and(eq(s.modelFiles.hash, hash), isNull(s.modelFiles.deletedAt))).limit(1);
  return NextResponse.json({ duplicate: dup ?? null });
}
