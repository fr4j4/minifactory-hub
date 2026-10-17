import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sessionSecret } from '@/lib/config';
import { loginFailed, loginKeyFor, loginThrottled, safeNextPath } from '@/lib/auth';

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
  it('un navegador de confianza tiene su propio contador de intentos', () => {
    const k = loginKeyFor('a@b.cl'); for (let i = 0; i < 8; i++) loginFailed(k);
    expect(loginThrottled(k)).toBe(true);
    expect(loginKeyFor('a@b.cl', 'falsa')).toBe(k);
    const tag = loginKeyFor('a@b.cl', crypto.createHmac('sha256', sessionSecret()).update('login-device:a@b.cl').digest('base64url'));
    expect(tag).toBe('login|a@b.cl|dev'); expect(loginThrottled(tag)).toBe(false);
  });
});
