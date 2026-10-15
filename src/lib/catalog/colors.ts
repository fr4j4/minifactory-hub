/** Colores habituales de filamento en español e inglés → hex sugerido. Sirve para el alta masiva (N4). */
const C: Array<[string[], string]> = [
  [['negro', 'black'], '#1c1c1c'], [['blanco', 'white'], '#f1f1ee'], [['gris', 'grey', 'gray'], '#8a8a8a'], [['gris oscuro', 'dark grey', 'dark gray', 'grafito', 'graphite'], '#4a4a4a'],
  [['gris claro', 'light grey', 'light gray', 'plata', 'silver', 'plateado'], '#b9bcc0'], [['rojo', 'red'], '#d62f2f'], [['rojo oscuro', 'burdeo', 'burdeos', 'granate', 'dark red', 'burgundy'], '#7a1f2b'],
  [['naranja', 'orange'], '#f28a1d'], [['amarillo', 'yellow'], '#f2d21d'], [['verde', 'green'], '#2f9d4b'], [['verde oscuro', 'dark green'], '#1f5a35'], [['verde claro', 'light green', 'lima', 'lime'], '#8cd04f'],
  [['azul', 'blue'], '#2d6cdf'], [['azul oscuro', 'azul marino', 'navy', 'dark blue'], '#1b2f66'], [['azul cielo', 'celeste', 'sky blue', 'light blue'], '#6cc0ee'], [['turquesa', 'cyan', 'teal'], '#1fb5b0'],
  [['morado', 'violeta', 'purple', 'violet'], '#7a4fc2'], [['lila', 'lavanda', 'lavender'], '#b9a2e0'], [['rosado', 'rosa', 'pink'], '#f08cb4'], [['fucsia', 'magenta'], '#d6246e'],
  [['marron', 'marrón', 'café', 'cafe', 'brown'], '#6b4326'], [['beige', 'crema', 'cream'], '#e3d3b0'], [['piel', 'skin', 'carne'], '#e8b894'], [['dorado', 'oro', 'gold'], '#c9a227'], [['cobre', 'bronce', 'copper', 'bronze'], '#b0643a'],
  [['transparente', 'natural', 'clear', 'translucent'], '#cfe6ee'],
];
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const MAP = new Map<string, string>(); for (const [names, hex] of C) for (const n of names) MAP.set(norm(n), hex);
/** Hex sugerido para un nombre de color; null si no se reconoce. */
export function suggestHex(name: string): string | null {
  const n = norm(name); if (MAP.has(n)) return MAP.get(n)!;
  for (const w of n.split(' ')) if (MAP.has(w)) return MAP.get(w)!; // «rojo brillante» → rojo
  return null;
}
/** «Negro, Blanco; Rojo» o una columna pegada desde una planilla → lista de nombres sin repetidos. */
export function parseColorList(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\n\r\t,;]+/)) { const v = raw.trim(); if (v && !out.some((o) => norm(o) === norm(v))) out.push(v); }
  return out;
}
