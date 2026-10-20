'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { applyCatalogFillAction } from '@/actions/inventory';
import { useT } from '@/i18n/client';
import { useToast } from './client';
import type { CatalogMatch } from '@/lib/catalog/match';

type Item = CatalogMatch & { label: string };
const keyOf = (m: Item) => m.materialId;

/** Vista previa de lo que se completaría en materiales existentes; se aplican solo los marcados. */
export function CatalogFill({ matches }: { matches: Item[] }) {
  const t = useT(); const toast = useToast(); const [pending, start] = useTransition();
  const [ticked, setTicked] = useState<Set<string>>(new Set(matches.filter((m) => m.confidence === 'alta').map(keyOf)));
  const [done, setDone] = useState<{ updated: number; skipped: number } | null>(null);
  const toggle = (k: string) => setTicked((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const apply = () => start(async () => {
    const r = await applyCatalogFillAction(matches.filter((m) => ticked.has(keyOf(m))).map((m) => ({ materialId: m.materialId, filamentKey: m.filamentKey, variantId: m.variantId })));
    if (!r.ok) toast.push(r.error, 'err'); else setDone(r.data as { updated: number; skipped: number });
  });
  if (done) return <div className="card p-5" role="status" data-testid="fill-done"><p className="mb-3">{t('inventory.catFillDone', done)}</p><Link className="btn-primary" href="/inventario">{t('inventory.catFillBack')}</Link></div>;
  if (!matches.length) return <div className="card p-5 muted" data-testid="fill-empty">{t('inventory.catFillNone')}</div>;
  const show = (m: Item) => Object.entries(m.fill).map(([k, v]) => `${t(`inventory.catField_${k}` as 'inventory.catField_gtin')}${typeof v === 'string' || typeof v === 'number' ? `: ${v}` : ''}`).join(' · ');
  return (
    <div className="space-y-4" data-testid="catalog-fill">
      <div className="flex gap-2"><button type="button" className="btn-ghost btn-sm" onClick={() => setTicked(new Set(matches.map(keyOf)))}>{t('inventory.catFillSelectAll')}</button><button type="button" className="btn-ghost btn-sm" onClick={() => setTicked(new Set())}>{t('inventory.catSelectNone')}</button></div>
      <div className="card overflow-x-auto" tabIndex={0}><table className="w-full"><thead><tr><th className="th" /><th className="th">{t('inventory.catFillMaterial')}</th><th className="th">{t('inventory.catFillMatch')}</th><th className="th">{t('inventory.catFillWill')}</th></tr></thead>
        <tbody>{matches.map((m) => (
          <tr key={keyOf(m)} data-testid="fill-row"><td className="td"><input type="checkbox" checked={ticked.has(keyOf(m))} onChange={() => toggle(keyOf(m))} aria-label={m.label} /></td>
            <td className="td font-medium">{m.label}</td>
            <td className="td">{m.brandName} · {m.filamentName}{m.variantName ? ` · ${m.variantName}` : ''} <span className="badge border-[var(--line)] ml-1">{t(m.confidence === 'alta' ? 'inventory.catFillHigh' : 'inventory.catFillMedium')}</span></td>
            <td className="td text-xs">{show(m)}</td></tr>))}</tbody></table></div>
      <div className="flex justify-end"><button type="button" className="btn-primary" disabled={pending || !ticked.size} onClick={apply} data-testid="fill-apply">{t('inventory.catFillApply', { n: ticked.size })}</button></div>
    </div>
  );
}
