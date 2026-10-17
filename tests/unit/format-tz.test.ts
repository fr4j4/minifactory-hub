import { describe, expect, it } from 'vitest';
import { addDays, dayStart, dmy, dmyHm, setTimeZone, ymd } from '@/lib/format';

describe('fechas en la zona del taller', () => {
  setTimeZone('America/Santiago');
  it('"hoy" es el día local, no el UTC', () => { expect(ymd(new Date('2026-10-17T01:30:00Z'))).toBe('2026-10-16'); expect(dmyHm(new Date('2026-10-17T01:30:00Z'))).toBe('16-10-2026 22:30'); });
  it('las fechas de calendario no se corren', () => { expect(dmy('2026-03-05')).toBe('05-03-2026'); expect(addDays('2026-12-31', 1)).toBe('2027-01-01'); });
  it('el inicio del día es la medianoche local (también en cambio de horario)', () => {
    expect(dayStart('2026-10-16').toISOString()).toBe('2026-10-16T03:00:00.000Z');
    expect(dayStart('2026-07-01').toISOString()).toBe('2026-07-01T04:00:00.000Z');
    expect(ymd(dayStart('2026-09-06'))).toBe('2026-09-06'); // 00:00 no existe ese día en Chile
    expect(ymd(new Date(dayStart('2026-09-06').getTime() - 1))).toBe('2026-09-05');
  });
  it('una zona inválida no rompe el formato', () => { setTimeZone('Nada/Nada'); expect(ymd(new Date('2026-10-17T01:30:00Z'))).toBe('2026-10-16'); });
});
