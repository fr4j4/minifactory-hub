import { describe, expect, it } from 'vitest';
import { geometryTags, mergeSuggestions, normalizeTag, ruleCandidates, tokensFromName } from '@/lib/library/tags';

describe('etiquetas de la biblioteca (N2)', () => {
  it('normaliza: minúsculas, sin tildes, singular simple', () => {
    expect(normalizeTag('  Llaveros ')).toBe('llavero'); expect(normalizeTag('Corazón')).toBe('corazon'); expect(normalizeTag('Lápices!')).toBe('lapiz');
    expect(normalizeTag('Soportes')).toBe('soporte'); expect(normalizeTag('gas')).toBe('gas'); expect(normalizeTag('Pro-Tools')).toBe('pro-tool');
  });
  it('saca palabras útiles del nombre de archivo', () => {
    expect(tokensFromName('llavero_corazon-v2_final.stl')).toEqual(['llavero', 'corazon']);
    expect(tokensFromName('SoporteCelular 3mm.3mf')).toEqual(['Soporte', 'Celular']);
  });
  it('etiquetas por forma', () => {
    expect(geometryTags({ dimX: 80, dimY: 40, dimZ: 2 }).map((t) => t.name)).toContain('plano');
    expect(geometryTags({ dimX: 10, dimY: 10, dimZ: 60 }).map((t) => t.name)).toEqual(expect.arrayContaining(['alto']));
    expect(geometryTags({ dimX: 200, dimY: 20, dimZ: 20 }).map((t) => t.name)).toContain('grande');
    expect(geometryTags({})).toEqual([]);
  });
  it('fusiona: prefiere el vocabulario, quita repetidas y ya puestas, limita a 8', () => {
    const c = ruleCandidates({ name: 'Llaveros_corazon_grande.stl', sourceTags: ['Regalo', 'amor'], origin: 'https://makerworld.com/es/models/123', geom: { dimX: 40, dimY: 40, dimZ: 3 } });
    const m = mergeSuggestions(c, { vocabulary: ['llavero', 'Regalo'], existing: ['amor'] });
    const names = m.map((x) => x.name);
    expect(names).toContain('llavero'); expect(names).toContain('Regalo'); expect(names).not.toContain('amor'); expect(names).not.toContain('llaveros');
    expect(new Set(names).size).toBe(names.length); expect(names.length).toBeLessThanOrEqual(8);
    expect(m[0].confidence).toBeGreaterThanOrEqual(m[m.length - 1].confidence);
  });
  it('descarta términos prohibidos y de relleno', () => {
    expect(mergeSuggestions([{ name: 'NSFW', confidence: 1, source: 'ia' }, { name: 'final', confidence: 1, source: 'regla' }, { name: 'a', confidence: 1, source: 'regla' }])).toEqual([]);
  });
});
