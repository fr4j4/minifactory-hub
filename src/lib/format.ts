import type { TFn } from '@/i18n/translate';

// Formato del taller (ajustes shop.lang y shop.currency), solo para mostrar. Lo fija getSettings() en el servidor
// y I18nProvider en el navegador; es uno por taller, así que no depende de la petición.
let fmt = { lang: 'es-CL', currency: 'CLP', money: new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }) };
export function setNumberFormat(lang: string, currency: string) {
  if (lang === fmt.lang && currency === fmt.currency) return;
  try { fmt = { lang, currency, money: new Intl.NumberFormat(lang, { style: 'currency', currency }) }; } catch { /* idioma o moneda inválidos: queda el formato anterior */ }
}
/** Monto en la moneda del taller (los decimales los decide la moneda: CLP sin decimales, USD/EUR con 2). */
export const money = (n: number | null | undefined) => (n == null ? '—' : fmt.money.format(n));
export const num = (n: number | null | undefined, d = 1) => (n == null ? '—' : new Intl.NumberFormat(fmt.lang, { maximumFractionDigits: d, minimumFractionDigits: 0 }).format(n));
export const pct = (n: number | null | undefined, d = 0) => (n == null ? '—' : `${num(n, d)}%`);
export const dur = (sec: number | null | undefined) => { if (sec == null) return '—'; const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return `${h}:${String(m).padStart(2, '0')} h`; };
export const hoursFmt = (h: number | null | undefined) => (h == null ? '—' : dur(Math.round(h * 3600)));
export const grams = (g: number | null | undefined) => (g == null ? '—' : `${num(g, g < 100 ? 1 : 0)} g`);
/** Zona horaria del taller (Ajustes → shop.timezone). El servidor la fija al leer los ajustes; el navegador la recibe en I18nProvider.
 *  ponytail: una sola zona por proceso (hay un solo taller); si llega multi-taller, pasarla por contexto. */
let TZ = 'America/Santiago';
const fmts = new Map<string, Intl.DateTimeFormat>();
export const setTimeZone = (tz: string | null | undefined) => { if (!tz || tz === TZ) return; try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); TZ = tz; } catch { /* zona inválida: se mantiene la anterior */ } };
const parts = (x: Date) => {
  let f = fmts.get(TZ); if (!f) fmts.set(TZ, (f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })));
  return Object.fromEntries(f.formatToParts(x).map((p) => [p.type, p.value])) as Record<'year' | 'month' | 'day' | 'hour' | 'minute', string>;
};
/** Día calendario aaaa-mm-dd en la zona del taller (por defecto, hoy). Reemplaza a `toISOString().slice(0, 10)`, que da el día UTC. */
export const ymd = (d: Date = new Date()) => { const p = parts(d); return `${p.year}-${p.month}-${p.day}`; };
/** aaaa-mm-dd + n días (aritmética de calendario, sin zona). */
export const addDays = (day: string, n: number) => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400_000).toISOString().slice(0, 10);
/** Instante en que empieza el día aaaa-mm-dd en la zona del taller (para rangos: `>= dayStart(desde)` y `< dayStart(hasta + 1)`). */
export const dayStart = (day: string) => {
  const g = Date.parse(day + 'T00:00:00Z');
  const off = (ms: number) => { const p = parts(new Date(ms)); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(ms / 60_000) * 60_000; };
  const first = g - off(g), t = g - off(first);
  return new Date(ymd(new Date(t)) === day ? t : first); // si las 00:00 no existen (cambio de horario), el día empieza en `first`
};
export const dmy = (d: Date | string | null | undefined) => {
  if (!d) return '—';
  if (typeof d === 'string' && d.length === 10) return `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`; // fecha de calendario: sin zona
  const p = parts(typeof d === 'string' ? new Date(d) : d); return `${p.day}-${p.month}-${p.year}`;
};
export const dmyHm = (d: Date | string | null | undefined) => { if (!d) return '—'; const p = parts(typeof d === 'string' ? new Date(d) : d); return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}`; };
export const ago = (d: Date | string, t: TFn) => { const x = typeof d === 'string' ? new Date(d) : d; const s = (Date.now() - x.getTime()) / 1000; if (s < 90) return t('time.now'); if (s < 3600) return t('time.minutesAgo', { n: Math.round(s / 60) }); if (s < 86400) return t('time.hoursAgo', { n: Math.round(s / 3600) }); return t('time.daysAgo', { count: Math.round(s / 86400) }); };
export const cn = (...a: Array<string | false | null | undefined>) => a.filter(Boolean).join(' ');
export const SOURCE_KEYS = ['whatsapp', 'instagram', 'facebook', 'correo', 'marketplace', 'feria', 'presencial', 'recomendacion', 'otro'] as const;
/** Canales de origen de un pedido, ya traducidos: `{ whatsapp: 'WhatsApp', … }`. */
export const sources = (t: TFn): Record<string, string> => Object.fromEntries(SOURCE_KEYS.map((k) => [k, t(`sources.${k}`)]));

/** RUT chileno: si el texto tiene forma de RUT (12.345.678-5), el dígito verificador (módulo 11) debe calzar. Otro formato (identificador extranjero) se acepta. */
export function rutOk(raw: string): boolean {
  const m = raw.trim().match(/^(\d{1,2}\.?\d{3}\.?\d{3})-?([\dkK])$/); if (!m) return true;
  let sum = 0, f = 2; for (const d of m[1].replace(/\./g, '').split('').reverse()) { sum += +d * f; f = f === 7 ? 2 : f + 1; }
  const dv = 11 - (sum % 11); return (dv === 11 ? '0' : dv === 10 ? 'K' : String(dv)) === m[2].toUpperCase();
}
