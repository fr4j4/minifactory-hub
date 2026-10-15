import { describe, expect, it } from 'vitest';
import { modifiedKeys, normalizeValue, PARAMS, searchParams, validateValue, visibleAt } from '@/lib/slicer/schema';
import { SIMPLE_PARAMS } from '@/lib/slicer/params';

describe('esquema curado de parámetros (Estudio)', () => {
  it('no repite claves y todas tienen texto en español e inglés', () => {
    const seen = new Set(PARAMS.map((p) => `${p.type}:${p.key}`)); expect(seen.size).toBe(PARAMS.length);
    for (const p of PARAMS) { expect(p.es.label && p.es.tip && p.en.label && p.en.tip).toBeTruthy(); if (p.kind === 'select') expect(p.options?.length).toBeGreaterThan(1); }
  });
  it('cubre todos los parámetros del editor simple actual (una sola fuente de verdad)', () => {
    const have = new Set(PARAMS.map((p) => `${p.type}:${p.key}`));
    const need = (['process', 'filament'] as const).flatMap((t) => SIMPLE_PARAMS[t].map((p) => `${t}:${p.key}`));
    expect(need.filter((k) => !have.has(k))).toEqual([]);
  });
  it('los niveles se incluyen unos en otros', () => {
    expect(visibleAt('process', 'simple').length).toBeLessThan(visibleAt('process', 'advanced').length);
    expect(visibleAt('process', 'advanced').length).toBeLessThan(visibleAt('process', 'expert').length);
  });
  it('búsqueda difusa en ambos idiomas y sin tildes', () => {
    expect(searchParams('relleno', 'process')[0].key).toBe('sparse_infill_density');
    expect(searchParams('infill pattern', 'process')[0].key).toBe('sparse_infill_pattern');
    expect(searchParams('aceleracion', 'process').map((p) => p.key)).toContain('default_acceleration');
    expect(searchParams('zzzz', 'process')).toEqual([]);
  });
  it('detecta lo modificado respecto de la base, ignorando formato (coma, %)', () => {
    expect(modifiedKeys({ layer_height: '0.2', sparse_infill_density: '15%' }, { layer_height: '0,2', sparse_infill_density: '30%', wall_loops: '3' })).toEqual(['sparse_infill_density', 'wall_loops']);
  });
  it('valida rango, opciones y tipo', () => {
    expect(validateValue('process', 'layer_height', '2')).toMatchObject({ kind: 'range' });
    expect(validateValue('process', 'layer_height', '0,2')).toBeNull();
    expect(validateValue('process', 'wall_loops', '2.5')).toMatchObject({ kind: 'number' });
    expect(validateValue('process', 'sparse_infill_pattern', 'xyz')).toMatchObject({ kind: 'option' });
    expect(validateValue('process', 'clave_desconocida', 'x')).toBeNull();
    expect(normalizeValue('process', 'sparse_infill_density', '25')).toBe('25%'); expect(normalizeValue('process', 'layer_height', '0,16')).toBe('0.16');
  });
});
