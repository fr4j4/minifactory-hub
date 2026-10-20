import { pagePerm } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { getT } from '@/i18n/server';
import { CatalogFill } from '@/components/catalog-fill';
import { previewCatalogFill } from '@/lib/services/catalog-fill';

export async function generateMetadata() { return { title: (await getT())('inventory.catFillTitle') }; }
export default async function CatalogFillPage() {
  const t = await getT();
  await pagePerm('inventario', 'E');
  return (<><PageHeader back={{ href: '/inventario', label: t('nav.inventory') }} title={t('inventory.catFillTitle')} subtitle={t('inventory.catFillSubtitle')} /><CatalogFill matches={await previewCatalogFill()} /></>);
}
