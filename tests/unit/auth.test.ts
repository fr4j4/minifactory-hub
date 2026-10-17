import { describe, expect, it } from 'vitest';
import { loginFailed, loginThrottled, safeNextPath } from '@/lib/auth';

describe('auth', () => {
  it('safeNextPath acepta solo rutas internas', () => {
    expect(safeNextPath('/pedidos?x=1')).toBe('/pedidos?x=1');
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', '/\t/evil.example', '', null, 'pedidos']) expect(safeNextPath(bad)).toBe('/');
  });
  it('bloquea tras 8 intentos fallidos con la misma clave', () => {
    for (let i = 0; i < 8; i++) loginFailed('login|x@y.cl');
    expect(loginThrottled('login|x@y.cl')).toBe(true);
    expect(loginThrottled('login|otro@y.cl')).toBe(false);
  });
});
