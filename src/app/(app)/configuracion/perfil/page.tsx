import { requireUser } from '@/lib/auth';
import { PageHeader, Card } from '@/components/ui';
import { ProfileForm } from '@/components/config-forms';
export const metadata = { title: 'Mi perfil' };
export default async function ProfilePage() { const u = await requireUser(); return (<><PageHeader title="Mi perfil y avisos" subtitle={`${u.name} · ${u.email}`} /><Card><ProfileForm prefs={u.notifPrefs} /></Card></>); }
