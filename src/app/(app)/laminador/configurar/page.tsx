import { pagePerm } from '@/lib/auth';
import { can } from '@/lib/perm';
import { PageHeader } from '@/components/ui';
import { SlicingSetup } from '@/components/slicing-setup';
import { slicingReadiness } from '@/lib/slicer/setup';
import { orcaAvailable } from '@/lib/slicer/catalog';
import { getT } from '@/i18n/server';

export async function generateMetadata() { return { title: (await getT())('meta.slicerSetup') }; }
export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const t = await getT();
  const user = await pagePerm('laminador', 'V');
  const data = await slicingReadiness();
  return (
    <>
      <PageHeader back={{ href: '/laminador', label: t('nav.slicer') }} title={t('slicer.setUpSlicing')} subtitle={t('slicer.threeStepsSoTheApp')} />
      {!orcaAvailable() && <div className="rounded-xl box-warn p-3 text-sm mb-4">{t('slicer.orcaMissingConfig', { cmd: 'npm run orca:install' })}</div>}
      <SlicingSetup data={data} canEdit={can(user, 'laminador', 'C')} />
    </>
  );
}
