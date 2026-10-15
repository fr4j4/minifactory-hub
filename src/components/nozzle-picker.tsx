'use client';
import { useState } from 'react';
import { COMMON_NOZZLES, normNozzle } from '@/lib/slicer/nozzle';
import { cn } from '@/lib/format';
import { useT } from '@/i18n/client';

/**
 * Elegir diámetros de boquilla con un toque (0,2 · 0,4 · 0,6 · 0,8) y «Otra…» para el resto (0,25 · 1,0 · 1,2…).
 * `multi`: varias a la vez (las que tiene una máquina); si no, una sola (la de un perfil).
 */
export function NozzlePicker({ value, onChange, multi, label, hint, testId }: { value: string[]; onChange: (v: string[]) => void; multi?: boolean; label?: string; hint?: string; testId?: string }) {
  const t = useT(); label ??= t('nozzle.colNozzle');
  const [other, setOther] = useState(''); const [err, setErr] = useState(false);
  const shown = [...new Set<string>([...COMMON_NOZZLES, ...value])].sort((a, b) => Number(a) - Number(b));
  const toggle = (n: string) => { if (!multi) return onChange([n]); onChange(value.includes(n) ? value.filter((x) => x !== n) : [...value, n].sort((a, b) => Number(a) - Number(b))); };
  const add = () => { const n = normNozzle(other); if (!n) { setErr(true); return; } setErr(false); setOther(''); if (multi) onChange([...new Set([...value, n])].sort((a, b) => Number(a) - Number(b))); else onChange([n]); };
  return (
    <div data-testid={testId}>
      <span className="label">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5" role={multi ? 'group' : 'radiogroup'} aria-label={label}>
        {shown.map((n) => { const on = value.includes(n); return (
          <button key={n} type="button" role={multi ? undefined : 'radio'} aria-checked={multi ? undefined : on} aria-pressed={multi ? on : undefined} onClick={() => toggle(n)} data-testid={`nozzle-${n}`}
            className={cn('num min-h-[36px] px-3 rounded-xl border text-sm', on ? 'bg-[var(--panel)] text-[var(--panel-ink)] border-transparent dark:bg-slate-700' : 'border-[var(--line)] hover:bg-slate-100 dark:hover:bg-slate-800')}>{t('nozzle.mm', { n: n.replace('.', ',') })}</button>); })}
        <span className="inline-flex items-center gap-1">
          <input className={cn('input !w-20 !min-h-[36px] num', err && 'ring-2 ring-red-500/50')} inputMode="decimal" placeholder={t('nozzle.otherPlaceholder')} value={other} onChange={(e) => { setOther(e.target.value); setErr(false); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} aria-label={t('nozzle.otherAria')} data-testid="nozzle-other" />
          <button type="button" className="btn-ghost btn-sm" onClick={add} disabled={!other.trim()}>{t('nozzle.add')}</button>
        </span>
      </div>
      {err && <p className="text-xs text-danger mt-1" role="alert">{t('nozzle.otherError')}</p>}
      {hint && <p className="text-xs muted mt-1">{hint}</p>}
    </div>
  );
}
