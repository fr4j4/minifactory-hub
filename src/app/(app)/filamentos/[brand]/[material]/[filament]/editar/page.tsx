import { notFound } from 'next/navigation';
import { pagePerm } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { getT } from '@/i18n/server';
import { getIndex, listMaterials } from '@/lib/catalog/ofd';
import { filamentForEdit } from '@/lib/catalog/local';
import { FilamentForm, type FilamentFormInit } from '@/components/filament-form';

export async function generateMetadata() { return { title: (await getT())('inventory.catEdEdit') }; }
const s = (v: number | string | null | undefined) => (v === null || v === undefined ? '' : String(v));

export default async function EditFilamentPage({ params }: { params: Promise<{ brand: string; material: string; filament: string }> }) {
  const t = await getT(); await pagePerm('inventario', 'E'); const p = await params;
  const key = [p.brand, p.material, p.filament].map(decodeURIComponent).join('/');
  const e = await filamentForEdit(key); if (!e) notFound();
  const [ix, mats] = await Promise.all([getIndex(), listMaterials()]); const f = e.filament;
  const initial: FilamentFormInit = {
    brandId: f.brandId, brandName: e.brand?.name ?? f.brandName, brandWebsite: s(e.brand?.website), brandOrigin: s(e.brand?.origin), material: f.material, name: f.name, density: s(f.density),
    diameterTolerance: s(f.diameterTolerance), tempMin: s(f.tempMin), tempMax: s(f.tempMax), bedMin: s(f.bedMin), bedMax: s(f.bedMax), dryMax: s(f.dryMax), chamber: s(f.chamber), shoreA: s(f.shoreA), shoreD: s(f.shoreD),
    datasheetUrl: s(f.datasheetUrl), safetyUrl: s(f.safetyUrl), discontinued: f.discontinued, slicers: f.slicers,
  };
  return (
    <>
      <PageHeader back={{ href: `/filamentos/${key.split('/').map(encodeURIComponent).join('/')}`, label: `${f.brandName} · ${f.name}` }} title={t('inventory.catEdEditTitle', { name: f.name })} subtitle={`${t('inventory.catEdEditSubtitle')} ${e.inOfd ? t('inventory.catEdOfdNote') : t('inventory.catEdOwnNote')}`} />
      <FilamentForm initial={initial} existingKey={key} brands={ix.brands.map((b) => ({ id: b.id, name: b.name }))} materials={mats.map((m) => m.material)} />
    </>
  );
}
