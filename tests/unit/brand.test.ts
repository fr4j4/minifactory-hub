import { describe, expect, it } from 'vitest';
import { brandCss, contrast, deriveBrand, hexToRgb } from '@/lib/brand';

describe('paleta de marca (N9)', () => {
  it('la tinta de texto cumple contraste AA (4,5) contra el fondo, para colores claros y oscuros', () => {
    for (const hex of ['#ff5b1f', '#1d62f0', '#ffe600', '#0b3d2e', '#7a1fa2']) {
      const b = deriveBrand(hex)!;
      expect(contrast(hexToRgb(b.light['--accent-ink'])!, [243, 241, 236])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(hexToRgb(b.dark['--accent-ink'])!, [18, 18, 17])).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('elige texto sobre el acento con buen contraste', () => {
    expect(deriveBrand('#ffe600')!.light['--on-accent']).toBe('#17161a');
    expect(deriveBrand('#0b3d2e')!.light['--on-accent']).toBe('#ffffff');
  });
  it('el valor histórico del PDF o un valor inválido no cambian el tema', () => {
    expect(brandCss('#1d62f0')).toBe(''); expect(brandCss('')).toBe(''); expect(brandCss('rojo')).toBe('');
    expect(brandCss('#ff5b1f')).toContain('--accent:#ff5b1f');
  });
});
