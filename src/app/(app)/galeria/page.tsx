import Link from 'next/link';
import { and, desc, eq, gte, ilike, isNull, sql } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can } from '@/lib/perm';
import { PageHeader, Card, Empty } from '@/components/ui';
import { PhotoCapture } from '@/components/photo-capture';
import { Uploader } from '@/components/uploader';
import { PhotoGrid, type PhotoView } from '@/components/photo-grid';
import { STAGES } from '@/lib/photos';

export const metadata = { title: 'Galería' };
export default async function GalleryPage({ searchParams }: { searchParams: Promise<{ stage?: string; fav?: string; tag?: string; months?: string; col?: string; subir?: string; cliente?: string }> }) {
  const user = await pagePerm('galeria', 'V'); const sp = await searchParams; const db = await getDb();
  const conds = [isNull(s.photos.deletedAt)];
  if (sp.stage) conds.push(eq(s.photos.stage, sp.stage)); if (sp.fav) conds.push(eq(s.photos.featured, true));
  if (sp.tag) conds.push(sql`${s.photos.tags}::text ilike ${'%' + sp.tag + '%'}`);
  if (sp.months) conds.push(gte(s.photos.takenAt, new Date(Date.now() - Number(sp.months) * 30 * 86400_000)));
  if (sp.cliente) conds.push(eq(s.photos.customerId, sp.cliente));
  const rows = await db.select({ p: s.photos, o: s.orders.number, c: s.customers.name }).from(s.photos).leftJoin(s.orders, eq(s.orders.id, s.photos.orderId)).leftJoin(s.customers, eq(s.customers.id, s.photos.customerId)).where(and(...conds)).orderBy(desc(s.photos.featured), desc(s.photos.takenAt)).limit(300);
  const cols = await db.select().from(s.collections); const colPhotos = sp.col ? await db.select().from(s.collectionPhotos).where(eq(s.collectionPhotos.collectionId, sp.col)) : [];
  const list = sp.col ? rows.filter((r) => colPhotos.some((c) => c.photoId === r.p.id)) : rows;
  const allTags = [...new Set((await db.select({ t: s.photos.tags }).from(s.photos).where(isNull(s.photos.deletedAt))).flatMap((x) => x.t ?? []))].sort().slice(0, 30);
  const views: PhotoView[] = list.map(({ p, o, c }) => ({ id: p.id, kind: p.kind, thumb: p.kind === 'video' ? '' : `/api/media/${p.variants?.['320'] ?? p.storageKey}`, large: `/api/media/${p.kind === 'video' ? p.storageKey : p.variants?.['1600'] ?? p.storageKey}`, stage: p.stage, stageLabel: STAGES[p.stage] ?? p.stage, featured: p.featured, tags: p.tags ?? [], caption: p.caption, internalOnly: p.internalOnly, takenAt: p.takenAt.toISOString(), order: o, customer: c, publish: p.publish ?? {}, suggestedText: p.suggestedText }));
  return (
    <>
      <PageHeader title="Galería" subtitle="Cada foto queda ligada a su pedido, modelo, material y máquina. Encuentra “lo mejor de PETG negro” en pocos clics." />
      {can(user, 'galeria', 'C') && <Card className="mb-4" title="Subir fotos y videos"><div className="grid md:grid-cols-2 gap-4"><PhotoCapture intent={{}} /><Uploader compact intent={{ intent: 'photo' }} accept="image/*,video/mp4,video/webm" label="…o arrastra fotos y videos (≤ 60 s)" hint="Se convierten a WebP en 320/800/1600 px; se conserva el original y se quita el GPS al exportar." /></div></Card>}
      <form className="flex flex-wrap gap-2 mb-4" role="search">
        <select name="stage" defaultValue={sp.stage ?? ''} className="input sm:!w-48" aria-label="Etapa"><option value="">Todas las etapas</option>{Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input name="tag" defaultValue={sp.tag} list="tags" className="input sm:!w-48" placeholder="Etiqueta (ej. PETG)" aria-label="Etiqueta" /><datalist id="tags">{allTags.map((t) => <option key={t} value={t} />)}</datalist>
        <select name="months" defaultValue={sp.months ?? ''} className="input sm:!w-44" aria-label="Período"><option value="">Todo el tiempo</option><option value="1">Último mes</option><option value="3">Últimos 3 meses</option><option value="6">Últimos 6 meses</option></select>
        {cols.length > 0 && <select name="col" defaultValue={sp.col ?? ''} className="input sm:!w-48" aria-label="Colección"><option value="">Todas las colecciones</option>{cols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
        <label className="flex items-center gap-1.5 text-sm px-1"><input type="checkbox" name="fav" value="1" defaultChecked={!!sp.fav} /> ★ Destacadas</label><button className="btn-ghost" data-testid="gallery-filter">Filtrar</button>
      </form>
      {views.length === 0 ? <Card><Empty title="No hay fotos con estos filtros" hint="Toma fotos desde un pedido o un trabajo, o súbelas aquí." /></Card> : <PhotoGrid photos={views} stages={STAGES} canEdit={can(user, 'galeria', 'E')} />}
    </>
  );
}
