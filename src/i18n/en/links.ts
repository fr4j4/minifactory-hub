import type { Shape } from '../translate';
import type { es } from '../es';

export const links: Shape<typeof es['links']> = {
  pasteALinkPrintablesThingiverse: 'Paste a link (Printables, Thingiverse, MakerWorld, Instagram, Drive…)',
  referenceLink: 'Reference link',
  linkType: 'Link type',
  reading: 'Reading…',
  add: 'Add',
  noReferenceLinks: 'No reference links.',
  thereAreNoLinksYet: 'There are no links yet. The title and preview image are saved when the site allows it.',
  showInTheQuotePdf: 'Show in the quote PDF',
  removeLink: 'Remove link {title}',
  kind: {
    modelo_original: 'Original model',
    inspiracion: 'Inspiration',
    requerimiento: 'Customer requirement',
    otro: 'Other',
  },
  onlyHttp: 'Only http/https links are accepted',
};
