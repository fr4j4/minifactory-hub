'use client';
import type { ReactNode } from 'react';
import { cn } from '@/lib/format';
import { useT } from '@/i18n/client';
import { Hint } from './calc-bits';

export const pathGet = (o: any, p: string): any => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
/** Copia con el valor cambiado en la ruta («floors.perGram»); `undefined` elimina la clave. */
export function pathSet<T>(o: T, p: string, v: unknown): T {
  const [h, ...rest] = p.split('.');
  const cur: any = o ?? {};
  if (!rest.length) { const n = { ...cur }; if (v === undefined) delete n[h]; else n[h] = v; return n; }
  const child = pathSet(cur[h] ?? {}, rest.join('.'), v);
  const n = { ...cur, [h]: child };
  if (v === undefined && child && typeof child === 'object' && !Object.keys(child).length) delete n[h];
  return n;
}

const unitBox = 'input tabular';
/** Campo numérico con nombre claro, unidad, ayuda de una línea y «Restablecer» al valor por defecto. */
export function NumField({ label, hint, value, onChange, def, unit, min = 0, max, step = 'any', testid, disabled, className }: {
  label: string; hint?: string; value: number; onChange: (v: number) => void; def?: number; unit?: string; min?: number; max?: number; step?: number | 'any'; testid?: string; disabled?: boolean; className?: string;
}) {
  const t = useT();
  return (
    <div className={cn('block', className)}>
      <label className="label" htmlFor={testid}>{label}{hint && <Hint text={hint} />}{def !== undefined && value !== def && !disabled && (
        <button type="button" className="ml-2 text-xs underline font-normal" onClick={() => onChange(def)} aria-label={t('calc.cfg.resetField', { name: label, value: String(def) })} data-testid={testid ? `${testid}-reset` : undefined}>{t('calc.cfg.reset')}</button>)}</label>
      <div className="flex items-center gap-1.5">
        <input id={testid} type="number" inputMode="decimal" className={unitBox} min={min} max={max} step={step} value={Number.isFinite(value) ? value : ''} disabled={disabled} data-testid={testid}
          onChange={(e) => onChange(e.target.value === '' ? 0 : +e.target.value)} />
        {unit && <span className="text-xs muted whitespace-nowrap">{unit}</span>}
      </div>
    </div>
  );
}

export function SelectField({ label, hint, value, onChange, options, testid, disabled }: { label: string; hint?: string; value: string; onChange: (v: string) => void; options: Array<[string, string]>; testid?: string; disabled?: boolean }) {
  return (
    <div className="block">
      <label className="label" htmlFor={testid}>{label}{hint && <Hint text={hint} />}</label>
      <select id={testid} className="input" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} data-testid={testid}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
    </div>
  );
}

export function CheckField({ label, hint, checked, onChange, testid, disabled }: { label: ReactNode; hint?: string; checked: boolean; onChange: (v: boolean) => void; testid?: string; disabled?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm min-h-[44px] md:min-h-0"><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} data-testid={testid} />{label}{hint && <Hint text={hint} />}</label>
  );
}
