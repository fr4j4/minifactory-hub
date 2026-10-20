import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pagePerm } from '@/lib/auth';
import { can } from '@/lib/perm';
import { PageHeader } from '@/components/ui';
import { getT } from '@/i18n/server';
import { getFilament, listVariants } from '@/lib/catalog/ofd';
import { specsOf } from '@/lib/catalog/map';
import { CatalogInfo } from '@/components/catalog-info';

type P = { brand: string; material: string; filament: string };
export async function generateMetadata({ params }: { params: Promise<P> }) { const p = await params; const f = await getFilament(`${p.brand}/${p.material}/${p.filament}`); return { title: f ? `${f.brandName} ${f.name}` : (await getT())('inventory.catLibTitle') }; }

export default async function LibraryLinePage({ params, searchParams }: { params: Promise<P>; searchParams: Promise<{ page?: string }> }) {
  const t = await getT(); const user = await pagePerm('inventario', 'V'); const p = await params; const sp = await searchParams;
  const key = `${decodeURIComponent(p.brand)}/${decodeURIComponent(p.material)}/${decodeURIComponent(p.filament)}`;
  const f = await getFilament(key); if (!f) notFound();
  const vs = (await listVariants(key, { page: Number(sp.page) || 1, pageSize: 60 }))!; const pages = Math.max(1, Math.ceil(vs.total / vs.pageSize));
  const base = `/inventario/biblioteca/${key.split('/').map(encodeURIComponent).join('/')}`;
  return (
    <>
      <PageHeader back={{ href: '/inventario/biblioteca', label: t('inventory.catLibBack') }} title={`${f.brandName} · ${f.name}`} subtitle={`${f.material} · ${f.density} g/cm³ · ${t('inventory.catColorsCount', { n: f.colorCount })}`}
        actions={can(user, 'inventario', 'C') ? <Link className="btn-primary" href={`/inventario/alta-rapida?catalog=${encodeURIComponent(key)}`}>{t('inventory.catLibAdd')}</Link> : undefined} />
      <div className="mb-4"><CatalogInfo specs={specsOf(f)} /></div>
      <h2 className="text-sm font-semibold mb-2">{t('inventory.catLibColorsPage', { page: vs.page, pages })}</h2>
      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2" data-testid="lib-colors">{vs.items.map((v) => (
        <li key={v.id} className="card p-3 flex items-center gap-3"><span className="inline-block h-8 w-8 rounded-full border border-[var(--line)] shrink-0" style={{ background: v.hexes.length > 1 ? `linear-gradient(90deg, ${v.hexes.join(', ')})` : v.hex }} aria-hidden />
          <div className="min-w-0"><div className="font-medium truncate">{v.name}</div><div className="text-xs muted tabular">{v.hexes.join(' · ')}{v.sizes[0] ? ` · ${v.sizes[0].weight} g` : ''}{v.sizes.find((s) => s.gtin)?.gtin ? ` · ${v.sizes.find((s) => s.gtin)!.gtin}` : ''}</div></div></li>))}</ul>
      <nav className="flex justify-end gap-2 mt-3">{vs.page > 1 && <Link className="btn-ghost btn-sm" href={`${base}?page=${vs.page - 1}`}>{t('inventory.catLibPrev')}</Link>}{vs.nextPage && <Link className="btn-ghost btn-sm" href={`${base}?page=${vs.nextPage}`}>{t('inventory.catLibNext')}</Link>}</nav>
    </>
  );
}
