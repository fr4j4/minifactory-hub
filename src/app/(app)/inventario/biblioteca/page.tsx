import Link from 'next/link';
import { pagePerm } from '@/lib/auth';
import { can } from '@/lib/perm';
import { PageHeader } from '@/components/ui';
import { getT } from '@/i18n/server';
import { getIndex, listBrands, listFilaments, listMaterials } from '@/lib/catalog/ofd';
import { tempRange } from '@/lib/catalog/map';

export async function generateMetadata() { return { title: (await getT())('inventory.catLibTitle') }; }
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** Explorador del catálogo de filamentos: búsqueda, filtros y páginas calculados en el servidor (los mismos datos que sirve /api/catalog). */
export default async function LibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await getT(); const user = await pagePerm('inventario', 'V'); const sp = await searchParams;
  const q = one(sp.q).trim(), brand = one(sp.brand), material = one(sp.material), hasTemps = one(sp.temps) === '1'; const page = Math.max(1, Number(one(sp.page)) || 1);
  const [res, brands, mats, ix] = await Promise.all([listFilaments({ q, brand: brand || undefined, material: material || undefined, hasTemps, page, pageSize: 25 }), listBrands({ pageSize: 200 }), listMaterials(), getIndex()]);
  const pages = Math.max(1, Math.ceil(res.total / res.pageSize));
  const href = (p: number) => `/inventario/biblioteca?${new URLSearchParams({ ...(q && { q }), ...(brand && { brand }), ...(material && { material }), ...(hasTemps && { temps: '1' }), page: String(p) })}`;
  return (
    <>
      <PageHeader back={{ href: '/inventario', label: t('nav.inventory') }} title={t('inventory.catLibTitle')} subtitle={t('inventory.catLibSubtitle')} />
      <form className="card p-4 grid sm:grid-cols-4 gap-3 mb-4" role="search" data-testid="lib-filters">
        <label className="block sm:col-span-2"><span className="label">{t('inventory.catLibSearch')}</span><input name="q" defaultValue={q} className="input" /></label>
        <label className="block"><span className="label">{t('inventory.catLibBrand')}</span><select name="brand" defaultValue={brand} className="input"><option value="">{t('inventory.catLibAllBrands')}</option>{brands.items.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.filaments})</option>)}</select></label>
        <label className="block"><span className="label">{t('inventory.catLibMaterial')}</span><select name="material" defaultValue={material} className="input"><option value="">{t('inventory.catLibAllMaterials')}</option>{mats.map((m) => <option key={m.material} value={m.material}>{m.material} ({m.filaments})</option>)}</select></label>
        <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" name="temps" value="1" defaultChecked={hasTemps} />{t('inventory.catLibOnlyTemps')}</label>
        <div className="flex justify-end"><button className="btn-primary">{t('common.search')}</button></div>
      </form>
      {res.items.length === 0 ? <div className="card p-5 muted">{t('inventory.catLibEmpty')}</div> : (
        <div className="card overflow-x-auto" tabIndex={0}><table className="w-full" data-testid="lib-table"><thead><tr><th className="th">{t('inventory.catLibBrand')}</th><th className="th">{t('inventory.catLibColumnLine')}</th><th className="th">{t('inventory.catLibMaterial')}</th><th className="th">{t('inventory.catLibColumnTemps')}</th><th className="th text-right">{t('inventory.catLibColumnDensity')}</th><th className="th text-right">{t('inventory.catLibColumnColors')}</th><th className="th" /></tr></thead>
          <tbody>{res.items.map((f) => (
            <tr key={f.key} data-testid="lib-row"><td className="td font-medium">{f.brandName}</td><td className="td"><Link className="underline underline-offset-2" href={`/inventario/biblioteca/${f.key.split('/').map(encodeURIComponent).join('/')}`}>{f.name}</Link></td><td className="td">{f.material}</td>
              <td className="td text-xs tabular">{f.tempMax != null ? `${tempRange(f.tempMin, f.tempMax)} °C` : '—'}{f.bedMax != null ? ` · ${tempRange(f.bedMin, f.bedMax)} °C` : ''}</td><td className="td text-right tabular">{f.density}</td><td className="td text-right tabular">{f.colorCount}</td>
              <td className="td text-right">{can(user, 'inventario', 'C') && <Link className="btn-ghost btn-sm" href={`/inventario/biblioteca/${f.key.split('/').map(encodeURIComponent).join('/')}`}>{t('buy.pickColors')}</Link>}</td></tr>))}</tbody></table></div>)}
      <nav className="flex items-center justify-between mt-3 text-sm" aria-label="paginación">
        <span className="muted">{t('inventory.catLibPage', { page: res.page, pages, total: res.total })}</span>
        <span className="flex gap-2">{res.page > 1 && <Link className="btn-ghost btn-sm" href={href(res.page - 1)}>{t('inventory.catLibPrev')}</Link>}{res.nextPage && <Link className="btn-ghost btn-sm" href={href(res.nextPage)}>{t('inventory.catLibNext')}</Link>}</span>
      </nav>
      <p className="muted text-xs mt-4">{t('inventory.catLibMeta', { brands: ix.meta.brands, filaments: ix.meta.filaments, variants: ix.meta.variants, date: ix.meta.commitDate.slice(0, 10) })} {t('inventory.catLibLicense')}</p>
    </>
  );
}
