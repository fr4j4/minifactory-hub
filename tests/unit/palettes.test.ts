import { describe, expect, it } from 'vitest';
import { contrast, hexToRgb } from '@/lib/brand';
import { bootScript, PALETTE_IDS, paletteCss, tokens } from '@/lib/palettes';

const c = (a: string, b: string) => contrast(hexToRgb(a)!, hexToRgb(b)!);
describe('paletas de la interfaz (N9b)', () => {
  for (const id of PALETTE_IDS) for (const dark of [false, true]) {
    it(`${id} ${dark ? 'oscuro' : 'claro'}: contraste AA en texto, texto atenuado y acento`, () => {
      const t = tokens(id, dark);
      expect(c(t['--ink'], t['--bg'])).toBeGreaterThanOrEqual(7); expect(c(t['--ink'], t['--card'])).toBeGreaterThanOrEqual(7);
      expect(c(t['--muted'], t['--bg'])).toBeGreaterThanOrEqual(4.5); expect(c(t['--muted'], t['--card'])).toBeGreaterThanOrEqual(4.5);
      expect(c(t['--accent-ink'], t['--card'])).toBeGreaterThanOrEqual(4.5);
      expect(c(t['--on-accent'], t['--accent'])).toBeGreaterThanOrEqual(4.5);
      expect(c(t['--panel-ink'], t['--panel'])).toBeGreaterThanOrEqual(7);
    });
  }
  it('el CSS cubre cada paleta en claro, oscuro explícito y oscuro del sistema', () => {
    const css = paletteCss();
    for (const id of PALETTE_IDS) { expect(css).toContain(`:root[data-palette="${id}"]{`); expect(css).toContain(`[data-palette="${id}"][data-theme="dark"]`); expect(css).toContain(`prefers-color-scheme:dark){:root[data-palette="${id}"]:not([data-theme="light"])`); }
  });
  it('el script de arranque usa la paleta del taller si no hay preferencia y no confía en valores arbitrarios', () => {
    const s = bootScript('oceano'); expect(s).toContain('"oceano"'); expect(s).toContain('localStorage.getItem');
    expect(bootScript('capa')).toContain('removeAttribute');
  });
});
