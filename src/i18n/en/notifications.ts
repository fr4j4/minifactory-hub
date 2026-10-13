import type { Shape } from '../translate';
import type { es } from '../es';

export const notifications: Shape<typeof es['notifications']> = {
  notifications: 'Notifications',
  internalWorkshopAlertsChooseWhic: 'Internal workshop alerts. Choose which ones to receive in your profile.',
  noNotifications: 'No notifications',
  read: 'Read',
  unread: 'Unread',
  markAllAsRead: 'Mark all as read',
  allMarkedAsRead2: 'All marked as read',
};
