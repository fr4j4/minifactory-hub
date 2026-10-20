import { cookies, headers } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, matchLocale, type Locale } from './config';
import { createT, type TFn } from './translate';

/** Idioma de la petición actual: cookie, luego Accept-Language, luego español. Fuera de una petición (worker, scripts, pruebas) devuelve español. */
export async function getLocale(): Promise<Locale> {
  try {
    const c = (await cookies()).get(LOCALE_COOKIE)?.value;
    if (isLocale(c)) return c;
    return matchLocale((await headers()).get('accept-language'));
  } catch { return DEFAULT_LOCALE; }
}

export async function getT(): Promise<TFn> { return createT(await getLocale()); }
export async function getI18n(): Promise<{ locale: Locale; t: TFn }> { const locale = await getLocale(); return { locale, t: createT(locale) }; }
