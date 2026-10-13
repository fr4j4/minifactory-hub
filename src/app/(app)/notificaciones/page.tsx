import Link from 'next/link';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { requireUser } from '@/lib/auth';
import { PageHeader, Card, Empty } from '@/components/ui';
import { MarkRead } from '@/components/mark-read';
import { ago } from '@/lib/format';

export const metadata = { title: 'Notificaciones' };
export default async function NotificationsPage() {
  const u = await requireUser(); const db = await getDb();
  const rows = (await db.select().from(s.notifications).where(or(isNull(s.notifications.userId), eq(s.notifications.userId, u.id))).orderBy(desc(s.notifications.createdAt)).limit(80)).filter((n) => u.notifPrefs[n.kind] !== false);
  return (<><PageHeader title="Notificaciones" subtitle="Avisos internos del taller. Elige cuáles recibir en tu perfil." actions={<MarkRead />} />
    {rows.length === 0 ? <Card><Empty title="Sin notificaciones" /></Card> : <Card pad={false}><ul className="divide-y divide-slate-100 dark:divide-slate-800">{rows.map((n) => <li key={n.id}><Link href={n.href ?? '#'} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40"><span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${n.read ? 'bg-slate-300' : 'bg-brand-600'}`} aria-label={n.read ? 'Leída' : 'Sin leer'} /><div><div className="text-sm font-medium">{n.title}</div>{n.body && <div className="text-xs muted">{n.body}</div>}</div><span className="ml-auto text-xs muted shrink-0">{ago(n.createdAt)}</span></Link></li>)}</ul></Card>}</>);
}
