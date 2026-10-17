'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CalcContext } from '@/lib/context';
import type { ModelBrief } from '@/actions/quotes';
import { saveQuoteAction } from '@/actions/quotes';
import { setCalcLevelAction } from '@/actions/settings';
import { computeItem, LineEditor, newItem, type ItemState } from './line-editor';
import { CopyButton, useToast } from './client';
import { money } from '@/lib/format';
import { useT } from '@/i18n/client';

/** Calculadora rápida independiente: cotiza una consulta (ej. por WhatsApp) sin crear presupuesto. */
export function QuickCalc({ ctx, models, showCosts, canPrice, canCreate, whatsappTpl, level: level0 = 'basico' }: { ctx: CalcContext; models: ModelBrief[]; showCosts: boolean; canPrice: boolean; canCreate: boolean; whatsappTpl: string; level?: 'basico' | 'avanzado' }) {
  const t = useT();
  const [level, setLevel] = useState(level0); const advanced = level === 'avanzado';
  const [items, setItems] = useState<ItemState[]>(() => [newItem(ctx)]); const router = useRouter(); const toast = useToast(); const [busy, setBusy] = useState(false);
  const cs = useMemo(() => items.map((x) => computeItem(x, ctx)), [items, ctx]);
  const totals = items.map((x, i) => (x.finalUnit ?? cs[i].suggestedUnit) * Math.max(1, x.qty));
  const total = totals.reduce((a, b) => a + b, 0);
  const text = items.length === 1
    ? t('calculator.reply', { item: items[0].description || t('calculator.yourPart'), qty: items[0].qty, total: money(total) })
    : t('calculator.replyMany', { list: items.map((x, i) => `${x.qty} × ${x.description || t('calculator.yourPart')} (${money(totals[i])})`).join(', '), total: money(total) });
  const toQuote = async () => {
    setBusy(true);
    const r = await saveQuoteAction({ items: items.map((x) => ({ kind: x.models.length ? 'modelo' : 'manual', description: x.description, qty: x.qty, materialId: x.materialId, color: x.color, machineId: x.machineId, processProfileId: x.processProfileId, mode: x.mode, gramsTotal: x.gramsTotal, hoursTotal: x.hoursTotal, origin: x.origin as any, postMinutes: x.postMinutes, postSupplies: x.postSupplies, prepMinutes: x.prepMinutes, shipping: x.shipping, finalUnit: x.finalUnit, sliceRunId: x.sliceRunId, models: x.models.map((m) => ({ modelFileId: m.modelFileId, fileVersionId: m.fileVersionId, qty: m.qty })) })) });
    // con éxito el botón sigue deshabilitado hasta que llega la página nueva (un segundo toque crearía otro presupuesto)
    if (!r.ok) { setBusy(false); toast.push(r.error, 'err'); } else router.push(`/presupuestos/${r.data.id}`);
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm" role="group" aria-label={t('calculator.level')}>
        <span className="muted">{t('calculator.level')}</span>
        {(['basico', 'avanzado'] as const).map((lv) => <button key={lv} className={level === lv ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'} aria-pressed={level === lv} data-testid={`calc-level-${lv}`} onClick={() => { setLevel(lv); void setCalcLevelAction(lv); }}>{t(lv === 'basico' ? 'calculator.levelBasic' : 'calculator.levelAdvanced')}</button>)}
      </div>
      {items.map((it, i) => (
        <div key={i} className="space-y-1" data-testid={`quick-piece-${i}`}>
          {items.length > 1 && <div className="flex items-center justify-between text-sm"><span className="font-medium">{t('calculator.piece', { n: i + 1 })}</span><button className="btn-ghost btn-sm" onClick={() => setItems((xs) => xs.filter((_, k) => k !== i))}>{t('quotes.remove')}</button></div>}
          <LineEditor it={{ ...it, open: true }} index={i} ctx={ctx} models={models} showCosts={showCosts && advanced} canPrice={canPrice && advanced} priceAdj={0} variantsById={{}} onChange={(p) => setItems((xs) => xs.map((x, k) => (k === i ? { ...x, ...p } : x)))} />
        </div>
      ))}
      <button className="btn-ghost" onClick={() => setItems((xs) => [...xs, newItem(ctx)])} data-testid="quick-add-piece">{t('calculator.addPiece')}</button>
      <div className="card p-4 flex flex-wrap items-center gap-3" data-testid="quick-result">
        <div><div className="text-xs muted">{t('calculator.priceForTheCustomer')}</div><div className="text-3xl font-bold tabular" data-testid="quick-total">{money(total)}</div></div>
        <div className="ml-auto flex flex-wrap gap-2"><CopyButton text={text} label={t('calculator.copyReply')} className="btn-ghost" />{canCreate && <button className="btn-primary" onClick={toQuote} disabled={busy}>{t('calculator.convertToQuote')}</button>}</div>
      </div>
    </div>
  );
}
