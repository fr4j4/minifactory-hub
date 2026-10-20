'use client';
import { useState } from 'react';
import { removeSupplyRuleAction, saveSupplyRuleAction } from '@/actions/purchases';
import { useAction } from './client';
import { useT } from '@/i18n/client';
import { money } from '@/lib/format';

export interface RuleRow { itemId: string; name: string; unit: string; qty: number; unitCost: number }

/** «Cada pedido entregado gasta…»: embalaje e insumos que salen solos del inventario y entran al costo real del pedido. */
export function SupplyRules({ rules, items, canEdit, showCost }: { rules: RuleRow[]; items: Array<{ id: string; name: string; unit: string }>; canEdit: boolean; showCost: boolean }) {
  const t = useT(); const { run, pending } = useAction();
  const free = items.filter((i) => !rules.some((r) => r.itemId === i.id));
  const [itemId, setItemId] = useState(''); const [qty, setQty] = useState('1');
  return (
    <section className="card p-4 mt-4" data-testid="supply-rules">
      <h2 className="font-display text-[15px] font-semibold flex items-center gap-2"><span className="h-3 w-[3px] rounded-full bg-[var(--accent)]" aria-hidden />{t('buy.rulesTitle')}</h2>
      <p className="muted text-sm mt-1 mb-3 max-w-2xl">{t('buy.rulesHint')}</p>
      {rules.length === 0 ? <p className="text-sm muted mb-3">{t('buy.rulesEmpty')}</p> : (
        <ul className="divide-y divide-[var(--line)] mb-3">{rules.map((r) => (
          <li key={r.itemId} className="py-2 flex items-center justify-between gap-3 text-sm" data-testid="supply-rule">
            <span className="font-medium">{r.name}</span><span className="tabular muted">{r.qty} {r.unit}{showCost && <> · {money(Math.round(r.qty * r.unitCost))}</>}</span>
            {canEdit && <button className="btn-ghost btn-sm text-danger" disabled={pending} onClick={() => run(() => removeSupplyRuleAction(r.itemId))}>{t('buy.ruleRemove')}</button>}
          </li>))}</ul>)}
      {canEdit && free.length > 0 && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (!itemId) return; run(() => saveSupplyRuleAction({ itemId, qtyPerOrder: Number(qty) || 1 }), { ok: t('buy.ruleSaved'), onOk: () => { setItemId(''); setQty('1'); } }); }}>
          <label className="block"><span className="label">{t('buy.ruleItem')}</span><select className="input" value={itemId} onChange={(e) => setItemId(e.target.value)} data-testid="rule-item"><option value="">—</option>{free.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
          <label className="block"><span className="label">{t('buy.ruleQty')}</span><input type="number" min={0.01} step="any" className="input !w-24" value={qty} onChange={(e) => setQty(e.target.value)} data-testid="rule-qty" /></label>
          <button className="btn-primary" disabled={pending || !itemId} data-testid="rule-add">{t('buy.ruleAdd')}</button>
        </form>)}
    </section>
  );
}
