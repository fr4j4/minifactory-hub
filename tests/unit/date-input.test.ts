import { describe, expect, it } from 'vitest';
import { parseDisplay } from '@/lib/date-input';

describe('DateInput: dd-mm-aaaa', () => {
  it('convierte fechas válidas a ISO', () => { expect(parseDisplay('05-03-2026')).toBe('2026-03-05'); expect(parseDisplay('5/3/2026')).toBe('2026-03-05'); });
  it('rechaza fechas inexistentes o incompletas', () => { expect(parseDisplay('31-02-2026')).toBe(''); expect(parseDisplay('05-03-26')).toBe(''); expect(parseDisplay('')).toBe(''); });
});
