'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { deleteFilamentAction, resetFilamentAction, restoreFilamentAction } from '@/actions/filament-library';
import { useAction } from './client';
import { useT } from '@/i18n/client';

/** Acciones de una línea del catálogo: editar, volver al original (si es una copia editada de OFD) y eliminar u ocultar. */
export function LineActions({ filamentKey, canEdit, canDelete, local, inOfd }: { filamentKey: string; canEdit: boolean; canDelete: boolean; local: boolean; inOfd: boolean }) {
  const t = useT(); const router = useRouter(); const { run, pending } = useAction();
  const href = `/filamentos/${filamentKey.split('/').map(encodeURIComponent).join('/')}/editar`;
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="line-actions">
      {canEdit && <Link className="btn-ghost" href={href} data-testid="edit-filament">{t('inventory.catEdEdit')}</Link>}
      {canEdit && local && inOfd && <button className="btn-ghost" disabled={pending} onClick={() => { if (window.confirm(t('inventory.catEdRestoreConfirm'))) run(() => resetFilamentAction(filamentKey), { ok: t('inventory.catEdRestored') }); }}>{t('inventory.catEdRestoreOriginal')}</button>}
      {canDelete && <button className="btn-ghost" disabled={pending} onClick={() => { if (window.confirm(inOfd ? t('inventory.catEdHideConfirm') : t('inventory.catEdDeleteConfirm'))) run(() => deleteFilamentAction(filamentKey), { ok: inOfd ? t('inventory.catEdHidden') : t('inventory.catEdDeleted'), refresh: false, onOk: () => router.push('/filamentos') }); }} data-testid="delete-filament">{inOfd ? t('inventory.catEdHide') : t('inventory.catEdDelete')}</button>}
    </div>
  );
}

/** Filamentos del catálogo original que el taller ocultó, con un botón para mostrarlos de nuevo. */
export function HiddenList({ items, canRestore }: { items: Array<{ key: string; label: string }>; canRestore: boolean }) {
  const t = useT(); const { run, pending } = useAction();
  if (!items.length) return null;
  return (
    <details className="card p-3 mt-4" data-testid="hidden-list"><summary className="cursor-pointer text-sm font-medium">{t('inventory.catEdHiddenTitle', { n: items.length })}</summary>
      <ul className="mt-2 divide-y divide-[var(--line)] text-sm">{items.map((x) => (
        <li key={x.key} className="py-1.5 flex items-center justify-between gap-2"><span className="truncate">{x.label}</span>
          {canRestore && <button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => restoreFilamentAction(x.key), { ok: t('inventory.catEdShown') })}>{t('inventory.catEdShow')}</button>}</li>))}</ul>
    </details>
  );
}
