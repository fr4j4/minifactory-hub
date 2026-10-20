import { afterEach, describe, expect, it } from 'vitest';
import { money, num, setNumberFormat } from '@/lib/format';

describe('format: moneda e idioma del taller', () => {
  afterEach(() => setNumberFormat('es-CL', 'CLP'));
  it('por defecto usa pesos chilenos sin decimales', () => {
    expect(money(1234.5)).toBe('$1.235');
    expect(num(1234.5)).toBe('1.234,5');
  });
  it('usa la moneda y el idioma configurados', () => {
    setNumberFormat('en-US', 'USD');
    expect(money(1234.5)).toBe('$1,234.50');
    expect(num(1234.5)).toBe('1,234.5');
    setNumberFormat('es-CL', 'EUR');
    expect(money(10)).toMatch(/^EUR\s10,00$/);
  });
  it('ignora una moneda inválida', () => {
    setNumberFormat('es-CL', 'XX');
    expect(money(5)).toBe('$5');
  });
});
