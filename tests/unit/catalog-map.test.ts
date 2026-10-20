import { describe, expect, it } from 'vitest';
import { commonSizeOf, lineNameOf, needsHardenedNozzle, pickSize, specsOf, splitVariantKey, tempRange, variantKey } from '@/lib/catalog/map';
import type { CatalogFilament, CatalogSize, CatalogVariant } from '@/lib/catalog/ofd';

const size = (o: Partial<CatalogSize> = {}): CatalogSize => ({ weight: 1000, diameter: 1.75, gtin: null, articleNumber: null, emptySpoolWeight: null, refill: false, discontinued: false, links: [], ...o });
const variant = (sizes: CatalogSize[]): CatalogVariant => ({ id: 'v', name: 'V', hex: '#000000', hexes: ['#000000'], traits: [], discontinued: false, standards: {}, sizes });

describe('mapeo del catálogo al taller', () => {
  it('nombre de línea: antepone el material salvo que ya empiece con él', () => {
    expect(lineNameOf('PLA', 'Basic')).toBe('PLA Basic'); expect(lineNameOf('PETG', 'PETG HF')).toBe('PETG HF'); expect(lineNameOf('PC', 'pc fr')).toBe('pc fr');
  });
  it('rango de temperatura con raya larga, un solo extremo o vacío', () => {
    expect(tempRange(190, 230)).toBe('190–230'); expect(tempRange(200, 200)).toBe('200'); expect(tempRange(null, 250)).toBe('250'); expect(tempRange(null, null)).toBe(''); expect(tempRange(undefined, undefined)).toBe('');
  });
  it('elige el tamaño por peso y diámetro, ignorando recargas y descontinuados', () => {
    const a = size({ gtin: 'A', weight: 750 }); const b = size({ gtin: 'B' }); const c = size({ gtin: 'C', diameter: 2.85 }); const r = size({ gtin: 'R', refill: true });
    expect(pickSize([a, b, c, r], 1000, 1.75)?.gtin).toBe('B'); expect(pickSize([a, b, c], 1000, 2.85)?.gtin).toBe('C');
    expect(pickSize([a, r], 1000, 1.75)?.gtin).toBe('A'); expect(pickSize([], 1000, 1.75)).toBeNull();
  });
  it('tamaño más frecuente de una línea', () => {
    const vs = [variant([size({ emptySpoolWeight: 250 })]), variant([size({ emptySpoolWeight: 250 }), size({ weight: 250 })]), variant([size({ emptySpoolWeight: 230 })])];
    expect(commonSizeOf(vs)).toEqual({ netG: 1000, diameter: 1.75, tareG: 250 }); expect(commonSizeOf([])).toEqual({ netG: null, diameter: null, tareG: null });
  });
  it('clave de color ida y vuelta', () => {
    expect(splitVariantKey(variantKey('b/PLA/basic', 'rojo'))).toEqual({ filament: 'b/PLA/basic', variant: 'rojo' }); expect(splitVariantKey('b/PLA')).toBeNull();
  });
  it('avisa de boquilla endurecida solo con abrasivos o fibras', () => {
    expect(needsHardenedNozzle(['silk'])).toBe(false); expect(needsHardenedNozzle(['abrasive'])).toBe(true); expect(needsHardenedNozzle(['contains_carbon_fiber', 'matte'])).toBe(true); expect(needsHardenedNozzle(null)).toBe(false);
  });
  it('specsOf copia los datos del fabricante y deja constancia del origen', () => {
    const f = { tempMin: 200, tempMax: 230, bedMin: 50, bedMax: 60, dryMax: 55, chamber: null, shoreA: null, shoreD: null, datasheetUrl: 'https://x', slicers: { orcaslicer: 'P' }, traits: ['silk'] } as unknown as CatalogFilament;
    expect(specsOf(f)).toMatchObject({ tempMax: 230, dryMax: 55, slicers: { orcaslicer: 'P' }, source: 'open-filament-database' });
  });
});
