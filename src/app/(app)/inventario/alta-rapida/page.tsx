import { pagePerm } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { getT } from '@/i18n/server';
import { BulkEntry } from '@/components/bulk-entry';
import { listSuppliers } from '@/lib/services/inventory';

export async function generateMetadata() { return { title: (await getT())('inventory.bulkTitle') }; }
export default async function BulkPage() {
  const t = await getT();
  await pagePerm('inventario', 'C');
  return (<><PageHeader back={{ href: '/inventario', label: t('nav.inventory') }} title={t('inventory.bulkTitle')} subtitle={t('inventory.bulkSubtitle')} /><BulkEntry suppliers={(await listSuppliers()).map((x) => ({ id: x.id, name: x.name }))} /></>);
}
