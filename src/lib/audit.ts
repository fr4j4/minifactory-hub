import { getDb, s, WORKSPACE_ID } from '@/db';

/** Registro de auditoría de cambios en precios, estados y stock. */
export async function audit(entity: string, entityId: string | null, action: string, changes: Record<string, any>, userId?: string | null) {
  const db = await getDb();
  await db.insert(s.activityLog).values({ workspaceId: WORKSPACE_ID, entity, entityId, action, changes, userId: userId ?? null });
}
export async function notify(kind: string, title: string, body?: string, href?: string, userId?: string | null) {
  const db = await getDb();
  await db.insert(s.notifications).values({ workspaceId: WORKSPACE_ID, kind, title, body, href, userId: userId ?? null });
}
