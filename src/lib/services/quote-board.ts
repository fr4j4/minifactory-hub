import { and, eq, inArray, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';

const DAY = 86400_000;
const OPEN = ['borrador', 'enviado'];

/** Indicadores del tablero de presupuestos (ventana de conversión: 30 días). Solo versiones vigentes (sin «reemplazado»). */
export async function quoteBoard(now = new Date()) {
  const db = await getDb();
  const all = await db.select({ id: s.quotes.id, status: s.quotes.status, total: s.quotes.total, validUntil: s.quotes.validUntil, createdAt: s.quotes.createdAt, updatedAt: s.quotes.updatedAt, approvedAt: s.quotes.approvedAt })
    .from(s.quotes).where(and(isNull(s.quotes.deletedAt)));
  const counts: Record<string, number> = {};
  for (const q of all) counts[q.status] = (counts[q.status] ?? 0) + 1;
  const open = all.filter((q) => OPEN.includes(q.status));
  const in3 = new Date(now.getTime() + 3 * DAY).toISOString().slice(0, 10); const today = now.toISOString().slice(0, 10);
  const dueSoon = open.filter((q) => q.status === 'enviado' && q.validUntil && String(q.validUntil) >= today && String(q.validUntil) <= in3).length;
  const noReply = open.filter((q) => q.status === 'enviado' && now.getTime() - q.updatedAt.getTime() > 7 * DAY).length;
  const win = all.filter((q) => now.getTime() - q.createdAt.getTime() <= 30 * DAY && ['enviado', 'aprobado', 'rechazado', 'vencido'].includes(q.status));
  const approved30 = win.filter((q) => q.status === 'aprobado').length;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    counts, total: all.filter((q) => q.status !== 'reemplazado').length,
    openCount: open.length, openAmount: open.reduce((a, q) => a + q.total, 0), dueSoon, noReply,
    conversionPct: win.length ? Math.round((approved30 / win.length) * 100) : null,
    approvedMonth: all.filter((q) => q.status === 'aprobado' && (q.approvedAt ?? q.updatedAt) >= monthStart).reduce((a, q) => a + q.total, 0),
  };
}

/** Hasta 3 miniaturas de modelo por presupuesto (para la pila de la fila). */
export async function quoteThumbs(quoteIds: string[]) {
  if (!quoteIds.length) return new Map<string, string[]>();
  const db = await getDb();
  const rows = await db.select({ quoteId: s.quoteItems.quoteId, versionId: s.quoteItemModels.fileVersionId, thumb: s.fileVersions.thumbKey, pos: s.quoteItems.position })
    .from(s.quoteItemModels).innerJoin(s.quoteItems, eq(s.quoteItems.id, s.quoteItemModels.quoteItemId))
    .innerJoin(s.modelFiles, eq(s.modelFiles.id, s.quoteItemModels.modelFileId)).leftJoin(s.fileVersions, eq(s.fileVersions.id, s.modelFiles.currentVersionId))
    .where(inArray(s.quoteItems.quoteId, quoteIds));
  const out = new Map<string, string[]>();
  for (const r of rows.sort((a, b) => a.pos - b.pos)) { if (!r.thumb || !r.versionId) continue; const l = out.get(r.quoteId) ?? []; if (l.length < 3 && !l.includes(r.versionId)) l.push(r.versionId); out.set(r.quoteId, l); }
  return out;
}
