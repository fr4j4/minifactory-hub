'use client';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Locale } from './config';
import { createT, type Messages, type TFn } from './translate';
import { setNumberFormat, setTimeZone } from '@/lib/format';

const Ctx = createContext<{ locale: Locale; t: TFn } | null>(null);

export function I18nProvider({ locale, messages, timeZone, numberFormat, children }: { locale: Locale; messages: Messages; timeZone?: string; /** idioma y moneda del taller para money()/num() */ numberFormat?: { lang: string; currency: string }; children: ReactNode }) {
  setTimeZone(timeZone); // antes de pintar a los hijos: el navegador formatea fechas en la misma zona que el servidor (sin desajuste de hidratación)
  if (numberFormat) setNumberFormat(numberFormat.lang, numberFormat.currency);
  const value = useMemo(() => ({ locale, t: createT(locale, messages) }), [locale, messages]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() { const v = useContext(Ctx); if (!v) throw new Error('I18nProvider ausente'); return v; }
export const useT = (): TFn => useI18n().t;
export const useLocale = (): Locale => useI18n().locale;
