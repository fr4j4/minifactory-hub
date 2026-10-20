import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
vi.mock('@/lib/library/connectors/http', () => ({ request: vi.fn() }));
import { request } from '@/lib/library/connectors/http';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { getBuffer } from '@/lib/storage';
import { importSourceImages } from '@/lib/library/source-images';
import { linkModelImage } from '@/lib/library/model-images';
let sample: Buffer;
beforeAll(async () => { process.env.MF_EXTERNAL_WORKER = '1'; sample = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#f80' } }).jpeg().toBuffer(); });
beforeEach(() => { vi.mocked(request).mockReset(); });
async function fixture(urls: string[]) {
  const db = await getDb();
  const [source] = await db.insert(s.modelSources).values({ workspaceId: WORKSPACE_ID, provider: 'makerworld', url: 'https://makerworld.com/models/123', images: urls.map(url => ({ url })), authorName: 'Artist', licenseText: 'Personal use' }).returning();
  const [model] = await db.insert(s.modelFiles).values({ workspaceId: WORKSPACE_ID, name: 'Photo test', sourceId: source.id }).returning();
  return { db, source, model };
}
function response(buffer = sample, headers = {}) { return Object.assign(Readable.from([buffer]), { headers }) as any; }
it('stores compressed local images, deduplicates identical content and sets an author cover', async () => {
  const { db, source, model } = await fixture(['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg']);
  vi.mocked(request).mockImplementation(async () => response());
  await importSourceImages(model.id, source.id);
  const photos = await db.select().from(s.photos).where(eq(s.photos.modelFileId, model.id));
  expect(photos).toHaveLength(1);
  expect(photos[0]).toMatchObject({ width: 1600, height: 800, scope: 'model' }); // no aparece en la Galería
  const meta = await sharp(await getBuffer(photos[0].storageKey)).metadata();
  expect(meta.format).toBe('webp'); expect(meta.exif).toBeUndefined();
  expect(Object.keys(photos[0].variants!)).toEqual(['320', '800', '1600']);
  const links = await db.select().from(s.libraryPhotoLinks).where(eq(s.libraryPhotoLinks.modelId, model.id));
  expect(links).toHaveLength(1); expect(links[0].data).toMatchObject({ type: 'author', cover: true, author: 'Artist', license: 'Personal use' });
  await importSourceImages(model.id, source.id); expect(request).toHaveBeenCalledTimes(2);
  expect(request).toHaveBeenCalledWith('https://cdn.example/a.jpg', { timeoutMs: 15000 });
});
it('keeps successful images on partial failure and retries only missing photos', async () => {
  const { db, source, model } = await fixture(['https://cdn.example/ok.jpg', 'https://cdn.example/fail.jpg']);
  vi.mocked(request).mockResolvedValueOnce(response()).mockRejectedValueOnce(new Error('private signed URL'));
  await expect(importSourceImages(model.id, source.id)).rejects.toThrow('1 imágenes');
  const [saved] = await db.select().from(s.modelSources).where(eq(s.modelSources.id, source.id));
  expect(saved.images![0].storageKey).toBeTruthy(); expect(saved.images![1].error).not.toContain('private');
  vi.mocked(request).mockResolvedValueOnce(response());
  await importSourceImages(model.id, source.id); expect(request).toHaveBeenCalledTimes(3);
});
it('rejects oversized responses and non-image content without creating photos', async () => {
  const { db, source, model } = await fixture(['https://cdn.example/large', 'https://cdn.example/html']);
  vi.mocked(request).mockResolvedValueOnce(response(sample, { 'content-length': String(9 * 1024 * 1024) })).mockResolvedValueOnce(response(Buffer.from('<html>Login</html>')));
  await expect(importSourceImages(model.id, source.id)).rejects.toThrow('2 imágenes');
  expect(await db.select().from(s.photos).where(eq(s.photos.modelFileId, model.id))).toHaveLength(0);
});
it('does not process a source that is no longer associated', async () => {
  const { db, source, model } = await fixture(['https://cdn.example/a']);
  await db.update(s.modelFiles).set({ sourceId: null }).where(eq(s.modelFiles.id, model.id));
  await importSourceImages(model.id, source.id); expect(request).not.toHaveBeenCalled();
});
it('preserves a manually selected cover', async () => {
  const { db, source, model } = await fixture(['https://cdn.example/new']);
  const [photo] = await db.insert(s.photos).values({ workspaceId: WORKSPACE_ID, storageKey: 'manual.webp', modelFileId: model.id }).returning();
  await db.insert(s.libraryPhotoLinks).values({ workspaceId: WORKSPACE_ID, modelId: model.id, photoId: photo.id, data: { cover: true, type: 'real' } });
  vi.mocked(request).mockResolvedValueOnce(response()); await importSourceImages(model.id, source.id);
  const links = await db.select().from(s.libraryPhotoLinks).where(eq(s.libraryPhotoLinks.modelId, model.id));
  expect(links.filter(x => x.data.cover).map(x => x.photoId)).toEqual([photo.id]);
});
it('links uploaded model images: the first becomes the cover, later ones keep it, and re-linking is idempotent', async () => {
  const { db, model } = await fixture([]);
  const user = { id: '00000000-0000-4000-8000-0000000000aa', workspaceId: WORKSPACE_ID };
  const mk = async (key: string) => (await db.insert(s.photos).values({ workspaceId: WORKSPACE_ID, storageKey: key, modelFileId: model.id, scope: 'model' }).returning())[0];
  const a = await mk('a.webp'), b = await mk('b.webp');
  await linkModelImage(user, model.id, a.id); await linkModelImage(user, model.id, b.id); await linkModelImage(user, model.id, b.id);
  const links = await db.select().from(s.libraryPhotoLinks).where(eq(s.libraryPhotoLinks.modelId, model.id));
  expect(links).toHaveLength(2);
  expect(links.find(l => l.photoId === a.id)!.data).toMatchObject({ cover: true, origin: 'upload' });
  expect(links.find(l => l.photoId === b.id)!.data.cover).toBe(false);
});
