import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/perm';
import { exists, stat, webStream, getBuffer } from '@/lib/storage';
import { getT } from '@/i18n/server';

const MIME: Record<string, string> = { stl: 'model/stl', obj: 'text/plain', '3mf': 'model/3mf', gcode: 'text/plain', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', pdf: 'application/pdf', svg: 'image/svg+xml' };

/** Entrega derivados de una versión de archivo: raw (descarga), mesh (vista previa binaria), gcode (capas), thumb. Requiere sesión. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const t = await getT();
  const user = await getSession();
  if (!user || !can(user, 'archivos', 'V')) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 });
  const { id, kind } = await params;
  const db = await getDb();
  const [v] = await db.select().from(s.fileVersions).where(and(eq(s.fileVersions.id, id), eq(s.fileVersions.workspaceId, WORKSPACE_ID)));
  if (!v) return NextResponse.json({ error: t('common.notFound') }, { status: 404 });
  const meta = (v.meta ?? {}) as Record<string, any>;
  let key: string | null | undefined; let type = 'application/octet-stream'; let name: string | null = null;
  if (kind === 'raw') {
    try { key = await (await import('@/lib/library/content')).ensureVersionLocal(id); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 409 }); } type = MIME[v.format] ?? type;
    const [mf] = await db.select().from(s.modelFiles).where(eq(s.modelFiles.id, v.modelFileId));
    name = `${mf?.name ?? 'archivo'}-v${v.number}.${v.format}`;
  } else if (kind === 'mesh') { key = meta.previewKey; type = 'application/octet-stream'; }
  else if (kind === 'gcode') { key = meta.gcodePreviewKey; type = 'application/octet-stream'; }
  else if (kind === 'thumb') { key = v.thumbKey; type = 'image/webp'; }
  else if (kind === 'turn') { key = meta.turnKey; type = 'image/webp'; }
  if (!key || !(await exists(key))) return NextResponse.json({ error: t('api.notAvailable') }, { status: kind === 'raw' ? 404 : 202 });
  const st = await stat(key);
  const headers: Record<string, string> = { 'content-type': type, 'cache-control': 'private, max-age=3600', 'content-length': String(st.size) };
  if (name) headers['content-disposition'] = `attachment; filename="${encodeURIComponent(name)}"`;
  return new Response(webStream(key), { headers });
}
