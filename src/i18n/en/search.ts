import type { Shape } from '../translate';
import type { es } from '../es';

export const search: Shape<typeof es['search']> = {
  customer: 'Customer',
  order: 'Order',
  quote: 'Quote',
  product: 'Product',
  file: '3D file',
  spool: 'Spool',
};
