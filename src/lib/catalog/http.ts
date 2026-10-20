import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/perm';
import { getIndex } from './ofd';

/** Las rutas del catálogo piden sesión con permiso de ver el inventario. */
export async function guard() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!can(user, 'inventario')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return null;
}

export const intParam = (u: URL, k: string) => { const v = Number(u.searchParams.get(k)); return Number.isFinite(v) && v > 0 ? Math.floor(v) : undefined; };
export const strParam = (u: URL, k: string) => u.searchParams.get(k)?.trim() || undefined;

/** JSON cacheable: el ETag es el commit del catálogo + la URL, así el navegador revalida barato tras cada sincronización. */
export async function json(req: Request, body: unknown, status = 200) {
  const m = (await getIndex()).meta;
  const etag = `W/"${m.commit.slice(0, 12) || 'local'}-${m.filaments}-${Buffer.from(new URL(req.url).search).toString('base64url').slice(0, 40)}"`;
  if (req.headers.get('if-none-match') === etag) return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  return NextResponse.json(body, { status, headers: { ETag: etag, 'Cache-Control': 'private, max-age=0, must-revalidate' } });
}
