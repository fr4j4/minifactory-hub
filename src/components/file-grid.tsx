'use client';
import { BatchPlan } from './library-advanced';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { bulkFilesAction, renameTagAction, type BulkOp } from '@/actions/files';
import { useT } from '@/i18n/client';
import { useToast } from './client';
import { Badge } from './badge';
import { Icon } from '@/components/shell';
import { collectionModels } from '@/actions/library';
import { FavButton } from './file-bits';
import { ModalDialog } from './ui/kit';
import { AlertTriangle, Check, Eye, FileText, Layers, Palette } from 'lucide-react';

export interface FileCard { id: string; name: string; format: string; cover?:string; versionId: string | null; hasThumb: boolean; hasTurn?: boolean; dims: string; tags: string[]; favorite: boolean; closed: boolean | null; version: number; fits: string[]; slices: number; quotes: number; multicolor: boolean; size?: number | null; updatedAt?: string; author?: string | null; license?: string | null; remote?: boolean }

const bytes = (n?: number | null) => n == null ? '—' : n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(n < 104857600 ? 1 : 0)} MB`;

/** Imagen principal de un modelo: portada, miniatura con giro o, si no hay, el formato. */
function Preview({ c, alt }: { c: FileCard; alt: string }) {
  /* eslint-disable-next-line @next/next/no-img-element */
  return c.cover ? <img src={`/api/media/${c.cover}`} alt={c.name} className="w-full h-full object-cover" loading="lazy"/> : c.hasThumb && c.versionId ? <CardThumb versionId={c.versionId} hasTurn={!!c.hasTurn} alt={alt} /> : <div className="w-full h-full grid place-items-center text-slate-400 text-sm font-mono">{c.format}</div>;
}

/** Rejilla de la biblioteca con selección múltiple y acciones masivas (etiquetar, mover, favorito). */
/** Miniatura que gira al pasar el mouse (o al enfocar) si la versión tiene la animación. */
function CardThumb({ versionId, hasTurn, alt }: { versionId: string; hasTurn: boolean; alt: string }) {
  const [spin,setSpin]=useState(false);
  useEffect(()=>{const listener=(e:Event)=>{if((e as CustomEvent).detail!==versionId)setSpin(false);};window.addEventListener('library-spin',listener);return()=>window.removeEventListener('library-spin',listener);},[versionId]);
  const play=()=>{window.dispatchEvent(new CustomEvent('library-spin',{detail:versionId}));setSpin(true);};
  /* eslint-disable-next-line @next/next/no-img-element */
  return <img src={`/api/files/v/${versionId}/${spin && hasTurn ? 'turn' : 'thumb'}`} alt={alt} className="w-full h-full object-cover" loading="lazy" onMouseEnter={() => { if (!matchMedia('(prefers-reduced-motion: reduce)').matches && !(navigator as any).connection?.saveData) play(); }} onMouseLeave={() => setSpin(false)} tabIndex={hasTurn ? 0 : undefined} onFocus={() => { if (!matchMedia('(prefers-reduced-motion: reduce)').matches) play(); }} onBlur={() => setSpin(false)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();spin?setSpin(false):play();}}} data-turn={hasTurn ? '1' : undefined} />;
}

export function FileGrid({ cards, canEdit, vocabulary, tagColors = {}, scope = "" }: { scope?:string; cards: FileCard[]; canEdit: boolean; vocabulary: Array<{ tag: string; n: number }>; tagColors?: Record<string, string> }) {
  const t = useT(); const toast = useToast(); const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  useEffect(()=>{try{setSel(new Set(JSON.parse(sessionStorage.getItem('library-selection:'+scope)||'[]')));}catch{}},[scope]);
  const updateSel=(next:Set<string>)=>{setSel(next);sessionStorage.setItem('library-selection:'+scope,JSON.stringify([...next]));}; const [tagText, setTagText] = useState(''); const [folder, setFolder] = useState(''); const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [peek, setPeek] = useState<FileCard | null>(null);
  const toggle=(id:string)=>{const n=new Set(sel);n.has(id)?n.delete(id):n.add(id);updateSel(n);};
  const run = async (op: BulkOp, ok: string) => { setBusy(true); const r = await bulkFilesAction([...sel], op); setBusy(false); if (!r.ok) { toast.push(r.error, 'err'); return; } toast.push(ok); updateSel(new Set()); setTagText(''); router.refresh(); };
  const rename = async () => { setBusy(true); const r = await renameTagAction(from, to); setBusy(false); if (!r.ok) { toast.push(r.error, 'err'); return; } toast.push(t('files.tagRenamed', { n: r.data })); setFrom(''); setTo(''); router.refresh(); };
  return (
    <div>
      {canEdit&&<div className="flex flex-wrap items-center gap-2 mb-2"><button className="btn-ghost btn-sm" onClick={()=>updateSel(new Set([...sel,...cards.map(c=>c.id)]))}>{t('library.selectPage')}</button><button className="btn-ghost btn-sm" onClick={async()=>{const r=await(await import('@/actions/library-advanced')).snapshotLibrarySelection(Object.fromEntries([...new Set(new URLSearchParams(location.search).keys())].map(k=>[k,new URLSearchParams(location.search).getAll(k).join(',')])));if(r.ok)updateSel(new Set(r.data));else toast.push(r.error,'err');}}>{t('library.selectResults')}</button><BatchPlan ids={[...sel]} onClear={()=>updateSel(new Set())}/></div>}
      {canEdit && sel.size > 0 && (
        <div className="sticky top-2 z-20 card p-2.5 mb-3 flex flex-wrap items-center gap-2 shadow-md" role="toolbar" aria-label={t('files.bulkBar')} data-testid="bulk-bar"><button className="btn-ghost btn-sm" disabled={busy} onClick={async()=>{const name=window.prompt(t('library.collection'));if(!name)return;setBusy(true);const r=await collectionModels(name,[...sel]);setBusy(false);if(!r.ok)toast.push(r.error,'err');else router.refresh();}}>{t('library.addCollection')}</button>
          <b className="text-sm px-1">{t('files.selected', { n: sel.size })}</b>
          <input className="input !w-40 !min-h-[36px]" placeholder={t('files.bulkTagsPlaceholder')} value={tagText} onChange={(e) => setTagText(e.target.value)} list="vocab-tags" aria-label={t('files.bulkTagsPlaceholder')} data-testid="bulk-tags" />
          <button className="btn-ghost btn-sm" disabled={busy || !tagText.trim()} onClick={() => run({ kind: 'addTags', tags: tagText.split(',').map((x) => x.trim()).filter(Boolean) }, t('files.bulkDone'))} data-testid="bulk-add-tags">{t('files.bulkAddTags')}</button>
          <input className="input !w-36 !min-h-[36px]" placeholder={t('files.folder')} value={folder} onChange={(e) => setFolder(e.target.value)} aria-label={t('files.folder')} />
          <button className="btn-ghost btn-sm" disabled={busy} onClick={() => run({ kind: 'folder', folder: folder || null }, t('files.bulkDone'))}>{t('files.bulkMove')}</button>
          <button className="btn-ghost btn-sm" disabled={busy} onClick={() => run({ kind: 'favorite', value: true }, t('files.bulkDone'))} data-testid="bulk-favorite"><Icon name="star" className="h-4 w-4" /> {t('files.markAsFavorite')}</button>
          <button className="btn-ghost btn-sm ml-auto" onClick={() => updateSel(new Set())}>{t('common.cancel')}</button>
        </div>)}
      <datalist id="vocab-tags">{vocabulary.map((v) => <option key={v.tag} value={v.tag} />)}</datalist>
      <ul className={`grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 ${sel.size ? 'selecting' : ''}`} data-testid="file-grid">
        {cards.map((c) => (
          <li key={c.id} className={`group card overflow-hidden flex flex-col relative transition-shadow hover:shadow-md ${sel.has(c.id) ? 'ring-2 ring-[var(--accent)]' : ''}`}>
            {canEdit && <label className="tile-check absolute right-1.5 top-1.5 z-10 bg-white/90 dark:bg-slate-900/80 rounded-md p-1 cursor-pointer"><input type="checkbox" className="h-4 w-4" checked={sel.has(c.id)} onChange={() => toggle(c.id)} aria-label={t('files.selectFile', { name: c.name })} data-testid="file-select" /></label>}
            <div className="relative aspect-square bg-slate-100 dark:bg-slate-800">
              <Link href={`/archivos/${c.id}`} className="block w-full h-full" aria-label={t('files.open', { name: c.name })}><Preview c={c} alt={t('files.thumbnailOf', { name: c.name })} /></Link>
              <span className="absolute left-1.5 bottom-1.5 badge bg-white/90 dark:bg-slate-900/80 border-transparent font-mono !text-[11px] pointer-events-none">{c.format}</span>
              <button type="button" className="absolute right-1.5 bottom-1.5 btn-ghost btn-sm !px-2 !min-h-[30px] opacity-100 md:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity" onClick={() => setPeek(c)} aria-label={`${t('library.quickView')}: ${c.name}`} title={t('library.quickView')}><Eye className="h-4 w-4" aria-hidden /></button>
            </div>
            <div className="p-2.5 flex-1 flex flex-col gap-1.5">
              <div className="flex items-start justify-between gap-1"><Link href={`/archivos/${c.id}`} className="font-medium text-sm leading-snug hover:underline line-clamp-2" title={c.name}>{c.name}</Link><FavButton id={c.id} fav={c.favorite} /></div>
              <div className="text-[11px] muted tabular font-mono truncate">{c.dims}{c.version > 1 ? ` · v${c.version}` : ''}</div>
              <Signals c={c} />
              {c.tags.length > 0 && <div className="flex flex-wrap gap-1 mt-auto">{c.tags.slice(0, 3).map((tt) => <span key={tt} className="badge !text-[11px]" style={tagColors[tt] ? { borderColor: tagColors[tt], boxShadow: `inset 3px 0 0 ${tagColors[tt]}` } : undefined}>{tt}</span>)}{c.tags.length > 3 && <span className="badge !text-[11px] muted" title={c.tags.slice(3).join(', ')}>{t('library.moreTags', { n: c.tags.length - 3 })}</span>}</div>}
            </div>
          </li>))}
      </ul>
      <QuickView card={peek} onClose={() => setPeek(null)} tagColors={tagColors} />
      {canEdit && vocabulary.length > 0 && (
        <details className="card mt-5 p-3 text-sm" data-testid="tag-admin"><summary className="cursor-pointer font-medium">{t('files.tagAdmin')}</summary>
          <p className="muted text-xs my-2">{t('files.tagAdminHint')}</p>
          <ul className="flex flex-wrap gap-1.5 mb-3">{vocabulary.map((v) => <li key={v.tag}><button className="badge border-[var(--line)] hover:border-[var(--accent)]" onClick={() => { setFrom(v.tag); setTo(v.tag); }}>{v.tag} <span className="muted">{v.n}</span></button></li>)}</ul>
          <div className="flex flex-wrap gap-2 items-center"><input className="input !w-40 !min-h-[36px]" value={from} onChange={(e) => setFrom(e.target.value)} placeholder={t('files.tagFrom')} aria-label={t('files.tagFrom')} /><span aria-hidden>→</span><input className="input !w-40 !min-h-[36px]" value={to} onChange={(e) => setTo(e.target.value)} placeholder={t('files.tagTo')} aria-label={t('files.tagTo')} data-testid="tag-to" /><button className="btn-ghost btn-sm" disabled={busy || !from.trim() || !to.trim() || from === to} onClick={rename} data-testid="tag-rename">{t('files.tagMerge')}</button></div>
        </details>)}
    </div>
  );
}

/** Señales compactas de la tarjeta: cabe en máquina, multicolor, laminados, presupuestos y malla abierta. */
function Signals({ c }: { c: FileCard }) {
  const t = useT();
  const items = [
    c.fits.length > 0 && { k: 'fits', icon: <Check className="h-3.5 w-3.5" />, text: c.fits.length === 1 ? c.fits[0] : String(c.fits.length), title: t('files.badgeFits', { names: c.fits.join(', ') }), cls: 'text-emerald-700 dark:text-emerald-400' },
    c.multicolor && { k: 'multi', icon: <Palette className="h-3.5 w-3.5" />, text: '', title: t('files.badgeMulticolor'), cls: 'text-violet-700 dark:text-violet-400' },
    c.slices > 0 && { k: 'slices', icon: <Layers className="h-3.5 w-3.5" />, text: String(c.slices), title: t('files.badgeSlices', { n: c.slices }), cls: 'text-sky-700 dark:text-sky-400' },
    c.quotes > 0 && { k: 'quotes', icon: <FileText className="h-3.5 w-3.5" />, text: String(c.quotes), title: t('files.badgeQuotes', { n: c.quotes }), cls: 'text-sky-700 dark:text-sky-400' },
    c.closed === false && { k: 'open', icon: <AlertTriangle className="h-3.5 w-3.5" />, text: '', title: t('files.openMesh'), cls: 'text-amber-700 dark:text-amber-400' },
  ].filter(Boolean) as Array<{ k: string; icon: React.ReactNode; text: string; title: string; cls: string }>;
  if (!items.length) return null;
  return <ul className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-medium">{items.map((x) => <li key={x.k} className={`inline-flex items-center gap-1 max-w-full ${x.cls}`} title={x.title}><span aria-hidden>{x.icon}</span><span className="sr-only">{x.title}</span>{x.text && <span className="truncate" aria-hidden>{x.text}</span>}</li>)}</ul>;
}

/** Vista rápida: la ficha esencial sin salir de la lista. */
function QuickView({ card: c, onClose, tagColors }: { card: FileCard | null; onClose: () => void; tagColors: Record<string, string> }) {
  const t = useT();
  return (
    <ModalDialog open={!!c} onClose={onClose} title={c?.name || ''} wide closeLabel={t('common.close' as any)}>
      {c && <div className="grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-5">
        <div className="aspect-square rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800"><Preview c={c} alt={t('files.thumbnailOf', { name: c.name })} /></div>
        <div className="grid content-start gap-4 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <dt className="muted">{t('library.format')}</dt><dd className="font-mono">{c.format}{c.version > 1 ? ` · v${c.version}` : ''}</dd>
            <dt className="muted">{t('files.dimensions' as any)}</dt><dd className="font-mono tabular">{c.dims}</dd>
            <dt className="muted">{t('library.sizeCol')}</dt><dd className="tabular">{bytes(c.size)}{c.remote ? ` · ${t('library.remote')}` : ''}</dd>
            {c.author && <><dt className="muted">{t('library.authorName')}</dt><dd>{c.author}</dd></>}
            {c.license && <><dt className="muted">{t('library.license')}</dt><dd>{c.license}</dd></>}
            {c.updatedAt && <><dt className="muted">{t('library.updatedCol')}</dt><dd>{new Date(c.updatedAt).toLocaleDateString()}</dd></>}
            <dt className="muted">{t('library.fitsIn')}</dt><dd>{c.fits.length ? c.fits.join(', ') : <span className="muted">{t('library.fitsNone')}</span>}</dd>
          </dl>
          <Signals c={c} />
          {c.tags.length > 0 && <div className="flex flex-wrap gap-1">{c.tags.map((tt) => <span key={tt} className="badge" style={tagColors[tt] ? { borderColor: tagColors[tt], boxShadow: `inset 3px 0 0 ${tagColors[tt]}` } : undefined}>{tt}</span>)}</div>}
          <div className="flex flex-wrap gap-2 pt-1">
            <Link className="btn-primary" href={`/archivos/${c.id}`}>{t('library.openDetail')}</Link>
            {c.versionId && c.format !== 'G-code' && <Link className="btn-ghost" href={`/archivos/${c.id}/estudio`}><Layers className="h-4 w-4" aria-hidden />{t('library.sliceIt')}</Link>}
            <FavButton id={c.id} fav={c.favorite} />
          </div>
        </div>
      </div>}
    </ModalDialog>
  );
}

/** Tabla de la biblioteca: miniatura, medidas, etiquetas y columnas ordenables. */
export function FileTable({ cards, sortHrefs, sort }: { cards: FileCard[]; sortHrefs: Record<string, string>; sort: string }) {
  const t = useT();
  const H = ({ k, label, className = '' }: { k?: string; label: string; className?: string }) => <th className={`th ${className}`} aria-sort={k && sort === k ? (k === 'name' ? 'ascending' : 'descending') : undefined}>{k ? <Link href={sortHrefs[k]} className={`hover:underline ${sort === k ? 'text-[var(--accent-ink)]' : ''}`}>{label}{sort === k ? (k === 'name' ? ' ↑' : ' ↓') : ''}</Link> : label}</th>;
  return (
    <div className="card overflow-auto">
      <table className="w-full text-sm">
        <thead><tr><th className="th w-14"><span className="sr-only">{t('files.thumbnailOf', { name: '' })}</span></th><H k="name" label={t('library.name')} /><H label={t('library.format')} /><H label={t('files.dimensions' as any)} className="max-md:hidden" /><H label={t('library.fitsCol')} className="max-lg:hidden" /><H label={t('library.tagsCol')} className="max-lg:hidden" /><H k="size" label={t('library.sizeCol')} className="text-right" /><H k="updated" label={t('library.updatedCol')} className="max-md:hidden" /></tr></thead>
        <tbody>{cards.map((c) => (
          <tr key={c.id} className="hover:bg-[var(--hover)]">
            <td className="td !py-1.5"><Link href={`/archivos/${c.id}`} className="block h-11 w-11 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800" tabIndex={-1} aria-hidden><Preview c={{ ...c, hasTurn: false }} alt="" /></Link></td>
            <td className="td"><Link href={`/archivos/${c.id}`} className="font-medium hover:underline line-clamp-2">{c.name}</Link><Signals c={c} /></td>
            <td className="td font-mono text-xs">{c.format}</td>
            <td className="td font-mono text-xs tabular whitespace-nowrap max-md:hidden">{c.dims}</td>
            <td className="td text-xs max-lg:hidden">{c.fits.length ? c.fits.join(', ') : <span className="muted">—</span>}</td>
            <td className="td max-lg:hidden"><div className="flex flex-wrap gap-1">{c.tags.slice(0, 4).map((tt) => <span key={tt} className="badge !text-[11px]">{tt}</span>)}{c.tags.length > 4 && <span className="badge !text-[11px] muted">{t('library.moreTags', { n: c.tags.length - 4 })}</span>}</div></td>
            <td className="td text-right tabular text-xs whitespace-nowrap">{bytes(c.size)}</td>
            <td className="td text-xs muted whitespace-nowrap max-md:hidden">{c.updatedAt ? new Date(c.updatedAt).toLocaleDateString() : '—'}</td>
          </tr>))}
        </tbody>
      </table>
    </div>
  );
}
