'use client';
import { useState } from 'react';
import { createFolderAction, deleteFolderAction, renameFolderAction, setTagColorAction } from '@/actions/files';
import { useAction } from './client';
import { useT } from '@/i18n/client';

/** Administración de carpetas (árbol con «/») y colores de etiquetas de la biblioteca. */
export function FolderManager({ folders, tags }: { folders: Array<{ path: string; count: number }>; tags: Array<{ tag: string; n: number; color: string | null }> }) {
  const t = useT(); const { run, pending } = useAction();
  const [name, setName] = useState(''); const [editing, setEditing] = useState<string | null>(null); const [to, setTo] = useState('');
  return (
    <details className="card p-3 mb-4" data-testid="folder-manager">
      <summary className="cursor-pointer text-sm font-medium">{t('files.manageFolders')}</summary>
      <div className="mt-3 grid gap-5 md:grid-cols-2">
        <section aria-label={t('files.folders')}>
          <h3 className="eyebrow mb-1.5">{t('files.folders')}</h3>
          <ul className="text-sm space-y-1" data-testid="folder-list">{folders.map((f) => (
            <li key={f.path} className="flex items-center justify-between gap-2" style={{ paddingLeft: `${(f.path.split('/').length - 1) * 14}px` }}>
              {editing === f.path
                ? <form className="flex gap-1.5 w-full" onSubmit={(e) => { e.preventDefault(); run(() => renameFolderAction(f.path, to), { ok: t('files.folderRenamed'), onOk: () => setEditing(null) }); }}><input className="input !min-h-[32px]" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t('files.folderNewName')} data-testid="folder-rename-input" /><button className="btn-primary btn-sm" disabled={pending} data-testid="folder-rename-save">{t('common.save')}</button></form>
                : <><span>{f.path.split('/').pop()} <span className="muted">· {f.count}</span></span>
                  <span className="flex gap-1"><button className="btn-ghost btn-sm" onClick={() => { setEditing(f.path); setTo(f.path); }} data-testid="folder-rename">{t('common.edit')}</button>
                    <button className="btn-ghost btn-sm text-danger" disabled={pending} onClick={() => { if (confirm(t('files.folderDeleteConfirm', { name: f.path }))) run(() => deleteFolderAction(f.path), { ok: t('files.folderDeleted') }); }} data-testid="folder-delete">{t('remove.delete')}</button></span></>}
            </li>))}
            {folders.length === 0 && <li className="muted">{t('files.noFolders')}</li>}
          </ul>
          <form className="flex gap-1.5 mt-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) run(() => createFolderAction(name), { ok: t('files.folderCreated'), onOk: () => setName('') }); }}>
            <input className="input !min-h-[36px]" placeholder={t('files.folderNewPlaceholder')} value={name} onChange={(e) => setName(e.target.value)} aria-label={t('files.folderNewPlaceholder')} data-testid="folder-new" />
            <button className="btn-ghost btn-sm" disabled={pending || !name.trim()} data-testid="folder-create">{t('files.folderCreate')}</button>
          </form>
        </section>
        <section aria-label={t('files.tagColors')}>
          <h3 className="eyebrow mb-1.5">{t('files.tagColors')}</h3>
          <ul className="flex flex-wrap gap-2 text-sm" data-testid="tag-colors">{tags.slice(0, 40).map((x) => (
            <li key={x.tag}><label className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-2 py-1"><input type="color" className="h-5 w-5 p-0 border-0 bg-transparent" value={x.color ?? '#9a9a9a'} aria-label={t('files.tagColorOf', { tag: x.tag })} onChange={(e) => { void setTagColorAction(x.tag, e.target.value); }} />{x.tag}<span className="muted">· {x.n}</span></label></li>))}
          </ul>
        </section>
      </div>
    </details>
  );
}
