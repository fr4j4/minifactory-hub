import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, desc, eq, isNull, inArray } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can, canSeeCosts } from '@/lib/perm';
import { PageHeader, Card, Table, Badge } from '@/components/ui';
import { ProductForm } from '@/components/catalog-bits';
import { LinksEditor } from '@/components/links-editor';
import { PhotoCapture } from '@/components/photo-capture';
import { dmyHm } from '@/lib/format';

export const metadata = { title: 'Producto' };
const KIND: Record<string, string> = { produccion: 'Producción', venta: 'Venta', merma: 'Merma', muestra: 'Muestra', uso_interno: 'Uso interno', ajuste: 'Ajuste', devolucion: 'Devolución', reserva: 'Reserva' };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pagePerm('catalogo', 'V'); const { id } = await params; const db = await getDb();
  const [p] = await db.select().from(s.products).where(eq(s.products.id, id)); if (!p) notFound();
  const vars = await db.select().from(s.productVariants).where(eq(s.productVariants.productId, id)).orderBy(asc(s.productVariants.sku));
  const mv = vars.length ? await db.select({ m: s.stockMovements, sku: s.productVariants.sku }).from(s.stockMovements).innerJoin(s.productVariants, eq(s.productVariants.id, s.stockMovements.variantId)).where(inArray(s.stockMovements.variantId, vars.map((v) => v.id))).orderBy(desc(s.stockMovements.createdAt)).limit(40) : [];
  const links = await db.select().from(s.referenceLinks).where(and(eq(s.referenceLinks.ownerType, 'product'), eq(s.referenceLinks.ownerId, id)));
  const photos = await db.select().from(s.photos).where(and(eq(s.photos.productId, id), isNull(s.photos.deletedAt))).limit(12);
  const mats = await db.select().from(s.materials).where(isNull(s.materials.deletedAt)); const models = await db.select({ id: s.modelFiles.id, name: s.modelFiles.name }).from(s.modelFiles).where(isNull(s.modelFiles.deletedAt));
  const costs = canSeeCosts(user);
  return (
    <>
      <PageHeader back={{ href: '/catalogo', label: 'Catálogo' }} title={p.name} subtitle={<span className="inline-flex gap-2"><Badge>{p.mode === 'simple' ? 'Simple' : 'Con variantes'}</Badge>{p.category}</span>} />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-4">
          <Card title="Variantes" pad={false}><Table><thead><tr><th className="th">SKU</th><th className="th">Atributos</th><th className="th text-right">Stock</th><th className="th text-right">Precio</th>{costs && <th className="th text-right">Costo</th>}<th className="th text-right">Peso / tiempo</th></tr></thead><tbody>{vars.map((v) => <tr key={v.id} className={v.active ? '' : 'opacity-50'}><td className="td font-medium tabular">{v.sku}</td><td className="td">{Object.entries(v.attrs ?? {}).map(([k, x]) => `${k}: ${x}`).join(' · ') || '—'}</td><td className="td text-right tabular">{v.stock}</td><td className="td text-right tabular">${v.price.toLocaleString('es-CL')}</td>{costs && <td className="td text-right tabular">${v.avgCost.toLocaleString('es-CL')}</td>}<td className="td text-right text-xs tabular">{v.weightG} g · {v.printH} h</td></tr>)}</tbody></Table></Card>
          <Card title="Movimientos de stock" pad={false}><Table><thead><tr><th className="th">Fecha</th><th className="th">SKU</th><th className="th">Tipo</th><th className="th text-right">Cant.</th><th className="th">Motivo</th></tr></thead><tbody>{mv.map(({ m, sku }) => <tr key={m.id}><td className="td tabular text-xs">{dmyHm(m.createdAt)}</td><td className="td tabular">{sku}</td><td className="td">{KIND[m.kind] ?? m.kind}</td><td className={`td text-right tabular ${m.qty < 0 ? 'text-red-600 dark:text-red-400' : m.qty > 0 ? 'text-emerald-600' : ''}`}>{m.qty > 0 ? '+' : ''}{m.qty}</td><td className="td text-xs muted">{m.reason}</td></tr>)}{mv.length === 0 && <tr><td className="td muted" colSpan={5}>Sin movimientos.</td></tr>}</tbody></Table></Card>
          <Card title="Fotos"><div className="mb-3">{can(user, 'galeria', 'C') && <PhotoCapture intent={{ productId: p.id, modelFileId: p.modelFileId }} />}</div><div className="grid grid-cols-4 sm:grid-cols-6 gap-2">{photos.map((x) => <img key={x.id} src={`/api/media/${x.variants?.['320'] ?? x.storageKey}`} alt="" className="rounded aspect-square object-cover" />)}</div></Card>
        </div>
        <div className="space-y-4">
          {can(user, 'catalogo', 'E') && <Card title="Datos del producto"><ProductForm materials={mats.map((m) => ({ id: m.id, label: `${m.type} ${m.colorName}` }))} models={models} p={{ id: p.id, name: p.name, category: p.category, description: p.description, mode: p.mode, status: p.status, modelFileId: p.modelFileId, attributes: p.attributes ?? [], tags: p.tags ?? [] }} /></Card>}
          <Card title="Links de referencia"><LinksEditor value={links.map((l) => ({ ...l }))} persist={{ ownerType: 'product', ownerId: p.id, revalidate: `/catalogo/${p.id}` }} readOnly={!can(user, 'catalogo', 'E')} compact /></Card>
          {p.modelFileId && <Link className="btn-ghost w-full" href={`/archivos/${p.modelFileId}`}>Ver modelo 3D vinculado</Link>}
        </div>
      </div>
    </>
  );
}
