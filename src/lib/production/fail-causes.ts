/**
 * Catálogo cerrado de causas de falla de impresión. `print_jobs.fail_code` guarda el código;
 * `fail_cause` conserva el detalle en texto libre. Los trabajos anteriores se clasifican al vuelo con `normalizeFailCause`.
 */
export const FAIL_CAUSES = ['despegue', 'warping', 'hilos', 'capas_separadas', 'espagueti', 'atasco', 'sin_material', 'soportes', 'superficie', 'corte_energia', 'otro'] as const;
export type FailCode = (typeof FAIL_CAUSES)[number];
export const isFailCode = (v: unknown): v is FailCode => typeof v === 'string' && (FAIL_CAUSES as readonly string[]).includes(v);

const RULES: Array<[FailCode, RegExp]> = [
  ['despegue', /desp?eg|desprend|solt[óo] de la cama|lift(ed)?|detach|no adhier|adherencia|primera capa|first layer/i],
  ['warping', /warp|alabe|curv|esquina.*(lev|sub)|se levant/i],
  ['hilos', /hilo|stringing|string|telara|babead|ooz/i],
  ['capas_separadas', /separaci[óo]n de capas|capas.*(separ|abr)|delamin|layer (split|separation)|se abri|partid/i],
  ['espagueti', /espagu?et|spaghetti|enredad|maraña/i],
  ['atasco', /atasc|obstru|tap[óo]|clog|jam|no extru|sub-?extru|boquilla/i],
  ['sin_material', /sin (filamento|material)|se acab|runout|out of filament|fin de bobina|bobina vac/i],
  ['soportes', /soporte|support/i],
  ['superficie', /superficie|acabado|rugos|zits|grumos|blob|ghost|ringing|surface/i],
  ['corte_energia', /corte de (luz|energ)|apag[óo]n|power (loss|outage|cut)|se fue la luz/i],
];
/** Clasifica un texto libre en el catálogo; `null` si no se reconoce (se tratará como «otro»). */
export function normalizeFailCause(text: string | null | undefined): FailCode | null {
  const t = (text ?? '').trim(); if (!t) return null;
  return RULES.find(([, re]) => re.test(t))?.[0] ?? null;
}
/** Código efectivo de un trabajo: el guardado, o el deducido del texto. */
export const effectiveFailCode = (j: { failCode?: string | null; failCause?: string | null }): FailCode | null =>
  isFailCode(j.failCode) ? j.failCode : normalizeFailCause(j.failCause) ?? (j.failCause?.trim() ? 'otro' : null);
