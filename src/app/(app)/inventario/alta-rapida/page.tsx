import { pagePerm } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { getT } from '@/i18n/server';
import { BulkEntry } from '@/components/bulk-entry';
import { listSuppliers } from '@/lib/services/inventory';
import { getFilament, getVariant, listVariants } from '@/lib/catalog/ofd';

export async function generateMetadata() { return { title: (await getT())('inventory.bulkTitle') }; }
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** `?catalog=marca/material/filamento` (desde la biblioteca) o `&variant=color` (desde un código de barras) precargan el formulario. */
export default async function BulkPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await getT(); const sp = await searchParams;
  await pagePerm('inventario', 'C');
  const key = one(sp.catalog); const variant = one(sp.variant);
  const line = key ? await getFilament(key) : null;
  const colors = line ? (variant ? [await getVariant(key, variant)].filter((v) => !!v) : (await listVariants(key, { pageSize: 200 }))?.items ?? []) : [];
  return (<><PageHeader back={{ href: '/inventario', label: t('nav.inventory') }} title={t('inventory.bulkTitle')} subtitle={t('inventory.bulkSubtitle')} /><BulkEntry suppliers={(await listSuppliers()).map((x) => ({ id: x.id, name: x.name }))} preset={line ? { line, colors: colors as NonNullable<(typeof colors)[number]>[] } : undefined} key={key + variant} /></>);
}
