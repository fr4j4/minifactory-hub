'use client';
import { importFromVersionAction } from '@/actions/slicer';
import { useAction } from './client';
import { useT } from '@/i18n/client';

/** «3MF inteligente»: guarda como perfiles los ajustes que el proyecto trae dentro (si ya existen, entran como versión nueva). */
export function ImportProjectButton({ versionId }: { versionId: string }) {
  const t = useT(); const { run, pending } = useAction();
  return <button className="btn-ghost btn-sm" disabled={pending} data-testid="import-project-settings" onClick={() => run(() => importFromVersionAction(versionId), { onOk: (r) => alert(t('slicer.importedNew2', { count: (r as { created: number }).created, v: (r as { updated: number }).updated ? t('slicer.updatedNewVersion', { count: (r as { updated: number }).updated }) : '' })) })}>{t('files.importProjectSettings')}</button>;
}
