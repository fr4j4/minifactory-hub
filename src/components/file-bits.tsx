'use client';
import { useEffect, useState } from 'react';
import { updateFileAction, deleteFileAction, setCurrentVersionAction } from '@/actions/files';
import { ConfirmButton, useAction } from './client';
import { useRouter } from 'next/navigation';
import { useT } from '@/i18n/client';
import { Icon } from '@/components/shell';

export function FavButton({ id, fav }: { id: string; fav: boolean }) {
  const t = useT();
  const { run, pending } = useAction();
  return <button className="btn-ghost btn-sm !px-2.5" aria-label={fav ? t('files.removeFromFavorites') : t('files.markAsFavorite')} aria-pressed={fav} disabled={pending} onClick={() => run(() => updateFileAction(id, { favorite: !fav }))}><Icon name="star" className={fav ? 'h-4 w-4 fill-current' : 'h-4 w-4'} /></button>;
}

export function FileMetaForm({ f, customers }: { f: { id: string; name: string; folder: string | null; tags: string[]; license: string | null; origin: string | null; author: string | null; customerId: string | null }; customers: Array<{ id: string; name: string }> }) {
  const t = useT();
  const { run, pending } = useAction();
  const [v, setV] = useState({ name: f.name, folder: f.folder ?? '', tags: (f.tags ?? []).join(', '), license: f.license ?? 'propia', origin: f.origin ?? '', author: f.author ?? '', customerId: f.customerId ?? '' });
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(() => updateFileAction(f.id, { name: v.name, folder: v.folder || null, tags: v.tags.split(',').map((tt) => tt.trim()).filter(Boolean), license: v.license, origin: v.origin || null, author: v.author || null, customerId: v.customerId || null }), { ok: t('files.detailsSaved2') }); }}>
      <label className="block sm:col-span-2"><span className="label">{t('common.name')}</span><input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required /></label>
      <label className="block"><span className="label">{t('files.folder')}</span><input className="input" value={v.folder} onChange={(e) => setV({ ...v, folder: e.target.value })} placeholder={t('files.eGCustomersLosAromos')} /></label>
      <label className="block"><span className="label">{t('files.tagsCommaSeparated')}</span><input className="input" value={v.tags} onChange={(e) => setV({ ...v, tags: e.target.value })} /></label>
      <label className="block"><span className="label">{t('files.license2')}</span><select className="input" value={v.license} onChange={(e) => setV({ ...v, license: e.target.value })}>{[['propia', t('files.own')], ['CC-BY', 'CC-BY'], ['CC-BY-NC', 'CC-BY-NC'], ['comercial', t('files.commercial')], ['cliente', t('files.fromTheCustomer')]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="block"><span className="label">{t('files.source')}</span><input className="input" value={v.origin} onChange={(e) => setV({ ...v, origin: e.target.value })} placeholder={t('files.printablesThingiverseCustomer')} /></label>
      <label className="block"><span className="label">{t('files.author')}</span><input className="input" value={v.author} onChange={(e) => setV({ ...v, author: e.target.value })} /></label>
      <label className="block"><span className="label">{t('common.customer')}</span><select className="input" value={v.customerId} onChange={(e) => setV({ ...v, customerId: e.target.value })}><option value="">{t('common.none')}</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <div className="sm:col-span-2 flex justify-end"><button className="btn-primary" disabled={pending}>{t('files.saveDetails')}</button></div>
    </form>
  );
}

export function DeleteFileButton({ id }: { id: string }) {
  const t = useT();
  const { run, pending } = useAction(); const router = useRouter();
  return <ConfirmButton disabled={pending} className="btn-ghost text-danger" message={t('files.deleteThisFileFromThe')} onConfirm={() => run(() => deleteFileAction(id), { ok: t('files.fileDeleted2'), refresh: false, onOk: () => router.push('/archivos') })}>{t('common.deleteLabel')}</ConfirmButton>;
}
export function SetVersionButton({ modelId, versionId }: { modelId: string; versionId: string }) {
  const t = useT();
  const { run, pending } = useAction();
  return <button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => setCurrentVersionAction(modelId, versionId), { ok: t('files.activeVersionChanged2') })}>{t('files.useThisVersion')}</button>;
}

/** Recarga la página cada pocos segundos mientras algo se procesa en segundo plano. */
export function AutoRefresh({ active, ms = 1500 }: { active: boolean; ms?: number }) {
  const t = useT();
  const router = useRouter();
  useEffect(() => { if (!active) return; const tt = setInterval(() => router.refresh(), ms); return () => clearInterval(tt); }, [active, ms, router]);
  return active ? <p className="text-sm muted" role="status">{t('files.analyzingTheFileInThe')}</p> : null;
}
