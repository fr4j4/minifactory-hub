import type { s } from '@/db';

/** Lo que el navegador necesita saber de un laminado (estado, resultado y progreso). */
export function runInfoOf(r: typeof s.sliceRuns.$inferSelect) {
  return { id: r.id, status: r.status, error: r.error, errorCode: (r.result as any)?.errorCode ?? null, timeS: r.timeS, filament: r.filament, layers: r.layers, plates: r.plates, durationMs: r.durationMs, engineVersion: r.engineVersion, label: r.label, copies: r.copies, cached: !!(r.result as any)?.cached, progress: r.status === 'running' ? ((r.result as any)?.progress ?? null) : null, hasGcode: !!r.gcodeKey, has3mf: !!r.threemfKey, profileVersions: r.profileVersions, platesInfo: ((r.result as any)?.platesInfo ?? []) as Array<{ index: number; timeS: number | null; layers: number | null; filament: Array<{ g: number; mm: number }> }> };
}
export const RUN_FINISHED = ['done', 'error', 'cancelado'];
