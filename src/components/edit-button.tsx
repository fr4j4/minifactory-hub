'use client';
import { useState } from 'react';
import { editRecordAction } from '@/actions/edits';
import { Modal, useAction } from './client';
import { useT } from '@/i18n/client';
import type { EditKind } from '@/lib/services/edits';
import type { MessageKey } from '@/i18n/translate';
import { Icon } from './shell';

export interface EditField { key: string; label: string; type?: 'text' | 'number' | 'date' | 'textarea' | 'select'; options?: Array<{ value: string; label: string }>; required?: boolean }

/** Botón + diálogo para editar campos sueltos de un registro. El servidor decide qué campos acepta. */
export function EditButton({ kind, id, fields, values, className, label, icon, testId }: { kind: EditKind; id: string; fields: EditField[]; values: object; className?: string; label?: string; /** solo el ícono de lápiz (con nombre accesible) */ icon?: boolean; testId?: string }) {
  const t = useT(); const { run, pending } = useAction(); const [open, setOpen] = useState(false);
  const init = () => Object.fromEntries(fields.map((f) => { const x = (values as Record<string, unknown>)[f.key]; return [f.key, x == null ? '' : String(x)]; }));
  const [v, setV] = useState<Record<string, string>>(init);
  const set = (k: string, x: string) => setV((o) => ({ ...o, [k]: x }));
  const missing = fields.some((f) => f.required && !v[f.key]?.trim());
  return (<span onClick={(e) => e.stopPropagation()}>
    <button type="button" className={className ?? 'btn-ghost btn-sm'} onClick={() => { setV(init()); setOpen(true); }} data-testid={testId ?? `edit-${kind}`} aria-label={icon ? t('edit.edit') : undefined} title={icon ? t('edit.edit') : undefined}>{icon ? <Icon name="pencil" className="h-4 w-4" /> : label ?? t('edit.edit')}</button>
    <Modal open={open} onClose={() => setOpen(false)} title={t(`edit.title.${kind}` as MessageKey)}>
      <form className="grid sm:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); run(() => editRecordAction(kind, id, v), { ok: t('edit.saved'), onOk: () => setOpen(false) }); }}>
        {fields.map((f) => (
          <label key={f.key} className={`block ${f.type === 'textarea' ? 'sm:col-span-2' : ''}`}><span className="label">{f.label}{f.required ? ' *' : ''}</span>
            {f.type === 'select' ? <select className="input" value={v[f.key]} onChange={(e) => set(f.key, e.target.value)} data-testid={`edit-field-${f.key}`}>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              : f.type === 'textarea' ? <textarea className="input h-20" value={v[f.key]} onChange={(e) => set(f.key, e.target.value)} data-testid={`edit-field-${f.key}`} />
              : <input className="input" type={f.type ?? 'text'} step={f.type === 'number' ? 'any' : undefined} min={f.type === 'number' ? 0 : undefined} value={v[f.key]} onChange={(e) => set(f.key, e.target.value)} required={f.required} data-testid={`edit-field-${f.key}`} />}
          </label>))}
        <div className="sm:col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button><button className="btn-primary" disabled={pending || missing} data-testid="edit-save">{t('common.save')}</button></div>
      </form>
    </Modal>
  </span>);
}
