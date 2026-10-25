import { ymd } from './format';

/** Calendario del taller: días hábiles (0 = domingo) y feriados en YYYY-MM-DD. */
export interface WorkCalendar { days: number[]; holidays: string[] }

/** Día de la semana de una fecha YYYY-MM-DD, sin depender de la zona horaria de quien calcula. */
const weekdayOf = (key: string) => new Date(`${key}T12:00:00Z`).getUTCDay();

/** El taller abre ese día: es un día hábil y no es feriado. */
export const isWorkingDay = (d: Date, cal: WorkCalendar) => { const key = ymd(d); return cal.days.includes(weekdayOf(key)) && !cal.holidays.includes(key); };

/** Días en que abre el taller entre `a` (incluido) y `b` (excluido). */
export function workingDaysBetween(a: Date, b: Date, cal: WorkCalendar): number {
  const seen = new Set<string>(); let n = 0;
  for (let t = a.getTime(); t < b.getTime(); t += 86400_000 / 4) { // cada 6 h: ningún día se salta aunque cambie la hora oficial
    const key = ymd(new Date(t)); if (seen.has(key)) continue; seen.add(key);
    if (cal.days.includes(weekdayOf(key)) && !cal.holidays.includes(key)) n++;
  }
  return n;
}
