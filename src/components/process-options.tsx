'use client';
import { useT } from '@/i18n/client';
import { splitByNozzle } from '@/lib/slicer/nozzle';

/** Opciones de un <select> de calidades: primero las de la boquilla de la máquina; las de otra boquilla quedan aparte y con aviso. */
export function ProcessOptions({ profiles, machineNozzle }: { profiles: Array<{ id: string; name: string; nozzle: string | null }>; machineNozzle: string | null }) {
  const t = useT();
  const { compatible, others } = splitByNozzle(profiles, machineNozzle);
  if (!others.length) return <>{compatible.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</>;
  return <>
    <optgroup label={t('nozzle.forNozzle', { n: machineNozzle })}>{compatible.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
    <optgroup label={t('nozzle.otherNozzleGroup')}>{others.map((p) => <option key={p.id} value={p.id}>{p.name} · {t('nozzle.nozzleMm', { n: p.nozzle })}</option>)}</optgroup>
  </>;
}

/** Aviso cuando la calidad elegida es de otra boquilla que la de la máquina. */
export function NozzleMismatch({ processNozzle, machineNozzle }: { processNozzle: string | null | undefined; machineNozzle: string | null | undefined }) {
  const t = useT();
  if (!processNozzle || !machineNozzle || Number(processNozzle) === Number(machineNozzle)) return null;
  return <p className="text-xs text-amber-800 dark:text-amber-300 mt-1" role="status" data-testid="nozzle-mismatch">⚠ {t('nozzle.mismatchWarn', { process: processNozzle, machine: machineNozzle })}</p>;
}
