/** Horas reales de un trabajo cuando nadie las escribió al terminarlo. */

/** Rango de real ÷ estimado que se considera una medición creíble (fuera de él, el tiempo transcurrido no es el de impresión). */
export const PLAUSIBLE_RATIO = { min: 0.3, max: 3 } as const;

export const plausibleRatio = (r: number) => Number.isFinite(r) && r >= PLAUSIBLE_RATIO.min && r <= PLAUSIBLE_RATIO.max;

/**
 * Sin impresora conectada, «Iniciar» y «Terminar» suelen marcarse juntos al final: el tiempo entre ambos clics no es el de impresión.
 * Se usa el transcurrido solo si es creíble frente al estimado; si no, el estimado.
 */
export function defaultRealHours(estH: number, realStart: Date | string | null | undefined, now: Date = new Date()): { hours: number; source: 'transcurrido' | 'estimado' } {
  const start = realStart ? new Date(realStart).getTime() : NaN;
  const elapsed = Number.isFinite(start) ? Math.max(0, (now.getTime() - start) / 3600_000) : NaN;
  if (!Number.isFinite(elapsed)) return { hours: estH, source: 'estimado' };
  if (estH <= 0) return { hours: Math.max(0.01, elapsed), source: 'transcurrido' };
  return plausibleRatio(elapsed / estH) ? { hours: Math.max(0.01, elapsed), source: 'transcurrido' } : { hours: estH, source: 'estimado' };
}
