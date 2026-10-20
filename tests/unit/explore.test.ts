import { describe, expect, it } from 'vitest';
import { bestOf, grid, paretoFront, sweep } from '@/lib/slicer/explore';

describe('exploración de perfiles (5.4)', () => {
  it('barrido y rejilla: sin repetidos y con tope', () => {
    expect(sweep('layer_height', ['0.12', '0.2', ' 0.2 ', ''])).toHaveLength(2);
    const g = grid({ key: 'wall_loops', values: ['2', '3', '4'] }, { key: 'sparse_infill_density', values: ['10%', '20%', '30%', '40%', '50%'] }, 12);
    expect(g).toHaveLength(12); expect(g[0].overrides).toEqual({ wall_loops: '2', sparse_infill_density: '10%' });
  });
  const pts = [{ id: 'a', timeS: 100, grams: 10 }, { id: 'b', timeS: 80, grams: 14 }, { id: 'c', timeS: 120, grams: 8 }, { id: 'd', timeS: 130, grams: 15 }, { id: 'e', timeS: 90, grams: 10.5 }];
  it('frontera de Pareto: descarta los dominados', () => {
    expect(paretoFront(pts).sort()).toEqual(['a', 'b', 'c', 'e']); // d lo dominan todos; e es más rápido que a aunque más pesado: ninguno domina al otro
  });
  it('mejor según criterio', () => {
    expect(bestOf(pts, 'fastest')).toBe('b'); expect(bestOf(pts, 'cheapest')).toBe('c');
    expect(bestOf(pts.map((p) => ({ ...p, price: p.id === 'a' ? 1 : 9 })), 'cheapest')).toBe('a');
    expect(['a', 'e']).toContain(bestOf(pts, 'balanced')); expect(bestOf([], 'fastest')).toBeNull();
  });
});
