import {photoAccess} from '@/lib/library/access';
import Link from 'next/link';
import { and, desc, eq, gte, ilike, isNull, sql } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can } from '@/lib/perm';
import { PageHeader, Card, Empty } from '@/components/ui';
import { PhotoCapture } from '@/components/photo-capture';
import { Uploader } from '@/components/uploader';
import { PhotoGrid, type PhotoView } from '@/components/photo-grid';
import { STAGE_KEYS } from '@/lib/photo-stages';
import { tOr } from '@/i18n/translate';
import { EditButton } from '@/components/edit-button';
import { editFields } from '@/lib/edit-fields';
import { getT } from '@/i18n/server';
import { noPhotoConsent } from '@/lib/photos';
import { RemoveButton } from '@/components/remove-button';
import { Icon } from '@/components/shell';

export async function generateMetadata() { return { title: (await getT())('meta.gallery') }; }
const LIMIT = 300;
export default async function GalleryPage({ searchParams }: { searchParams: Promise<{ stage?: string; fav?: string; tag?: string; months?: string; col?: string; subir?: string; cliente?: string }> }) {
  const t = await getT();
  const user = await pagePerm('galeria', 'V'); const sp = await searchParams; const db = await getDb();
  const conds = [photoAccess(user),isNull(s.photos.deletedAt),eq(s.photos.scope,'job')];
  if (sp.stage) conds.push(eq(s.photos.stage, sp.stage)); if (sp.fav) conds.push(eq(s.photos.featured, true));
  if (sp.tag) conds.push(sql`${s.photos.tags}::text ilike ${'%' + sp.tag + '%'}`);
  if (sp.months) conds.push(gte(s.photos.takenAt, new Date(Date.now() - Number(sp.months) * 30 * 86400_000)));
  if (sp.cliente) conds.push(eq(s.photos.customerId, sp.cliente));
  const rows = await db.select({ p: s.photos, o: s.orders.number, c: s.customers.name, consent: s.customers.photoConsent }).from(s.photos).leftJoin(s.orders, eq(s.orders.id, s.photos.orderId)).leftJoin(s.customers, eq(s.customers.id, s.photos.customerId)).where(and(...conds)).orderBy(desc(s.photos.featured), desc(s.photos.takenAt)).limit(LIMIT);
  const cols = await db.select().from(s.collections).where(isNull(s.collections.deletedAt)); const colPhotos = sp.col ? await db.select().from(s.collectionPhotos).where(eq(s.collectionPhotos.collectionId, sp.col)) : [];
  const list = sp.col ? rows.filter((r) => colPhotos.some((c) => c.photoId === r.p.id)) : rows;
  const allTags = [...new Set((await db.select({ t: s.photos.tags }).from(s.photos).where(and(photoAccess(user),isNull(s.photos.deletedAt),eq(s.photos.scope,'job')))).flatMap((x) => x.t ?? []))].sort().slice(0, 30);
  const views: PhotoView[] = list.map(({ p, o, c, consent }) => ({ id: p.id, kind: p.kind, thumb: p.kind === 'video' ? '' : `/api/media/${p.variants?.['320'] ?? p.storageKey}`, large: `/api/media/${p.kind === 'video' ? p.storageKey : p.variants?.['1600'] ?? p.storageKey}`, stage: p.stage, stageLabel: tOr(t, `gallery.stage.${p.stage}`, p.stage), featured: p.featured, tags: p.tags ?? [], caption: p.caption, internalOnly: p.internalOnly || noPhotoConsent(consent), takenAt: p.takenAt.toISOString(), order: o, customer: c, publish: p.publish ?? {}, suggestedText: p.suggestedText }));
  return (
    <>
      <PageHeader title={t('gallery.gallery')} subtitle={t('gallery.everyPhotoIsLinkedTo')} />
      {can(user, 'galeria', 'C') && <Card className="mb-4" title={t('gallery.uploadPhotosAndVideos')}><div className="grid md:grid-cols-2 gap-4"><PhotoCapture intent={{}} /><Uploader compact intent={{ intent: 'photo' }} accept="image/*,video/mp4,video/webm" label={t('gallery.orDropPhotosAndVideos')} hint={t('gallery.theyAreConvertedToWebp')} /></div></Card>}
      <form className="filter-bar flex flex-wrap gap-2 mb-4" role="search">
        <select name="stage" defaultValue={sp.stage ?? ''} className="input sm:!w-48" aria-label={t('common.stage')}><option value="">{t('gallery.allStages')}</option>{STAGE_KEYS.map((k) => <option key={k} value={k}>{t(`gallery.stage.${k}`)}</option>)}</select>
        <input name="tag" defaultValue={sp.tag} list="tags" className="input sm:!w-48" placeholder={t('gallery.tagEGPetg')} aria-label={t('common.tag')} /><datalist id="tags">{allTags.map((tt) => <option key={tt} value={tt} />)}</datalist>
        <select name="months" defaultValue={sp.months ?? ''} className="input sm:!w-44" aria-label={t('gallery.period')}><option value="">{t('gallery.allTime')}</option><option value="1">{t('gallery.lastMonth')}</option><option value="3">{t('gallery.last3Months')}</option><option value="6">{t('gallery.last6Months')}</option></select>
        {cols.length > 0 && <select name="col" defaultValue={sp.col ?? ''} className="input sm:!w-48" aria-label={t('gallery.collection')}><option value="">{t('gallery.allCollections')}</option>{cols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}{sp.col && cols.some((c) => c.id === sp.col) && can(user, 'galeria', 'E') && <EditButton kind="collection" id={sp.col} fields={editFields('collection', t)} values={cols.find((c) => c.id === sp.col)!} className="btn-ghost" testId="edit-collection" />}{sp.col && cols.some((c) => c.id === sp.col) && can(user, 'galeria', 'X') && <RemoveButton kind="collection" id={sp.col} name={cols.find((c) => c.id === sp.col)!.name} redirectTo="/galeria" />}
        <label className="flex items-center gap-1.5 text-sm px-1"><input type="checkbox" name="fav" value="1" defaultChecked={!!sp.fav} /> <Icon name="star" className="h-4 w-4 fill-current text-amber-500" />{t('gallery.featured')}</label><button className="btn-ghost" data-testid="gallery-filter">{t('common.filter')}</button>
      </form>
      {rows.length === LIMIT && <p className="text-xs muted mb-3" role="status">{t('common.listCapped', { n: LIMIT })}</p>}
      {views.length === 0 ? <Card><Empty title={t('gallery.noPhotosMatchTheseFilters')} hint={t('gallery.takePhotosFromAnOrder')} /></Card> : <PhotoGrid photos={views} stages={Object.fromEntries(STAGE_KEYS.map((k) => [k, t(`gallery.stage.${k}`)]))} canEdit={can(user, 'galeria', 'E')} />}
    </>
  );
}
