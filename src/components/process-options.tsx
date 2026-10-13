import { splitByNozzle } from '@/lib/slicer/nozzle';

/** Opciones de un <select> de calidades: primero las de la boquilla de la máquina; las de otra boquilla quedan aparte y con aviso. */
export function ProcessOptions({ profiles, machineNozzle }: { profiles: Array<{ id: string; name: string; nozzle: string | null }>; machineNozzle: string | null }) {
  const { compatible, others } = splitByNozzle(profiles, machineNozzle);
  if (!others.length) return <>{compatible.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</>;
  return <>
    <optgroup label={`Para boquilla ${machineNozzle} mm`}>{compatible.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
    <optgroup label="Pensadas para otra boquilla">{others.map((p) => <option key={p.id} value={p.id}>{p.name} · boquilla {p.nozzle}</option>)}</optgroup>
  </>;
}

/** Aviso cuando la calidad elegida es de otra boquilla que la de la máquina. */
export function NozzleMismatch({ processNozzle, machineNozzle }: { processNozzle: string | null | undefined; machineNozzle: string | null | undefined }) {
  if (!processNozzle || !machineNozzle || Number(processNozzle) === Number(machineNozzle)) return null;
  return <p className="text-xs text-amber-800 dark:text-amber-300 mt-1" role="status" data-testid="nozzle-mismatch">⚠ Esta calidad es para boquilla {processNozzle} mm y la máquina tiene la {machineNozzle} mm: el tiempo y los gramos no serán reales.</p>;
}
