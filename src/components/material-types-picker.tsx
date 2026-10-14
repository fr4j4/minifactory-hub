'use client';
import { useState } from 'react';
import { canonicalMaterialType, KNOWN_MATERIAL_TYPES } from '@/lib/slicer/material-types';
import { cn } from '@/lib/format';
import { useT } from '@/i18n/client';

/** Tipos de material que acepta una máquina: se marcan con un toque y «Otro…» agrega uno nuevo (siempre con la misma grafía, «pla» → «PLA»). */
export function MaterialTypesPicker({ value, onChange, options, testId }: { value: string[]; onChange: (v: string[]) => void; options?: string[]; testId?: string }) {
  const t = useT(); const [other, setOther] = useState('');
  const shown = [...new Set([...KNOWN_MATERIAL_TYPES.slice(0, 8), ...(options ?? []), ...value])];
  const toggle = (x: string) => onChange(value.includes(x) ? value.filter((y) => y !== x) : [...value, x]);
  const add = () => { const c = canonicalMaterialType(other, shown); if (!c) return; setOther(''); if (!value.includes(c)) onChange([...value, c]); };
  return (
    <div data-testid={testId}>
      <span className="label">{t('machines.compatibleMaterials')}</span>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('machines.compatibleMaterials')}>
        {shown.map((x) => { const on = value.includes(x); return <button key={x} type="button" aria-pressed={on} onClick={() => toggle(x)} data-testid={`mat-${x}`}
          className={cn('min-h-[36px] px-3 rounded-xl border text-sm', on ? 'bg-[var(--panel)] text-[var(--panel-ink)] border-transparent dark:bg-slate-700' : 'border-[var(--line)] hover:bg-slate-100 dark:hover:bg-slate-800')}>{x}</button>; })}
        <span className="inline-flex items-center gap-1">
          <input className="input !w-24 !min-h-[36px]" placeholder={t('nozzle.otherMaterial')} value={other} onChange={(e) => setOther(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} aria-label={t('nozzle.otherMaterialAria')} data-testid="mat-other" />
          <button type="button" className="btn-ghost btn-sm" onClick={add} disabled={!other.trim()}>{t('nozzle.add')}</button>
        </span>
      </div>
    </div>
  );
}
