import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/perm';
import { getSettingsRaw, saveSettings } from '@/lib/settings';
import { exists, getBuffer, newKey, putBuffer, remove } from '@/lib/storage';
import { audit } from '@/lib/audit';
import { getT } from '@/i18n/server';
import { getDb, s } from '@/db';
import { sql } from 'drizzle-orm';

// solo claves de logo (brand/AAAA/MM/uuid.png): ?k= no puede servir otros archivos
const LOGO_KEY = /^brand\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/;

/** Un presupuesto enviado guarda la clave del logo que recibió el cliente: ese archivo no se borra al cambiar o quitar el logo. */
async function removeUnlessFrozen(key: string) {
  const db = await getDb();
  const used = await db.select({ id: s.quotes.id }).from(s.quotes).where(sql`${s.quotes.docTemplate}->'snapshot'->'shop'->>'logoKey' = ${key}`).limit(1);
  if (!used.length) await remove(key).catch(() => {});
}

/** El logo del taller se muestra en documentos; se sirve sin sesión (no es información sensible). Con ?k= se sirve el logo congelado de un presupuesto. */
export async function GET(req: Request) {
  const k = new URL(req.url).searchParams.get('k');
  if (k && !LOGO_KEY.test(k)) return new NextResponse(null, { status: 404 });
  const key = k ?? (await getSettingsRaw()).shop.logoKey;
  if (!key || !(await exists(key))) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(await getBuffer(key)), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=300' } });
}

/** Sube el logo: solo PNG/JPG/WebP (se descarta SVG para no servir contenido activo), se reencoda a PNG de hasta 600 px. */
export async function POST(req: Request) {
  const t = await getT(); const user = await getSession();
  if (!user || !can(user, 'config', 'E')) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 });
  const file = (await req.formData()).get('file');
  if (!(file instanceof File) || file.size === 0 || file.size > 2 * 1024 * 1024) return NextResponse.json({ error: t('settings.logoTooBig') }, { status: 413 });
  try {
    const img = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000 });
    const meta = await img.metadata();
    if (!meta.format || !['png', 'jpeg', 'webp'].includes(meta.format)) throw new Error('format');
    const out = await img.rotate().resize({ width: 600, height: 300, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    const st = await getSettingsRaw(); const key = newKey('brand', 'png'); await putBuffer(key, out);
    await saveSettings({ shop: { ...st.shop, logoKey: key } }); if (st.shop.logoKey) await removeUnlessFrozen(st.shop.logoKey);
    await audit('settings', 'logo', 'editar', {}, user.id);
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: t('settings.logoBadFormat') }, { status: 400 }); }
}

export async function DELETE() {
  const t = await getT(); const user = await getSession();
  if (!user || !can(user, 'config', 'E')) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 });
  const st = await getSettingsRaw(); if (st.shop.logoKey) await removeUnlessFrozen(st.shop.logoKey);
  await saveSettings({ shop: { ...st.shop, logoKey: undefined } });
  return NextResponse.json({ ok: true });
}
