import fsp from 'node:fs/promises';
import sharp from 'sharp';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { getBuffer, newKey, putBuffer, putFile } from './storage';
import { audit } from './audit';
import { getT } from '@/i18n/server';

export { STAGE_KEYS } from './photo-stages';
export const RATIOS: Record<string, [number, number]> = { '1:1': [1, 1], '4:5': [4, 5], '9:16': [9, 16], '16:9': [16, 9] };

/** Conversión a WebP en 320/800/1600 + original; corrige rotación EXIF y elimina metadatos (GPS). */
export async function ingestPhoto(o: { tmpPath: string; filename: string; userId?: string | null; stage?: string; orderId?: string | null; jobId?: string | null; modelFileId?: string | null; customerId?: string | null; productId?: string | null; materialId?: string | null; machineId?: string | null; caption?: string | null; tags?: string[]; featured?: boolean }) {
  const db = await getDb();
  const isVideo = /\.(mp4|mov|webm)$/i.test(o.filename);
  const ext = (o.filename.split('.').pop() ?? 'bin').toLowerCase();
  const origKey = newKey('photos/original', ext);
  let variants: Record<string, string> = {}; let width: number | null = null, height: number | null = null;
  if (!isVideo) {
    const input = await fsp.readFile(o.tmpPath);
    const base = sharp(input, { failOn: 'none' }).rotate();
    const meta = await base.metadata();
    width = meta.width ?? null; height = meta.height ?? null;
    for (const w of [320, 800, 1600]) variants[String(w)] = await putBuffer(newKey(`photos/${w}`, 'webp'), await base.clone().resize({ width: w, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer());
  }
  await putFile(origKey, o.tmpPath, true);
  // consentimiento del cliente: sin permiso → solo uso interno
  let internalOnly = false;
  if (o.customerId) { const [c] = await db.select().from(s.customers).where((await import('drizzle-orm')).eq(s.customers.id, o.customerId)); internalOnly = !!c && noPhotoConsent(c.photoConsent); }
  // etiquetas automáticas: material, color, máquina, cliente (si hay consentimiento), categoría del modelo
  const auto: string[] = [];
  const { eq } = await import('drizzle-orm');
  if (o.materialId) { const [m] = await db.select().from(s.materials).where(eq(s.materials.id, o.materialId)); if (m) auto.push(m.type, `${m.type} ${m.colorName}`.toLowerCase()); }
  if (o.machineId) { const [m] = await db.select().from(s.machines).where(eq(s.machines.id, o.machineId)); if (m) auto.push(m.name); }
  if (o.productId) { const [p] = await db.select().from(s.products).where(eq(s.products.id, o.productId)); if (p?.category) auto.push(p.category); }
  if (o.modelFileId) { const [f] = await db.select().from(s.modelFiles).where(eq(s.modelFiles.id, o.modelFileId)); if (f) auto.push(...(f.tags ?? [])); }
  const tags = [...new Set([...(o.tags ?? []), ...auto])];
  const [p] = await db.insert(s.photos).values({
    workspaceId: WORKSPACE_ID, kind: isVideo ? 'video' : 'foto', storageKey: origKey, variants, width, height, stage: o.stage ?? 'producto_final', featured: !!o.featured, tags,
    caption: o.caption ?? null, orderId: o.orderId ?? null, jobId: o.jobId ?? null, modelFileId: o.modelFileId ?? null, customerId: o.customerId ?? null, productId: o.productId ?? null,
    materialId: o.materialId ?? null, machineId: o.machineId ?? null, internalOnly, createdBy: o.userId ?? null,
  }).returning();
  await audit('photo', p.id, 'subir', { stage: o.stage }, o.userId);
  return p;
}

/** Sin permiso vigente del cliente para publicar sus fotos (lo retiró o nunca lo dio). */
export const noPhotoConsent = (consent: string | null | undefined) => consent === 'no' || consent === 'unknown';

/** Recorte a formato de redes con marca de agua opcional. */
export async function exportPhoto(photoId: string, o: { ratio?: string; watermark?: { logo: Buffer; opacity: number; position: string } | null }): Promise<Buffer> {
  const t = await getT();
  const { eq } = await import('drizzle-orm');
  const db = await getDb();
  const [p] = await db.select().from(s.photos).where(eq(s.photos.id, photoId));
  if (!p) throw new Error(t('gallery.photoNotFound'));
  if (p.internalOnly) throw new Error(t('gallery.thisPhotoIsForInternal'));
  // el permiso vigente del cliente manda: si lo retiró después de subir la foto, tampoco se exporta
  if (p.customerId) { const [c] = await db.select({ consent: s.customers.photoConsent }).from(s.customers).where(eq(s.customers.id, p.customerId)); if (c && noPhotoConsent(c.consent)) throw new Error(t('gallery.internalUseOnlyTheCustomer')); }
  let img = sharp(await getBuffer(p.variants?.['1600'] ?? p.storageKey)).rotate();
  const r = o.ratio ? RATIOS[o.ratio] : null;
  if (r) { const meta = await img.metadata(); const W = meta.width ?? 1600; const H = Math.round((W * r[1]) / r[0]); img = img.resize({ width: W, height: H, fit: 'cover' }); }
  let out = await img.jpeg({ quality: 90 }).toBuffer(); // sin metadatos: sharp los elimina por defecto
  if (o.watermark) {
    const meta = await sharp(out).metadata();
    const logo = await sharp(o.watermark.logo).resize({ width: Math.round((meta.width ?? 1000) * 0.2) }).ensureAlpha(o.watermark.opacity).toBuffer();
    const gravity = ({ 'abajo-derecha': 'southeast', 'abajo-izquierda': 'southwest', 'arriba-derecha': 'northeast', 'arriba-izquierda': 'northwest', centro: 'center' } as Record<string, string>)[o.watermark.position] ?? 'southeast';
    out = await sharp(out).composite([{ input: logo, gravity }]).jpeg({ quality: 90 }).toBuffer();
  }
  return out;
}
