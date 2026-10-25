import { describe, expect, it } from 'vitest';
import { defaultRealHours, plausibleRatio } from '@/lib/real-hours';
import { isWorkingDay, workingDaysBetween } from '@/lib/work-calendar';

describe('horas reales por defecto al terminar un trabajo', () => {
  const now = new Date('2026-10-25T12:00:00Z');
  const ago = (h: number) => new Date(now.getTime() - h * 3600_000);
  it('usa el tiempo desde «Iniciar» cuando es creíble frente al estimado', () => {
    expect(defaultRealHours(3, ago(2.5), now)).toEqual({ hours: 2.5, source: 'transcurrido' });
  });
  it('usa el estimado si se marcó inicio y término juntos o se olvidó terminarlo', () => {
    expect(defaultRealHours(3, ago(1 / 60), now)).toEqual({ hours: 3, source: 'estimado' });
    expect(defaultRealHours(1, ago(14), now)).toEqual({ hours: 1, source: 'estimado' });
    expect(defaultRealHours(2, null, now)).toEqual({ hours: 2, source: 'estimado' });
  });
  it('sin estimado se queda con lo transcurrido', () => {
    expect(defaultRealHours(0, ago(0.5), now).source).toBe('transcurrido');
  });
  it('el factor de tiempo descarta mediciones fuera de rango', () => {
    expect(plausibleRatio(0.006)).toBe(false); expect(plausibleRatio(1.1)).toBe(true); expect(plausibleRatio(5)).toBe(false);
  });
});

describe('calendario del taller', () => {
  const cal = { days: [1, 2, 3, 4, 5], holidays: ['2026-10-26'] };
  it('un feriado o un fin de semana no es día hábil', () => {
    expect(isWorkingDay(new Date('2026-10-26T15:00:00Z'), cal)).toBe(false); // lunes feriado
    expect(isWorkingDay(new Date('2026-10-27T15:00:00Z'), cal)).toBe(true);
    expect(isWorkingDay(new Date('2026-10-25T15:00:00Z'), cal)).toBe(false); // domingo
  });
  it('cuenta los días hábiles del período sin feriados', () => {
    expect(workingDaysBetween(new Date('2026-10-26T12:00:00Z'), new Date('2026-11-01T12:00:00Z'), cal)).toBe(4);
  });
});
