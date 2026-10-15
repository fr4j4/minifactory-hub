/**
 * Plantilla de documentos (N7a, nivel L1): un modelo JSON tipado —nunca HTML— que describe secciones, tema y textos.
 * El mismo componente `QuoteDocument` lo renderiza en la vista cliente, en el PDF y en la vista previa de Configuración.
 */
export type SectionId = 'customer' | 'items' | 'optionals' | 'totals' | 'references' | 'notes' | 'terms';
export const SECTION_IDS: SectionId[] = ['customer', 'items', 'optionals', 'totals', 'references', 'notes', 'terms'];
export type DocFont = 'sans' | 'serif' | 'mono';
export const DOC_FONTS: Record<DocFont, string> = { sans: 'Inter, Arial, sans-serif', serif: 'Georgia, "Times New Roman", serif', mono: '"Courier New", monospace' };

export interface DocSection { id: SectionId; visible: boolean; /** título propio (vacío = el de fábrica traducido) */ title: string; /** texto propio; en «condiciones» reemplaza el de Configuración */ text: string }
export interface DocTemplate {
  version: 1;
  theme: { brandColor: string; font: DocFont; showLogo: boolean; showThumbs: boolean };
  header: { subtitle: string };
  sections: DocSection[];
  options: { showLeadTime: boolean; showModelNames: boolean };
  footer: string;
}

export const DEFAULT_QUOTE_TEMPLATE: DocTemplate = {
  version: 1,
  theme: { brandColor: '', font: 'sans', showLogo: true, showThumbs: true },
  header: { subtitle: '' },
  sections: SECTION_IDS.map((id) => ({ id, visible: true, title: '', text: '' })),
  options: { showLeadTime: true, showModelNames: true },
  footer: '',
};

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
/** Normaliza lo guardado (o recibido del navegador): descarta claves desconocidas, completa las que faltan y limita los textos. */
export function normalizeTemplate(raw: unknown): DocTemplate {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const D = DEFAULT_QUOTE_TEMPLATE;
  const seen = new Set<SectionId>(); const sections: DocSection[] = [];
  for (const x of Array.isArray(r.sections) ? r.sections : []) {
    const id = x?.id as SectionId; if (!SECTION_IDS.includes(id) || seen.has(id)) continue; seen.add(id);
    sections.push({ id, visible: bool(x.visible, true), title: str(x.title, 80), text: str(x.text, 2000) });
  }
  for (const id of SECTION_IDS) if (!seen.has(id)) sections.push({ id, visible: true, title: '', text: '' }); // las secciones nuevas aparecen al final
  const color = typeof r.theme?.brandColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.theme.brandColor) ? r.theme.brandColor : '';
  return {
    version: 1,
    theme: { brandColor: color, font: r.theme?.font in DOC_FONTS ? r.theme.font : D.theme.font, showLogo: bool(r.theme?.showLogo, D.theme.showLogo), showThumbs: bool(r.theme?.showThumbs, D.theme.showThumbs) },
    header: { subtitle: str(r.header?.subtitle, 200) },
    sections,
    options: { showLeadTime: bool(r.options?.showLeadTime, true), showModelNames: bool(r.options?.showModelNames, true) },
    footer: str(r.footer, 500),
  };
}

/** Reemplaza {cliente}, {numero}, {total}, {vigencia}, {taller}; lo desconocido se deja tal cual. */
export function fillVars(text: string, vars: Record<string, string>) {
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}
