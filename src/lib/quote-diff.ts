/** Diferencias entre dos versiones de un presupuesto: líneas agregadas, quitadas y cambiadas, y el total. */
export interface DiffItem { description: string; qty: number; unit: number; grams: number; hours: number; materialId: string | null; /** colores adicionales resumidos («Blanco 20 %, Rojo»); null si no hay */ colors?: string | null }
export type LineChange = { field: 'qty' | 'unit' | 'grams' | 'hours' | 'materialId' | 'colors'; before: number | string | null; after: number | string | null };
export interface QuoteDiff {
  added: DiffItem[]; removed: DiffItem[]; changed: Array<{ description: string; changes: LineChange[] }>;
  totalBefore: number; totalAfter: number; delta: number;
}

const FIELDS: Array<[LineChange['field'], (i: DiffItem) => number | string | null]> = [['qty', (i) => i.qty], ['unit', (i) => i.unit], ['grams', (i) => Math.round(i.grams)], ['hours', (i) => Math.round(i.hours * 100) / 100], ['materialId', (i) => i.materialId], ['colors', (i) => i.colors ?? null]];

/** Las líneas se emparejan por descripción (varias con el mismo nombre se emparejan en orden). */
export function diffQuotes(a: { items: DiffItem[]; total: number }, b: { items: DiffItem[]; total: number }): QuoteDiff {
  const pool = new Map<string, DiffItem[]>();
  for (const i of a.items) pool.set(i.description, [...(pool.get(i.description) ?? []), i]);
  const added: DiffItem[] = []; const changed: QuoteDiff['changed'] = [];
  for (const after of b.items) {
    const list = pool.get(after.description); const before = list?.shift();
    if (!before) { added.push(after); continue; }
    const changes: LineChange[] = [];
    for (const [field, get] of FIELDS) { const x = get(before), y = get(after); if (x !== y) changes.push({ field, before: x, after: y }); }
    if (changes.length) changed.push({ description: after.description, changes });
  }
  const removed = [...pool.values()].flat();
  return { added, removed, changed, totalBefore: a.total, totalAfter: b.total, delta: b.total - a.total };
}
