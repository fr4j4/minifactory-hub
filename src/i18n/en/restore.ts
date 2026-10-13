import type { Shape } from '../translate';
import type { es } from '../es';

export const restore: Shape<typeof es['restore']> = {
  restore: 'Restore',
  done: 'Restored',
  parentDeleted: 'It can\'t be restored: the record it belongs to is still deleted. Restore that one first.',
  conflict: 'It can\'t be restored: “{value}” is already used by another record.',
};
