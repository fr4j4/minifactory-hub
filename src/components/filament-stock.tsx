import Link from 'next/link';
import { Badge, Card, Empty, Meter, StatusBadge } from './ui';
import { MaterialForm } from './inventory-bits';
import { RemoveButton } from './remove-button';
import { SpoolIcon } from './spool-icon';
import { getT } from '@/i18n/server';
import { cn, grams, money } from '@/lib/format';
import { needsHardenedNozzle } from '@/lib/catalog/map';
import type { materials as Mat, spools as Spool } from '@/db/schema';
import type { MaterialStock } from '@/lib/services/inventory';

type M = typeof Mat.$inferSelect; type Sp = typeof Spool.$inferSelect;
export type StockFilter = 'todos' | 'con' | 'bajo' | 'sin';

/** Stock de filamento y resina: un bloque por marca + línea, una ficha por color con su carrete dibujado y los carretes reales desplegables. */
export async function FilamentStock({ mats, stock, spools, costMap, canEdit, canBuy, canRemove, profiles, linkMap, lineSpecs, filter, replaceOptions }: {
  mats: M[]; stock: MaterialStock[]; spools: Sp[]; costMap: Map<string, number>; canEdit: boolean; canBuy: boolean; canRemove: boolean;
  profiles: Array<{ id: string; name: string }>; linkMap: Map<string, string>; lineSpecs: Map<string, any>; filter: StockFilter; replaceOptions: Array<{ id: string; label: string }>;
}) {
  const t = await getT();
  const st = new Map(stock.map((x) => [x.materialId, x]));
  const state = (m: M) => { const x = st.get(m.id); return !x || x.physicalG <= 0 ? 'sin' : x.low ? 'bajo' : 'ok'; };
  const shown = mats.filter((m) => filter === 'todos' || (filter === 'con' && state(m) !== 'sin') || (filter === 'bajo' && state(m) === 'bajo') || (filter === 'sin' && state(m) === 'sin'));
  const groups = new Map<string, { title: string; type: string; items: M[] }>();
  for (const m of shown) {
    const k = m.lineId ?? `${m.manufacturer ?? ''}|${m.line ?? ''}|${m.type}`;
    const title = [m.manufacturer, m.line].filter(Boolean).join(' ') || t('inventory.lineNone');
    if (!groups.has(k)) groups.set(k, { title, type: m.type, items: [] });
    groups.get(k)!.items.push(m);
  }
  const ordered = [...groups.values()].sort((a, b) => a.title.localeCompare(b.title));
  if (ordered.length === 0) return <Card><Empty title={t('common.noMatches')} action={<Link className="btn-ghost" href="/inventario">{t('common.clearFilters')}</Link>} /></Card>;
  return (
    <div className="space-y-4" data-testid="filament-stock">
      {ordered.map((g) => {
        const totalG = g.items.reduce((a, m) => a + (st.get(m.id)?.physicalG ?? 0), 0);
        return (
          <section key={g.title + g.type} className="card min-w-0" data-testid="stock-group">
            <header className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5 pb-2">
              <h2 className="font-display text-[15px] font-semibold tracking-[-.01em] flex items-center gap-2 min-w-0"><span className="h-3 w-[3px] rounded-full bg-[var(--accent)]" aria-hidden /><span className="truncate">{g.title}</span><Badge>{g.type}</Badge></h2>
              <span className="text-xs muted tabular">{t('buy.groupSummary', { colors: g.items.length, g: grams(totalG) })}</span>
            </header>
            <ul className="grid gap-2.5 p-3 pt-1 sm:grid-cols-2 xl:grid-cols-3">
              {g.items.map((m) => {
                const x = st.get(m.id); const sp = spools.filter((q) => q.materialId === m.id).sort((a, b) => a.code.localeCompare(b.code));
                const s = state(m); const pack = m.packG && m.packG > 0 ? m.packG : 1000;
                return (
                  <li key={m.id} data-testid="material-row" className={cn('rounded-xl border bg-[var(--card)] p-3 flex gap-3 min-w-0', s === 'bajo' ? 'border-amber-400/70' : s === 'sin' ? 'border-dashed border-[var(--line)]' : 'border-[var(--line)]')}>
                    <SpoolIcon hex={m.hex} label={m.tech === 'resina' ? 'RES' : m.type} fill={(x?.physicalG ?? 0) / Math.max(pack, x?.physicalG ?? 0, 1)} resin={m.tech === 'resina'} size={52} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0"><div className="font-medium truncate">{m.colorName}</div>
                          <div className="text-xs muted truncate">{m.tech === 'resina' ? t('inventory.resinLower') : m.type}{needsHardenedNozzle(m.traits) && <> · <span className="text-danger">{t('inventory.catAbrasiveBadge')}</span></>}{costMap.has(m.id) && <> · {money(costMap.get(m.id))}/kg</>}</div></div>
                        {s === 'sin' ? <Badge>{t('buy.noStock')}</Badge> : s === 'bajo' ? <Badge tone="red">{t('inventory.low')}</Badge> : null}
                      </div>
                      <div className="num text-sm mt-1.5">{grams(x?.physicalG ?? 0)} <span className="muted text-xs">· {t('buy.spoolsCount', { count: x?.spools ?? 0, n: x?.spools ?? 0 })}{(x?.reservedG ?? 0) > 0 && <> · {t('buy.reservedShort', { g: grams(x!.reservedG) })}</>}</span></div>
                      <div className="mt-1"><Meter value={x?.physicalG ?? 0} max={Math.max(m.stockMinG * 3, x?.physicalG ?? 0, 1)} tone={s === 'bajo' ? 'bad' : 'ok'} decorative /></div>
                      <div className="mt-1 text-[11px] muted">{t('buy.minShort', { g: grams(m.stockMinG) })}</div>
                      <div className="flex flex-wrap items-center gap-1 mt-2">
                        {canBuy && <Link className={cn('btn-sm', s === 'ok' ? 'btn-ghost' : 'btn-primary')} href={`/inventario/compras/nueva?material=${m.id}`} data-testid="buy-material">{t('buy.buyThis')}</Link>}
                        {canEdit && <MaterialForm m={{ ...m, filamentProfileId: linkMap.get(m.id) ?? null, lineSpecs: m.lineId ? lineSpecs.get(m.lineId) ?? null : null }} profiles={profiles} trigger={<button className="btn-ghost btn-sm">{t('common.edit')}</button>} />}
                        {canRemove && <RemoveButton kind="material" id={m.id} name={`${m.type} ${m.colorName}`} replaceOptions={replaceOptions.filter((o) => o.id !== m.id)} />}
                      </div>
                      {sp.length > 0 && (
                        <details className="mt-2 group">
                          <summary className="cursor-pointer text-xs text-[var(--accent-ink)] select-none list-none flex items-center gap-1 [&::-webkit-details-marker]:hidden"><span className="inline-block transition-transform group-open:rotate-90" aria-hidden>▸</span>{t('buy.showSpools', { n: sp.length })}</summary>
                          <ul className="mt-1.5 divide-y divide-[var(--line)] text-xs">
                            {sp.map((q) => (
                              <li key={q.id} className="py-1.5 flex items-center gap-2 justify-between" data-testid="spool-row">
                                <Link className="font-medium tabular hover:underline" href={`/inventario/bobinas/${q.id}`}>{q.code}</Link>
                                <span className="tabular muted">{grams(q.remainingG)} / {grams(q.initialG)}</span>
                                <span className="truncate muted max-w-[7rem]">{q.location}</span>
                                <StatusBadge status={q.status} />
                              </li>))}
                          </ul>
                        </details>)}
                    </div>
                  </li>);
              })}
            </ul>
          </section>);
      })}
    </div>
  );
}
