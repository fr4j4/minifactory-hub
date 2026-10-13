import { PARAM_BY_KEY, first, numOf, type ParamDef, type Risk, type Scope } from './params';

export type RejectCode = 'not_allowed' | 'unknown_key' | 'bad_value' | 'no_change' | 'dependency' | 'duplicate' | 'too_many';
export interface Proposed { scope: string; key: string; to: string | number; reason?: string; evidence?: string }
export interface Accepted { scope: Scope; key: string; from: string | number | null; to: string | number; clamped: boolean; risk: Risk; reason: string; evidence: string }
export interface Rejected { key: string; code: RejectCode; to?: string | number }
export interface ValidateCtx {
  nozzle: number;
  /** Perfil efectivo actual (fábrica + cambios) de cada tipo. */
  process: Record<string, any>; filament: Record<string, any>;
  /** Claves existentes en el perfil de fábrica (si OrcaSlicer está disponible); null = no se puede comprobar. */
  knownKeys?: { process: Set<string>; filament: Set<string> } | null;
  machineMaxSpeed?: number | null; machineMaxAccel?: number | null;
}
export const MAX_CHANGES = 12;

const fmtNum = (n: number, dec = 3) => String(Math.round(n * 10 ** dec) / 10 ** dec);

/** Límites dependientes del contexto (boquilla, material, máquina). */
function bounds(def: ParamDef, c: ValidateCtx): { min: number; max: number } | null {
  if (def.type === 'enum' || def.type === 'bool') return null;
  let { min, max } = def;
  if (def.key === 'layer_height') { min = Math.max(min, 0.25 * c.nozzle); max = Math.min(max, 0.8 * c.nozzle); }
  if (def.key === 'initial_layer_print_height') max = Math.min(max, 0.8 * c.nozzle);
  if (def.key.endsWith('_speed') && c.machineMaxSpeed) max = Math.min(max, c.machineMaxSpeed);
  if (def.key === 'default_acceleration' && c.machineMaxAccel) max = Math.min(max, c.machineMaxAccel);
  if (def.key === 'nozzle_temperature' || def.key === 'nozzle_temperature_initial_layer') {
    const lo = numOf(c.filament.nozzle_temperature_range_low), hi = numOf(c.filament.nozzle_temperature_range_high);
    const cur = numOf(c.filament[def.key]);
    if (lo != null && hi != null && hi > lo) { min = Math.max(min, lo); max = Math.min(max, hi); }
    else if (cur != null) { min = Math.max(min, cur - 30); max = Math.min(max, cur + 30); } // sin rango del material: ±30 °C de lo actual
  }
  return { min, max };
}

/** Normaliza el valor propuesto al formato de Orca; devuelve null si no es válido. */
function coerce(def: ParamDef, raw: string | number, c: ValidateCtx): { value: string | number; clamped: boolean } | null {
  if (def.type === 'enum') { const s = String(raw).trim(); return def.options.includes(s) ? { value: s, clamped: false } : null; }
  if (def.type === 'bool') { const s = String(raw).trim().toLowerCase(); if (['1', 'true', 'si', 'sí', 'yes'].includes(s)) return { value: '1', clamped: false }; if (['0', 'false', 'no'].includes(s)) return { value: '0', clamped: false }; return null; }
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace('%', '').replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const b = bounds(def, c)!; let v = Math.min(b.max, Math.max(b.min, n));
  if (def.type === 'int') v = Math.round(v);
  const wasClamped = v !== n && (def.type !== 'int' || Math.round(n) !== v);
  if (def.type === 'percent') return { value: `${fmtNum(v, 0)}%`, clamped: wasClamped };
  if (def.type === 'number') return { value: Number(fmtNum(v, 3)), clamped: wasClamped };
  return { value: v, clamped: wasClamped };
}

const same = (a: unknown, b: unknown) => {
  const x = first(a), y = first(b); if (x == null || y == null) return false;
  const nx = numOf(x), ny = numOf(y);
  return nx != null && ny != null && !String(x).includes('(') ? Math.abs(nx - ny) < 1e-9 : String(x) === String(y);
};

/**
 * Valida y normaliza los cambios propuestos por el modelo. Devuelve los aceptados (con el valor actual real como `from`)
 * y los rechazados con su motivo. No lanza: una propuesta mala nunca debe romper el flujo.
 */
export function validateChanges(input: Proposed[], c: ValidateCtx): { accepted: Accepted[]; rejected: Rejected[] } {
  const accepted: Accepted[] = []; const rejected: Rejected[] = []; const seen = new Set<string>();
  for (const p of input) {
    const def = PARAM_BY_KEY.get(p.key);
    if (!def) { rejected.push({ key: p.key, code: 'not_allowed', to: p.to }); continue; }
    if (seen.has(p.key)) { rejected.push({ key: p.key, code: 'duplicate', to: p.to }); continue; }
    const known = c.knownKeys?.[def.scope];
    if (known && !known.has(p.key)) { rejected.push({ key: p.key, code: 'unknown_key', to: p.to }); continue; }
    if (accepted.length >= MAX_CHANGES) { rejected.push({ key: p.key, code: 'too_many', to: p.to }); continue; }
    const v = coerce(def, p.to, c);
    if (!v) { rejected.push({ key: p.key, code: 'bad_value', to: p.to }); continue; }
    const cur = (def.scope === 'process' ? c.process : c.filament)[p.key];
    if (same(cur, v.value)) { rejected.push({ key: p.key, code: 'no_change', to: p.to }); continue; }
    seen.add(p.key);
    accepted.push({ scope: def.scope, key: p.key, from: cur == null ? null : (first(cur) as string | number), to: v.value, clamped: v.clamped, risk: def.risk, reason: (p.reason ?? '').slice(0, 200), evidence: (p.evidence ?? '').slice(0, 160) });
  }
  // dependencias entre parámetros (usando el valor final de cada uno)
  const finalVal = (key: string, scope: Scope) => accepted.find((a) => a.key === key)?.to ?? first((scope === 'process' ? c.process : c.filament)[key]);
  for (let i = accepted.length - 1; i >= 0; i--) {
    const a = accepted[i];
    if (a.key === 'support_type' && String(finalVal('enable_support', 'process')) !== '1') { rejected.push({ key: a.key, code: 'dependency', to: a.to }); accepted.splice(i, 1); }
  }
  return { accepted, rejected };
}

/** Valores efectivos tras aplicar los cambios aceptados (para puntuar y para guardar). */
export function applyAccepted(base: Record<string, any>, acc: Accepted[], scope: Scope): Record<string, any> {
  const out = { ...base };
  for (const a of acc) if (a.scope === scope) out[a.key] = Array.isArray(base[a.key]) ? [String(a.to)] : a.to;
  return out;
}
