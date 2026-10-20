import { describe, expect, it } from 'vitest';
import { inkFor, luma, rollRadius } from '@/lib/spool-geometry';
import { matOptionLabel, stockTag } from '@/lib/material-label';
import { createT } from '@/i18n/translate';

describe('ícono de carrete', () => {
  it('el texto va en negro sobre colores claros y en blanco sobre oscuros', () => {
    expect(inkFor('#ffffff')).toBe('#111827'); expect(inkFor('#101010')).toBe('#ffffff'); expect(inkFor('#ffd400')).toBe('#111827'); expect(inkFor('#1f3a93')).toBe('#ffffff');
    expect(luma('no-es-color')).toBe(0.5);
  });
  it('el rollo se achica con el filamento que queda y nunca desaparece', () => {
    expect(rollRadius(1)).toBe(19); expect(rollRadius(1)).toBeGreaterThan(rollRadius(0.5)); expect(rollRadius(0)).toBeGreaterThan(8); expect(rollRadius(5)).toBe(19);
  });
});

describe('etiqueta de stock en los selectores', () => {
  const t = createT('es');
  it('distingue genérico, sin stock y con stock', () => {
    expect(stockTag({ generic: true, stockG: 5000 }, t)).toBe('sin color');
    expect(stockTag({ generic: false, stockG: 0 }, t)).toBe('sin stock');
    expect(stockTag({ generic: false, stockG: 2300 }, t)).toContain('2.300');
    expect(matOptionLabel({ label: 'PLA Negro', generic: false, stockG: 0 }, t)).toBe('PLA Negro · sin stock');
  });
});
