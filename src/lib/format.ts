import type { TFn } from '@/i18n/translate';

export const money = (n: number | null | undefined) => (n == null ? '—' : new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n));
export const num = (n: number | null | undefined, d = 1) => (n == null ? '—' : new Intl.NumberFormat('es-CL', { maximumFractionDigits: d, minimumFractionDigits: 0 }).format(n));
export const pct = (n: number | null | undefined, d = 0) => (n == null ? '—' : `${num(n, d)}%`);
export const dur = (sec: number | null | undefined) => { if (sec == null) return '—'; const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return `${h}:${String(m).padStart(2, '0')} h`; };
export const hoursFmt = (h: number | null | undefined) => (h == null ? '—' : dur(Math.round(h * 3600)));
export const grams = (g: number | null | undefined) => (g == null ? '—' : `${num(g, g < 100 ? 1 : 0)} g`);
const pad = (n: number) => String(n).padStart(2, '0');
export const dmy = (d: Date | string | null | undefined) => { if (!d) return '—'; const x = typeof d === 'string' ? new Date(d.length === 10 ? d + 'T12:00:00' : d) : d; return `${pad(x.getDate())}-${pad(x.getMonth() + 1)}-${x.getFullYear()}`; };
export const dmyHm = (d: Date | string | null | undefined) => { if (!d) return '—'; const x = typeof d === 'string' ? new Date(d) : d; return `${dmy(x)} ${pad(x.getHours())}:${pad(x.getMinutes())}`; };
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
