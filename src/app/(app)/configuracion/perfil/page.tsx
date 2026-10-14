import { requireUser } from '@/lib/auth';
import { PageHeader, Card } from '@/components/ui';
import { ProfileForm } from '@/components/config-forms';
import { getT } from '@/i18n/server';
export async function generateMetadata() { return { title: (await getT())('meta.profile') }; }
export default async function ProfilePage() {
  const t = await getT(); const u = await requireUser(); return (<><PageHeader title={t('settings.myProfileAlerts')} subtitle={`${u.name} · ${u.email}`} /><Card><ProfileForm prefs={u.notifPrefs} /></Card></>); }
