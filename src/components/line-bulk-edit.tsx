'use client';
import { useState } from 'react';
import { updateLineAction } from '@/actions/inventory';
import { Modal, useAction } from './client';
import { useT } from '@/i18n/client';

export interface LineRow { id: string; manufacturer: string | null; name: string; count: number; costPerKg: number | null; stockMinG: number | null; filamentProfileId: string | null }

/** Líneas de filamento (marca + línea): edición masiva de costo y stock mínimo, y perfil de laminado compartido por sus colores. */
export function LineBulkEdit({ lines, showCost, profiles }: { lines: LineRow[]; showCost: boolean; profiles: Array<{ id: string; name: string }> }) {
  const t = useT(); const { run, pending } = useAction();
  const [sel, setSel] = useState<LineRow | null>(null); const [cost, setCost] = useState(''); const [min, setMin] = useState(''); const [prof, setProf] = useState('');
  const open = (l: LineRow) => { setSel(l); setCost(l.costPerKg != null ? String(l.costPerKg) : ''); setMin(l.stockMinG != null ? String(l.stockMinG) : ''); setProf(l.filamentProfileId ?? ''); };
  const title = (l: Pick<LineRow, 'manufacturer' | 'name'> | null) => [l?.manufacturer, l?.name].filter(Boolean).join(' ');
  return (
    <div data-testid="material-lines" className="mb-3">
      <ul className="flex flex-wrap gap-2 max-md:flex-nowrap max-md:overflow-x-auto max-md:-mx-3 max-md:px-3 [scrollbar-width:none] [&>li]:shrink-0">{lines.map((l) => (
        <li key={l.id}><button className="btn-ghost btn-sm whitespace-nowrap" onClick={() => open(l)} data-testid="line-edit">{title(l)} <span className="muted">· {t('inventory.lineColors', { count: l.count, n: l.count })}</span></button></li>
      ))}</ul>
      <Modal open={!!sel} onClose={() => setSel(null)} title={t('inventory.lineEditTitle', { name: title(sel) })}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!sel) return; run(() => updateLineAction(sel.id, { costPerKg: showCost && cost !== '' ? Number(cost) : undefined, stockMinG: min !== '' ? Number(min) : undefined, filamentProfileId: prof || null }), { ok: t('inventory.lineSaved'), onOk: () => setSel(null) }); }}>
          <p className="muted text-sm">{t('inventory.lineEditHint', { n: sel?.count ?? 0 })}</p>
          {showCost && <label className="block"><span className="label">{t('inventory.lineCost')}</span><input type="number" min={0} className="input" value={cost} onChange={(e) => setCost(e.target.value)} data-testid="line-cost" /></label>}
          <label className="block"><span className="label">{t('inventory.lineStockMin')}</span><input type="number" min={0} className="input" value={min} onChange={(e) => setMin(e.target.value)} data-testid="line-min" /></label>
          <label className="block"><span className="label">{t('inventory.lineProfile')}</span><select className="input" value={prof} onChange={(e) => setProf(e.target.value)} data-testid="line-profile"><option value="">{t('inventory.lineProfileAuto')}</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><span className="muted text-xs">{t('inventory.lineProfileHint')}</span></label>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setSel(null)}>{t('common.cancel')}</button><button className="btn-primary" disabled={pending} data-testid="line-save">{t('common.save')}</button></div>
        </form>
      </Modal>
    </div>
  );
}
