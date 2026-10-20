'use client';
import { useEffect, useState } from 'react';
import { Columns3, LayoutList, Table2 } from 'lucide-react';
import { useT } from '@/i18n/client';

const KEY = 'mf_quotes_view';
type View = 'list' | 'table' | 'kanban';
/** Alterna entre filas ricas y tabla; la elección se recuerda en este navegador (localStorage). Ambas vistas llegan renderizadas desde el servidor. */
export function QuoteViews({ list, table, kanban }: { list: React.ReactNode; table: React.ReactNode; kanban?: React.ReactNode }) {
  const t = useT(); const [view, setView] = useState<View>('list');
  useEffect(() => { try { const v = localStorage.getItem(KEY); if (v === 'list' || v === 'table' || (v === 'kanban' && kanban)) setView(v); } catch { /* sin almacenamiento: queda la lista */ } }, []);
  const pick = (v: View) => { setView(v); try { localStorage.setItem(KEY, v); } catch { /* ignorar */ } };
  const btn = (v: View, label: string, icon: React.ReactNode) => <button type="button" onClick={() => pick(v)} aria-pressed={view === v} data-testid={`view-${v}`} className={`btn-sm inline-flex items-center gap-1.5 rounded-lg px-2.5 border ${view === v ? 'bg-[var(--panel)] text-[var(--panel-ink)] border-transparent' : 'btn-ghost'}`}>{icon}{label}</button>;
  return (
    <div>
      <div className="hidden md:flex justify-end gap-1.5 mb-2" role="group" aria-label={t('quotes.viewMode')}>{btn('list', t('quotes.viewList'), <LayoutList className="h-4 w-4" aria-hidden />)}{btn('table', t('quotes.viewTable'), <Table2 className="h-4 w-4" aria-hidden />)}{kanban && btn('kanban', t('quotes.viewKanban'), <Columns3 className="h-4 w-4" aria-hidden />)}</div>
      {kanban && <div className={view === 'kanban' ? 'hidden md:block' : 'hidden'} data-testid="quotes-kanban-wrap">{kanban}</div>}
      <div className={view === 'table' ? 'hidden md:block' : 'hidden'} data-testid="quotes-table">{table}</div>
      <div className={view === 'list' ? '' : 'md:hidden'} data-testid="quotes-list">{list}</div>
    </div>
  );
}
