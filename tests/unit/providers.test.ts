import { describe, expect, it } from 'vitest';
import { assertSupportedProvider, detectImportProvider, supportedProviders, unsupportedMessage } from '@/lib/library/providers';

describe('detección del sitio de importación', () => {
  it('reconoce MakerWorld (con o sin www, subdominio e idioma) como compatible', () => {
    for (const u of ['https://makerworld.com/models/1', 'https://www.makerworld.com/es/models/2-x', 'https://eu.makerworld.com/models/3'])
      expect(detectImportProvider(u)).toMatchObject({ id: 'makerworld', supported: true, known: true });
  });
  it('reconoce sitios conocidos pero todavía no compatibles', () => {
    expect(detectImportProvider('https://www.printables.com/model/987-llavero')).toMatchObject({ id: 'printables', supported: false, known: true });
    expect(detectImportProvider('https://www.thingiverse.com/thing:555')).toMatchObject({ id: 'thingiverse', supported: false, known: true });
  });
  it('marca como desconocido cualquier otro sitio y no se deja engañar por dominios parecidos', () => {
    expect(detectImportProvider('https://example.com/modelo.stl')).toMatchObject({ id: 'unknown', supported: false, known: false, host: 'example.com' });
    for (const u of ['https://makerworld.com.evil.example/models/1', 'https://notmakerworld.com/models/1', 'https://evil.example/?u=https://makerworld.com/models/1'])
      expect(detectImportProvider(u)?.supported).toBe(false);
  });
  it('rechaza lo que no es una URL http(s)', () => {
    expect(detectImportProvider('no es un enlace')).toBeNull(); expect(detectImportProvider('ftp://makerworld.com/x')).toBeNull();
  });
  it('explica el motivo y qué sitios sí se aceptan', () => {
    expect(supportedProviders().map((p) => p.id)).toEqual(['makerworld']);
    expect(unsupportedMessage(detectImportProvider('https://www.printables.com/model/1')!)).toContain('Printables todavía no es compatible');
    expect(unsupportedMessage(detectImportProvider('https://example.com/x')!)).toContain('No reconocemos el sitio example.com');
    expect(() => assertSupportedProvider('https://example.com/x.stl')).toThrow(/MakerWorld/);
    expect(assertSupportedProvider('https://makerworld.com/models/1').id).toBe('makerworld');
  });
});
