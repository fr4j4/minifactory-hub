import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { getSession } from '@/lib/auth';
import { runInfoOf } from '@/lib/slicer/run-info';
import { getT } from '@/i18n/server';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  if (!(await getSession())) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 });
  const { id } = await params; const db = await getDb();
  const [r] = await db.select().from(s.sliceRuns).where(eq(s.sliceRuns.id, id));
  return r ? NextResponse.json(runInfoOf(r)) : NextResponse.json({ error: t('common.doesNotExist') }, { status: 404 });
}
