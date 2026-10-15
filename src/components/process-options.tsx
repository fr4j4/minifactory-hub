'use client';
import { useT } from '@/i18n/client';
import { splitByNozzle } from '@/lib/slicer/nozzle';

type Opt = { id: string; name: string; nozzle: string | null };

/** Opciones de un <select> de calidades: primero las de la impresora y boquilla de la máquina; las de otra boquilla o de otra impresora quedan aparte y con aviso. */
export function ProcessOptions({ profiles, machineNozzle, compatibleIds }: { profiles: Opt[]; machineNozzle: string | null; /** si se indica, las calidades que no son de esta impresora van en un grupo aparte */ compatibleIds?: string[] | null }) {
  const t = useT();
  const ok = compatibleIds ? new Set(compatibleIds) : null;
  const mine = ok ? profiles.filter((p) => ok.has(p.id)) : profiles;
  const foreign = ok ? profiles.filter((p) => !ok.has(p.id)) : [];
  const { compatible, others } = splitByNozzle(mine, machineNozzle);
  const plain = (list: Opt[]) => list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>);
  const foreignGroup = foreign.length ? <optgroup label={t('nozzle.otherPrinterGroup')}>{plain(foreign)}</optgroup> : null;
  if (!others.length && !foreignGroup) return <>{plain(compatible)}</>;
  return <>
    {others.length || foreignGroup ? <optgroup label={t('nozzle.forNozzle', { n: machineNozzle })}>{plain(compatible)}</optgroup> : plain(compatible)}
    {others.length ? <optgroup label={t('nozzle.otherNozzleGroup')}>{others.map((p) => <option key={p.id} value={p.id}>{p.name} · {t('nozzle.nozzleMm', { n: p.nozzle })}</option>)}</optgroup> : null}
    {foreignGroup}
  </>;
}

/** Aviso cuando la calidad elegida es de otra boquilla que la de la máquina. */
export function NozzleMismatch({ processNozzle, machineNozzle }: { processNozzle: string | null | undefined; machineNozzle: string | null | undefined }) {
  const t = useT();
  if (!processNozzle || !machineNozzle || Number(processNozzle) === Number(machineNozzle)) return null;
  return <p className="text-xs text-warn mt-1" role="status" data-testid="nozzle-mismatch">⚠ {t('nozzle.mismatchWarn', { process: processNozzle, machine: machineNozzle })}</p>;
}
