import { grams } from './format';
import type { TFn } from '@/i18n/translate';

/** Lo que se agrega al nombre de un material en los selectores de laminado, cotización y cola: genérico, sin stock o cuánto hay. Solo informa. */
export function stockTag(m: { generic: boolean; stockG: number }, t: TFn): string {
  if (m.generic) return t('buy.tagGeneric');
  return m.stockG > 0 ? t('buy.tagInStock', { g: grams(m.stockG) }) : t('buy.tagNoStock');
}
export const matOptionLabel = (m: { label: string; generic: boolean; stockG: number }, t: TFn) => `${m.label} · ${stockTag(m, t)}`;
