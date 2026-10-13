import { describe, expect, it } from 'vitest';
import { DICTIONARIES, createT } from '@/i18n/translate';
import { LOCALES, matchLocale } from '@/i18n/config';

type Tree = { [k: string]: string | Tree };
const flat = (o: Tree, p = ''): Record<string, string> => Object.entries(o).reduce((a, [k, v]) => (typeof v === 'string' ? { ...a, [p + k]: v } : { ...a, ...flat(v, p + k + '.') }), {});
const params = (s: string) => [...new Set(s.match(/\{\w+\}/g) ?? [])].sort().join(',');

describe('i18n: diccionarios', () => {
  const es = flat(DICTIONARIES.es as Tree);
  for (const loc of LOCALES.filter((l) => l !== 'es')) {
    const other = flat(DICTIONARIES[loc] as Tree);
    it(`${loc} tiene exactamente las mismas claves que es`, () => {
      expect(Object.keys(other).sort()).toEqual(Object.keys(es).sort());
    });
    it(`${loc} usa los mismos parámetros {x} que es`, () => {
      const bad = Object.keys(es).filter((k) => params(es[k]) !== params(other[k]));
      expect(bad).toEqual([]);
    });
    it(`${loc} no deja textos vacíos`, () => {
      expect(Object.entries(other).filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
    });
  }
  it('las formas plurales vienen en pares one/other', () => {
    const keys = Object.keys(es);
    for (const k of keys.filter((x) => x.endsWith('_one'))) expect(keys).toContain(k.replace(/_one$/, '_other'));
  });
});

describe('i18n: createT', () => {
  it('interpola parámetros y elige singular/plural', () => {
    const es = createT('es'), en = createT('en');
    expect(es('time.minutesAgo', { n: 5 })).toBe('hace 5 min');
    expect(en('time.minutesAgo', { n: 5 })).toBe('5 min ago');
    expect(es('time.daysAgo', { count: 1 })).toBe('hace 1 día');
    expect(es('time.daysAgo', { count: 3 })).toBe('hace 3 días');
    expect(en('time.daysAgo', { count: 1 })).toBe('1 day ago');
  });
  it('si falta una clave devuelve la clave', () => {
    expect(createT('es')('no.existe' as never)).toBe('no.existe');
  });
});

describe('i18n: idioma por defecto', () => {
  it('elige el idioma desde Accept-Language y cae en español', () => {
    expect(matchLocale('en-US,en;q=0.9,es;q=0.8')).toBe('en');
    expect(matchLocale('es-CL,es;q=0.9')).toBe('es');
    expect(matchLocale('fr-FR,fr;q=0.9')).toBe('es');
    expect(matchLocale(null)).toBe('es');
  });
});
