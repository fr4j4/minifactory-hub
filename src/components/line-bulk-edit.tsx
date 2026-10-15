'use client';
import { useState } from 'react';
import { bulkUpdateLineAction } from '@/actions/inventory';
import { Modal, useAction } from './client';
import { useT } from '@/i18n/client';

export interface LineRow { manufacturer: string | null; line: string | null; count: number; costPerKg: number | null; stockMinG: number | null }

/** Lista de líneas (marca + línea) con edición masiva de costo y stock mínimo. */
export function LineBulkEdit({ lines, showCost }: { lines: LineRow[]; showCost: boolean }) {
  const t = useT(); const { run, pending } = useAction();
  const [sel, setSel] = useState<LineRow | null>(null); const [cost, setCost] = useState(''); const [min, setMin] = useState('');
  const open = (l: LineRow) => { setSel(l); setCost(l.costPerKg != null ? String(l.costPerKg) : ''); setMin(l.stockMinG != null ? String(l.stockMinG) : ''); };
  return (
    <div data-testid="material-lines" className="mb-3">
      <ul className="flex flex-wrap gap-2">{lines.map((l) => (
        <li key={`${l.manufacturer}|${l.line}`}><button className="btn-ghost btn-sm" onClick={() => open(l)} data-testid="line-edit">{[l.manufacturer, l.line].filter(Boolean).join(' ') || t('inventory.lineNone')} <span className="muted">· {t('inventory.lineColors', { n: l.count })}</span></button></li>
      ))}</ul>
      <Modal open={!!sel} onClose={() => setSel(null)} title={t('inventory.lineEditTitle', { name: [sel?.manufacturer, sel?.line].filter(Boolean).join(' ') || t('inventory.lineNone') })}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!sel) return; run(() => bulkUpdateLineAction({ manufacturer: sel.manufacturer, line: sel.line }, { costPerKg: showCost && cost !== '' ? Number(cost) : undefined, stockMinG: min !== '' ? Number(min) : undefined }), { ok: t('inventory.lineSaved'), onOk: () => setSel(null) }); }}>
          <p className="muted text-sm">{t('inventory.lineEditHint', { n: sel?.count ?? 0 })}</p>
          {showCost && <label className="block"><span className="label">{t('inventory.lineCost')}</span><input type="number" min={0} className="input" value={cost} onChange={(e) => setCost(e.target.value)} data-testid="line-cost" /></label>}
          <label className="block"><span className="label">{t('inventory.lineStockMin')}</span><input type="number" min={0} className="input" value={min} onChange={(e) => setMin(e.target.value)} data-testid="line-min" /></label>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setSel(null)}>{t('common.cancel')}</button><button className="btn-primary" disabled={pending} data-testid="line-save">{t('common.save')}</button></div>
        </form>
      </Modal>
    </div>
  );
}
