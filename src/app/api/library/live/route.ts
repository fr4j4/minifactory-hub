import { getSession } from '@/lib/auth';
import { can } from '@/lib/perm';
import { libraryLiveState } from '@/lib/library/live';
export const dynamic = 'force-dynamic';

/** Estado de la biblioteca para refrescar la lista sola. Recibe los mismos parámetros de búsqueda que la página. */
export async function GET(req: Request) {
  const user = await getSession();
  if (!user) return Response.json({}, { status: 401 });
  if (!can(user, 'archivos', 'V')) return Response.json({}, { status: 403 });
  const sp: Record<string, string> = {};
  for (const [k, v] of new URL(req.url).searchParams) sp[k] = sp[k] ? `${sp[k]},${v}` : v;
  const state = await libraryLiveState(user, sp);
  return Response.json(state, { headers: { 'cache-control': 'no-store' } });
}
