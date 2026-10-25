import { pagePerm } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { getT } from '@/i18n/server';
import { getIndex, listMaterials } from '@/lib/catalog/ofd';
import { FilamentForm, EMPTY_FILAMENT } from '@/components/filament-form';

export async function generateMetadata() { return { title: (await getT())('inventory.catEdCreateTitle') }; }

export default async function NewFilamentPage() {
  const t = await getT(); await pagePerm('inventario', 'C');
  const [ix, mats] = await Promise.all([getIndex(), listMaterials()]);
  return (
    <>
      <PageHeader back={{ href: '/filamentos', label: t('inventory.catLibBack') }} title={t('inventory.catEdCreateTitle')} subtitle={t('inventory.catEdCreateSubtitle')} />
      <FilamentForm initial={EMPTY_FILAMENT} brands={ix.brands.map((b) => ({ id: b.id, name: b.name }))} materials={mats.map((m) => m.material)} />
    </>
  );
}
