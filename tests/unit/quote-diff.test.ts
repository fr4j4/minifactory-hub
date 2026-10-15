import { describe, expect, it } from 'vitest';
import { diffQuotes, type DiffItem } from '@/lib/quote-diff';

const ln = (description: string, o: Partial<DiffItem> = {}): DiffItem => ({ description, qty: 1, unit: 1000, grams: 50, hours: 2, materialId: 'm1', ...o });

describe('diferencias entre versiones de un presupuesto', () => {
  it('detecta líneas agregadas, quitadas y cambiadas, y la diferencia del total', () => {
    const d = diffQuotes({ items: [ln('Barco'), ln('Llavero', { qty: 10 }), ln('Soporte')], total: 20000 }, { items: [ln('Barco', { unit: 1200 }), ln('Llavero', { qty: 12 }), ln('Tapa')], total: 25000 });
    expect(d.added.map((x) => x.description)).toEqual(['Tapa']); expect(d.removed.map((x) => x.description)).toEqual(['Soporte']);
    expect(d.changed.find((c) => c.description === 'Barco')!.changes).toEqual([{ field: 'unit', before: 1000, after: 1200 }]);
    expect(d.changed.find((c) => c.description === 'Llavero')!.changes[0]).toMatchObject({ field: 'qty', before: 10, after: 12 });
    expect(d.delta).toBe(5000);
  });
  it('sin cambios no marca nada', () => {
    const d = diffQuotes({ items: [ln('A')], total: 1 }, { items: [ln('A')], total: 1 });
    expect(d.added).toHaveLength(0); expect(d.removed).toHaveLength(0); expect(d.changed).toHaveLength(0); expect(d.delta).toBe(0);
  });
});
