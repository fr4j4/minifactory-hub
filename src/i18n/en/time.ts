import type { Shape } from '../translate';
import type { es } from '../es';

export const time: Shape<typeof es['time']> = {
  now: 'just now',
  minutesAgo: '{n} min ago',
  hoursAgo: '{n} h ago',
  daysAgo_one: '{count} day ago',
  daysAgo_other: '{count} days ago',
};
