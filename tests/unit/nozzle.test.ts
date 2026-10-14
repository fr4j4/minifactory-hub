import { describe, expect, it } from 'vitest';
import { COMMON_NOZZLES, layerChoices, layerRange, layersForThickness, lineWidth, loopsForThickness, normNozzle, nozzleFromName, parseNozzles, processWarnings, qualityTemplates, splitByNozzle, standardLayer, thicknessForLoops, wallThicknessOptions } from '@/lib/slicer/nozzle';
import { cleanChanges } from '@/lib/slicer/validate';

describe('boquillas', () => {
  it('normaliza coma decimal y sufijos', () => {
    expect(['0,4', '0.40', '0.4mm', '0.4 nozzle', ' 0,2 '].map(normNozzle)).toEqual(['0.4', '0.4', '0.4', '0.4', '0.2']);
    expect(['abc', '', '0', '5', '0.05'].map(normNozzle)).toEqual([null, null, null, null, null]);
    expect(normNozzle(1.2)).toBe('1.2'); expect(['1', '1,0', 2].map(normNozzle)).toEqual(['1.0', '1.0', '2.0']);
  });
  it('la lista escrita a mano no parte «0,4» en «0» y «4»', () => {
    expect(parseNozzles('0,4')).toEqual(['0.4']);
    expect(parseNozzles('0,2 0,4')).toEqual(['0.2', '0.4']);
    expect(parseNozzles('0.4, 0.2')).toEqual(['0.2', '0.4']);
    expect(parseNozzles('0.4,0.6;0.8')).toEqual(['0.4', '0.6', '0.8']);
    expect(parseNozzles('0.4 0.4 mm')).toEqual(['0.4']);
  });
  it('lee la boquilla del nombre de un perfil de fábrica', () => {
    expect(nozzleFromName('Bambu Lab A1 0.2 nozzle')).toBe('0.2');
    expect(nozzleFromName('0.20mm SPEED @MK4S 0.4')).toBe('0.4');
    expect(nozzleFromName('0.30mm Standard @BBL A1 0.6 nozzle')).toBe('0.6');
    expect(nozzleFromName('0.20mm Standard @BBL A1')).toBeNull();
  });
  it('trae las boquillas habituales', () => { expect([...COMMON_NOZZLES]).toEqual(['0.2', '0.4', '0.6', '0.8']); });
});

describe('medidas en múltiplos de la boquilla', () => {
  it('espesores de pared: con 0,4 son 0,8 · 1,2 · 1,6 · 2,0 · 2,4 mm = 2 a 6 paredes', () => {
    expect(wallThicknessOptions(0.4)).toEqual([{ mm: 0.8, loops: 2 }, { mm: 1.2, loops: 3 }, { mm: 1.6, loops: 4 }, { mm: 2, loops: 5 }, { mm: 2.4, loops: 6 }]);
    expect(loopsForThickness(1.2, 0.4)).toBe(3); expect(loopsForThickness(1.2, 0.6)).toBe(2); expect(loopsForThickness(0.8, 0.2)).toBe(4);
    expect(thicknessForLoops(3, 0.4)).toBe(1.26);
  });
  it('capas necesarias para un espesor, sin errores de coma flotante', () => {
    expect(layersForThickness(1.0, 0.2)).toBe(5); expect(layersForThickness(0.6, 0.2)).toBe(3); expect(layersForThickness(0.6, 0.3)).toBe(2); expect(layersForThickness(0.8, 0.12)).toBe(7);
  });
  it('ancho de línea y altura estándar siguen a los perfiles de fábrica', () => {
    expect([0.2, 0.4, 0.6, 0.8].map(lineWidth)).toEqual([0.22, 0.42, 0.62, 0.82]);
    expect([0.2, 0.4, 0.6, 0.8].map(standardLayer)).toEqual([0.1, 0.2, 0.3, 0.4]);
  });
  it('rango de capa: 20–70 % del diámetro, o el que declara la máquina', () => {
    expect(layerRange(0.4)).toEqual({ min: 0.08, max: 0.28 }); expect(layerRange(0.2)).toEqual({ min: 0.04, max: 0.14 });
    expect(layerRange(0.8, { min: 0.16, max: 0.56 })).toEqual({ min: 0.16, max: 0.56 });
    expect(layerChoices(0.4)).toEqual([0.1, 0.12, 0.16, 0.2, 0.24, 0.28]);
  });
});

describe('plantillas de calidad', () => {
  const layers = (n: number) => Object.fromEntries(qualityTemplates(n).map((t) => [t.key, t.layer]));
  it('mismas proporciones que Draft / Standard / Fine de Bambu en las cuatro boquillas', () => {
    expect(layers(0.2)).toMatchObject({ borrador: 0.12, estandar: 0.1, fino: 0.06 });
    expect(layers(0.4)).toMatchObject({ borrador: 0.24, estandar: 0.2, fino: 0.12 });
    expect(layers(0.6)).toMatchObject({ borrador: 0.36, estandar: 0.3, fino: 0.18 });
    expect(layers(0.8)).toMatchObject({ borrador: 0.48, estandar: 0.4, fino: 0.24 });
  });
  it('la Estándar 0,4 reproduce la de fábrica: 2 paredes, 5 capas arriba y 3 abajo, ancho 0,42', () => {
    const t = qualityTemplates(0.4).find((x) => x.key === 'estandar')!.changes;
    expect(t).toMatchObject({ layer_height: '0.2', initial_layer_print_height: '0.2', wall_loops: '2', top_shell_layers: '5', bottom_shell_layers: '3', line_width: '0.42', inner_wall_line_width: '0.45', sparse_infill_line_width: '0.45', initial_layer_line_width: '0.5', sparse_infill_density: '15%' });
  });
  it('con 0,2 usa 4 paredes (0,8 mm mínimo), como Bambu', () => { expect(qualityTemplates(0.2).find((x) => x.key === 'estandar')!.changes).toMatchObject({ wall_loops: '4', line_width: '0.22', initial_layer_line_width: '0.25' }); });
  it('Funcional: paredes de 1,2 mm (3 líneas) con 0,4; Resistente: 4 líneas y más relleno', () => {
    const f = qualityTemplates(0.4).find((x) => x.key === 'funcional')!; expect(f.changes.wall_loops).toBe('3');
    const r = qualityTemplates(0.4).find((x) => x.key === 'resistente')!; expect(r.changes).toMatchObject({ wall_loops: '4', sparse_infill_density: '30%' });
  });
  it('respeta los límites de capa de la máquina', () => {
    expect(qualityTemplates(0.8, { min: 0.16, max: 0.56 }).map((t) => t.layer)).toEqual([0.48, 0.4, 0.24, 0.4, 0.4]);
    expect(Math.min(...qualityTemplates(0.4, { min: 0.12, max: 0.28 }).map((t) => t.layer))).toBe(0.12);
  });
  it('funciona con boquillas gruesas (1,2) y finas (0,25)', () => {
    expect(qualityTemplates(1.2).find((x) => x.key === 'estandar')!.changes).toMatchObject({ layer_height: '0.6', line_width: '1.22', wall_loops: '2' });
    expect(qualityTemplates(0.25).find((x) => x.key === 'fino')!.layer).toBe(0.075);
  });
});

describe('avisos de combinación', () => {
  it('boquilla distinta y capa fuera de rango (claves de traducción con sus datos)', () => {
    expect(processWarnings({ machineNozzle: '0.2', processNozzle: '0.4' })).toEqual([{ key: 'nozzle.warnOtherNozzle', params: { process: '0.4', machine: '0.2' } }]);
    expect(processWarnings({ machineNozzle: '0.2', processNozzle: '0.2', layerHeight: 0.2 })[0]).toMatchObject({ key: 'nozzle.warnLayerHigh', params: { layer: '0.2', nozzle: '0.2', max: '0.14' } });
    expect(processWarnings({ machineNozzle: '0.4', processNozzle: '0.4', layerHeight: 0.2 })).toEqual([]);
    expect(processWarnings({ machineNozzle: '0.4', processNozzle: null, layerHeight: 0.02 })[0]).toMatchObject({ key: 'nozzle.warnLayerLow' });
  });
  it('separa las calidades de otra boquilla', () => {
    const r = splitByNozzle([{ nozzle: '0.2' }, { nozzle: '0.4' }, { nozzle: null }], '0.4'); expect(r.compatible).toHaveLength(2); expect(r.others).toEqual([{ nozzle: '0.2' }]);
    expect(splitByNozzle([{ nozzle: '0.2' }], null).others).toEqual([]);
  });
});

describe('limpieza de lo que se escribe en el editor', () => {
  it('acepta coma decimal, completa el % del relleno y descarta vacíos', () => {
    expect(cleanChanges('process', { layer_height: '0,2', sparse_infill_density: '25', wall_loops: '3', top_shell_layers: '' })).toEqual({ layer_height: '0.2', sparse_infill_density: '25%', wall_loops: '3' });
    expect(cleanChanges('filament', { nozzle_temperature: '245', filament_cost: '15990' })).toEqual({ nozzle_temperature: '245', filament_cost: '15990' });
  });
  it('rechaza texto, negativos y opciones inválidas', () => {
    expect(() => cleanChanges('process', { layer_height: 'fina' })).toThrow(/Altura de capa.*debe ser un número/);
    expect(() => cleanChanges('process', { wall_loops: '2.5' })).toThrow(/entero/);
    expect(() => cleanChanges('process', { wall_loops: '-1' })).toThrow(/negativo/);
    expect(() => cleanChanges('process', { sparse_infill_density: '150%' })).toThrow(/porcentaje/);
    expect(() => cleanChanges('process', { sparse_infill_pattern: 'zigzag' })).toThrow(/no es una opción/);
  });
  it('respeta valores en lista y claves desconocidas (importados)', () => {
    expect(cleanChanges('filament', { nozzle_temperature: ['250'], pressure_advance: ['0.04'], foo: 'bar' })).toEqual({ nozzle_temperature: ['250'], pressure_advance: ['0.04'], foo: 'bar' });
  });
});
