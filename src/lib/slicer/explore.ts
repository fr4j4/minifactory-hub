/** Exploración de perfiles: combinaciones de uno o dos parámetros, frontera de Pareto y mejores resultados. Funciones puras (también se usan en el navegador). */
export interface Variant { label: string; overrides: Record<string, string> }

/** Barrido de un parámetro: una variante por valor. */
export function sweep(key: string, values: string[]): Variant[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].map((v) => ({ label: `${key}=${v}`, overrides: { [key]: v } }));
}
/** Rejilla de dos parámetros (producto cartesiano), con un tope de variantes para no saturar la cola. */
export function grid(a: { key: string; values: string[] }, b: { key: string; values: string[] }, max = 12): Variant[] {
  const out: Variant[] = [];
  for (const x of [...new Set(a.values.map((v) => v.trim()).filter(Boolean))]) for (const y of [...new Set(b.values.map((v) => v.trim()).filter(Boolean))]) out.push({ label: `${a.key}=${x} · ${b.key}=${y}`, overrides: { [a.key]: x, [b.key]: y } });
  return out.slice(0, max);
}
export interface Point { id: string; timeS: number; grams: number; price?: number }
/** Puntos que ningún otro supera en tiempo Y gramos a la vez (menos es mejor en ambos). */
export function paretoFront(points: Point[]): string[] {
  return points.filter((p) => !points.some((q) => q.id !== p.id && q.timeS <= p.timeS && q.grams <= p.grams && (q.timeS < p.timeS || q.grams < p.grams))).map((p) => p.id);
}
export type Criterion = 'fastest' | 'cheapest' | 'balanced';
/** Mejor punto según el criterio: más rápido, más barato (precio o, si falta, gramos) o equilibrado (menor distancia al ideal normalizado). */
export function bestOf(points: Point[], by: Criterion): string | null {
  if (!points.length) return null;
  if (by === 'fastest') return points.reduce((a, p) => (p.timeS < a.timeS ? p : a)).id;
  if (by === 'cheapest') return points.reduce((a, p) => ((p.price ?? p.grams) < (a.price ?? a.grams) ? p : a)).id;
  const range = (f: (p: Point) => number) => { const v = points.map(f); return [Math.min(...v), Math.max(...v) - Math.min(...v) || 1] as const; };
  const [t0, tr] = range((p) => p.timeS), [g0, gr] = range((p) => p.grams);
  return points.reduce((a, p) => { const d = (x: Point) => Math.hypot((x.timeS - t0) / tr, (x.grams - g0) / gr); return d(p) < d(a) ? p : a; }).id;
}
