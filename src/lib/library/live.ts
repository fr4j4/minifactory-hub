import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import type { SessionUser } from '../auth';
import { libraryFilters } from './search';

export interface LibraryLiveState {
  /** cambia cuando aparece, desaparece o termina de procesarse un modelo de esta búsqueda, o cuando cambia una importación en curso */
  signature: string;
  /** hay algo en marcha: conviene consultar seguido */
  active: boolean;
  processing: number;
  imports: Array<{ id: string; title: string; status: string }>;
}

/** Estado barato de la biblioteca con los mismos filtros que la página (sin la paginación). */
export async function libraryLiveState(user: SessionUser, sp: Record<string, string | undefined>): Promise<LibraryLiveState> {
  const db = await getDb();
  const conds = libraryFilters(user, { ...sp, cursor: undefined });
  const [agg] = await db.select({
    total: sql<number>`count(*)::int`,
    processing: sql<number>`(count(*) filter (where ${s.fileVersions.meta}->>'status'='processing'))::int`,
    changed: sql<string>`coalesce(max(greatest(${s.modelFiles.updatedAt},${s.fileVersions.createdAt}))::text,'')`,
    states: sql<string>`coalesce(string_agg(distinct ${s.fileVersions.meta}->>'status', ','),'')`,
  }).from(s.modelFiles).leftJoin(s.fileVersions, eq(s.fileVersions.id, s.modelFiles.currentVersionId)).where(and(...conds));
  // importaciones por enlace del usuario que todavía no terminan (el modelo aparece cuando se descarga)
  const ops = await db.select({ id: s.libraryOperations.id, status: s.libraryOperations.status, input: s.libraryOperations.input }).from(s.libraryOperations)
    .where(and(eq(s.libraryOperations.workspaceId, WORKSPACE_ID), eq(s.libraryOperations.createdBy, user.id), eq(s.libraryOperations.kind, 'url.import'), inArray(s.libraryOperations.status, ['queued', 'running'])));
  const imports = ops.map((o) => ({ id: o.id, status: o.status, title: String(o.input?.preview?.title || o.input?.filename || '').slice(0, 120) }));
  return { signature: [agg.total, agg.processing, agg.changed, agg.states, imports.map((i) => `${i.id}:${i.status}`).join('|')].join('~'), active: agg.processing > 0 || imports.length > 0, processing: agg.processing, imports };
}
