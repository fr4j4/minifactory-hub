/** Luminancia relativa de un color #rrggbb (0 oscuro … 1 claro). */
export function luma(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim()); if (!m) return 0.5;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Color del texto sobre el filamento: negro sobre claros, blanco sobre oscuros. */
export const inkFor = (hex: string) => (luma(hex) > 0.55 ? '#111827' : '#ffffff');
/** Radio del rollo (entre el núcleo, 7, y el borde del plato, 19) según cuánto filamento queda (0 a 1); nunca desaparece del todo. */
export const rollRadius = (fill: number) => 7 + 12 * Math.max(0.12, Math.min(1, fill));
