import { NextResponse } from 'next/server';
import { eq, inArray } from 'drizzle-orm';
import { zipSync } from 'fflate';
import { getDb, s } from '@/db';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/perm';
import { getBuffer } from '@/lib/storage';
import { getT } from '@/i18n/server';
import { noPhotoConsent } from '@/lib/photos';

/** Descarga en lote (ZIP) de las fotos elegidas, en tamaño 1600 px. */
export async function GET(req: Request) {
  const t = await getT();
  const user = await getSession(); if (!user || !can(user, 'galeria', 'V')) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 });
  const ids = (new URL(req.url).searchParams.get('ids') ?? '').split(',').filter(Boolean).slice(0, 200);
  if (!ids.length) return NextResponse.json({ error: t('api.noPhotos') }, { status: 400 });
  const db = await getDb();
  // como al exportar: las fotos de uso interno (o de un cliente que retiró el permiso) no salen en el ZIP
  const rows = (await db.select({ p: s.photos, consent: s.customers.photoConsent }).from(s.photos).leftJoin(s.customers, eq(s.customers.id, s.photos.customerId)).where(inArray(s.photos.id, ids))).filter(({ p, consent }) => !p.internalOnly && !noPhotoConsent(consent)).map(({ p }) => p);
  if (!rows.length) return NextResponse.json({ error: t('gallery.internalUseOnlyTheCustomer') }, { status: 400 });
  const files: Record<string, Uint8Array> = {};
  for (const p of rows) { const key = p.variants?.['1600'] ?? p.storageKey; files[`${p.stage}-${p.id.slice(0, 8)}.${key.split('.').pop()}`] = new Uint8Array(await getBuffer(key)); }
  return new Response(new Uint8Array(zipSync(files, { level: 0 })), { headers: { 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="fotos.zip"' } });
}
