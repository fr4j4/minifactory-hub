import { pagePerm } from '@/lib/auth';
import { can } from '@/lib/perm';
import { PageHeader } from '@/components/ui';
import { SlicingSetup } from '@/components/slicing-setup';
import { slicingReadiness } from '@/lib/slicer/setup';
import { orcaAvailable } from '@/lib/slicer/catalog';

export const metadata = { title: 'Configurar laminado' };
export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const user = await pagePerm('laminador', 'V');
  const data = await slicingReadiness();
  return (
    <>
      <PageHeader back={{ href: '/laminador', label: 'Laminador' }} title="Configurar laminado" subtitle="Tres pasos para que el sitio calcule tiempo, gramos y precio con el mismo motor que Bambu Studio." />
      {!orcaAvailable() && <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm mb-4">OrcaSlicer no está instalado en el servidor (<code>npm run orca:install</code>): puedes dejar todo configurado, pero el laminado automático no funcionará hasta instalarlo.</div>}
      <SlicingSetup data={data} canEdit={can(user, 'laminador', 'C')} />
    </>
  );
}
