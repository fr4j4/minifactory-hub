'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addTagsAction, attachSourceAction, suggestTagsAction } from '@/actions/files';
import { useT } from '@/i18n/client';
import { useToast } from './client';
import { Badge } from './badge';

export interface SourceView { url: string; provider: string; title: string | null; authorName: string | null; licenseCode: string; licenseLabel: string; commercialUse: string; status: string; downloads?: number; likes?: number; tags: string[]; images: string[] }
type Sug = { name: string; confidence: number; source: 'manual' | 'ia' | 'import' | 'regla' };

/** Origen y licencia del modelo (N3) + etiquetas sugeridas por reglas o IA (N2). */
export function SourcePanel({ modelFileId, source, canEdit, aiTags }: { modelFileId: string; source: SourceView | null; canEdit: boolean; aiTags: boolean }) {
  const t = useT(); const toast = useToast(); const router = useRouter();
  const [url, setUrl] = useState(source?.url ?? ''); const [busy, setBusy] = useState(false); const [sug, setSug] = useState<Sug[] | null>(null);
  const fetchSource = async () => {
    setBusy(true); const r = await attachSourceAction(modelFileId, url); setBusy(false);
    if (!r.ok) { toast.push(r.error, 'err'); return; }
    toast.push(t(r.data.status === 'ok' ? 'files.sourceOk' : r.data.status === 'parcial' ? 'files.sourceParcial' : 'files.sourceError'), r.data.status === 'error' ? 'err' : 'ok'); router.refresh();
  };
  const suggest = async (ai: boolean) => { setBusy(true); const r = await suggestTagsAction(modelFileId, ai); setBusy(false); if (!r.ok) toast.push(r.error, 'err'); else setSug(r.data as Sug[]); };
  const add = async (list: Sug[]) => { setBusy(true); const r = await addTagsAction(modelFileId, list); setBusy(false); if (!r.ok) { toast.push(r.error, 'err'); return; } const done = new Set(list.map((x) => x.name)); setSug((l) => (l ?? []).filter((x) => !done.has(x.name))); router.refresh(); };
  const tone = source?.commercialUse === 'si' ? 'green' : source?.commercialUse === 'no' ? 'red' : 'amber';
  return (
    <div className="space-y-4" data-testid="source-panel">
      <div>
        <h3 className="text-sm font-semibold mb-2">{t('files.sourceTitle')}</h3>
        {source && (
          <div className="rounded-xl border border-[var(--line)] p-3 text-sm space-y-1.5 mb-3">
            <div className="flex flex-wrap items-center gap-2"><a className="font-medium underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.title ?? source.url}</a><Badge>{source.provider}</Badge>{source.status !== 'ok' && <Badge tone="amber">{source.status}</Badge>}</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs"><span><span className="muted">{t('files.sourceAuthor')}:</span> {source.authorName ?? '—'}</span><span><span className="muted">{t('files.sourceLicense')}:</span> <b>{source.licenseLabel}</b></span><span className="inline-flex items-center gap-1.5"><span className="muted">{t('files.sourceCommercial')}:</span> <Badge tone={tone}>{t(`files.commercial_${source.commercialUse}` as 'files.commercial_si')}</Badge></span></div>
            {(source.downloads != null || source.likes != null) && <div className="text-xs muted">{t('files.sourceStats', { downloads: source.downloads ?? 0, likes: source.likes ?? 0 })}</div>}
            {source.images.length > 0 && <div className="flex gap-1.5 overflow-x-auto pt-1">{source.images.slice(0, 5).map((u) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={u} src={u} alt="" className="h-14 w-14 rounded-lg object-cover" referrerPolicy="no-referrer" loading="lazy" />)}</div>}
          </div>)}
        {canEdit && <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (url.trim()) fetchSource(); }}><input className="input flex-1 min-w-[220px]" type="url" placeholder={t('files.sourceUrl')} value={url} onChange={(e) => setUrl(e.target.value)} aria-label={t('files.sourceUrl')} data-testid="source-url" /><button className="btn-ghost" disabled={busy || !url.trim()} data-testid="source-fetch">{source ? t('files.sourceRefresh') : t('files.sourceFetch')}</button></form>}
        <p className="muted text-xs mt-1.5">{t('files.sourceBestEffort')}</p>
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold mr-auto">{t('files.tagsSuggested')}</h3><button className="btn-ghost btn-sm" disabled={busy} onClick={() => suggest(false)} data-testid="tags-suggest">{t('files.suggestTags')}</button>{sug && sug.length > 1 && canEdit && <button className="btn-primary btn-sm" disabled={busy} onClick={() => add(sug)} data-testid="tags-add-all">{t('files.addAllTags', { n: sug.length })}</button>}{aiTags && <button className="btn-ghost btn-sm" disabled={busy} onClick={() => suggest(true)} data-testid="tags-suggest-ai">✦ {t('files.suggestTagsAi')}</button>}</div>
        {sug && (sug.length === 0 ? <p className="muted text-xs mt-2">{t('files.tagsNone')}</p> : <ul className="flex flex-wrap gap-2 mt-2" data-testid="tags-list">{sug.map((c) => <li key={c.name}><button className="group badge border-[var(--line)] hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-[#17161a] focus-visible:border-[var(--accent)] transition-colors" disabled={!canEdit || busy} onClick={() => add([c])} title={`${t('files.addTag')} · ${Math.round(c.confidence * 100)}%`} aria-label={`${t('files.addTag')}: ${c.name}`}>+ {c.name} <span className="muted group-hover:hidden group-focus-visible:hidden">· {t(c.source === 'ia' ? 'files.tagFromIa' : c.source === 'import' ? 'files.tagFromImport' : 'files.tagFromRule')}</span><span className="hidden group-hover:inline group-focus-visible:inline">· {t('files.addTag')}</span></button></li>)}</ul>)}
      </div>
    </div>
  );
}
