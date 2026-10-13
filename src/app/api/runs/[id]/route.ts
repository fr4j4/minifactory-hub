import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { getSession } from '@/lib/auth';
import { getT } from '@/i18n/server';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  if (!(await getSession())) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 });
  const { id } = await params; const db = await getDb();
  const [r] = await db.select().from(s.sliceRuns).where(eq(s.sliceRuns.id, id));
  return r ? NextResponse.json({ id: r.id, status: r.status, error: r.error, timeS: r.timeS, filament: r.filament, layers: r.layers, plates: r.plates, durationMs: r.durationMs, engineVersion: r.engineVersion, label: r.label, copies: r.copies, cached: !!(r.result as any)?.cached, hasGcode: !!r.gcodeKey, has3mf: !!r.threemfKey, profileVersions: r.profileVersions }) : NextResponse.json({ error: t('common.doesNotExist') }, { status: 404 });
}
