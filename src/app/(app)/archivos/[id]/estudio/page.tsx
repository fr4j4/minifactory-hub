import { aiAvailableFor } from '@/lib/ai';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can } from '@/lib/perm';
import { PageHeader } from '@/components/ui';
import { Studio } from '@/components/studio/studio';
import { getCalcContext } from '@/lib/context';
import { getT } from '@/i18n/server';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { return { title: (await getT())('studio.title') }; }

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT(); const user = await pagePerm('laminador', 'V'); const { id } = await params; const db = await getDb();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const [f] = await db.select().from(s.modelFiles).where(eq(s.modelFiles.id, id)); if (!f?.currentVersionId) notFound();
  const ctx = await getCalcContext();
  return (
    <>
      <PageHeader back={{ href: `/archivos/${f.id}`, label: f.name }} title={t('studio.title')} subtitle={t('studio.subtitle')} />
      <Studio mesh={{ volumeCm3: f.volumeCm3, areaCm2: f.areaCm2 }} fileVersionId={f.currentVersionId} fileId={f.id} fileName={f.name} ctx={ctx} canSlice={can(user, 'laminador', 'V')} canSaveProfile={can(user, 'laminador', 'C')} ai={{ advisor: await aiAvailableFor(user, 'profile.advisor'), diagnose: await aiAvailableFor(user, 'profile.diagnose'), canEdit: can(user, 'laminador', 'E'), canCreate: can(user, 'laminador', 'C') }} />
    </>
  );
}
