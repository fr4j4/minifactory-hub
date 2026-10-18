/** Run only inside the isolated library test container. Creates a labelled image-only fixture. */
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { getDb, s, WORKSPACE_ID } from '../src/db';
import { fetchSourceMeta, parseSourceUrl } from '../src/lib/library/source';
import { importSourceImages } from '../src/lib/library/source-images';
import { getBuffer } from '../src/lib/storage';

async function main() {
  if (process.env.MF_TEST_DEPLOYMENT !== '1' || new URL(process.env.DATABASE_URL || '').pathname !== '/library_test') throw new Error('Solo se permite la base library_test');
  const url = 'https://makerworld.com/es/models/3317662-pumpkin-patch-pal#profileId-3766961';
  const meta = await fetchSourceMeta(parseSourceUrl(url)!);
  if (!meta.imageUrls.length) throw new Error('El proveedor no devolvió imágenes');
  const db = await getDb();
  const name = 'Validación de imágenes · Pumpkin Patch Pal (sin archivo 3D)';
  let [model] = await db.select().from(s.modelFiles).where(and(eq(s.modelFiles.workspaceId, WORKSPACE_ID), eq(s.modelFiles.name, name)));
  if (!model) {
    const [source] = await db.insert(s.modelSources).values({ workspaceId: WORKSPACE_ID, provider: 'makerworld', url, title: meta.title, authorName: meta.authorName, licenseText: meta.licenseText, images: meta.imageUrls.map(url => ({ url })) }).returning();
    [model] = await db.insert(s.modelFiles).values({ workspaceId: WORKSPACE_ID, name, origin: url, author: meta.authorName, sourceId: source.id }).returning();
  }
  await importSourceImages(model.id, model.sourceId!);
  const photos = await db.select().from(s.photos).where(eq(s.photos.modelFileId, model.id));
  let bytes = 0;
  for (const photo of photos) for (const key of Object.values(photo.variants || {})) {
    const buffer = await getBuffer(key); const image = await sharp(buffer).metadata();
    if (image.format !== 'webp' || image.exif || (image.width || 0) > 1600 || (image.height || 0) > 1600) throw new Error('Compresión incorrecta');
    bytes += buffer.length;
  }
  console.log(JSON.stringify({ modelId: model.id, discovered: meta.imageUrls.length, stored: photos.length, totalBytesAllVariants: bytes, note: 'Imágenes reales del proveedor; ficha de prueba sin binario 3D.' }));
}
main().then(() => process.exit(0), error => { console.error(error.message); process.exit(1); });
