'use client';
import { useState } from 'react';
import { createCollectionAction, deletePhotoAction, suggestTextAction, updatePhotoAction } from '@/actions/gallery';
import { Modal, useAction, useToast } from './client';
import { Badge } from './ui';
import { cn, dmy } from '@/lib/format';
import { Icon } from '@/components/shell';
import { useT } from '@/i18n/client';

export interface PhotoView { id: string; kind: string; thumb: string; large: string; stage: string; stageLabel: string; featured: boolean; tags: string[]; caption: string | null; internalOnly: boolean; takenAt: string; order: string | null; customer: string | null; publish: Record<string, { status: string; url?: string }>; suggestedText: string | null }
const NETS = ['Instagram', 'Facebook', 'TikTok', 'Mercado Libre'];
const RATIOS = ['1:1', '4:5', '9:16', '16:9'];
const PUB = ['pendiente', 'programada', 'publicada'] as const;

export function PhotoGrid({ photos, stages, canEdit }: { photos: PhotoView[]; stages: Record<string, string>; canEdit: boolean }) {
  const t = useT();
  const [sel, setSel] = useState<string[]>([]); const [open, setOpen] = useState<PhotoView | null>(null); const { run } = useAction(); const toast = useToast(); const [col, setCol] = useState('');
  const toggle = (id: string) => setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  return (
    <div>
      {sel.length > 0 && (
        <div className="card p-3 mb-3 flex flex-wrap items-center gap-2 sticky top-16 z-20" role="region" aria-label={t('gallery.selection')}><b>{sel.length} {t('gallery.selected')}</b>
          <a className="btn-ghost btn-sm" href={`/api/photos/zip?ids=${sel.join(',')}`}>{t('gallery.zip')}</a>
          <input className="input !w-48 !min-h-[34px]" placeholder={t('gallery.collectionName')} value={col} onChange={(e) => setCol(e.target.value)} aria-label={t('gallery.collectionName2')} />
          <button className="btn-ghost btn-sm" disabled={!col.trim()} onClick={() => run(() => createCollectionAction(col, sel), { ok: t('gallery.addedToTheCollection2'), onOk: () => { setSel([]); setCol(''); } })}>{t('gallery.addToCollection')}</button>
          <button className="btn-ghost btn-sm ml-auto" onClick={() => setSel([])}>{t('gallery.clear')}</button></div>)}
      <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2" data-testid="photo-grid">
        {photos.map((p) => (
          <li key={p.id} className="relative group">
            <button className="block w-full aspect-square rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800" onClick={() => setOpen(p)} aria-label={t('gallery.openPhoto', { stage: p.stageLabel })} data-testid="photo-tile">{p.kind === 'video' ? <div className="w-full h-full grid place-items-center text-3xl">🎬</div> : <img src={p.thumb} alt={p.caption ?? p.stageLabel} className="w-full h-full object-cover" loading="lazy" />}</button>
            <span className="absolute left-1.5 top-1.5 flex gap-1">{p.featured && <span className="badge bg-amber-400 text-black border-transparent"><Icon name="star" className="h-3 w-3 fill-current" /><span className="sr-only">{t('gallery.featuredOne')}</span></span>}{p.internalOnly && <span className="badge bg-slate-900/80 text-white border-transparent">{t('gallery.internal')}</span>}</span>
            <label className="absolute right-1.5 top-1.5 bg-white/90 dark:bg-slate-900/80 rounded p-1"><input type="checkbox" checked={sel.includes(p.id)} onChange={() => toggle(p.id)} aria-label={t('gallery.selectPhoto')} /></label>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent text-white text-[11px] p-1.5 rounded-b-lg">{p.stageLabel}</div>
          </li>))}
      </ul>
      {open && <Detail p={open} stages={stages} canEdit={canEdit} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Detail({ p, stages, canEdit, onClose }: { p: PhotoView; stages: Record<string, string>; canEdit: boolean; onClose: () => void }) {
  const t = useT();
  const { run, pending } = useAction(); const toast = useToast(); const [stage, setStage] = useState(p.stage); const [tags, setTags] = useState(p.tags.join(', ')); const [cap, setCap] = useState(p.caption ?? ''); const [txt, setTxt] = useState(p.suggestedText ?? ''); const [pub, setPub] = useState(p.publish); const [ratio, setRatio] = useState('1:1'); const [wm, setWm] = useState(false);
  return (
    <Modal open onClose={onClose} title={t('gallery.photo', { stage: p.stageLabel })} wide>
      <div className="grid md:grid-cols-2 gap-4">
        <div>{p.kind === 'video' ? <video src={p.large} controls className="w-full rounded-lg" /> : <img src={p.large} alt={p.caption ?? ''} className="w-full rounded-lg" />}<p className="text-xs muted mt-2">{dmy(p.takenAt)}{p.order ? ` · ${p.order}` : ''}{p.customer ? ` · ${p.customer}` : ''}</p>
          {p.internalOnly && <p className="text-xs rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-300 p-2 mt-2">{t('gallery.internalUseOnlyTheCustomer')}</p>}</div>
        <div className="space-y-3">
          <label className="block"><span className="label">{t('common.stage')}</span><select className="input" value={stage} disabled={!canEdit} onChange={(e) => setStage(e.target.value)}>{Object.entries(stages).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="block"><span className="label">{t('common.tags')}</span><input className="input" value={tags} disabled={!canEdit} onChange={(e) => setTags(e.target.value)} /></label>
          <label className="block"><span className="label">{t('common.description')}</span><input className="input" value={cap} disabled={!canEdit} onChange={(e) => setCap(e.target.value)} /></label>
          <div><span className="label">{t('gallery.publicationStatusRecordedManuall')}</span><div className="space-y-1.5">{NETS.map((n) => <div key={n} className="flex items-center gap-2 text-sm"><span className="w-28">{n}</span><select className="input !min-h-[34px]" value={pub[n]?.status ?? ''} disabled={!canEdit} onChange={(e) => setPub({ ...pub, [n]: { ...(pub[n] ?? {}), status: e.target.value } })} aria-label={t('gallery.statusOn', { n })}><option value="">—</option>{PUB.map((k) => <option key={k} value={k}>{t(`gallery.pub.${k}`)}</option>)}</select></div>)}</div></div>
          <div><div className="flex items-center justify-between"><span className="label !mb-0">{t('gallery.suggestedText')}</span><button className="btn-ghost btn-sm" onClick={async () => { const r = await suggestTextAction(p.id); if (r.ok) setTxt(r.data); else toast.push(r.error, 'err'); }}>{t('gallery.suggest')}</button></div><textarea className="input h-24 mt-1" value={txt} onChange={(e) => setTxt(e.target.value)} aria-label={t('gallery.suggestedText')} /></div>
          {canEdit && <div className="flex flex-wrap gap-2"><button className="btn-primary" disabled={pending} onClick={() => run(() => updatePhotoAction(p.id, { stage, tags: tags.split(',').map((tt) => tt.trim()).filter(Boolean), caption: cap || null, publish: Object.fromEntries(Object.entries(pub).filter(([, v]) => v.status)), suggestedText: txt || null }), { ok: t('gallery.saved2'), onOk: onClose })} data-testid="photo-save">{t('common.save')}</button>
            <button className="btn-ghost" disabled={pending} onClick={() => run(() => updatePhotoAction(p.id, { featured: !p.featured }), { ok: p.featured ? t('gallery.removedFromFeatured2') : t('gallery.markedAsFeatured2'), onOk: onClose })} data-testid="photo-feature">{p.featured ? t('gallery.unfeature') : t('gallery.feature')}</button>
            <button className="btn-ghost text-danger" disabled={pending} onClick={() => run(() => deletePhotoAction(p.id), { ok: t('gallery.photoDeleted2'), onOk: onClose })}>{t('common.deleteLabel')}</button></div>}
          {p.kind === 'foto' && <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3"><div className="label">{t('gallery.socialMediaFormat')}</div><div className="flex flex-wrap items-center gap-2">{RATIOS.map((r) => <button key={r} className={cn('btn-ghost btn-sm', ratio === r && '!bg-[var(--panel)] !text-[var(--panel-ink)] dark:!bg-slate-700')} onClick={() => setRatio(r)}>{r}</button>)}<label className="text-xs flex items-center gap-1"><input type="checkbox" checked={wm} onChange={(e) => setWm(e.target.checked)} /> {t('gallery.watermark')}</label><a className="btn-primary btn-sm" href={`/api/photos/${p.id}/export?ratio=${ratio}${wm ? '&wm=1' : ''}`} data-testid="photo-export">{t('gallery.exportLabel')}</a></div></div>}
        </div>
      </div>
    </Modal>
  );
}
