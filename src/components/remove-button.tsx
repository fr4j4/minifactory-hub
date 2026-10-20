'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { removalInfoAction, removeAction, replaceMaterialAction } from '@/actions/removal';
import { Modal, useAction } from './client';
import { useT } from '@/i18n/client';
import type { RemovableKind } from '@/lib/services/removal';
import type { MessageKey } from '@/i18n/translate';
import { Icon } from './shell';

/**
 * Botón «Eliminar» para cualquier registro eliminable: primero consulta al servidor si se puede
 * (y por qué no), luego pide confirmación. Es un borrado lógico: el historial se conserva.
 */
export function RemoveButton({ kind, id, name, className, label, icon, redirectTo, onDone, testId, replaceOptions }: { replaceOptions?: Array<{ id: string; label: string }>; kind: RemovableKind; id: string; name: string; className?: string; label?: string; /** solo el ícono X (con nombre accesible) */ icon?: boolean; redirectTo?: string; onDone?: () => void; testId?: string }) {
  const t = useT(); const router = useRouter(); const { run, pending } = useAction();
  const [info, setInfo] = useState<{ canDelete: boolean; reason: string | null; replaceable?: boolean } | null>(null); const [target, setTarget] = useState('');
  const [open, setOpen] = useState(false); const [loading, setLoading] = useState(false);
  const check = async () => { setLoading(true); const r = await removalInfoAction(kind, id); setLoading(false); if (!r.ok) { run(async () => r); return; } setInfo(r.data); setOpen(true); };
  const confirm = () => run(() => removeAction(kind, id), { ok: t('remove.done'), onOk: () => { setOpen(false); onDone?.(); if (redirectTo) router.push(redirectTo); } });
  const replace = () => run(() => replaceMaterialAction(id, target), { ok: t('remove.done'), onOk: () => { setOpen(false); onDone?.(); router.refresh(); } });
  return (<span onClick={(e) => e.stopPropagation()}>
    <button type="button" className={className ?? 'btn-ghost btn-sm text-danger'} disabled={loading} onClick={check} data-testid={testId ?? `remove-${kind}`} aria-label={icon ? t('remove.title', { name }) : undefined} title={icon ? t('remove.delete') : undefined} aria-busy={loading || undefined}>{icon ? <Icon name="x" className="h-4 w-4" /> : loading ? t('remove.checking') : label ?? t('remove.delete')}</button>
    <Modal open={open} onClose={() => setOpen(false)} title={t('remove.title', { name })}>
      <div className="space-y-3 text-sm">
        {!info ? null : !info.canDelete ? <p role="alert" className="text-warn">{info.reason}</p> : <p>{t(`remove.confirm.${kind}` as MessageKey)}</p>}
        {info?.replaceable && replaceOptions?.length ? <label className="block"><span className="label">{t('remove.replaceWith')}</span><select className="input" value={target} onChange={(e) => setTarget(e.target.value)} data-testid="remove-replace-with"><option value="">—</option>{replaceOptions.filter((o) => o.id !== id).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label> : null}
        <div className="flex justify-end gap-2 pt-2">
          {info?.replaceable && replaceOptions?.length ? <button className="btn-danger" disabled={pending || !target} data-testid="remove-replace" onClick={replace}>{t('remove.replaceAndDelete')}</button> : null}
          <button className="btn-ghost" onClick={() => setOpen(false)}>{info && !info.canDelete ? t('common.close') : t('common.cancel')}</button>
          {info?.canDelete && <button className="btn-danger" disabled={pending} data-testid="remove-confirm" onClick={confirm}>{pending ? t('remove.deleting') : t('remove.delete')}</button>}
        </div>
      </div>
    </Modal>
  </span>);
}
