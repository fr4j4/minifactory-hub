'use client';
import { cn } from '@/lib/format';
import { TONES } from '@/components/badge';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from './client';
import { uploadChunked } from './uploader';
import { STAGE_KEYS } from '@/lib/photo-stages';
import { useT } from '@/i18n/client';
import { Icon } from '@/components/shell';

/* Cola sin conexión (IndexedDB): las fotos tomadas sin señal se guardan en el teléfono y se suben solas al volver la conexión. */
const DB = 'mf-offline', STORE = 'photos';
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function all(owner: string): Promise<Array<{ id: number; file: File; intent: any; owner?:string }>> { const d = await open(); return new Promise((res) => { const q = d.transaction(STORE).objectStore(STORE).getAll(); q.onsuccess = () => res((q.result as any[]).filter(row=>row.owner===owner)); q.onerror = () => res([]); }); }
async function put(file: File, intent: any, owner: string) { const d = await open(); return new Promise<void>((res) => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).add({ file, intent, owner }); tx.oncomplete = () => res(); }); }
async function del(id: number) { const d = await open(); return new Promise<void>((res) => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(id); tx.oncomplete = () => res(); }); }

export function PhotoCapture({ intent, label: labelProp, stages }: { intent: Record<string, any>; label?: string; stages?: Record<string, string> }) {
  const t = useT(); const label = labelProp ?? t('gallery.takePhotos');
  const toast = useToast(); const router = useRouter(); const input = useRef<HTMLInputElement>(null);
  const owner = useRef('');
  const identify = async () => { try { const r=await fetch('/api/library/session',{cache:'no-store'}); if(!r.ok){owner.current='';return '';} owner.current=(await r.json()).owner||''; return owner.current; } catch { return ''; } };
  const [pending, setPending] = useState(0); const [stage, setStage] = useState(intent.stage ?? 'producto_final'); const [busy, setBusy] = useState(false);
  const refresh = async () => { try { setPending((await all(owner.current)).length); } catch { /* sin IndexedDB */ } };
  const flush = async () => {
    if (busy || !navigator.onLine || !await identify()) return; setBusy(true);
    try { for (const it of await all(owner.current)) { try { await uploadChunked(it.file, { intent: 'photo', ...it.intent }, t); await del(it.id); } catch { break; } } } finally { setBusy(false); await refresh(); router.refresh(); }
  };
  useEffect(() => { refresh(); const on = () => { flush(); }; window.addEventListener('online', on); if (navigator.onLine) flush(); return () => window.removeEventListener('online', on); /* eslint-disable-next-line */ }, []);
  const onFiles = async (files: File[]) => {
    if(navigator.onLine)await identify(); if(!owner.current){toast.push(t('common.unauthorized'),'err');return;}
    const queued=await all(owner.current);if(queued.reduce((n,r)=>n+r.file.size,0)+files.reduce((n,f)=>n+f.size,0)>100*1024*1024){toast.push('100 MiB: cola de fotos llena','err');return;}
    for (const f of files) {
      const meta = { intent: 'photo', ...intent, stage, photoId: crypto.randomUUID() };
      if (!navigator.onLine) { await put(f, meta, owner.current); toast.push(t('gallery.offlineThePhotoWasSaved'), 'info'); continue; }
      try { await uploadChunked(f, meta, t); toast.push(t('gallery.photoUploaded')); } catch { await put(f, meta, owner.current); toast.push(t('gallery.couldNotUploadRightNow'), 'info'); }
    }
    await refresh(); router.refresh();
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className="input !w-auto" aria-label={t('gallery.photoStage')} value={stage} onChange={(e) => setStage(e.target.value)}>{Object.entries(stages ?? Object.fromEntries(STAGE_KEYS.map((k) => [k, t(`gallery.stage.${k}`)]))).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <button type="button" className="btn-primary" onClick={() => input.current?.click()}><Icon name="camera" className="h-4 w-4" />{label}</button>
      <input ref={input} type="file" accept="image/*,video/*" capture="environment" multiple className="sr-only" aria-label={label} data-testid="photo-input" onChange={(e) => { onFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
      {pending > 0 && <span className={cn('badge', TONES.amber)} data-testid="offline-pending">{pending} {t('gallery.queuedOffline')}</span>}
    </div>
  );
}
