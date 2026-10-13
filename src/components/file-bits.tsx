'use client';
import { useEffect, useState } from 'react';
import { updateFileAction, deleteFileAction, setCurrentVersionAction } from '@/actions/files';
import { ConfirmButton, useAction } from './client';
import { useRouter } from 'next/navigation';

export function FavButton({ id, fav }: { id: string; fav: boolean }) {
  const { run, pending } = useAction();
  return <button className="btn-ghost btn-sm !px-2.5" aria-label={fav ? 'Quitar de favoritos' : 'Marcar como favorito'} aria-pressed={fav} disabled={pending} onClick={() => run(() => updateFileAction(id, { favorite: !fav }))}>{fav ? '★' : '☆'}</button>;
}

export function FileMetaForm({ f, customers }: { f: { id: string; name: string; folder: string | null; tags: string[]; license: string | null; origin: string | null; author: string | null; customerId: string | null }; customers: Array<{ id: string; name: string }> }) {
  const { run, pending } = useAction();
  const [v, setV] = useState({ name: f.name, folder: f.folder ?? '', tags: (f.tags ?? []).join(', '), license: f.license ?? 'propia', origin: f.origin ?? '', author: f.author ?? '', customerId: f.customerId ?? '' });
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(() => updateFileAction(f.id, { name: v.name, folder: v.folder || null, tags: v.tags.split(',').map((t) => t.trim()).filter(Boolean), license: v.license, origin: v.origin || null, author: v.author || null, customerId: v.customerId || null }), { ok: 'Datos guardados' }); }}>
      <label className="block sm:col-span-2"><span className="label">Nombre</span><input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required /></label>
      <label className="block"><span className="label">Carpeta</span><input className="input" value={v.folder} onChange={(e) => setV({ ...v, folder: e.target.value })} placeholder="Ej. Clientes/Los Aromos" /></label>
      <label className="block"><span className="label">Etiquetas (separadas por coma)</span><input className="input" value={v.tags} onChange={(e) => setV({ ...v, tags: e.target.value })} /></label>
      <label className="block"><span className="label">Licencia</span><select className="input" value={v.license} onChange={(e) => setV({ ...v, license: e.target.value })}>{[['propia', 'Propia'], ['CC-BY', 'CC-BY'], ['CC-BY-NC', 'CC-BY-NC'], ['comercial', 'Comercial'], ['cliente', 'Del cliente']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="block"><span className="label">Origen</span><input className="input" value={v.origin} onChange={(e) => setV({ ...v, origin: e.target.value })} placeholder="Printables, Thingiverse, cliente…" /></label>
      <label className="block"><span className="label">Autor</span><input className="input" value={v.author} onChange={(e) => setV({ ...v, author: e.target.value })} /></label>
      <label className="block"><span className="label">Cliente</span><select className="input" value={v.customerId} onChange={(e) => setV({ ...v, customerId: e.target.value })}><option value="">— Ninguno —</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <div className="sm:col-span-2 flex justify-end"><button className="btn-primary" disabled={pending}>Guardar datos</button></div>
    </form>
  );
}

export function DeleteFileButton({ id }: { id: string }) {
  const { run } = useAction(); const router = useRouter();
  return <ConfirmButton className="btn-ghost text-red-600" message="¿Eliminar este archivo de la biblioteca? Queda en la papelera lógica y se puede recuperar desde la base de datos." onConfirm={() => run(() => deleteFileAction(id), { ok: 'Archivo eliminado', refresh: false, onOk: () => router.push('/archivos') })}>Eliminar</ConfirmButton>;
}
export function SetVersionButton({ modelId, versionId }: { modelId: string; versionId: string }) {
  const { run, pending } = useAction();
  return <button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => setCurrentVersionAction(modelId, versionId), { ok: 'Versión activa cambiada' })}>Usar esta versión</button>;
}

/** Recarga la página cada pocos segundos mientras algo se procesa en segundo plano. */
export function AutoRefresh({ active, ms = 1500 }: { active: boolean; ms?: number }) {
  const router = useRouter();
  useEffect(() => { if (!active) return; const t = setInterval(() => router.refresh(), ms); return () => clearInterval(t); }, [active, ms, router]);
  return active ? <p className="text-sm muted" role="status">⏳ Analizando el archivo en segundo plano…</p> : null;
}
