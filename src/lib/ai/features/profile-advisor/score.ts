import { first, numOf } from './params';

/**
 * Puntajes heurísticos (0–100) para ordenar y explicar candidatos. NO son física exacta: resumen deterministas,
 * documentados, de qué tanto favorece un perfil a cada objetivo. Se muestran junto a las medidas reales del laminador.
 */
export interface Scores { strength: number; quality: number; risk: number }
export interface ScoreInput {
  process: Record<string, any>; filament: Record<string, any>;
  overhangPct?: number | null;
  /** Tasa de éxito histórica del perfil (0–100), si hay datos suficientes. */
  historySuccessPct?: number | null;
}
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const lerp01 = (v: number, lo: number, hi: number) => clamp((v - lo) / (hi - lo), 0, 1);

export function scoreProfile(i: ScoreInput): Scores {
  const P = i.process, F = i.filament;
  const walls = numOf(P.wall_loops) ?? 2, infill = numOf(P.sparse_infill_density) ?? 15;
  const top = numOf(P.top_shell_layers) ?? 4, bottom = numOf(P.bottom_shell_layers) ?? 3;
  const pattern = String(first(P.sparse_infill_pattern) ?? 'grid');
  const lh = numOf(P.layer_height) ?? 0.2, ow = numOf(P.outer_wall_speed) ?? 120, acc = numOf(P.default_acceleration) ?? 5000;
  const supports = String(first(P.enable_support) ?? '0') === '1';

  // Resistencia: paredes pesan más que el relleno; patrones isotrópicos suman un poco.
  const strength = clamp(40 * lerp01(walls, 1, 6) + 35 * lerp01(infill, 0, 50) + (['gyroid', 'cubic', 'adaptivecubic', 'honeycomb'].includes(pattern) ? 5 : 0) + 20 * lerp01((top + bottom) / 2, 1, 6));
  // Calidad superficial: capa fina, pared exterior lenta y aceleración baja.
  const quality = clamp(40 * (1 - lerp01(lh, 0.08, 0.36)) + 30 * (1 - lerp01(ow, 40, 240)) + 30 * (1 - lerp01(acc, 1000, 10000)));
  // Riesgo de falla: voladizos sin soportes, caudal cerca del límite, temperatura en el borde del rango, historial.
  let risk = 0;
  if (!supports && i.overhangPct != null) risk += clamp(i.overhangPct * 2, 0, 35);
  const maxFlow = numOf(F.filament_max_volumetric_speed);
  const flow = lh * 0.42 * Math.max(ow, numOf(P.inner_wall_speed) ?? 0, numOf(P.sparse_infill_speed) ?? 0);
  if (maxFlow && maxFlow > 0) risk += clamp((flow / maxFlow - 0.8) * 100, 0, 30);
  const t = numOf(F.nozzle_temperature), lo = numOf(F.nozzle_temperature_range_low), hi = numOf(F.nozzle_temperature_range_high);
  if (t != null && lo != null && hi != null && hi > lo) { const edge = Math.min(t - lo, hi - t) / (hi - lo); if (edge < 0.1) risk += 10; }
  if (i.historySuccessPct != null) risk += clamp((100 - i.historySuccessPct) * 0.6, 0, 25);
  return { strength: Math.round(strength), quality: Math.round(quality), risk: Math.round(clamp(risk)) };
}

export type Goal = 'rapido' | 'resistente' | 'estetico' | 'ahorro' | 'equilibrado';
export const GOALS: Goal[] = ['rapido', 'resistente', 'estetico', 'ahorro', 'equilibrado'];

export interface Measured { timeS: number | null; grams: number | null; layers?: number | null }
/** Ganancia (positiva = mejor) del candidato frente a la base según el objetivo del usuario. */
export function goalGain(goal: Goal, base: { m: Measured; s: Scores }, cand: { m: Measured; s: Scores }): number {
  const pct = (b: number | null, c: number | null) => (b && c != null ? ((b - c) / b) * 100 : 0); // + si el candidato gasta menos
  const time = pct(base.m.timeS, cand.m.timeS), mat = pct(base.m.grams, cand.m.grams);
  const dStrength = cand.s.strength - base.s.strength, dQuality = cand.s.quality - base.s.quality, dRisk = cand.s.risk - base.s.risk;
  switch (goal) {
    case 'rapido': return time - 0.5 * dRisk;
    case 'resistente': return dStrength - 0.5 * dRisk;
    case 'estetico': return dQuality - 0.5 * dRisk;
    case 'ahorro': return mat - 0.5 * dRisk;
    default: return (time + mat) / 2 + (dStrength + dQuality) / 4 - dRisk / 2;
  }
}
