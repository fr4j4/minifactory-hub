import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/perm';
import { exists, getBuffer, newKey, putBuffer, stat, webStream } from '@/lib/storage';
import { buildGcodePreview, gcodePreviewToBin } from '@/lib/gcode';
import { getT } from '@/i18n/server';

/** gcode (descarga) | threemf (descarga) | preview (capas para el visor; se genera una vez y queda guardado) */
export async function GET(_: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const t = await getT();
  const user = await getSession();
  if (!user || !can(user, 'laminador', 'V')) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 });
  const { id, kind } = await params; const db = await getDb();
  const [r] = await db.select().from(s.sliceRuns).where(eq(s.sliceRuns.id, id));
  if (!r || r.status !== 'done') return NextResponse.json({ error: t('api.sliceNotAvailable') }, { status: 404 });
  const res = (r.result ?? {}) as Record<string, any>;
  if (kind === 'preview') {
    let key: string | undefined = res.previewKey;
    if (!key || !(await exists(key))) {
      if (!r.gcodeKey) return NextResponse.json({ error: t('api.noGCode') }, { status: 404 });
      key = await putBuffer(newKey('preview', 'mfg'), gcodePreviewToBin(buildGcodePreview((await getBuffer(r.gcodeKey)).toString('utf8'))));
      await db.update(s.sliceRuns).set({ result: { ...res, previewKey: key } }).where(eq(s.sliceRuns.id, id));
    }
    return new Response(webStream(key), { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'private, max-age=3600', 'content-length': String((await stat(key)).size) } });
  }
  const key = kind === 'gcode' ? r.gcodeKey : kind === 'threemf' ? r.threemfKey : null;
  if (!key || !(await exists(key))) return NextResponse.json({ error: t('common.notFound') }, { status: 404 });
  return new Response(webStream(key), { headers: { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${(r.label ?? 'laminado').replace(/[^\w.-]+/g, '_')}.${kind === 'gcode' ? 'gcode' : '3mf'}"`, 'content-length': String((await stat(key)).size) } });
}
