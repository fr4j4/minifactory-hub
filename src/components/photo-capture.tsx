'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from './client';
import { uploadChunked } from './uploader';

/* Cola sin conexión (IndexedDB): las fotos tomadas sin señal se guardan en el teléfono y se suben solas al volver la conexión. */
const DB = 'mf-offline', STORE = 'photos';
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function all(): Promise<Array<{ id: number; file: File; intent: any }>> { const d = await open(); return new Promise((res) => { const q = d.transaction(STORE).objectStore(STORE).getAll(); q.onsuccess = () => res(q.result as any); q.onerror = () => res([]); }); }
async function put(file: File, intent: any) { const d = await open(); return new Promise<void>((res) => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).add({ file, intent }); tx.oncomplete = () => res(); }); }
async function del(id: number) { const d = await open(); return new Promise<void>((res) => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(id); tx.oncomplete = () => res(); }); }

export function PhotoCapture({ intent, label = 'Tomar fotos', stages }: { intent: Record<string, any>; label?: string; stages?: Record<string, string> }) {
  const toast = useToast(); const router = useRouter(); const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(0); const [stage, setStage] = useState(intent.stage ?? 'producto_final'); const [busy, setBusy] = useState(false);
  const refresh = async () => { try { setPending((await all()).length); } catch { /* sin IndexedDB */ } };
  const flush = async () => {
    if (busy || !navigator.onLine) return; setBusy(true);
    try { for (const it of await all()) { try { await uploadChunked(it.file, { intent: 'photo', ...it.intent }); await del(it.id); } catch { break; } } } finally { setBusy(false); await refresh(); router.refresh(); }
  };
  useEffect(() => { refresh(); const on = () => { flush(); }; window.addEventListener('online', on); if (navigator.onLine) flush(); return () => window.removeEventListener('online', on); /* eslint-disable-next-line */ }, []);
  const onFiles = async (files: File[]) => {
    for (const f of files) {
      const meta = { intent: 'photo', ...intent, stage };
      if (!navigator.onLine) { await put(f, meta); toast.push('Sin conexión: la foto se guardó y se subirá sola al volver la señal', 'info'); continue; }
      try { await uploadChunked(f, meta); toast.push('Foto subida'); } catch { await put(f, meta); toast.push('No se pudo subir ahora: quedó en cola', 'info'); }
    }
    await refresh(); router.refresh();
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className="input !w-auto" aria-label="Etapa de la foto" value={stage} onChange={(e) => setStage(e.target.value)}>{Object.entries(stages ?? { durante: 'Durante la impresión', recien_impreso: 'Recién impreso', post_procesado: 'Post-procesado', producto_final: 'Producto final', empaque: 'Empaque', entregado: 'Entregado', falla: 'Falla' }).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <button type="button" className="btn-primary" onClick={() => input.current?.click()}>📷 {label}</button>
      <input ref={input} type="file" accept="image/*,video/*" capture="environment" multiple className="sr-only" aria-label={label} data-testid="photo-input" onChange={(e) => { onFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
      {pending > 0 && <span className="badge bg-amber-50 text-amber-900 border-amber-200" data-testid="offline-pending">{pending} en cola sin conexión</span>}
    </div>
  );
}
