import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildGcodePreview, gcodePreviewToBin } from '@/lib/gcode';

describe('vista previa de G-code v2 (MFG2)', () => {
  const p = buildGcodePreview(fs.readFileSync('samples/barquito-a1.gcode', 'utf8'));
  it('trae velocidad y ancho por segmento, y estadísticas', () => {
    expect(p.speeds.length).toBe(p.segments.length / 4); expect(p.widths.length).toBe(p.speeds.length);
    expect(p.stats.speed[0]).toBeGreaterThan(0); expect(p.stats.speed[1]).toBeGreaterThan(p.stats.speed[0]);
    expect(p.stats.width[0]).toBeGreaterThan(0.05); expect(p.stats.width[1]).toBeLessThan(1.5);
    expect(p.stats.layerTimeS.length).toBe(p.layers.length); expect(p.stats.layerTimeS.every((x) => x >= 0)).toBe(true);
    const total = p.stats.byType.reduce((a, x) => a + x.timeS, 0); expect(total).toBeGreaterThan(60); expect(total).toBeLessThan(3 * 3600); // la muestra imprime ≈ 32 min
  });
  it('el binario conserva la cabecera y los tres bloques en orden', () => {
    const b = gcodePreviewToBin(p); expect(b.subarray(0, 4).toString()).toBe('MFG2');
    const hl = b.readUInt32LE(4); const head = JSON.parse(b.subarray(8, 8 + hl).toString()); expect(head.segCount).toBe(p.segments.length / 4);
    expect(b.length).toBe(8 + hl + p.segments.byteLength + p.speeds.byteLength + p.widths.byteLength);
  });
});
