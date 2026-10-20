import { describe, expect, it } from 'vitest';
import { repairMesh } from '@/lib/mesh/repair';
import { analyze } from '@/lib/mesh/ops';
import type { Mesh } from '@/lib/mesh/parse';

/** Cubo de 10 mm como 12 triángulos, bien orientado. */
function cube(): number[][][] {
  const v = [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0], [0, 0, 10], [10, 0, 10], [10, 10, 10], [0, 10, 10]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return f.map((t) => t.map((i) => v[i]));
}
const mesh = (tris: number[][][]): Mesh => ({ positions: Float32Array.from(tris.flat(2)) });

describe('reparación de malla', () => {
  it('un cubo sano queda igual de cerrado y con 12 triángulos', () => {
    const r = repairMesh(mesh(cube())); expect(r.report.closedAfter).toBe(true); expect(r.report.trianglesAfter).toBe(12); expect(r.report.removed).toBe(0);
  });
  it('quita triángulos repetidos y degenerados', () => {
    const t = cube(); const r = repairMesh(mesh([...t, t[0], [[0, 0, 0], [0, 0, 0], [5, 5, 5]]]));
    expect(r.report.removed).toBe(2); expect(r.report.closedAfter).toBe(true);
  });
  it('da vuelta los triángulos mal orientados', () => {
    const t = cube(); t[3] = [t[3][0], t[3][2], t[3][1]]; t[8] = [t[8][0], t[8][2], t[8][1]];
    expect(analyze(mesh(t)).closed && analyze(mesh(t)).nonManifoldEdges === 0).toBe(false);
    const r = repairMesh(mesh(t)); expect(r.report.flipped).toBeGreaterThanOrEqual(1); expect(r.report.closedAfter).toBe(true);
  });
  it('tapa un hueco pequeño (falta una cara)', () => {
    const t = cube().filter((_, i) => i !== 0 && i !== 1); // sin la base
    const r = repairMesh(mesh(t)); expect(r.report.closedBefore).toBe(false); expect(r.report.holesFilled).toBe(1); expect(r.report.closedAfter).toBe(true);
  });
  it('un cubo con las normales hacia adentro se invierte entero', () => {
    const t = cube().map(([a, b, c]) => [a, c, b]); const r = repairMesh(mesh(t));
    expect(r.report.invertedAll || r.report.flipped === 0).toBe(true); expect(analyze(r.mesh).invertedNormals).toBe(false); expect(r.report.closedAfter).toBe(true);
  });
});
