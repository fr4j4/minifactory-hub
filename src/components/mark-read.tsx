'use client';
import { markNotificationsReadAction } from '@/actions/settings';
import { useAction } from './client';
import { useT } from '@/i18n/client';
export function MarkRead() {
  const t = useT(); const { run, pending } = useAction(); return <button className="btn-ghost" disabled={pending} onClick={() => run(() => markNotificationsReadAction(), { ok: t('notifications.allMarkedAsRead2') })}>{t('notifications.markAllAsRead')}</button>; }
