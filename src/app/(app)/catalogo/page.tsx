import Link from 'next/link';
import { and, asc, eq, ilike, isNull, or } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can, canSeeCosts } from '@/lib/perm';
import { PageHeader, Card, Table, Badge, Empty, Stat, StatusBadge } from '@/components/ui';
import { VariantRow } from '@/components/catalog-bits';
import { money } from '@/lib/format';

export const metadata = { title: 'Catálogo y stock' };

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ q?: string; low?: string }> }) {
  const user = await pagePerm('catalogo', 'V'); const sp = await searchParams; const db = await getDb();
  const prods = await db.select().from(s.products).where(and(isNull(s.products.deletedAt), sp.q ? or(ilike(s.products.name, `%${sp.q}%`), ilike(s.products.category, `%${sp.q}%`))! : undefined)).orderBy(asc(s.products.name));
  const vars = await db.select().from(s.productVariants).where(isNull(s.productVariants.deletedAt)).orderBy(asc(s.productVariants.sku));
  const channels = await db.select().from(s.salesChannels).where(eq(s.salesChannels.active, true));
  const mats = await db.select().from(s.materials).where(isNull(s.materials.deletedAt));
  const costs = canSeeCosts(user); const edit = can(user, 'catalogo', 'E');
  const units = vars.reduce((a, v) => a + v.stock, 0); const value = vars.reduce((a, v) => a + v.stock * v.avgCost, 0); const low = vars.filter((v) => v.active && v.minStock > 0 && v.stock <= v.minStock);
  return (
    <>
      <PageHeader title="Catálogo y stock de producto terminado" subtitle="Piezas ya impresas que puedes vender: stock por variante, costo real, margen y reposición." actions={<>{can(user, 'ventas', 'C') && <Link className="btn-ghost" href="/ventas/nueva">Venta rápida</Link>}{can(user, 'catalogo', 'C') && <Link className="btn-primary" href="/catalogo/nuevo" data-testid="new-product">+ Nuevo producto</Link>}</>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4"><Stat label="Productos" value={prods.length} /><Stat label="Unidades en stock" value={units} />{costs && <Stat label="Stock valorizado" value={money(value)} />}<Stat label="Por reponer" value={low.length} tone={low.length ? 'warn' : undefined} sub={low.slice(0, 2).map((v) => v.sku).join(', ')} /></div>
      <form className="flex gap-2 mb-4" role="search"><input name="q" defaultValue={sp.q} className="input sm:max-w-sm" placeholder="Buscar producto o categoría" aria-label="Buscar productos" /><button className="btn-ghost">Buscar</button></form>
      {prods.length === 0 ? <Card><Empty title="Aún no hay productos" hint="Crea un producto simple o con variantes (color, tamaño) y registra cuántas unidades tienes." action={<Link className="btn-primary" href="/catalogo/nuevo">Nuevo producto</Link>} /></Card> : (
        <div className="space-y-4" data-testid="catalog">{prods.map((p) => {
          const pv = vars.filter((v) => v.productId === p.id);
          return (
            <Card key={p.id} pad={false} title={<span className="flex items-center gap-2"><Link className="hover:underline text-base" href={`/catalogo/${p.id}`}>{p.name}</Link><Badge>{p.mode === 'simple' ? 'Simple' : 'Con variantes'}</Badge>{p.status !== 'activo' && <StatusBadge status={p.status} />}{p.category && <span className="muted text-xs font-normal">{p.category}</span>}</span>}>
              <Table><thead><tr><th className="th">Variante</th><th className="th text-right">Stock</th><th className="th text-right">Mínimo</th><th className="th text-right">Precio</th><th className="th text-right">{costs ? 'Costo' : ''}</th><th className="th text-right">{costs ? 'Margen' : ''}</th><th className="th" /></tr></thead>
                <tbody>{pv.map((v) => <VariantRow key={v.id} v={{ id: v.id, sku: v.sku, stock: v.stock, reserved: v.reserved, minStock: v.minStock, price: v.price, avgCost: v.avgCost, location: v.location, weightG: v.weightG, printH: v.printH, active: v.active, priceByChannel: v.priceByChannel ?? {} }} label={Object.values(v.attrs ?? {}).join(' / ') || p.name} avgCost={costs ? v.avgCost : 0} channels={channels} canEdit={edit} materials={mats.map((m) => ({ id: m.id, label: `${m.type} ${m.colorName}` }))} />)}</tbody></Table>
            </Card>);
        })}</div>
      )}
    </>
  );
}
