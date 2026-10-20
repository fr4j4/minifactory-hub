'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus, Star, Trash2 } from 'lucide-react';
import { listJobPhotos, removeModelImage, setModelCover, useJobPhotoForModel, type JobPhotoOption } from '@/actions/model-images';
import { useT } from '@/i18n/client';
import { cn } from '@/lib/format';
import { useToast } from './client';
import { PhotoCapture } from './photo-capture';
import { ModalDialog } from './ui/kit';

export interface ModelImage { linkId: string; photoId: string; thumb: string; large: string; cover: boolean; fromJob: boolean; caption: string | null }

/** Imágenes de un modelo 3D: subir, usar una foto de un trabajo, elegir portada y quitar. No pasan por la Galería. */
export function ModelImages({ modelId, images, canEdit, canPickJobPhoto }: { modelId: string; images: ModelImage[]; canEdit: boolean; canPickJobPhoto: boolean }) {
  const t = useT(); const toast = useToast(); const router = useRouter(); const [pending, start] = useTransition(); const [open, setOpen] = useState(false);
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); if (!r.ok) toast.push(r.error ?? '', 'err'); router.refresh(); });
  return (
    <div className="grid gap-3">
      <p className="muted text-xs">{t('library.modelImagesHint')}</p>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <PhotoCapture intent={{ intent: 'photo', scope: 'model', modelFileId: modelId }} label={t('library.uploadImage')} stages={{ producto_final: '—' }} hideStage />
          {canPickJobPhoto && <button type="button" className="btn-ghost" onClick={() => setOpen(true)}><ImagePlus className="h-4 w-4" aria-hidden />{t('library.useJobPhoto')}</button>}
        </div>
      )}
      {images.length === 0 ? <p className="muted text-sm">{t('library.noModelImages')}</p> : (
        <ul className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {images.map((im) => (
            <li key={im.linkId} className={cn('group relative card overflow-hidden', im.cover && 'ring-2 ring-[var(--accent)]')}>
              <a href={`/api/media/${im.large}`} target="_blank" rel="noreferrer" className="block aspect-square bg-slate-100 dark:bg-slate-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/media/${im.thumb}`} alt={im.caption ?? ''} className="w-full h-full object-cover" loading="lazy" />
              </a>
              <span className="absolute left-1 top-1 badge bg-white/90 dark:bg-slate-900/80 border-transparent !text-[10px]">{im.cover ? t('library.isCover') : im.fromJob ? t('library.fromJob') : t('library.ownImage')}</span>
              {canEdit && (
                <div className="absolute right-1 bottom-1 flex gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  {!im.cover && <button type="button" disabled={pending} className="btn-ghost btn-sm !px-2 !min-h-[30px]" title={t('library.setCover')} aria-label={t('library.setCover')} onClick={() => act(() => setModelCover(im.linkId))}><Star className="h-4 w-4" aria-hidden /></button>}
                  <button type="button" disabled={pending} className="btn-ghost btn-sm !px-2 !min-h-[30px]" title={t('library.removeImage')} aria-label={t('library.removeImage')} onClick={() => { if (window.confirm(t('library.removeImageConfirm'))) act(() => removeModelImage(im.linkId)); }}><Trash2 className="h-4 w-4" aria-hidden /></button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {canPickJobPhoto && <JobPhotoDialog modelId={modelId} open={open} onClose={() => setOpen(false)} hasCover={images.some((i) => i.cover)} />}
    </div>
  );
}

/** Diálogo para elegir una o varias fotos de trabajos y usarlas en el modelo. */
function JobPhotoDialog({ modelId, open, onClose, hasCover }: { modelId: string; open: boolean; onClose: () => void; hasCover: boolean }) {
  const t = useT(); const toast = useToast(); const router = useRouter();
  const [q, setQ] = useState(''), [photos, setPhotos] = useState<JobPhotoOption[]>([]), [more, setMore] = useState(false), [loading, setLoading] = useState(false), [sel, setSel] = useState<string[]>([]), [cover, setCover] = useState(false), [busy, setBusy] = useState(false);
  const load = async (query: string, offset: number) => {
    setLoading(true); const r = await listJobPhotos(modelId, { q: query, offset }); setLoading(false);
    if (!r.ok) { toast.push(r.error, 'err'); return; }
    setPhotos((cur) => offset ? [...cur, ...r.data.photos] : r.data.photos); setMore(r.data.more);
  };
  useEffect(() => { if (!open) return; setSel([]); const h = setTimeout(() => { load(q, 0); }, q ? 250 : 0); return () => clearTimeout(h); /* eslint-disable-next-line */ }, [open, q]);
  const toggle = (id: string) => setSel((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length < 24 ? [...c, id] : c));
  const use = async () => { setBusy(true); const r = await useJobPhotoForModel(modelId, sel, cover || !hasCover); setBusy(false); if (!r.ok) { toast.push(r.error, 'err'); return; } onClose(); router.refresh(); };
  return (
    <ModalDialog open={open} onClose={onClose} title={t('library.jobPhotoTitle')} wide closeLabel={t('common.close')}>
      <div className="grid gap-3">
        <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('library.jobPhotoSearch')} aria-label={t('library.jobPhotoSearch')} />
        {photos.length === 0 && !loading ? <p className="muted text-sm py-6 text-center">{t('library.jobPhotoNone')}</p> : (
          <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-[50vh] overflow-y-auto" aria-busy={loading}>
            {photos.map((p) => {
              const on = sel.includes(p.id);
              return (
                <li key={p.id}>
                  <button type="button" aria-pressed={on} onClick={() => toggle(p.id)} className={cn('block w-full text-left card overflow-hidden', on && 'ring-2 ring-[var(--accent)]')}>
                    <span className="block aspect-square bg-slate-100 dark:bg-slate-800">{p.thumb && /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/media/${p.thumb}`} alt={p.caption ?? ''} className="w-full h-full object-cover" loading="lazy" />}</span>
                    <span className="block px-1.5 py-1 text-[11px] leading-tight truncate muted">{p.order ? t('library.jobOrder', { n: p.order }) : ''}{p.order && p.customer ? ' · ' : ''}{p.customer ?? ''}{!p.order && !p.customer ? new Date(p.takenAt).toLocaleDateString() : ''}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {more && <button type="button" className="btn-ghost justify-self-center" disabled={loading} onClick={() => load(q, photos.length)}>{t('library.loadMore')}</button>}
        <p className="muted text-xs">{t('library.jobPhotoHint')}</p>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cover || !hasCover} disabled={!hasCover} onChange={(e) => setCover(e.target.checked)} />{t('library.setCover')}</label>
          <button type="button" className="btn-primary" disabled={busy || sel.length === 0} onClick={use}>{t('library.jobPhotoUse', { n: sel.length })}</button>
        </div>
      </div>
    </ModalDialog>
  );
}
