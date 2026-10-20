'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addCatalogColorsAction } from '@/actions/purchases';
import { useAction } from './client';
import { SpoolIcon } from './spool-icon';
import { useT } from '@/i18n/client';
import { cn } from '@/lib/format';

export interface ColorOpt { id: string; name: string; hex: string; hexes: string[]; size: string | null; gtin: string | null; /** material propio si ya lo tengo */ materialId: string | null; stockG: number }

/** Colores de una línea del catálogo: marca los que usas y los agrega a «Mis filamentos» sin stock; los que ya tienes muestran cuánto hay. */
export function AddToMine({ filamentKey, material, colors, canAdd, highlight }: { filamentKey: string; material: string; colors: ColorOpt[]; canAdd: boolean; highlight?: string }) {
  const t = useT(); const router = useRouter(); const { run, pending } = useAction();
  const [sel, setSel] = useState<Set<string>>(() => new Set(highlight && colors.some((c) => c.id === highlight && !c.materialId) ? [highlight] : []));
  const free = useMemo(() => colors.filter((c) => !c.materialId), [colors]);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const add = (thenBuy: boolean) => run(() => addCatalogColorsAction(filamentKey, [...sel]), {
    ok: t('buy.addedToMine', { n: sel.size }), refresh: !thenBuy,
    onOk: (d) => { setSel(new Set()); if (thenBuy) router.push(`/inventario/compras/nueva?lines=${d.materialIds.map((id) => `material:${id}:1`).join(',')}`); },
  });
  return (
    <div>
      {canAdd && (
        <div className="flex flex-wrap items-center gap-2 mb-3" role="toolbar" aria-label={t('buy.addToMine')}>
          <button className="btn-ghost btn-sm" disabled={free.length === 0} onClick={() => setSel(new Set(free.map((c) => c.id)))}>{t('buy.selectAllFree', { n: free.length })}</button>
          {sel.size > 0 && <button className="btn-ghost btn-sm" onClick={() => setSel(new Set())}>{t('buy.clearSelection')}</button>}
          <span className="grow" />
          <button className="btn-ghost" disabled={pending || sel.size === 0} onClick={() => add(false)} data-testid="add-mine">{t('buy.addToMine')}{sel.size > 0 ? ` (${sel.size})` : ''}</button>
          <button className="btn-primary" disabled={pending || sel.size === 0} onClick={() => add(true)} data-testid="add-and-buy">{t('buy.addAndBuy')}</button>
        </div>)}
      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2" data-testid="lib-colors">
        {colors.map((c) => {
          const on = sel.has(c.id); const owned = !!c.materialId;
          const body = (<>
            <span className="relative shrink-0"><SpoolIcon hex={c.hex} label={material} size={44} className={cn(owned && c.stockG <= 0 && 'opacity-60')} />{c.hexes.length > 1 && <span className="absolute -right-1 -bottom-1 h-4 w-4 rounded-full border border-[var(--line)]" style={{ background: `linear-gradient(90deg, ${c.hexes.join(', ')})` }} aria-hidden />}</span>
            <span className="min-w-0 flex-1 text-left"><span className="block font-medium truncate">{c.name}</span><span className="block text-xs muted tabular truncate">{c.hexes.join(' · ')}{c.size ? ` · ${c.size}` : ''}{c.gtin ? ` · ${c.gtin}` : ''}</span></span>
            {owned ? <span className={cn('text-xs rounded-full px-2 py-0.5 border shrink-0', c.stockG > 0 ? 'border-emerald-500/50 text-emerald-700 dark:text-emerald-300' : 'border-[var(--line)] muted')}>{c.stockG > 0 ? t('buy.ownedWithStock', { kg: (c.stockG / 1000).toFixed(2) }) : t('buy.ownedNoStock')}</span> : on ? <span className="text-xs text-[var(--accent-ink)] shrink-0">✓</span> : null}
          </>);
          return (
            <li key={c.id} id={`c-${c.id}`}>
              {owned || !canAdd
                ? <div className={cn('card p-3 flex items-center gap-3', highlight === c.id && 'ring-2 ring-[var(--accent)]')}>{body}</div>
                : <button type="button" onClick={() => toggle(c.id)} aria-pressed={on} className={cn('card p-3 flex items-center gap-3 w-full transition-colors', on && 'ring-2 ring-[var(--accent)] bg-[var(--accent-soft)]', highlight === c.id && !on && 'ring-1 ring-[var(--accent)]')} data-testid="color-pick">{body}</button>}
              {owned && canAdd && <a className="text-xs underline underline-offset-2 muted ml-1" href={`/inventario/compras/nueva?material=${c.materialId}`}>{t('buy.buyThis')}</a>}
            </li>);
        })}
      </ul>
    </div>
  );
}
