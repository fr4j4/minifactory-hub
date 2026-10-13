import type { Shape } from '../translate';
import type { es } from '../es';

export const payMethod: Shape<typeof es['payMethod']> = {
  transferencia: 'Bank transfer',
  efectivo: 'Cash',
  tarjeta: 'Card',
  marketplace: 'Marketplace',
  otro: 'Other',
  pendiente: 'Pending',
};
