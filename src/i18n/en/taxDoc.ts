import type { Shape } from '../translate';
import type { es } from '../es';

export const taxDoc: Shape<typeof es['taxDoc']> = {
  boleta: 'Receipt',
  factura: 'Invoice',
};
