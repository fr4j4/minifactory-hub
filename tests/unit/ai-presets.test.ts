import { describe, expect, it } from 'vitest';
import { PRESETS, PRESET_BY_ID, isPresetId, presetOf } from '@/lib/ai/presets';
import { assertAiUrl, isLocalHost } from '@/lib/ai/config';
import { parseTarget, suggestModels } from '@/lib/ai/discovery';
import { DICTIONARIES } from '@/i18n/translate';

describe('proveedores preconfigurados', () => {
  it('los ids son únicos y existen los dos genéricos', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    expect(PRESET_BY_ID.get('genericOpenai')).toMatchObject({ kind: 'openai-compat', group: 'generic' });
    expect(PRESET_BY_ID.get('genericAnthropic')).toMatchObject({ kind: 'anthropic', group: 'generic' });
    expect(PRESETS.filter((p) => p.group === 'local').length).toBeGreaterThanOrEqual(3);
    expect(PRESET_BY_ID.get('ollama')).toMatchObject({ baseUrl: 'http://localhost:11434/v1', needsKey: false, group: 'local' });
    expect(PRESET_BY_ID.get('ollamaCloud')).toMatchObject({ baseUrl: 'https://ollama.com/v1', needsKey: true, group: 'cloud', kind: 'openai-compat' });
  });
  it('cada preajuste trae una URL que pasa la validación de seguridad (los locales también en «solo local»)', () => {
    for (const p of PRESETS.filter((x) => x.baseUrl)) {
      expect(() => assertAiUrl(p.baseUrl, false), p.id).not.toThrow();
      if (p.group === 'local') { expect(isLocalHost(new URL(p.baseUrl).hostname), p.id).toBe(true); expect(() => assertAiUrl(p.baseUrl, true), p.id).not.toThrow(); expect(p.needsKey, p.id).toBe(false); }
      else expect(new URL(p.baseUrl).protocol, p.id).toBe('https:');
    }
    expect(() => assertAiUrl(PRESET_BY_ID.get('ollamaCloud')!.baseUrl, true)).toThrow(/solo local/i); // la nube no pasa en modo solo local
  });
  it('tienen nombre y descripción en español e inglés', () => {
    for (const loc of ['es', 'en'] as const) for (const p of PRESETS) {
      const e = (DICTIONARIES[loc] as any).ai.presets[p.id]; expect(e?.label, `${loc}.${p.id}`).toBeTruthy(); expect(e?.note, `${loc}.${p.id}`).toBeTruthy();
    }
  });
  it('infiere el preajuste de instalaciones anteriores', () => {
    expect(presetOf({ preset: '', provider: 'anthropic' })).toBe('anthropic');
    expect(presetOf({ preset: '', provider: 'openai-compat' })).toBe('genericOpenai');
    expect(presetOf({ preset: '', provider: 'none' })).toBe('');
    expect(presetOf({ preset: 'ollama', provider: 'openai-compat' })).toBe('ollama');
    expect(presetOf({ preset: 'inventado', provider: 'none' })).toBe('');
    expect(isPresetId('ollama')).toBe(true); expect(isPresetId('x')).toBe(false);
  });
});

describe('sugerencia de modelos', () => {
  it('rápido = el más chico, avanzado = el más grande razonable, y detecta visión', () => {
    expect(suggestModels(['llama3.1:8b', 'qwen2.5vl:7b', 'gpt-oss:20b', 'nomic-embed-text'])).toEqual({ fast: 'qwen2.5vl:7b', smart: 'gpt-oss:20b', vision: 'qwen2.5vl:7b' });
    expect(suggestModels(['llama3.3:70b', 'llama3.2:3b', 'qwen3:32b'])).toEqual({ fast: 'llama3.2:3b', smart: 'qwen3:32b', vision: '' }); // 70B no suele caber
    expect(suggestModels(['llama3.3:70b', 'llama3.1:405b'])).toMatchObject({ smart: 'llama3.3:70b' }); // si todo es enorme, el más chico
  });
  it('ignora modelos de embeddings y se las arregla con un solo modelo o sin tamaños', () => {
    expect(suggestModels(['nomic-embed-text', 'bge-m3'])).toMatchObject({ fast: 'nomic-embed-text' }); // no hay otra cosa
    expect(suggestModels(['mi-modelo'])).toEqual({ fast: 'mi-modelo', smart: 'mi-modelo', vision: '' });
    expect(suggestModels([])).toEqual({ fast: '', smart: '', vision: '' });
    expect(suggestModels(['gemma3:4b', 'llava:7b']).vision).toBe('gemma3:4b');
  });
});

describe('dirección a buscar', () => {
  it('acepta direcciones locales con o sin puerto y rechaza internet', () => {
    expect(parseTarget('192.168.1.20')).toEqual({ host: '192.168.1.20', port: undefined });
    expect(parseTarget('http://192.168.1.20:11434/v1')).toEqual({ host: '192.168.1.20', port: 11434 });
    expect(parseTarget(' pc-taller.local:1234 ')).toEqual({ host: 'pc-taller.local', port: 1234 });
    expect(parseTarget('[::1]:8080')).toEqual({ host: '::1', port: 8080 });
    for (const bad of ['8.8.8.8', 'api.openai.com', '169.254.169.254', '10.0.0.1:99999', '10.0.0.1:0', 'a b', '', 'http://']) expect(() => parseTarget(bad), bad).toThrow();
  });
});
