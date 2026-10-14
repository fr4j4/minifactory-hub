import type { Shape } from '../translate';
import type { es } from '../es';

export const roles: Shape<typeof es['roles']> = {
  admin: 'Administrator',
  operador: 'Operator',
  ventas: 'Sales',
};
