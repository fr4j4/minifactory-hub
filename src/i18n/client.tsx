'use client';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Locale } from './config';
import { createT, type Messages, type TFn } from './translate';

const Ctx = createContext<{ locale: Locale; t: TFn } | null>(null);

export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: ReactNode }) {
  const value = useMemo(() => ({ locale, t: createT(locale, messages) }), [locale, messages]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() { const v = useContext(Ctx); if (!v) throw new Error('I18nProvider ausente'); return v; }
export const useT = (): TFn => useI18n().t;
export const useLocale = (): Locale => useI18n().locale;
