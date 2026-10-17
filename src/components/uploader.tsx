'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/format';
import { Modal, useLinger, useToast } from './client';
import { useT } from '@/i18n/client';
import type { TFn } from '@/i18n/translate';

export interface UploadResult { filename: string; ok: boolean; data?: any; error?: string }

/** Sube un archivo por partes (4 MB) con reanudación: si la conexión se corta, continúa desde el último trozo recibido. */
export async function uploadChunked(file: File, intent: Record<string, any>, t: TFn, onProgress?: (p: number) => void): Promise<any> {
  const init = await fetch('/api/uploads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: file.name, size: file.size }) });
  if (!init.ok) throw new Error((await init.json().catch(() => ({}))).error ?? t('files.uploadStartFailed'));
  const { id, chunkSize } = await init.json();
  let offset = 0; let retries = 0;
  while (offset < file.size || (file.size === 0 && offset === 0)) {
    const end = Math.min(file.size, offset + chunkSize);
    try {
      const res = await fetch(`/api/uploads/${id}?offset=${offset}`, { method: 'PUT', body: file.slice(offset, end) });
      if (res.status === 409) { offset = (await res.json()).received; continue; }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? t('files.uploadError'));
      offset = (await res.json()).received; retries = 0; onProgress?.(file.size ? offset / file.size : 1);
      if (file.size === 0) break;
    } catch (e) {
      if (++retries > 5) throw e;
      await new Promise((r) => setTimeout(r, 800 * retries));
      const st = await fetch(`/api/uploads/${id}`).then((r) => r.json()).catch(() => null); if (st) offset = st.received;
    }
  }
  const done = await fetch(`/api/uploads/${id}/complete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(intent) });
  const data = await done.json();
  if (!done.ok) throw new Error(data.error ?? t('files.uploadCompleteFailed'));
  return data;
}

const HASH_MAX = 150 * 1024 * 1024;
/** SHA-256 en el navegador (para detectar duplicados antes de subir); null si el archivo es muy grande o no hay `crypto.subtle`. */
export async function sha256Hex(file: File): Promise<string | null> {
  try {
    if (file.size > HASH_MAX || !globalThis.crypto?.subtle) return null;
    const buf = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}

export function Uploader({ intent, accept, multiple = true, label, hint, onDone, capture, className, compact, testId }: {
  intent: Record<string, any>; accept?: string; multiple?: boolean; label?: string; hint?: string; capture?: boolean;
  onDone?: (r: UploadResult[]) => void; className?: string; compact?: boolean; testId?: string;
}) {
  const t = useT();
  const router = useRouter(); const toast = useToast();
  const [items, setItems] = useState<Array<{ name: string; p: number; state: 'up' | 'ok' | 'err'; msg?: string }>>([]);
  const [dup0, setDup] = useState<{ file: string; existing: { id: string; name: string }; resolve: (v: 'skip' | 'upload') => void } | null>(null); const dup = useLinger(dup0);
  const [drag, setDrag] = useState(false); const input = useRef<HTMLInputElement>(null);
  const go = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setItems(files.map((f) => ({ name: f.name, p: 0, state: 'up' as const })));
    const results: UploadResult[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      // archivo nuevo de la biblioteca: si ya existe uno idéntico, se pregunta antes de subir
      if (intent.intent === 'model' && !intent.modelFileId && !/\.zip$/i.test(f.name)) {
        const h = await sha256Hex(f);
        const ex = h ? await fetch(`/api/files/check?hash=${h}`).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
        if (ex?.duplicate) {
          const choice = await new Promise<'skip' | 'upload'>((resolve) => setDup({ file: f.name, existing: ex.duplicate, resolve }));
          setDup(null);
          if (choice === 'skip') { setItems((x) => x.map((it, k) => (k === i ? { ...it, p: 1, state: 'ok', msg: t('files.skippedDuplicate') } : it))); results.push({ filename: f.name, ok: true, data: { skipped: true, duplicateOf: ex.duplicate } }); continue; }
        }
      }
      try {
        const data = await uploadChunked(f, intent, t, (p) => setItems((x) => x.map((it, k) => (k === i ? { ...it, p } : it))));
        setItems((x) => x.map((it, k) => (k === i ? { ...it, p: 1, state: 'ok' } : it))); results.push({ filename: f.name, ok: true, data });
        if (data.duplicateOf) toast.push(t('files.alreadyExistsInTheLibrary', { f: f.name, duplicateOf: data.duplicateOf.name }), 'info');
      } catch (e) {
        const msg = (e as Error).message; setItems((x) => x.map((it, k) => (k === i ? { ...it, state: 'err', msg } : it))); results.push({ filename: f.name, ok: false, error: msg });
        toast.push(`${f.name}: ${msg}`, 'err');
      }
    }
    onDone?.(results); router.refresh();
    setTimeout(() => setItems([]), 4000);
  }, [intent, onDone, router, toast]);
  const dupDialog = dup && (
    <Modal open={!!dup0} onClose={() => dup.resolve('skip')} title={t('files.duplicateTitle')}>
      <div className="space-y-3 text-sm" data-testid="duplicate-dialog">
        <p>{t('files.duplicateBody', { f: dup.file, name: dup.existing.name })}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <a className="btn-ghost" href={`/archivos/${dup.existing.id}`} target="_blank" rel="noopener noreferrer">{t('files.duplicateOpen')}</a>
          <button className="btn-ghost" onClick={() => dup.resolve('skip')} data-testid="duplicate-skip">{t('files.duplicateSkip')}</button>
          <button className="btn-primary" onClick={() => dup.resolve('upload')} data-testid="duplicate-upload">{t('files.duplicateUpload')}</button>
        </div>
      </div>
    </Modal>);
  return (
    <div className={className}>
      {dupDialog}
      <div data-testid={testId} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); go([...e.dataTransfer.files]); }}
        className={cn('rounded-xl border-2 border-dashed text-center transition-colors', compact ? 'p-3' : 'p-6', drag ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-300 dark:border-slate-600')}>
        <p className="text-sm font-medium">{label ?? t('files.dropFilesHere')}</p>
        {hint && <p className="text-xs muted mt-0.5">{hint}</p>}
        <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => input.current?.click()}>{capture ? t('files.takeAPhotoOrChoose') : t('files.chooseFiles')}</button>
        <input ref={input} type="file" className="sr-only" aria-label={label ?? t('files.chooseFiles')} accept={accept} multiple={multiple} capture={capture ? 'environment' : undefined} onChange={(e) => { go([...(e.target.files ?? [])]); e.target.value = ''; }} />
      </div>
      {items.length > 0 && (
        <ul className="mt-2 space-y-1.5" aria-live="polite">
          {items.map((it, i) => (
            <li key={i} className="text-xs"><div className="flex justify-between gap-2"><span className="truncate">{it.name}</span><span className={cn(it.state === 'err' && 'text-danger')}>{it.state === 'ok' ? t('files.done') : it.state === 'err' ? it.msg : `${Math.round(it.p * 100)}%`}</span></div>
              <div className="h-1.5 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden"><div className={cn('h-full', it.state === 'err' ? 'bg-red-500' : 'bg-brand-600')} style={{ width: `${it.p * 100}%` }} /></div></li>
          ))}
        </ul>
      )}
    </div>
  );
}
