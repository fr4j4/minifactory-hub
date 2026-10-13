'use client';
import { useState } from 'react';
import { cn } from '@/lib/format';
import { previewLinkAction, saveLinksAction, type LinkRow } from '@/actions/links';
import { useToast } from './client';
import { useRouter } from 'next/navigation';

export const LINK_KINDS: Record<string, string> = { modelo_original: 'Modelo original', inspiracion: 'Inspiración', requerimiento: 'Requerimiento del cliente', otro: 'Otro' };
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

/** Links de referencia (Printables, Thingiverse, MakerWorld, Instagram, Drive…) con título e imagen de vista previa. */
export function LinksEditor({ value, onChange, persist, readOnly, compact }: { value: LinkRow[]; onChange?: (v: LinkRow[]) => void; persist?: { ownerType: Parameters<typeof saveLinksAction>[0]; ownerId: string; revalidate?: string }; readOnly?: boolean; compact?: boolean }) {
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
        <div className={cn('flex flex-col sm:flex-row gap-2', compact && 'text-sm')}>
          <input className="input" placeholder="Pega un enlace (Printables, Thingiverse, MakerWorld, Instagram, Drive…)" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} aria-label="Enlace de referencia" data-testid="link-url" />
          <select className="input sm:!w-52" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tipo de enlace">{Object.entries(LINK_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <button type="button" className="btn-ghost shrink-0" onClick={add} disabled={busy || !url.trim()} data-testid="link-add">{busy ? 'Leyendo…' : 'Agregar'}</button>
        </div>
      )}
      {value.length === 0 ? <p className="text-sm muted mt-2">{readOnly ? 'Sin enlaces de referencia.' : 'Aún no hay enlaces. Se guarda el título y la imagen de vista previa cuando el sitio lo permite.'}</p> : (
        <ul className="mt-3 space-y-2">
          {value.map((l, i) => (
            <li key={(l.id ?? '') + l.url + i} className="flex gap-3 rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
              {l.imageUrl ? <img src={l.imageUrl} alt="" className="h-14 w-14 rounded object-cover shrink-0 bg-slate-100" referrerPolicy="no-referrer" /> : <div className="h-14 w-14 rounded bg-slate-100 dark:bg-slate-800 grid place-items-center text-slate-400 shrink-0" aria-hidden>🔗</div>}
              <div className="min-w-0 flex-1">
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="font-medium text-sm text-brand-700 dark:text-brand-300 hover:underline break-words">{l.title || host(l.url)}</a>
                <div className="text-xs muted truncate">{host(l.url)} · {LINK_KINDS[l.kind ?? 'otro']}</div>
                {!readOnly && <label className="text-xs flex items-center gap-1.5 mt-1"><input type="checkbox" checked={!!l.showInPdf} onChange={(e) => commit(value.map((x, k) => (k === i ? { ...x, showInPdf: e.target.checked } : x)))} /> Mostrar en el PDF del presupuesto</label>}
              </div>
              {!readOnly && <button type="button" className="btn-ghost btn-sm self-start" onClick={() => commit(value.filter((_, k) => k !== i))} aria-label={`Quitar enlace ${l.title ?? l.url}`}>✕</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
