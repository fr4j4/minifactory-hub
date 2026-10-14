'use client';
import { useRouter } from 'next/navigation';
import { restoreAction } from '@/actions/archive';
import { useAction } from './client';
import { useT } from '@/i18n/client';

/** Devuelve un registro eliminado a las listas. */
export function RestoreButton({ kind, id }: { kind: string; id: string }) {
  const t = useT(); const router = useRouter(); const { run, pending } = useAction();
  return <button type="button" className="btn-ghost btn-sm" disabled={pending} data-testid={`restore-${kind}`} onClick={() => run(() => restoreAction(kind, id), { ok: t('restore.done'), onOk: () => router.refresh() })}>{t('restore.restore')}</button>;
}
