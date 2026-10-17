'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { bulkFilesAction, renameTagAction, type BulkOp } from '@/actions/files';
import { useT } from '@/i18n/client';
import { useToast } from './client';
import { Badge } from './badge';
import { Icon } from '@/components/shell';
import { FavButton } from './file-bits';

export interface FileCard { id: string; name: string; format: string; versionId: string | null; hasThumb: boolean; hasTurn?: boolean; dims: string; tags: string[]; favorite: boolean; closed: boolean | null; version: number; fits: string[]; slices: number; quotes: number; multicolor: boolean }

/** Rejilla de la biblioteca con selección múltiple y acciones masivas (etiquetar, mover, favorito). */
/** Miniatura que gira al pasar el mouse (o al enfocar) si la versión tiene la animación. */
function CardThumb({ versionId, hasTurn, alt }: { versionId: string; hasTurn: boolean; alt: string }) {
  const [spin, setSpin] = useState(false);
  /* eslint-disable-next-line @next/next/no-img-element */
  return <img src={`/api/files/v/${versionId}/${spin && hasTurn ? 'turn' : 'thumb'}`} alt={alt} className="w-full h-full object-cover" loading="lazy" onMouseEnter={() => setSpin(true)} onMouseLeave={() => setSpin(false)} data-turn={hasTurn ? '1' : undefined} />;
}

export function FileGrid({ cards, canEdit, vocabulary, tagColors = {} }: { cards: FileCard[]; canEdit: boolean; vocabulary: Array<{ tag: string; n: number }>; tagColors?: Record<string, string> }) {
  const t = useT(); const toast = useToast(); const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set()); const [tagText, setTagText] = useState(''); const [folder, setFolder] = useState(''); const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const toggle = (id: string) => setSel((o) => { const n = new Set(o); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const run = async (op: BulkOp, ok: string) => { setBusy(true); const r = await bulkFilesAction([...sel], op); setBusy(false); if (!r.ok) { toast.push(r.error, 'err'); return; } toast.push(ok); setSel(new Set()); setTagText(''); router.refresh(); };
  const rename = async () => { setBusy(true); const r = await renameTagAction(from, to); setBusy(false); if (!r.ok) { toast.push(r.error, 'err'); return; } toast.push(t('files.tagRenamed', { n: r.data })); setFrom(''); setTo(''); router.refresh(); };
  return (
    <div>
      {canEdit && sel.size > 0 && (
        <div className="sticky top-2 z-20 card p-2.5 mb-3 flex flex-wrap items-center gap-2 shadow-md" role="toolbar" aria-label={t('files.bulkBar')} data-testid="bulk-bar">
          <b className="text-sm px-1">{t('files.selected', { n: sel.size })}</b>
          <input className="input !w-40 !min-h-[36px]" placeholder={t('files.bulkTagsPlaceholder')} value={tagText} onChange={(e) => setTagText(e.target.value)} list="vocab-tags" aria-label={t('files.bulkTagsPlaceholder')} data-testid="bulk-tags" />
          <button className="btn-ghost btn-sm" disabled={busy || !tagText.trim()} onClick={() => run({ kind: 'addTags', tags: tagText.split(',').map((x) => x.trim()).filter(Boolean) }, t('files.bulkDone'))} data-testid="bulk-add-tags">{t('files.bulkAddTags')}</button>
          <input className="input !w-36 !min-h-[36px]" placeholder={t('files.folder')} value={folder} onChange={(e) => setFolder(e.target.value)} aria-label={t('files.folder')} />
          <button className="btn-ghost btn-sm" disabled={busy} onClick={() => run({ kind: 'folder', folder: folder || null }, t('files.bulkDone'))}>{t('files.bulkMove')}</button>
          <button className="btn-ghost btn-sm" disabled={busy} onClick={() => run({ kind: 'favorite', value: true }, t('files.bulkDone'))} data-testid="bulk-favorite"><Icon name="star" className="h-4 w-4" /> {t('files.markAsFavorite')}</button>
          <button className="btn-ghost btn-sm ml-auto" onClick={() => setSel(new Set())}>{t('common.cancel')}</button>
        </div>)}
      <datalist id="vocab-tags">{vocabulary.map((v) => <option key={v.tag} value={v.tag} />)}</datalist>
      <ul className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-5" data-testid="file-grid">
        {cards.map((c) => (
          <li key={c.id} className={`card overflow-hidden flex flex-col relative ${sel.has(c.id) ? 'ring-2 ring-[var(--accent)]' : ''}`}>
            {canEdit && <label className="absolute right-1.5 top-1.5 z-10 bg-white/90 dark:bg-slate-900/80 rounded-md p-1 cursor-pointer"><input type="checkbox" className="h-4 w-4" checked={sel.has(c.id)} onChange={() => toggle(c.id)} aria-label={t('files.selectFile', { name: c.name })} data-testid="file-select" /></label>}
            <Link href={`/archivos/${c.id}`} className="block aspect-[4/3] bg-slate-100 dark:bg-slate-800 relative" aria-label={t('files.open', { name: c.name })}>
              {c.hasThumb && c.versionId ? <CardThumb versionId={c.versionId} hasTurn={!!c.hasTurn} alt={t('files.thumbnailOf', { name: c.name })} /> : <div className="w-full h-full grid place-items-center text-slate-400 text-sm">{c.format}</div>}
              <span className="absolute left-1.5 top-1.5 badge bg-white/90 dark:bg-slate-900/80 border-transparent">{c.format}</span>
            </Link>
            <div className="p-3 flex-1 flex flex-col gap-1.5">
              <div className="flex items-start justify-between gap-1"><Link href={`/archivos/${c.id}`} className="font-medium text-sm leading-snug hover:underline line-clamp-2">{c.name}</Link><FavButton id={c.id} fav={c.favorite} /></div>
              <div className="text-xs muted tabular">{c.dims}</div>
              <div className="flex flex-wrap gap-1 mt-auto">
                {c.closed === false && <Badge tone="amber">{t('files.openMesh')}</Badge>}{c.version > 1 && <Badge>v{c.version}</Badge>}{c.multicolor && <Badge tone="violet">{t('files.badgeMulticolor')}</Badge>}
                {c.fits.length > 0 && <Badge tone="green" className="max-w-full truncate">{t('files.badgeFits', { names: c.fits.slice(0, 2).join(', ') + (c.fits.length > 2 ? '…' : '') })}</Badge>}
                {c.slices > 0 && <Badge tone="blue">{t('files.badgeSlices', { n: c.slices })}</Badge>}{c.quotes > 0 && <Badge tone="blue">{t('files.badgeQuotes', { n: c.quotes })}</Badge>}
                {c.tags.slice(0, 3).map((tt) => <span key={tt} className="badge" style={tagColors[tt] ? { borderColor: tagColors[tt], boxShadow: `inset 3px 0 0 ${tagColors[tt]}` } : undefined}>{tt}</span>)}
              </div>
            </div>
          </li>))}
      </ul>
      {canEdit && vocabulary.length > 0 && (
        <details className="card mt-5 p-3 text-sm" data-testid="tag-admin"><summary className="cursor-pointer font-medium">{t('files.tagAdmin')}</summary>
          <p className="muted text-xs my-2">{t('files.tagAdminHint')}</p>
          <ul className="flex flex-wrap gap-1.5 mb-3">{vocabulary.map((v) => <li key={v.tag}><button className="badge border-[var(--line)] hover:border-[var(--accent)]" onClick={() => { setFrom(v.tag); setTo(v.tag); }}>{v.tag} <span className="muted">{v.n}</span></button></li>)}</ul>
          <div className="flex flex-wrap gap-2 items-center"><input className="input !w-40 !min-h-[36px]" value={from} onChange={(e) => setFrom(e.target.value)} placeholder={t('files.tagFrom')} aria-label={t('files.tagFrom')} /><span aria-hidden>→</span><input className="input !w-40 !min-h-[36px]" value={to} onChange={(e) => setTo(e.target.value)} placeholder={t('files.tagTo')} aria-label={t('files.tagTo')} data-testid="tag-to" /><button className="btn-ghost btn-sm" disabled={busy || !from.trim() || !to.trim() || from === to} onClick={rename} data-testid="tag-rename">{t('files.tagMerge')}</button></div>
        </details>)}
    </div>
  );
}
