'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CalcContext } from '@/lib/context';
import type { ModelBrief } from '@/actions/quotes';
import { saveQuoteAction } from '@/actions/quotes';
import { computeItem, LineEditor, newItem, type ItemState } from './line-editor';
import { CopyButton, useToast } from './client';
import { money } from '@/lib/format';
import { useT } from '@/i18n/client';

/** Calculadora rápida independiente: cotiza una consulta (ej. por WhatsApp) sin crear presupuesto. */
export function QuickCalc({ ctx, models, showCosts, canPrice, canCreate, whatsappTpl }: { ctx: CalcContext; models: ModelBrief[]; showCosts: boolean; canPrice: boolean; canCreate: boolean; whatsappTpl: string }) {
  const t = useT();
  const [it, setIt] = useState<ItemState>(() => newItem(ctx)); const router = useRouter(); const toast = useToast(); const [busy, setBusy] = useState(false);
  const c = useMemo(() => computeItem(it, ctx), [it, ctx]);
  const unit = it.finalUnit ?? c.suggestedUnit; const total = unit * Math.max(1, it.qty);
  const text = t(ctx.rates.taxMode === 'incluido' ? 'calculator.replyVat' : 'calculator.reply', { item: it.description || t('calculator.yourPart'), qty: it.qty, total: money(total) });
  const toQuote = async () => {
    setBusy(true);
    const r = await saveQuoteAction({ items: [{ kind: it.models.length ? 'modelo' : 'manual', description: it.description, qty: it.qty, materialId: it.materialId, color: it.color, machineId: it.machineId, processProfileId: it.processProfileId, mode: it.mode, gramsTotal: it.gramsTotal, hoursTotal: it.hoursTotal, origin: it.origin as any, postMinutes: it.postMinutes, postSupplies: it.postSupplies, prepMinutes: it.prepMinutes, shipping: it.shipping, finalUnit: it.finalUnit, sliceRunId: it.sliceRunId, models: it.models.map((m) => ({ modelFileId: m.modelFileId, fileVersionId: m.fileVersionId, qty: m.qty })) }] });
    setBusy(false); if (!r.ok) toast.push(r.error, 'err'); else router.push(`/presupuestos/${r.data}`);
  };
  return (
    <div className="space-y-4">
      <LineEditor it={{ ...it, open: true }} index={0} ctx={ctx} models={models} showCosts={showCosts} canPrice={canPrice} priceAdj={0} variantsById={{}} onChange={(p) => setIt((x) => ({ ...x, ...p }))} />
      <div className="card p-4 flex flex-wrap items-center gap-3" data-testid="quick-result">
        <div><div className="text-xs muted">{t('calculator.priceForTheCustomer')}</div><div className="text-3xl font-bold tabular" data-testid="quick-total">{money(total)}</div></div>
        <div className="ml-auto flex flex-wrap gap-2"><CopyButton text={text} label={t('calculator.copyReply')} className="btn-ghost" />{canCreate && <button className="btn-primary" onClick={toQuote} disabled={busy}>{t('calculator.convertToQuote')}</button>}</div>
      </div>
    </div>
  );
}
