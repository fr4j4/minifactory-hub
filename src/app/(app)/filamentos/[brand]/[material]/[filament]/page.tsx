import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pagePerm } from '@/lib/auth';
import { can } from '@/lib/perm';
import { PageHeader } from '@/components/ui';
import { getT } from '@/i18n/server';
import { getFilament, getVariant, listVariants } from '@/lib/catalog/ofd';
import { specsOf } from '@/lib/catalog/map';
import { CatalogInfo } from '@/components/catalog-info';
import { LineActions } from '@/components/filament-actions';
import { VariantManager } from '@/components/variant-manager';
import { filamentForEdit } from '@/lib/catalog/local';
import { AddToMine, type ColorOpt } from '@/components/add-to-mine';
import { getDb, s } from '@/db';
import { materialStock } from '@/lib/services/inventory';
import { variantKey } from '@/lib/catalog/map';
import { and, inArray, isNull } from 'drizzle-orm';

type P = { brand: string; material: string; filament: string };
export async function generateMetadata({ params }: { params: Promise<P> }) { const p = await params; const f = await getFilament(`${p.brand}/${p.material}/${p.filament}`); return { title: f ? `${f.brandName} ${f.name}` : (await getT())('inventory.catLibTitle') }; }

export default async function LibraryLinePage({ params, searchParams }: { params: Promise<P>; searchParams: Promise<{ page?: string; variant?: string }> }) {
  const t = await getT(); const user = await pagePerm('inventario', 'V'); const p = await params; const sp = await searchParams;
  const key = `${decodeURIComponent(p.brand)}/${decodeURIComponent(p.material)}/${decodeURIComponent(p.filament)}`;
  const f = await getFilament(key); if (!f) notFound();
  const inOfd = (await filamentForEdit(key))?.inOfd ?? false;
  const vs = (await listVariants(key, { page: Number(sp.page) || 1, pageSize: 60 }))!; const pages = Math.max(1, Math.ceil(vs.total / vs.pageSize));
  // cuáles de estos colores ya están en Mis filamentos y cuánto hay de cada uno
  const db = await getDb(); const keys = (sp.variant ? [sp.variant, ...vs.items.map((v) => v.id)] : vs.items.map((v) => v.id)).map((id) => variantKey(key, id));
  const own = keys.length ? await db.select({ id: s.materials.id, variantId: s.materials.variantId }).from(s.materials).where(and(inArray(s.materials.variantId, keys), isNull(s.materials.deletedAt))) : [];
  const stockBy = new Map((await materialStock(db)).map((x) => [x.materialId, x.physicalG]));
  const extra = sp.variant && !vs.items.some((v) => v.id === sp.variant) ? await getVariant(key, sp.variant) : null;
  const colors: ColorOpt[] = (extra ? [extra, ...vs.items] : vs.items).map((v) => { const m = own.find((o) => o.variantId === variantKey(key, v.id)); return { id: v.id, name: v.name, hex: v.hex, hexes: v.hexes, size: v.sizes[0] ? `${v.sizes[0].weight} g` : null, gtin: v.sizes.find((z) => z.gtin)?.gtin ?? null, materialId: m?.id ?? null, stockG: m ? Math.round(stockBy.get(m.id) ?? 0) : 0 }; });
  const base = `/filamentos/${key.split('/').map(encodeURIComponent).join('/')}`;
  return (
    <>
      <PageHeader back={{ href: '/filamentos', label: t('inventory.catLibBack') }} title={`${f.brandName} · ${f.name}`} subtitle={`${f.material} · ${f.density} g/cm³ · ${t('inventory.catColorsCount', { n: f.colorCount })}`}
        actions={<div className="flex flex-wrap items-center gap-2">{can(user, 'inventario', 'C') && <Link className="btn-ghost" href={`/inventario/alta-rapida?catalog=${encodeURIComponent(key)}`}>{t('buy.loadExistingLine')}</Link>}<LineActions filamentKey={key} canEdit={can(user, 'inventario', 'E')} canDelete={can(user, 'inventario', 'X')} local={f.local} inOfd={inOfd} /></div>} />
      <div className="mb-4"><CatalogInfo specs={specsOf(f)} /></div>
      <h2 className="text-sm font-semibold mb-1">{t('inventory.catLibColorsPage', { page: vs.page, pages })}</h2>
      <p className="muted text-sm mb-3 max-w-2xl">{t('buy.libHint')}</p>
      <AddToMine filamentKey={key} material={f.material} colors={colors} canAdd={can(user, 'inventario', 'C')} highlight={sp.variant} />
      <nav className="flex justify-end gap-2 mt-3">{vs.page > 1 && <Link className="btn-ghost btn-sm" href={`${base}?page=${vs.page - 1}`}>{t('inventory.catLibPrev')}</Link>}{vs.nextPage && <Link className="btn-ghost btn-sm" href={`${base}?page=${vs.nextPage}`}>{t('inventory.catLibNext')}</Link>}</nav>
      <VariantManager filamentKey={key} material={f.material} variants={vs.items} canCreate={can(user, 'inventario', 'C')} canEdit={can(user, 'inventario', 'E')} canDelete={can(user, 'inventario', 'X')} />
    </>
  );
}
