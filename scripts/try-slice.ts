import { eq } from 'drizzle-orm';
import { getDb, s } from '../src/db';
import { enqueueSlice, waitForRuns } from '../src/lib/slicer/queue';

async function main() {
  const db = await getDb();
  const [mf] = await db.select().from(s.modelFiles).where(eq(s.modelFiles.name, 'Barquito decorativo'));
  const profs = await db.select().from(s.slicerProfiles);
  const P = (n: string) => profs.find((p) => p.name === n)!.id;
  const combos: Array<[string, string, string, string, number]> = [
    ['A1 estándar', 'Bambu Lab A1 0.4', 'A1 · 0,20 Standard', 'PLA Basic', 1],
    ['A1 fino', 'Bambu Lab A1 0.4', 'A1 · 0,12 Fine', 'PLA Basic', 1],
    ['A1 borrador', 'Bambu Lab A1 0.4', 'A1 · 0,28 Extra Draft', 'PLA Basic', 1],
    ['A1 relleno 40', 'Bambu Lab A1 0.4', 'A1 · 0,20 relleno 40% giroide', 'PLA Basic', 1],
    ['A1 lenta', 'Bambu Lab A1 0.4', 'A1 lenta (piezas técnicas)', 'PETG lento piezas técnicas', 1],
    ['Ender', 'Ender-3 V3 SE 0.4', 'Ender · 0,20 Standard', 'PLA genérico Ender', 1],
    ['MK4S', 'Prusa MK4S 0.4 (simulada)', 'MK4S · 0,20 SPEED', 'PLA Basic', 1],
    ['A1 ×4', 'Bambu Lab A1 0.4', 'A1 · 0,20 Standard', 'PLA Basic', 4],
  ];
  const t0 = Date.now();
  const ids: string[] = [];
  for (const [label, m, p, f, copies] of combos) ids.push(await enqueueSlice({ fileVersionId: mf.currentVersionId!, machineProfileId: P(m), processProfileId: P(p), filamentProfileId: P(f), copies, label }));
  const rows = await waitForRuns(ids, 180000);
  console.log('total ms', Date.now() - t0);
  for (const r of rows) console.log(r.label?.padEnd(16), r.status, r.error ?? '', r.timeS ? `${Math.floor(r.timeS / 3600)}:${String(Math.floor((r.timeS % 3600) / 60)).padStart(2, '0')}` : '', JSON.stringify(r.filament), 'capas', r.layers, 'placas', r.plates, 'ms', r.durationMs);
  // caché: repetir debe ser instantáneo
  const t1 = Date.now();
  const again = await enqueueSlice({ fileVersionId: mf.currentVersionId!, machineProfileId: P('Bambu Lab A1 0.4'), processProfileId: P('A1 · 0,20 Standard'), filamentProfileId: P('PLA Basic'), label: 'caché' });
  const [c] = await waitForRuns([again]);
  console.log('caché', c.status, 'ms', Date.now() - t1, JSON.stringify(c.result));
  // pieza que no cabe
  const [big] = await db.select().from(s.modelFiles).where(eq(s.modelFiles.name, 'Placa grande 300 mm'));
  const bid = await enqueueSlice({ fileVersionId: big.currentVersionId!, machineProfileId: P('Ender-3 V3 SE 0.4'), processProfileId: P('Ender · 0,20 Standard'), filamentProfileId: P('PLA genérico Ender'), label: 'grande' });
  const [b] = await waitForRuns([bid]);
  console.log('grande', b.status, b.error);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
