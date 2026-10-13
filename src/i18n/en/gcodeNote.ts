import type { Shape } from '../translate';
import type { es } from '../es';

export const gcodeNote: Shape<typeof es['gcodeNote']> = {
  modelTimeOnly: 'Model time without heating or preparation',
  curaMeters: 'Cura reports meters: grams are calculated from the material\'s diameter and density',
  noSummary: 'The G-code has no slicer summary (no time or filament comments)',
  unsliced3mf: 'Unsliced 3MF: it has no time or grams. You can slice it on the server or enter the data manually',
};
