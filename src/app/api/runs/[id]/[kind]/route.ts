import {runAccess} from '@/lib/library/access';
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/perm';
import { exists, getBuffer, newKey, putBuffer, stat, webStream } from '@/lib/storage';
import { buildGcodePreview, gcodePreviewToBin } from '@/lib/gcode';
import { getT } from '@/i18n/server';

/**
 * gcode (descarga) | threemf (descarga) | preview (capas para el visor; se genera una vez y queda guardado).
 * Con `?plate=N` (proyectos de varias placas) el G-code y las capas son los de esa placa.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const t = await getT();
  const user = await getSession();
  if (!user || !can(user, 'laminador', 'V')) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 });
  const { id, kind } = await params; const db = await getDb();
  const [r] = await db.select().from(s.sliceRuns).where(and(eq(s.sliceRuns.id, id),runAccess(user)));
  if (!r || r.status !== 'done') return NextResponse.json({ error: t('api.sliceNotAvailable') }, { status: 404 });
  const res = (r.result ?? {}) as Record<string, any>;
  const plate = Number(new URL(req.url).searchParams.get('plate') ?? 0);
  const pos = plate ? ((res.platesInfo as Array<{ index: number }> | undefined) ?? []).findIndex((p) => p.index === plate) : -1;
  if (plate && pos < 0) return NextResponse.json({ error: t('common.notFound') }, { status: 404 });
  const gcodeKey: string | null = plate ? (res.gcodeKeys?.[pos] ?? null) : r.gcodeKey;
  if (kind === 'preview') {
    let key: string | undefined = plate ? res.previewKeys?.[plate] : res.previewKey;
    if (!key || !(await exists(key))) {
      if (!gcodeKey) return NextResponse.json({ error: t('api.noGCode') }, { status: 404 });
      key = await putBuffer(newKey('preview', 'mfg'), gcodePreviewToBin(buildGcodePreview((await getBuffer(gcodeKey)).toString('utf8'))));
      await db.update(s.sliceRuns).set({ result: plate ? { ...res, previewKeys: { ...(res.previewKeys ?? {}), [plate]: key } } : { ...res, previewKey: key } }).where(and(eq(s.sliceRuns.id, id),runAccess(user)));
    }
    return new Response(webStream(key), { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'private, max-age=3600', 'content-length': String((await stat(key)).size) } });
  }
  const key = kind === 'gcode' ? gcodeKey : kind === 'threemf' ? r.threemfKey : null;
  if (!key || !(await exists(key))) return NextResponse.json({ error: t('common.notFound') }, { status: 404 });
  const base = (r.label ?? 'laminado').replace(/[^\w.-]+/g, '_') + (plate ? `-placa${plate}` : '');
  return new Response(webStream(key), { headers: { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${base}.${kind === 'gcode' ? 'gcode' : '3mf'}"`, 'content-length': String((await stat(key)).size) } });
}
