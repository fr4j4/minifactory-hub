'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { repairFileAction } from '@/actions/files';
import { Modal, useAction } from './client';
import { useT } from '@/i18n/client';
import type { RepairReport } from '@/lib/mesh/repair';

/** «Reparar malla»: crea una versión nueva con la malla soldada, orientada y con los huecos pequeños tapados. */
export function RepairButton({ versionId }: { versionId: string }) {
  const t = useT(); const router = useRouter(); const { run, pending } = useAction();
  const [rep, setRep] = useState<RepairReport | null>(null);
  return (
    <>
      <button className="btn-ghost btn-sm mt-2" disabled={pending} onClick={() => run(() => repairFileAction(versionId), { onOk: (r) => setRep((r as { report: RepairReport }).report) })} data-testid="repair-mesh">{pending ? t('files.repairing') : t('files.repairMesh')}</button>
      <Modal open={!!rep} onClose={() => { setRep(null); router.refresh(); }} title={t('files.repairDone')}>
        {rep && <div className="space-y-2 text-sm" data-testid="repair-report">
          <p>{rep.closedAfter ? t('files.repairClosed') : t('files.repairStillOpen')}</p>
          <ul className="list-disc pl-5"><li>{t('files.repairRemoved', { n: rep.removed })}</li><li>{t('files.repairFlipped', { n: rep.flipped })}</li><li>{t('files.repairHoles', { n: rep.holesFilled })}{rep.holesLeft > 0 && ` · ${t('files.repairHolesLeft', { n: rep.holesLeft })}`}</li>{rep.invertedAll && <li>{t('files.repairInverted')}</li>}</ul>
          <p className="muted text-xs">{t('files.repairNote')}</p>
          <div className="flex justify-end"><button className="btn-primary" onClick={() => { setRep(null); router.refresh(); }}>{t('common.close')}</button></div>
        </div>}
      </Modal>
    </>
  );
}
