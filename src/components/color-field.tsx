'use client';
import { useMemo, useState } from 'react';
import { COLOR_FAMILIES, FAMILY_HEX, FAMILY_LABEL, colorChoices, type PickMaterial } from '@/lib/filament-pick';
import { suggestHex } from '@/lib/catalog/colors';
import { cn, grams } from '@/lib/format';
import { useT } from '@/i18n/client';

export interface ColorPatch { materialId?: string | null; color: string }

/**
 * Color pedido sin escribir: se elige entre lo que hay en stock del mismo tipo (cambia el material al de ese color),
 * una paleta de colores comunes o un nombre libre. Un color que no se tiene pasa al genérico del tipo, así el costo y
 * el material no contradicen el color pedido.
 */
export function ColorField({ materials, materialId, color, onPick, disabled, testId }: { materials: PickMaterial[]; materialId: string | null; color: string; onPick: (p: ColorPatch) => void; disabled?: boolean; testId?: string }) {
  const t = useT(); const [open, setOpen] = useState(false); const [custom, setCustom] = useState('');
  const cur = materials.find((m) => m.id === materialId);
  const { stock, generic } = useMemo(() => colorChoices(materials, materialId), [materials, materialId]);
  const hex = (stock.find((m) => m.colorName.toLowerCase() === color.trim().toLowerCase())?.hex) ?? (cur && !cur.generic && cur.colorName.toLowerCase() === color.trim().toLowerCase() ? cur.hex : null) ?? (color ? suggestHex(color) : null);
  const other = (name: string) => { onPick({ materialId: cur && !cur.generic && generic ? generic.id : undefined, color: name }); setOpen(false); setCustom(''); };
  return (
    <div className="relative" onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false); }}>
      <button type="button" disabled={disabled} className="input w-full text-left flex items-center gap-2 min-w-0" aria-expanded={open} onClick={() => setOpen(!open)} data-testid={testId}>
        {hex ? <span className="h-4 w-4 rounded-full border border-black/20 shrink-0" style={{ background: hex }} aria-hidden /> : <span className="h-4 w-4 rounded-full border border-dashed border-[var(--line)] shrink-0" aria-hidden />}
        <span className={cn('truncate flex-1', !color && 'muted')}>{color || t('picker.colorAny')}</span><span aria-hidden className="muted shrink-0">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 left-0 top-full mt-1.5 w-[min(22rem,88vw)] card p-3 space-y-3 shadow-lg" data-testid={testId ? `${testId}-panel` : undefined}>
          <section><h4 className="eyebrow mb-1.5">{t('picker.colorFromStock')}</h4>
            {stock.length === 0 ? <p className="muted text-xs">{t('picker.colorNoStock')}</p> : <div className="flex flex-wrap gap-1.5">{stock.map((m) => (
              <button key={m.id} type="button" onClick={() => { onPick({ materialId: m.id, color: m.colorName }); setOpen(false); }} aria-pressed={m.id === materialId} data-testid="color-stock"
                className={cn('flex items-center gap-1.5 rounded-full border px-2.5 min-h-[32px] text-xs hover:bg-slate-100 dark:hover:bg-slate-800', m.id === materialId ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--line)]')}>
                <span className="h-3.5 w-3.5 rounded-full border border-black/20" style={{ background: m.hex }} aria-hidden />{m.colorName}<span className="muted">{grams(m.availableG)}</span></button>))}</div>}
          </section>
          <section><h4 className="eyebrow mb-0.5">{t('picker.colorOther')}</h4><p className="muted text-xs mb-1.5">{t('picker.colorOtherHint')}</p>
            <div className="flex flex-wrap gap-1.5">{COLOR_FAMILIES.map((f) => <button key={f} type="button" onClick={() => other(FAMILY_LABEL[f])} aria-label={FAMILY_LABEL[f]} title={FAMILY_LABEL[f]} data-testid="color-palette" className={cn('h-8 w-8 rounded-full border-2', color.toLowerCase() === FAMILY_LABEL[f].toLowerCase() ? 'border-[var(--accent)] ring-2 ring-[var(--accent-line)]' : 'border-black/20')} style={{ background: FAMILY_HEX[f] }} />)}</div>
            <form className="flex gap-2 mt-2" onSubmit={(e) => { e.preventDefault(); if (custom.trim()) other(custom.trim()); }}>
              <input className="input !min-h-[34px]" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={t('picker.colorName')} aria-label={t('picker.colorName')} data-testid="color-custom" />
              <button type="submit" className="btn-ghost btn-sm" disabled={!custom.trim()}>{t('picker.colorApply')}</button>
            </form>
          </section>
          {color && <button type="button" className="btn-ghost btn-sm" onClick={() => { onPick({ color: '' }); setOpen(false); }}>{t('picker.colorClear')}</button>}
        </div>)}
    </div>
  );
}
