export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'es';
export const LOCALE_COOKIE = 'mf_lang';
/** Nombre de cada idioma en su propio idioma (para el selector). */
export const LOCALE_NAMES: Record<Locale, string> = { es: 'Español', en: 'English' };
/** Etiqueta BCP 47 para `<html lang>` y para `Intl`. */
export const LOCALE_TAG: Record<Locale, string> = { es: 'es-CL', en: 'en-US' };

export const isLocale = (v: unknown): v is Locale => typeof v === 'string' && (LOCALES as readonly string[]).includes(v);

/** Elige el mejor idioma a partir de la cabecera Accept-Language. */
export function matchLocale(acceptLanguage: string | null | undefined): Locale {
  for (const part of (acceptLanguage ?? '').split(',')) {
    const base = part.split(';')[0].trim().toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
