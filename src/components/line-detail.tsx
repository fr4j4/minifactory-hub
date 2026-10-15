'use client';
import { useState } from 'react';
import { useT } from '@/i18n/client';
import { dur, grams, money, num, pct } from '@/lib/format';
import type { CostBreakdown } from '@/lib/pricing';

export interface LineDetailData {
  mode: string; gramsTotal: number; hoursTotal: number; qty: number; prepMinutes: number; postMinutes: number; postSupplies: number; shipping: number;
  color: string | null; material: string | null; machine: string | null; quality: string | null;
  origin: { grams?: string; hours?: string; file?: string; engine?: string; note?: string };
  breakdown: CostBreakdown | null; marginPct: number | null;
}
const PARTS: Array<[keyof CostBreakdown, 'common.material' | 'quotes.cMachine' | 'quotes.cEnergy' | 'quotes.cPrep' | 'quotes.cPost' | 'quotes.cRisk']> = [['material', 'common.material'], ['machine', 'quotes.cMachine'], ['energy', 'quotes.cEnergy'], ['prep', 'quotes.cPrep'], ['post', 'quotes.cPost'], ['failure', 'quotes.cRisk']];
const TONES = ['bg-orange-500', 'bg-sky-500', 'bg-yellow-500', 'bg-violet-500', 'bg-emerald-500', 'bg-rose-500'];

/** «Ver detalles» de una línea del presupuesto: de dónde salen el tiempo y los gramos, con qué material/máquina/calidad y, con permiso de costos, el desglose. */
export function LineDetail({ item }: { item: LineDetailData }) {
  const t = useT(); const [open, setOpen] = useState(false); const bd = item.breakdown;
  const total = bd ? PARTS.reduce((a, [k]) => a + (Number(bd[k]) || 0), 0) : 0;
  return (
    <div className="mt-1.5">
      <button type="button" className="text-xs underline underline-offset-2" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="line-detail-toggle">{open ? t('quotes.hideDetails') : t('quotes.viewDetails')}</button>
      {open && (
        <div className="mt-2 rounded-xl border border-[var(--line)] p-3 text-xs space-y-2" data-testid="line-detail">
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
            {item.material && <div><dt className="muted">{t('common.material')}</dt><dd>{item.material}{item.color ? ` · ${item.color}` : ''}</dd></div>}
            {item.machine && <div><dt className="muted">{t('common.machine')}</dt><dd>{item.machine}</dd></div>}
            {item.quality && <div><dt className="muted">{t('quotes.cQuality')}</dt><dd>{item.quality}</dd></div>}
            <div><dt className="muted">{t('common.time')}</dt><dd>{dur(item.hoursTotal * 3600)} <span className="muted">· {t(`calculator.origin.${item.origin.hours ?? 'manual'}` as 'calculator.origin.manual')}</span></dd></div>
            <div><dt className="muted">{t('common.material')} (g)</dt><dd>{grams(item.gramsTotal)} <span className="muted">· {t(`calculator.origin.${item.origin.grams ?? 'manual'}` as 'calculator.origin.manual')}</span></dd></div>
            {item.origin.engine && <div><dt className="muted">{t('quotes.cEngine')}</dt><dd>{item.origin.engine}</dd></div>}
            {item.origin.file && <div><dt className="muted">{t('quotes.cFile')}</dt><dd>{item.origin.file}</dd></div>}
            {(item.postMinutes > 0 || item.postSupplies > 0) && <div><dt className="muted">{t('quotes.cPost')}</dt><dd>{item.postMinutes} min · {money(item.postSupplies)}</dd></div>}
            {item.shipping > 0 && <div><dt className="muted">{t('quotes.cShipping')}</dt><dd>{money(item.shipping)}</dd></div>}
          </dl>
          {bd && total > 0 && (
            <div>
              <div className="flex h-2.5 rounded-full overflow-hidden" role="img" aria-label={t('quotes.cBreakdown')}>{PARTS.map(([k], i) => Number(bd[k]) > 0 ? <span key={k} className={TONES[i]} style={{ width: `${(Number(bd[k]) / total) * 100}%` }} /> : null)}</div>
              <ul className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">{PARTS.map(([k, label], i) => Number(bd[k]) > 0 && <li key={k} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${TONES[i]}`} aria-hidden />{t(label)} <b className="ml-auto tabular">{money(Number(bd[k]))}</b></li>)}</ul>
              <div className="flex justify-between border-t border-[var(--line)] mt-2 pt-1.5 font-medium"><span>{t('common.cost')}</span><span className="tabular">{money(bd.cost)}</span></div>
              <div className="flex justify-between muted"><span>{t('common.margin')}</span><span className="tabular">{item.marginPct != null ? pct(item.marginPct, 0) : num(bd.marginPct, 0) + '%'}</span></div>
            </div>)}
        </div>)}
    </div>
  );
}
