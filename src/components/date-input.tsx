'use client';
import { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { useT } from '@/i18n/client';
import { parseDisplay } from '@/lib/date-input';

const toDisplay = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '');
/** Campo de fecha en formato día-mes-año (es-CL) con selector de calendario; el valor siempre es ISO (aaaa-mm-dd). Soporta modo controlado (`value`) y de formulario (`name` + `defaultValue`). */
export function DateInput({ value, defaultValue, onChange, name, className = 'input', ...rest }: { value?: string; defaultValue?: string; onChange?: (iso: string) => void; name?: string; className?: string; 'aria-label'?: string; 'data-testid'?: string; required?: boolean }) {
  const t = useT();
  const [iso, setIso] = useState(value ?? defaultValue ?? ''); const [text, setText] = useState(toDisplay(value ?? defaultValue ?? ''));
  const pick = useRef<HTMLInputElement>(null);
  useEffect(() => { if (value !== undefined && value !== iso) { setIso(value); setText(toDisplay(value)); } }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = (txt: string) => { setText(txt); const v = txt.trim() === '' ? '' : parseDisplay(txt); if (txt.trim() === '' || v) { setIso(v); onChange?.(v); } };
  return (
    <span className="relative block">
      <input type="text" inputMode="numeric" placeholder={t('common.datePlaceholder')} className={`${className} pr-9`} value={text} aria-invalid={!!text && !parseDisplay(text)} onChange={(e) => commit(e.target.value)} onBlur={() => setText(toDisplay(iso))} {...rest} />
      {name && <input type="hidden" name={name} value={iso} />}
      <button type="button" tabIndex={-1} aria-label={t('common.pickDate')} className="absolute right-2 top-1/2 -translate-y-1/2 muted" onClick={() => pick.current?.showPicker?.()}><CalendarDays className="h-4 w-4" aria-hidden /></button>
      <input ref={pick} type="date" tabIndex={-1} aria-hidden className="absolute right-0 bottom-0 h-0 w-0 opacity-0 pointer-events-none" value={iso} onChange={(e) => commit(toDisplay(e.target.value))} />
    </span>
  );
}
