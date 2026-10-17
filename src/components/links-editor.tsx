'use client';
import { useState } from 'react';
import { cn } from '@/lib/format';
import { previewLinkAction, saveLinksAction, type LinkRow } from '@/actions/links';
import { useToast } from './client';
import { useRouter } from 'next/navigation';
import { useT } from '@/i18n/client';
import { Icon } from '@/components/shell';
import { tOr } from '@/i18n/translate';

export const LINK_KINDS = ['modelo_original', 'inspiracion', 'requerimiento', 'otro'] as const;
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

/** Links de referencia (Printables, Thingiverse, MakerWorld, Instagram, Drive…) con título e imagen de vista previa. */
export function LinksEditor({ value, onChange, persist, readOnly, compact }: { value: LinkRow[]; onChange?: (v: LinkRow[]) => void; persist?: { ownerType: Parameters<typeof saveLinksAction>[0]; ownerId: string; revalidate?: string }; readOnly?: boolean; compact?: boolean }) {
  const t = useT();
  const toast = useToast(); const router = useRouter();
  const [url, setUrl] = useState(''); const [kind, setKind] = useState('modelo_original'); const [busy, setBusy] = useState(false);
  const commit = async (next: LinkRow[]) => { onChange?.(next); if (persist) { const r = await saveLinksAction(persist.ownerType, persist.ownerId, next, persist.revalidate); if (!r.ok) toast.push(r.error, 'err'); else router.refresh(); } };
  const add = async () => {
    if (!url.trim()) return; setBusy(true);
    const r = await previewLinkAction(url);
    if (!r.ok) { toast.push(r.error, 'err'); setBusy(false); return; }
    await commit([...value, { url: r.data.url, title: r.data.title ?? r.data.site, imageUrl: r.data.image, kind, showInPdf: false }]);
    setUrl(''); setBusy(false);
  };
  return (
    <div data-testid="links-editor">
      {!readOnly && (
        <div className={cn('flex flex-col sm:flex-row sm:flex-wrap gap-2', compact && 'text-sm')}>
          <input className="input sm:flex-1 sm:min-w-[12rem]" placeholder={t('links.pasteALinkPrintablesThingiverse')} value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} aria-label={t('links.referenceLink')} data-testid="link-url" />
          <select className="input sm:!w-52" value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t('links.linkType')}>{LINK_KINDS.map((k) => <option key={k} value={k}>{t(`links.kind.${k}`)}</option>)}</select>
          <button type="button" className="btn-ghost shrink-0" onClick={add} disabled={busy || !url.trim()} data-testid="link-add">{busy ? t('links.reading') : t('links.add')}</button>
        </div>
      )}
      {value.length === 0 ? <p className="text-sm muted mt-2">{readOnly ? t('links.noReferenceLinks') : t('links.thereAreNoLinksYet')}</p> : (
        <ul className="mt-3 space-y-2">
          {value.map((l, i) => (
            <li key={(l.id ?? '') + l.url + i} className="flex gap-3 rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
              {l.imageUrl ? <img src={l.imageUrl} alt="" className="h-14 w-14 rounded object-cover shrink-0 bg-slate-100" referrerPolicy="no-referrer" /> : <div className="h-14 w-14 rounded bg-slate-100 dark:bg-slate-800 grid place-items-center text-slate-400 shrink-0" aria-hidden><Icon name="link" className="h-5 w-5" /></div>}
              <div className="min-w-0 flex-1">
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="font-medium text-sm text-brand-700 dark:text-brand-300 hover:underline break-words">{l.title || host(l.url)}</a>
                <div className="text-xs muted truncate">{host(l.url)} · {tOr(t, `links.kind.${l.kind ?? 'otro'}`, l.kind ?? '')}</div>
                {!readOnly && <label className="text-xs flex items-center gap-1.5 mt-1"><input type="checkbox" checked={!!l.showInPdf} onChange={(e) => commit(value.map((x, k) => (k === i ? { ...x, showInPdf: e.target.checked } : x)))} /> {t('links.showInTheQuotePdf')}</label>}
              </div>
              {!readOnly && <button type="button" className="btn-ghost btn-sm self-start" onClick={() => commit(value.filter((_, k) => k !== i))} aria-label={t('links.removeLink', { title: l.title ?? l.url })}><Icon name="x" className="h-4 w-4" /></button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
