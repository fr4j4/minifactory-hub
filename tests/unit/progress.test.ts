import { describe, expect, it } from 'vitest';
import { parseProgressLine } from '@/lib/slicer/run';

describe('progreso de OrcaSlicer (--pipe)', () => {
  it('lee el porcentaje y la etapa', () => {
    expect(parseProgressLine('{"message":"Generating walls","plate_percent":15,"plate_index":0}')).toEqual({ pct: 15, message: 'Generating walls' });
    expect(parseProgressLine('{"percent":140,"message":"x"}')).toEqual({ pct: 100, message: 'x' });
  });
  it('ignora lo que no es progreso', () => { expect(parseProgressLine('')).toBeNull(); expect(parseProgressLine('hola')).toBeNull(); expect(parseProgressLine('{"a":1}')).toBeNull(); });
});
