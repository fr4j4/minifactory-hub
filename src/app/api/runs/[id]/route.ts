import {runAccess} from '@/lib/library/access';
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { getSession } from '@/lib/auth';
import { runInfoOf } from '@/lib/slicer/run-info';
import { getT } from '@/i18n/server';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const user=await getSession();
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 });
  const { id } = await params; const db = await getDb();
  const [r] = await db.select().from(s.sliceRuns).where(and(eq(s.sliceRuns.id, id),runAccess(user)));
  return r ? NextResponse.json(runInfoOf(r)) : NextResponse.json({ error: t('common.doesNotExist') }, { status: 404 });
}
