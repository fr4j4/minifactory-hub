'use server';
import { and, eq } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { requireUser } from '@/lib/auth';
import { fetchLinkPreview, normalizeUrl } from '@/lib/links';
import { safe } from './common';

export async function previewLinkAction(url: string) {
  return safe(async () => { await requireUser(); return fetchLinkPreview(url); });
}

export interface LinkRow { id?: string; url: string; title?: string | null; kind?: string; note?: string | null; imageUrl?: string | null; showInPdf?: boolean }

/** Guarda los links de referencia de una entidad (reemplaza la lista completa). */
export async function saveLinksAction(ownerType: 'quote' | 'quote_item' | 'order' | 'order_item' | 'model_file' | 'product', ownerId: string, links: LinkRow[], revalidate?: string) {
  return safe(async () => {
    const u = await requireUser(); const db = await getDb();
    await db.delete(s.referenceLinks).where(and(eq(s.referenceLinks.ownerType, ownerType), eq(s.referenceLinks.ownerId, ownerId)));
    for (const l of links) if (l.url?.trim()) await db.insert(s.referenceLinks).values({ workspaceId: WORKSPACE_ID, url: normalizeUrl(l.url), title: l.title ?? null, kind: l.kind ?? 'otro', note: l.note ?? null, imageUrl: l.imageUrl ?? null, showInPdf: !!l.showInPdf, ownerType, ownerId, createdBy: u.id });
  }, revalidate ? [revalidate] : []);
}
