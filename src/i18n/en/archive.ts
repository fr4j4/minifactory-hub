import type { Shape } from '../translate';
import type { es } from '../es';

export const archive: Shape<typeof es['archive']> = {
  title: 'Deleted records',
  hint: 'Deleted records are kept for history. From here you can bring them back into the lists.',
  empty: 'There are no deleted records.',
  type: 'Type',
  name: 'Record',
  deletedOn: 'Deleted',
  kind: {
    material: 'Material',
    spool: 'Spool',
    item: 'Supply item',
    product: 'Product',
    variant: 'Variant',
    customer: 'Customer',
    quote: 'Quote',
    order: 'Order',
    priceList: 'Price list',
    channel: 'Sales channel',
    user: 'User',
    collection: 'Collection',
    plan: 'Maintenance plan',
    incident: 'Incident',
    contact: 'Contact',
    payment: 'Payment',
    file: '3D file',
    photo: 'Photo',
    machine: 'Machine',
  },
};
