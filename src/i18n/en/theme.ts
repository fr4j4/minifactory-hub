import type { Shape } from '../translate';
import type { es } from '../es';

export const theme: Shape<typeof es['theme']> = {
  mode: 'Mode',
  mode_system: 'System',
  mode_light: 'Light',
  mode_dark: 'Dark',
  palette: 'Palette',
  useShop: "Shop's default",
  appearance: 'Appearance',
  shopPalette: "Shop's default palette",
  shopPaletteHint: "Used by people who haven't picked another one in their browser.",
};
