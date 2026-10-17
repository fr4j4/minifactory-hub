import { afterEach, describe, expect, it, vi } from 'vitest';
import { sessionSecret } from '@/lib/config';
import { seal, unseal } from '@/lib/secret';

afterEach(() => { vi.unstubAllEnvs(); });
describe('sessionSecret', () => {
  it('en producción rechaza secretos ausentes, cortos o de ejemplo', () => {
    vi.stubEnv('NODE_ENV', 'production');
    for (const v of ['', 'dev', 'cambia-esto-por-un-valor-largo-y-aleatorio']) { vi.stubEnv('SESSION_SECRET', v); expect(() => sessionSecret()).toThrow(/SESSION_SECRET/); }
    vi.stubEnv('SESSION_SECRET', 'a'.repeat(64)); expect(sessionSecret()).toBe('a'.repeat(64));
  });
  it('fuera de producción usa el de desarrollo', () => { vi.stubEnv('SESSION_SECRET', ''); expect(sessionSecret()).toBe('dev-secret-cambiar-en-produccion'); });
  it('tras cambiar el secreto, SESSION_SECRET_PREVIOUS lee lo sellado antes', () => {
    vi.stubEnv('SESSION_SECRET', 'viejo'); const x = seal('12345678');
    vi.stubEnv('SESSION_SECRET', 'nuevo'); expect(() => unseal(x)).toThrow();
    vi.stubEnv('SESSION_SECRET_PREVIOUS', 'viejo'); expect(unseal(x)).toBe('12345678');
  });
});
