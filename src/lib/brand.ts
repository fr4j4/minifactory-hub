/** Paleta de marca derivada de un color base (N9): acento, tinta de texto con contraste AA, hover y sombra de «capa». */
const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n));
export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim()); if (!m) return null;
  const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const toHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(clamp(v / 255) * 255).toString(16).padStart(2, '0')).join('');
export function luminance([r, g, b]: [number, number, number]) {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export const contrast = (a: [number, number, number], b: [number, number, number]) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
export const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const WHITE: [number, number, number] = [255, 255, 255], BLACK: [number, number, number] = [0, 0, 0];

/** Oscurece/aclara el color hasta que cumpla el contraste mínimo contra el fondo. */
export function ensureContrast(c: [number, number, number], bg: [number, number, number], min: number, toward: [number, number, number]) {
  let out = c; for (let i = 0; i < 20 && contrast(out, bg) < min; i++) out = mix(out, toward, 0.1); return out;
}
/**
 * La tinta del acento también se lee sobre --accent-soft (insignias «en curso»), que es más oscuro (claro) o más claro (oscuro)
 * que la tarjeta: se exige el contraste contra ese fondo, que cubre también la tarjeta. Mismo 11 % que globals.css;
 * 4,6 deja margen al redondeo de color-mix del navegador.
 */
const soft = (accent: [number, number, number], bg: [number, number, number]) => mix(bg, accent, 0.11);
const INK_MIN = 4.6;
export interface BrandVars { '--accent': string; '--accent-ink': string; '--on-accent': string; '--accent-hover': string; '--accent-shadow': string; '--glow': string }
export interface Brand { light: BrandVars; dark: BrandVars }
export function deriveBrand(hex: string): Brand | null {
  const base = hexToRgb(hex); if (!base) return null;
  const on = contrast(base, [23, 22, 26]) >= contrast(base, WHITE) ? '#17161a' : '#ffffff';
  const paper: [number, number, number] = [243, 241, 236], ink: [number, number, number] = [27, 27, 25]; // fondo claro y tarjeta oscura de «capa»
  const mk = (accent: [number, number, number], inkBg: [number, number, number], inkToward: [number, number, number], glowA: number): BrandVars => ({
    '--accent': toHex(...accent), '--on-accent': on,
    '--accent-ink': toHex(...ensureContrast(accent, soft(accent, inkBg), INK_MIN, inkToward)),
    '--accent-hover': toHex(...mix(accent, WHITE, 0.12)), '--accent-shadow': toHex(...mix(accent, BLACK, 0.3)),
    '--glow': `rgba(${accent.map(Math.round).join(',')}, ${glowA})`,
  });
  return { light: mk(base, paper, BLACK, 0.16), dark: mk(mix(base, WHITE, 0.08), ink, WHITE, 0.14) };
}
export const LEGACY_BRAND = '#1d62f0'; // valor por defecto histórico del PDF: no se considera elección de marca
export function brandCss(hex: string): string {
  if (!hex || hex.toLowerCase() === LEGACY_BRAND) return '';
  const b = deriveBrand(hex); if (!b) return '';
  const decl = (v: BrandVars) => Object.entries(v).map(([k, x]) => `${k}:${x}`).join(';');
  // la marca personaliza la paleta «capa a capa» (la de fábrica); las demás paletas traen su propio acento
  const sel = ':root:not([data-palette]),:root[data-palette="capa"]';
  return `${sel}{${decl(b.light)}}@media (prefers-color-scheme:dark){:root:not([data-palette]):not([data-theme="light"]){${decl(b.dark)}}}:root[data-theme="dark"]:not([data-palette]){${decl(b.dark)}}`;
}

/** Variables de acento (texto sobre el acento, tinta legible, hover, sombra y brillo) para un acento sobre un fondo dado. */
export function accentVars(accent: string, bg: string, dark: boolean): BrandVars {
  const a = hexToRgb(accent)!, b = hexToRgb(bg)!;
  const on = contrast(a, [23, 22, 26]) >= contrast(a, WHITE) ? '#17161a' : '#ffffff';
  return {
    '--accent': toHex(...a), '--on-accent': on, '--accent-ink': toHex(...ensureContrast(a, soft(a, b), INK_MIN, dark ? WHITE : BLACK)),
    '--accent-hover': toHex(...mix(a, dark ? WHITE : WHITE, 0.12)), '--accent-shadow': toHex(...mix(a, BLACK, 0.3)), '--glow': `rgba(${a.map(Math.round).join(',')}, ${dark ? 0.14 : 0.16})`,
  };
}
