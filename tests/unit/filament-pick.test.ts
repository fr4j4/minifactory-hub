import { describe, expect, it } from 'vitest';
import { colorFamily, filterMaterials, groupMaterials, hexDistance, lineTitle, pickerName, type PickMaterial } from '@/lib/filament-pick';

const m = (o: Partial<PickMaterial> & { id: string }): PickMaterial => ({ label: o.id, type: 'PLA', colorName: 'Negro', hex: '#1c1c1c', costPerKg: 15000, generic: false, stockG: 0, availableG: 0, manufacturer: null, line: null, variantId: null, tech: 'fdm', filamentProfileId: null, ...o });
const LIST = [
  m({ id: 'g-pla', type: 'PLA', generic: true, colorName: 'Genérico', hex: '#9ca3af' }),
  m({ id: 'a', manufacturer: 'Bambu Lab', line: 'PLA Basic', colorName: 'Negro', availableG: 640 }),
  m({ id: 'b', manufacturer: 'Bambu Lab', line: 'PLA Basic', colorName: 'Rojo', hex: '#d62f2f' }),
  m({ id: 'c', manufacturer: 'eSun', line: 'PETG', type: 'PETG', colorName: 'Azul', hex: '#2d6cdf', availableG: 900 }),
  m({ id: 'd', manufacturer: 'eSun', line: 'Silk', type: 'PLA', colorName: 'Oro', hex: '#c9a227' }),
  m({ id: 'r', tech: 'resina', type: 'Resina estándar', colorName: 'Gris', hex: '#9aa0a6' }),
];

describe('filament-pick: color', () => {
  it('clasifica tonos en familias', () => {
    expect(colorFamily('#1c1c1c')).toBe('negro'); expect(colorFamily('#f1f1ee')).toBe('blanco'); expect(colorFamily('#8a8a8a')).toBe('gris');
    expect(colorFamily('#d62f2f')).toBe('rojo'); expect(colorFamily('#f28a1d')).toBe('naranja'); expect(colorFamily('#f2d21d')).toBe('amarillo');
    expect(colorFamily('#2f9d4b')).toBe('verde'); expect(colorFamily('#2d6cdf')).toBe('azul'); expect(colorFamily('#7a4fc2')).toBe('morado');
    expect(colorFamily('#f08cb4')).toBe('rosa'); expect(colorFamily('#6b4326')).toBe('marron');
  });
  it('el nombre transparente manda sobre el tono y un hex inválido no clasifica', () => {
    expect(colorFamily('#cfe6ee', 'Transparente')).toBe('transparente'); expect(colorFamily('zzz')).toBeNull();
  });
  it('mide cercanía de color', () => { expect(hexDistance('#ff0000', '#ff0000')).toBe(0); expect(hexDistance('#ff0000', '#fe0000')).toBeLessThan(hexDistance('#ff0000', '#0000ff')); });
});

describe('filament-pick: nombres', () => {
  it('antepone el tipo solo si la línea no lo dice', () => {
    expect(lineTitle(LIST[1])).toBe('Bambu Lab · PLA Basic'); expect(lineTitle(LIST[4])).toBe('eSun · PLA Silk'); expect(lineTitle(LIST[0])).toBe('PLA');
    expect(pickerName(LIST[1])).toBe('Bambu Lab PLA Basic · Negro'); expect(pickerName(LIST[0])).toBe('PLA Genérico');
  });
});

describe('filament-pick: filtros', () => {
  it('busca por varias palabras sin acentos', () => { expect(filterMaterials(LIST, { q: 'bambu rojo' }).map((x) => x.id)).toEqual(['b']); expect(filterMaterials(LIST, { q: 'GENERICO' }).map((x) => x.id)).toEqual(['g-pla']); });
  it('filtra por tipo, tecnología, stock y familia', () => {
    expect(filterMaterials(LIST, { type: 'petg' }).map((x) => x.id)).toEqual(['c']);
    expect(filterMaterials(LIST, { tech: 'fdm', onlyStock: true }).map((x) => x.id)).toEqual(['a', 'c']);
    expect(filterMaterials(LIST, { family: 'rojo' }).map((x) => x.id)).toEqual(['b']);
  });
  it('ordena por tipo y tono de referencia y deja los genéricos al final', () => {
    const r = filterMaterials(LIST, { tech: 'fdm', hintType: 'PLA', hintHex: '#d00000' }).map((x) => x.id);
    expect(r[0]).toBe('b'); expect(r[r.length - 1]).toBe('g-pla'); expect(r.indexOf('c')).toBeGreaterThan(r.indexOf('a'));
  });
});

describe('filament-pick: grupos', () => {
  it('agrupa por marca y línea y deja los genéricos al final', () => {
    const g = groupMaterials(LIST.filter((x) => x.tech === 'fdm'), 'Genéricos');
    expect(g.map((x) => x.title)).toEqual(['Bambu Lab · PLA Basic', 'eSun · PETG', 'eSun · PLA Silk', 'Genéricos']);
    expect(g[0].items.map((x) => x.id)).toEqual(['a', 'b']);
  });
});
