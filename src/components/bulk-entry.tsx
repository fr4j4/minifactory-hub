'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { applyBulkAction, previewBulkAction } from '@/actions/inventory';
import { useT } from '@/i18n/client';
import { useToast } from './client';
import { BASIC_COLORS, BRANDS, densityOf } from '@/lib/catalog/filaments';
import { parseColorList, suggestHex } from '@/lib/catalog/colors';

interface Row { colorName: string; hex: string; spools: number; lot: string }
const mkRow = (colorName = ''): Row => ({ colorName, hex: suggestHex(colorName) ?? '#888888', spools: 1, lot: '' });

/** Alta rápida de filamentos (N4): datos comunes una vez, tabla de colores, vista previa con duplicados y confirmación. */
export function BulkEntry() {
  const t = useT(); const toast = useToast(); const [pending, start] = useTransition();
  const [c, setC] = useState({ manufacturer: '', line: '', type: 'PLA', diameter: 1.75, density: 1.24, costPerKg: 15000, netG: 1000, tareG: 200, supplierText: '' });
  const [rows, setRows] = useState<Row[]>([mkRow('Negro'), mkRow('Blanco')]); const [paste, setPaste] = useState('');
  const [plan, setPlan] = useState<{ items: Array<{ colorName: string; status: 'new' | 'exists' | 'repeat' }>; newMaterials: number; spools: number } | null>(null);
  const [done, setDone] = useState<{ created: number; spools: number } | null>(null);
  const brand = BRANDS.find((b) => b.name.toLowerCase() === c.manufacturer.trim().toLowerCase());
  const setCommon = (p: Partial<typeof c>) => { setC((o) => ({ ...o, ...p })); setPlan(null); };
  const pickLine = (line: string) => { const l = brand?.lines.find((x) => x.line === line); setCommon(l ? { line, type: l.type, density: l.density ?? densityOf(l.type) } : { line }); };
  const addNames = (names: string[]) => { setRows((r) => [...r, ...names.filter((n) => !r.some((x) => x.colorName.toLowerCase() === n.toLowerCase())).map(mkRow)]); setPlan(null); };
  const upd = (i: number, p: Partial<Row>) => { setRows((r) => r.map((x, k) => (k === i ? { ...x, ...p } : x))); setPlan(null); };
  const payload = () => ({ ...c, rows: rows.filter((r) => r.colorName.trim()).map((r) => ({ colorName: r.colorName, hex: r.hex, spools: r.spools, lot: r.lot || undefined })) });
  const preview = () => start(async () => { const p = payload(); const r = await previewBulkAction(c, p.rows); if (!r.ok) toast.push(r.error, 'err'); else setPlan(r.data as any); });
  const apply = () => start(async () => { const p = payload(); const r = await applyBulkAction(c, p.rows); if (!r.ok) toast.push(r.error, 'err'); else setDone(r.data); });
  const num = (k: keyof typeof c) => (e: React.ChangeEvent<HTMLInputElement>) => setCommon({ [k]: e.target.value === '' ? 0 : Number(e.target.value) } as any);
  if (done) return <div className="card p-5" role="status" data-testid="bulk-done"><p className="mb-3">{t('inventory.bulkDone', { created: done.created, spools: done.spools })}</p><Link className="btn-primary" href="/inventario">{t('inventory.bulkGoInventory')}</Link></div>;
  return (
    <div className="space-y-5" data-testid="bulk-entry">
      <section className="card p-4">
        <h2 className="text-sm font-semibold mb-3">{t('inventory.bulkCommon')}</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="block"><span className="label">{t('inventory.bulkBrand')}</span><input className="input" list="bulk-brands" value={c.manufacturer} onChange={(e) => setCommon({ manufacturer: e.target.value })} data-testid="bulk-brand" /><datalist id="bulk-brands">{BRANDS.map((b) => <option key={b.id} value={b.name} />)}</datalist></label>
          <label className="block"><span className="label">{t('inventory.bulkLine')}</span><input className="input" list="bulk-lines" value={c.line} onChange={(e) => pickLine(e.target.value)} data-testid="bulk-line" /><datalist id="bulk-lines">{(brand?.lines ?? []).map((l) => <option key={l.line} value={l.line} />)}</datalist></label>
          <label className="block"><span className="label">{t('inventory.bulkType')}</span><input className="input" value={c.type} onChange={(e) => setCommon({ type: e.target.value, density: densityOf(e.target.value) })} data-testid="bulk-type" /></label>
          <label className="block"><span className="label">{t('inventory.bulkCost')}</span><input type="number" min={0} className="input" value={c.costPerKg} onChange={num('costPerKg')} data-testid="bulk-cost" /></label>
          <label className="block"><span className="label">{t('inventory.bulkNet')}</span><input type="number" min={1} className="input" value={c.netG} onChange={num('netG')} /></label>
          <label className="block"><span className="label">{t('inventory.bulkTare')}</span><input type="number" min={0} className="input" value={c.tareG} onChange={num('tareG')} /></label>
          <label className="block"><span className="label">{t('inventory.bulkDiameter')}</span><input type="number" step="0.01" className="input" value={c.diameter} onChange={num('diameter')} /></label>
          <label className="block"><span className="label">{t('inventory.bulkDensity')}</span><input type="number" step="0.01" className="input" value={c.density} onChange={num('density')} /></label>
          <label className="block"><span className="label">{t('inventory.bulkSupplier')}</span><input className="input" value={c.supplierText} onChange={(e) => setCommon({ supplierText: e.target.value })} /></label>
        </div>
        <p className="muted text-xs mt-2">{t('inventory.bulkCatalogHint')}</p>
      </section>
      <section className="card p-4">
        <h2 className="text-sm font-semibold mb-3">{t('inventory.bulkColors')}</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          <textarea className="input flex-1 min-w-[220px] !min-h-[44px]" rows={2} placeholder={t('inventory.bulkPaste')} value={paste} onChange={(e) => setPaste(e.target.value)} data-testid="bulk-paste" />
          <div className="flex flex-col gap-2"><button type="button" className="btn-ghost btn-sm" onClick={() => { addNames(parseColorList(paste)); setPaste(''); }} data-testid="bulk-add-list">{t('inventory.bulkAddFromList')}</button><button type="button" className="btn-ghost btn-sm" onClick={() => addNames(BASIC_COLORS)}>{t('inventory.bulkAddBasic')}</button></div>
        </div>
        <div className="overflow-x-auto"><table className="w-full"><thead><tr><th className="th">{t('inventory.bulkColor')}</th><th className="th">{t('inventory.bulkHex')}</th><th className="th">{t('inventory.bulkSpools')}</th><th className="th">{t('inventory.bulkLot')}</th><th className="th" /></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={i} data-testid="bulk-row"><td className="td"><input className="input" value={r.colorName} onChange={(e) => upd(i, { colorName: e.target.value, ...(suggestHex(e.target.value) ? { hex: suggestHex(e.target.value)! } : {}) })} aria-label={t('inventory.bulkColor')} /></td>
              <td className="td"><input type="color" className="h-10 w-14 rounded" value={r.hex} onChange={(e) => upd(i, { hex: e.target.value })} aria-label={t('inventory.bulkHex')} /></td>
              <td className="td"><input type="number" min={0} max={50} className="input w-24" value={r.spools} onChange={(e) => upd(i, { spools: Math.max(0, Number(e.target.value) || 0) })} aria-label={t('inventory.bulkSpools')} /></td>
              <td className="td"><input className="input" value={r.lot} onChange={(e) => upd(i, { lot: e.target.value })} aria-label={t('inventory.bulkLot')} /></td>
              <td className="td"><button type="button" className="btn-ghost btn-sm" onClick={() => { setRows(rows.filter((_, k) => k !== i)); setPlan(null); }}>{t('inventory.bulkRemove')}</button></td></tr>))}</tbody></table></div>
        <button type="button" className="btn-ghost btn-sm mt-3" onClick={() => { setRows([...rows, mkRow()]); setPlan(null); }}>{t('inventory.bulkAddRow')}</button>
      </section>
      {plan && <section className="card p-4" role="status" data-testid="bulk-plan">
        <p className="font-medium mb-2">{t('inventory.bulkSummary', { n: plan.newMaterials, spools: plan.spools })}</p>
        <ul className="text-sm flex flex-wrap gap-2">{plan.items.map((it, i) => <li key={i} className="badge border-[var(--line)]">{it.colorName} · {t(`inventory.bulk${it.status === 'new' ? 'New' : it.status === 'exists' ? 'Exists' : 'Repeat'}` as 'inventory.bulkNew')}</li>)}</ul>
      </section>}
      <div className="flex gap-2 justify-end"><button type="button" className="btn-ghost" disabled={pending} onClick={preview} data-testid="bulk-preview">{t('inventory.bulkPreview')}</button><button type="button" className="btn-primary" disabled={pending || !plan} onClick={apply} data-testid="bulk-apply">{t('inventory.bulkConfirm')}</button></div>
    </div>
  );
}
