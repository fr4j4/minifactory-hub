import { describe, expect, it } from 'vitest';
import { DEFAULT_QUOTE_TEMPLATE, fillVars, normalizeTemplate, SECTION_IDS } from '@/lib/documents';

describe('plantilla de documentos (N7a)', () => {
  it('vacío o basura → plantilla por defecto completa', () => {
    for (const raw of [undefined, null, 5, 'x', {}, { sections: 'no' }]) { const t = normalizeTemplate(raw); expect(t.sections.map((s) => s.id)).toEqual(SECTION_IDS); expect(t.theme.font).toBe('sans'); }
  });
  it('respeta el orden y la visibilidad, y agrega al final las secciones que faltan', () => {
    const t = normalizeTemplate({ sections: [{ id: 'terms', visible: false }, { id: 'items', visible: true, title: 'Detalle' }, { id: 'items' }, { id: 'inventada' }] });
    expect(t.sections.map((s) => s.id).slice(0, 2)).toEqual(['terms', 'items']); expect(t.sections[0].visible).toBe(false); expect(t.sections[1].title).toBe('Detalle');
    expect(t.sections.length).toBe(SECTION_IDS.length);
  });
  it('limita textos, valida el color y la tipografía (nada de HTML ni valores libres)', () => {
    const t = normalizeTemplate({ theme: { brandColor: 'javascript:alert(1)', font: 'comic' }, footer: 'x'.repeat(9999), header: { subtitle: 5 } });
    expect(t.theme.brandColor).toBe(''); expect(t.theme.font).toBe('sans'); expect(t.footer.length).toBe(500); expect(t.header.subtitle).toBe('');
    expect(normalizeTemplate({ theme: { brandColor: '#12abEF' } }).theme.brandColor).toBe('#12abEF');
  });
  it('variables {cliente}… y lo desconocido queda tal cual', () => {
    expect(fillVars('Hola {cliente}, {numero} {nada}', { cliente: 'Ana', numero: 'P-1' })).toBe('Hola Ana, P-1 {nada}');
    expect(DEFAULT_QUOTE_TEMPLATE.sections.every((s) => s.visible)).toBe(true);
  });
});
