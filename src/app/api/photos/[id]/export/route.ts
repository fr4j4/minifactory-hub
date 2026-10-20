import {assertPhotoAccess} from '@/lib/library/access';
import fs from 'node:fs';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/perm';
import { exportPhoto } from '@/lib/photos';
import { getSettings } from '@/lib/settings';
import { exists, getBuffer } from '@/lib/storage';
import { getT } from '@/i18n/server';

/** Foto lista para redes: recorte (1:1, 4:5, 9:16, 16:9), sin metadatos GPS y con marca de agua opcional. Las fotos "solo uso interno" se rechazan. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const user = await getSession(); if (!user || !can(user, 'galeria', 'V')) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 });
  const { id } = await params; const url = new URL(req.url); const st = await getSettings();
  let watermark = null as null | { logo: Buffer; opacity: number; position: string };
  if (url.searchParams.get('wm') === '1') { const key = st.shop.logoKey; if (key && (await exists(key))) watermark = { logo: await getBuffer(key), opacity: st.watermark.opacity, position: st.watermark.position }; else { try { watermark = { logo: fs.readFileSync(process.cwd() + '/public/icon.svg'), opacity: st.watermark.opacity, position: st.watermark.position }; } catch { /* sin logo */ } } }
  try {
    await assertPhotoAccess(user,id);
    const buf = await exportPhoto(id, { ratio: url.searchParams.get('ratio') ?? undefined, watermark });
    return new Response(new Uint8Array(buf), { headers: { 'content-type': 'image/jpeg', 'content-disposition': `attachment; filename="foto-${id.slice(0, 8)}${url.searchParams.get('ratio') ? '-' + url.searchParams.get('ratio')!.replace(':', 'x') : ''}.jpg"` } });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }
}
