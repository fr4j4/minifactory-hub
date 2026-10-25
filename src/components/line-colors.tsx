'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { affectsPrice, mainShare, overflows, type ExtraColor } from '@/lib/color-slots';
import { colorsFromSlots, pickerName, type FileSlot, type PickMaterial } from '@/lib/filament-pick';
import { cn } from '@/lib/format';
import { useT } from '@/i18n/client';
import { FilamentPicker } from './filament-picker';
import { ColorField } from './color-field';

type Level = 'basico' | 'detallado' | 'experto';

/**
 * «Colores de la pieza»: más materiales o colores además del principal, sin estorbar. Cerrado muestra un botón o un resumen de una línea.
 * Cada color es solo referencia, un % del peso (Detallado) o gramos exactos (Experto); el campo de gramos de la línea sigue siendo uno solo.
 */
export function LineColors({ materials, mainId, colors, total, level, tech, disabled, fileSlots, onChange }: { materials: PickMaterial[]; mainId: string | null; colors: ExtraColor[]; total: number; level: Level; tech: 'fdm' | 'resina' | null; disabled?: boolean; fileSlots?: FileSlot[]; onChange: (c: ExtraColor[]) => void }) {
  const t = useT(); const [open, setOpen] = useState(false);
  const prev = useRef(colors.length); useEffect(() => { if (prev.current === 0 && colors.length > 0) setOpen(true); prev.current = colors.length; }, [colors.length]); // llegan colores del archivo: se abre sola
  const main = materials.find((m) => m.id === mainId);
  const share = mainShare(total, colors); const over = overflows(total, colors);
  const label = (c: ExtraColor) => { const m = materials.find((x) => x.id === c.materialId); return m ? (m.generic ? (c.color || m.type) : m.colorName) : '—'; };
  const summary = useMemo(() => colors.length ? t('picker.colorsSummary', { n: colors.length + 1, list: [main ? (main.generic ? main.type : main.colorName) : '—', ...colors.map((c) => `${label(c)}${affectsPrice(c) ? (c.g ? ` ${c.g} g` : ` ${c.pct} %`) : ''}`)].join(', ') }) : '', [colors, main, materials, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const fromFile = fileSlots && fileSlots.length > 1 && colors.length === 0 ? colorsFromSlots(fileSlots, materials, mainId, tech) : [];
  const set = (i: number, p: Partial<ExtraColor>) => onChange(colors.map((c, k) => (k === i ? { ...c, ...p } : c)));
  const add = () => { onChange([...colors, { materialId: mainId ?? materials.find((m) => !m.generic)?.id ?? '' }]); setOpen(true); };
  if (disabled && !colors.length) return null;
  return (
    <div className="space-y-2" data-testid="line-colors">
      {!open && (
        <div className="flex flex-wrap items-center gap-2">
          {colors.length === 0
            ? !disabled && <button type="button" className="btn-ghost btn-sm" onClick={add} data-testid="add-color">{t('picker.colorsAdd')}</button>
            : <button type="button" className="btn-ghost btn-sm text-left" onClick={() => setOpen(true)} aria-expanded={false} data-testid="colors-summary">{summary}</button>}
          {fromFile.length > 0 && !disabled && <button type="button" className="btn-ghost btn-sm" onClick={() => { onChange(fromFile); setOpen(true); }} title={t(fileSlots!.some((x) => (x.g ?? 0) > 0) ? 'picker.colorsFromFileHint' : 'picker.colorsFromFileRefHint', { n: fileSlots!.length })} data-testid="colors-from-file">{t('picker.colorsFromFile')}</button>}
        </div>)}
      {open && (
        <div className="rounded-xl border border-[var(--line)] p-3 space-y-2" data-testid="colors-panel">
          <div className="flex items-center justify-between gap-2"><span className="label !mb-0">{t('picker.colorsTitle')}</span><button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>{t('picker.colorsClose')}</button></div>
          {main && <div className="text-sm muted">{pickerName(main)}{share != null ? ` · ${share} %` : ''}</div>}
          {colors.map((c, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto] items-start" data-testid="color-row">
              <FilamentPicker materials={materials} value={c.materialId} disabled={disabled} tech={tech} showCost={false} ariaLabel={t('common.material')} onChange={(id, m) => set(i, { materialId: id, color: m && !m.generic ? '' : c.color })} />
              <ColorField materials={materials} materialId={c.materialId || null} color={(() => { const m = materials.find((x) => x.id === c.materialId); return m && !m.generic ? m.colorName : c.color ?? ''; })()} disabled={disabled} onPick={(p) => set(i, { ...(p.materialId !== undefined && p.materialId ? { materialId: p.materialId } : {}), color: materials.find((x) => x.id === (p.materialId ?? c.materialId))?.generic ? p.color : '' })} />
              {level === 'basico' ? <span className="muted text-xs self-center">{t('picker.colorsRef')}</span> : <AmountInput c={c} level={level} disabled={disabled} total={total} onChange={(p) => set(i, p)} />}
              {!disabled && <button type="button" className="btn-ghost btn-sm" aria-label={t('picker.colorsRemove')} onClick={() => { const n = colors.filter((_, k) => k !== i); onChange(n); if (!n.length) setOpen(false); }} data-testid="color-remove">✕</button>}
            </div>))}
          <p className="muted text-xs">{t('picker.colorsRefHint')}</p>
          {share != null && <p className="text-xs">{t('picker.colorsMainShare', { pct: share })}</p>}
          {over && <p className="text-xs text-warn" role="status" data-testid="colors-overflow">{t('picker.colorsOverflow')}</p>}
          {!disabled && <button type="button" className="btn-ghost btn-sm" onClick={add} data-testid="add-color-more">{t('picker.colorsAddMore')}</button>}
        </div>)}
    </div>
  );
}

/** % del peso (Detallado) o gramos (Experto, con selector de unidad). Vacío = solo referencia. */
function AmountInput({ c, level, disabled, total, onChange }: { c: ExtraColor; level: Level; disabled?: boolean; total: number; onChange: (p: Partial<ExtraColor>) => void }) {
  const t = useT(); const grams = level === 'experto' && !!c.g;
  const parse = (v: string) => { const n = Number(v.replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };
  return (
    <span className="flex items-center gap-1">
      <input type="number" min={0} step="0.1" inputMode="decimal" className={cn('input !w-24 tabular', !!c.g && total > 0 && c.g > total && 'ring-2 ring-amber-500')} disabled={disabled} value={(grams ? c.g : c.pct) ?? ''} placeholder={t('picker.colorsRef')}
        aria-label={grams ? t('picker.colorsGrams') : t('picker.colorsPct')} onChange={(e) => onChange(grams ? { g: parse(e.target.value), pct: null } : { pct: parse(e.target.value) == null ? null : Math.min(100, parse(e.target.value)!), g: null })} data-testid="color-amount" />
      {level === 'experto'
        ? <button type="button" className="btn-ghost btn-sm !px-2" disabled={disabled} title={grams ? t('picker.colorsGrams') : t('picker.colorsPct')} onClick={() => onChange(grams ? { g: null, pct: c.g && total > 0 ? Math.round((c.g / total) * 1000) / 10 : null } : { pct: null, g: Math.round((total * (c.pct ?? 10)) / 10) / 10 || 1 })} data-testid="color-unit">{grams ? 'g' : '%'}</button>
        : <span className="muted text-xs">%</span>}
    </span>
  );
}
