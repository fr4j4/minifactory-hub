import { accentVars, type BrandVars } from './brand';

/**
 * Paletas de la interfaz (N9b): neutros + acento, cada una en claro y oscuro. La marca del taller personaliza solo la paleta «capa»;
 * las demás traen su propio acento. Los textos sobre el acento y la tinta del acento se calculan para cumplir contraste AA.
 */
export type PaletteId = 'capa' | 'grafito' | 'oceano' | 'bosque' | 'violeta' | 'contraste';
export type ThemeMode = 'system' | 'light' | 'dark';
export const PALETTE_IDS: PaletteId[] = ['capa', 'grafito', 'oceano', 'bosque', 'violeta', 'contraste'];
export const isPalette = (v: unknown): v is PaletteId => typeof v === 'string' && (PALETTE_IDS as string[]).includes(v);
export const isThemeMode = (v: unknown): v is ThemeMode => v === 'system' || v === 'light' || v === 'dark';
export const PALETTE_NAMES: Record<PaletteId, { es: string; en: string }> = {
  capa: { es: 'Capa a capa', en: 'Layer by layer' }, grafito: { es: 'Grafito', en: 'Graphite' }, oceano: { es: 'Océano', en: 'Ocean' },
  bosque: { es: 'Bosque', en: 'Forest' }, violeta: { es: 'Violeta', en: 'Violet' }, contraste: { es: 'Alto contraste', en: 'High contrast' },
};
interface Neutrals { bg: string; card: string; line: string; ink: string; muted: string; panel: string; panelInk: string; dot: string }
interface Def { accent: string; light: Neutrals; dark: Neutrals }
export const PALETTES: Record<PaletteId, Def> = {
  capa: { accent: '#ff5b1f',
    light: { bg: '#f3f1ec', card: '#fbfaf7', line: '#e0dcd2', ink: '#17161a', muted: '#5b564e', panel: '#151514', panelInk: '#e9e5dc', dot: 'rgba(23,22,26,.085)' },
    dark: { bg: '#121211', card: '#1b1b19', line: '#2c2b28', ink: '#ece8df', muted: '#a29c90', panel: '#0c0c0b', panelInk: '#e9e5dc', dot: 'rgba(236,232,223,.06)' } },
  grafito: { accent: '#e8a100',
    light: { bg: '#f3f4f6', card: '#ffffff', line: '#dcdfe4', ink: '#14161a', muted: '#555b66', panel: '#16181d', panelInk: '#e6e8ec', dot: 'rgba(20,22,26,.07)' },
    dark: { bg: '#101216', card: '#181b21', line: '#2a2e36', ink: '#e8eaee', muted: '#9aa1ad', panel: '#0a0c0f', panelInk: '#e6e8ec', dot: 'rgba(232,234,238,.05)' } },
  oceano: { accent: '#1a6bcc',
    light: { bg: '#eef4f8', card: '#fbfdff', line: '#d3e0ea', ink: '#0f1b26', muted: '#475a6a', panel: '#0e2233', panelInk: '#e3eef7', dot: 'rgba(15,27,38,.07)' },
    dark: { bg: '#0b1620', card: '#12202d', line: '#22364a', ink: '#e4eef7', muted: '#93a9bc', panel: '#07101a', panelInk: '#e3eef7', dot: 'rgba(228,238,247,.05)' } },
  bosque: { accent: '#2e9b5f',
    light: { bg: '#f0f4ee', card: '#fafcf8', line: '#d6e0d0', ink: '#14201a', muted: '#4f6257', panel: '#12251b', panelInk: '#e4efe7', dot: 'rgba(20,32,26,.07)' },
    dark: { bg: '#0d1510', card: '#142019', line: '#243629', ink: '#e4efe7', muted: '#93ab9a', panel: '#080f0b', panelInk: '#e4efe7', dot: 'rgba(228,239,231,.05)' } },
  violeta: { accent: '#7c4dff',
    light: { bg: '#f4f0f8', card: '#fcfaff', line: '#e0d7ec', ink: '#1d1626', muted: '#5a4f69', panel: '#1b1226', panelInk: '#ece6f5', dot: 'rgba(29,22,38,.07)' },
    dark: { bg: '#130e1a', card: '#1c1526', line: '#32264a', ink: '#ece6f5', muted: '#a99dbd', panel: '#0d0912', panelInk: '#ece6f5', dot: 'rgba(236,230,245,.05)' } },
  contraste: { accent: '#0036c9',
    light: { bg: '#ffffff', card: '#ffffff', line: '#000000', ink: '#000000', muted: '#1f1f1f', panel: '#000000', panelInk: '#ffffff', dot: 'rgba(0,0,0,0)' },
    dark: { bg: '#000000', card: '#000000', line: '#ffffff', ink: '#ffffff', muted: '#e6e6e6', panel: '#000000', panelInk: '#ffffff', dot: 'rgba(0,0,0,0)' } },
};
/** El acento en oscuro de «contraste» es amarillo (sobre negro el azul no se lee). */
const DARK_ACCENT: Partial<Record<PaletteId, string>> = { contraste: '#ffd400' };

export function tokens(id: PaletteId, dark: boolean): Record<string, string> {
  const d = PALETTES[id]; const n = dark ? d.dark : d.light; const acc = dark ? DARK_ACCENT[id] ?? d.accent : d.accent;
  const a: BrandVars = accentVars(acc, n.card, dark);
  return { '--bg': n.bg, '--card': n.card, '--line': n.line, '--ink': n.ink, '--muted': n.muted, '--panel': n.panel, '--panel-ink': n.panelInk, '--dot': n.dot, ...a };
}
const decl = (t: Record<string, string>) => Object.entries(t).map(([k, v]) => `${k}:${v}`).join(';');
/**
 * CSS de todas las paletas. Selectores: `[data-palette=x]` con `data-theme` claro/oscuro explícito y, sin elección (sistema),
 * `prefers-color-scheme`. La paleta «capa» sin atributo es la de globals.css (no se repite aquí).
 */
export function paletteCss(): string {
  let css = '';
  for (const id of PALETTE_IDS) {
    const L = decl(tokens(id, false)), D = decl(tokens(id, true));
    css += `:root[data-palette="${id}"]{${L}}:root[data-palette="${id}"][data-theme="dark"]{${D}}`;
    css += `@media (prefers-color-scheme:dark){:root[data-palette="${id}"]:not([data-theme="light"]){${D}}}`;
  }
  css += ':root[data-theme="dark"]{color-scheme:dark}:root[data-theme="light"]{color-scheme:light}';
  // tema explícito sin paleta (capa a capa)
  css += `:root[data-theme="light"]:not([data-palette]){${decl(tokens('capa', false))}}:root[data-theme="dark"]:not([data-palette]){${decl(tokens('capa', true))}}`;
  return css;
}
/** Script que corre antes del primer pintado: aplica la preferencia del navegador (localStorage) o, si no hay, la del taller. */
export function bootScript(shopPalette: PaletteId): string {
  return `try{var d=document.documentElement,p=localStorage.getItem('mf_palette'),m=localStorage.getItem('mf_theme');if(!p||!${JSON.stringify(PALETTE_IDS)}.includes(p))p=${JSON.stringify(shopPalette)};if(p&&p!=='capa')d.setAttribute('data-palette',p);else d.removeAttribute('data-palette');if(m==='light'||m==='dark')d.setAttribute('data-theme',m);else d.removeAttribute('data-theme')}catch(e){}`;
}
