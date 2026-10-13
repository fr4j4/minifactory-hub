'use client';
import { markNotificationsReadAction } from '@/actions/settings';
import { useAction } from './client';
export function MarkRead() { const { run, pending } = useAction(); return <button className="btn-ghost" disabled={pending} onClick={() => run(() => markNotificationsReadAction(), { ok: 'Todo marcado como leído' })}>Marcar todo como leído</button>; }
