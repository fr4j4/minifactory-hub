import { describe, expect, it } from 'vitest';
import { parseColorList, suggestHex } from '@/lib/catalog/colors';
import { BRANDS, densityOf } from '@/lib/catalog/filaments';

describe('catálogo de colores y marcas (N4)', () => {
  it('sugiere hex por nombre en español e inglés, con o sin tildes', () => {
    expect(suggestHex('Negro')).toBe(suggestHex('black')); expect(suggestHex('Marrón')).toBe(suggestHex('cafe'));
    expect(suggestHex('rojo brillante')).toBe(suggestHex('rojo')); expect(suggestHex('azul cielo')).not.toBe(suggestHex('azul')); expect(suggestHex('xyz')).toBeNull();
  });
  it('separa una lista pegada y quita repetidos', () => {
    expect(parseColorList('Negro, Blanco;\nRojo\tnegro')).toEqual(['Negro', 'Blanco', 'Rojo']);
  });
  it('densidad por tipo y marcas de Chile en el catálogo', () => {
    expect(densityOf('petg')).toBe(1.27); expect(densityOf('XYZ')).toBe(1.24);
    for (const n of ['Cicla 3D', 'GST3D', 'Bambu Lab', 'Genérico']) expect(BRANDS.some((b) => b.name === n)).toBe(true);
  });
});
