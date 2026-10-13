import type { Shape } from '../translate';
import type { es } from '../es';

export const sources: Shape<typeof es['sources']> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  correo: 'Email',
  marketplace: 'Marketplace',
  feria: 'Fair',
  presencial: 'In person',
  recomendacion: 'Referral',
  otro: 'Other',
};
