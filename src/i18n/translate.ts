import type { Locale } from './config';
import { es } from './es';
import { en } from './en';

/** Convierte la forma de un diccionario en otra con las mismas claves y valores `string`. */
export type Shape<T> = { [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };

type Flat<T, P extends string = ''> = { [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Flat<T[K], `${P}${K}.`> }[keyof T & string];
type StripPlural<K extends string> = K extends `${infer B}_${'one' | 'other'}` ? B : K;
/** Claves válidas de traducción (las formas plurales `x_one` / `x_other` se piden como `x` con `count`). */
export type MessageKey = StripPlural<Flat<typeof es>>;
export type Params = Record<string, string | number | null | undefined>;
export type TFn = (key: MessageKey, params?: Params) => string;
export type Messages = Shape<typeof es>;

export const DICTIONARIES: Record<Locale, Messages> = { es, en };

function lookup(dict: Messages, key: string): string | undefined {
  let cur: unknown = dict;
  for (const part of key.split('.')) { if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[part]; else return undefined; }
  return typeof cur === 'string' ? cur : undefined;
}

/** Crea la función `t` de un idioma. Usa `{nombre}` para parámetros y `count` para elegir singular/plural. */
export function createT(locale: Locale, dict: Messages = DICTIONARIES[locale]): TFn {
  const rules = new Intl.PluralRules(locale);
  return (key, params) => {
    let raw: string | undefined;
    if (params && typeof params.count === 'number') raw = lookup(dict, `${key}_${rules.select(params.count)}`) ?? lookup(dict, `${key}_other`);
    raw ??= lookup(dict, key) ?? lookup(DICTIONARIES.es, key) ?? key;
    return params ? raw.replace(/\{(\w+)\}/g, (m, name: string) => (params[name] == null ? m : String(params[name]))) : raw;
  };
}

/** Traduce una clave construida dinámicamente (p. ej. por estado); si no existe devuelve `fallback`. */
export function tOr(t: TFn, key: string, fallback: string, params?: Params): string {
  const r = t(key as MessageKey, params);
  return r === key ? fallback : r;
}
