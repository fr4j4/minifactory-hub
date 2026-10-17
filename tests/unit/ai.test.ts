import { describe, expect, it } from 'vitest';
import { createRedactor } from '@/lib/ai/redact';
import { costOf, estimateTokens } from '@/lib/ai/budget';
import { assertAiUrl, isLocalHost, sameAiTarget } from '@/lib/ai/config';
import { extractJson } from '@/lib/ai/run';
import { can } from '@/lib/perm';
import { DEFAULT_SETTINGS } from '@/lib/settings';

describe('IA: privacidad', () => {
  it('reemplaza correos, teléfonos, RUT y nombres y los restituye', () => {
    const r = createRedactor(true); r.addNames(['María Pérez']);
    const out = r.redact('María Pérez (maria@correo.cl, +56 9 8765 4321, RUT 12.345.678-5) quiere 10 llaveros. Escribió maria@correo.cl otra vez');
    expect(out).not.toMatch(/María|maria@|8765|12\.345/);
    expect(out).toContain('Cliente A');
    expect(out.match(/\[correo-1\]/g)).toHaveLength(2); // mismo alias para el mismo dato
    expect(r.restore(out)).toContain('maria@correo.cl');
    expect(r.restore(out)).toContain('María Pérez');
  });
  it('desactivado no toca el texto', () => {
    const r = createRedactor(false); expect(r.redact('a@b.cl')).toBe('a@b.cl');
  });
  it('no confunde medidas y cantidades con teléfonos', () => {
    const r = createRedactor(true); const t = 'Pieza de 82 x 45 x 31 mm, 150 g, 12 unidades, 0.2 mm';
    expect(r.redact(t)).toBe(t);
  });
});

describe('IA: costos', () => {
  it('estima según el modelo; los locales y el mock cuestan 0', () => {
    expect(costOf('claude-sonnet-5-5', 'anthropic', 1_000_000, 1_000_000)).toBeCloseTo(18);
    expect(costOf('claude-haiku-5-5', 'anthropic', 1_000_000, 0)).toBeCloseTo(1);
    expect(costOf('llama3', 'openai-compat', 5_000, 5_000)).toBe(0);
    expect(costOf('claude-sonnet-5-5', 'mock', 5_000, 5_000)).toBe(0);
    expect(estimateTokens('x'.repeat(400))).toBe(100);
  });
});

describe('IA: URLs del proveedor', () => {
  it('reconoce hosts locales', () => {
    for (const h of ['localhost', '127.0.0.1', '192.168.1.20', '10.0.0.5', '172.20.1.1', 'ollama', 'pc.local', '[::1]']) expect(isLocalHost(h), h).toBe(true);
    for (const h of ['api.openai.com', '8.8.8.8', '172.32.0.1', 'openrouter.ai']) expect(isLocalHost(h), h).toBe(false);
  });
  it('exige https fuera de la red y bloquea metadatos de nube', () => {
    expect(() => assertAiUrl('https://api.anthropic.com', false)).not.toThrow();
    expect(() => assertAiUrl('http://api.openai.com/v1', false)).toThrow(/https/);
    expect(() => assertAiUrl('http://ollama:11434/v1', false)).not.toThrow();
    expect(() => assertAiUrl('http://169.254.169.254/latest', false)).toThrow();
    expect(() => assertAiUrl('https://user:pw@x.com', false)).toThrow();
    expect(() => assertAiUrl('ftp://x', false)).toThrow();
    expect(() => assertAiUrl('https://api.openai.com/v1', true)).toThrow(/solo local/i);
    expect(() => assertAiUrl('http://192.168.1.5:1234/v1', true)).not.toThrow();
  });
});

describe('IA: salida del modelo', () => {
  it('extrae JSON aunque venga con cercas de código o texto', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Claro, aquí está: {"a":{"b":2}} ¡listo!')).toEqual({ a: { b: 2 } });
    expect(() => extractJson('sin json')).toThrow();
  });
});

describe('IA: valores por defecto', () => {
  it('viene apagada y sin proveedor', () => {
    expect(DEFAULT_SETTINGS.ai.enabled).toBe(false);
    expect(DEFAULT_SETTINGS.ai.provider).toBe('none');
    expect(DEFAULT_SETTINGS.ai.apiKeySealed).toBe('');
    expect(DEFAULT_SETTINGS.ai.privacy).toEqual({ redactPII: true, sendImages: false });
  });
  it('permisos del módulo ia por rol', () => {
    expect(can({ role: 'admin' }, 'ia', 'X')).toBe(true);
    expect(can({ role: 'operador' }, 'ia', 'C')).toBe(true);
    expect(can({ role: 'operador' }, 'ia', 'X')).toBe(false);
    expect(can({ role: 'ventas' }, 'ia', 'C')).toBe(true);
    expect(can({ role: 'ventas', permOverrides: { ia: '' } }, 'ia', 'C')).toBe(false);
  });
});

describe('sameAiTarget', () => {
  it('la clave guardada solo sirve para el mismo proveedor y URL', () => {
    const saved = { provider: 'openai-compat', baseUrl: 'https://api.openai.com/v1' };
    expect(sameAiTarget(saved, 'openai-compat', ' https://api.openai.com/v1/ ')).toBe(true);
    expect(sameAiTarget(saved, 'openai-compat', 'https://evil.example/v1')).toBe(false);
    expect(sameAiTarget(saved, 'anthropic', 'https://api.openai.com/v1')).toBe(false);
  });
});
