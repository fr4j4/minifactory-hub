import {modelAccess,photoAccess} from '@/lib/library/access';
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
import { dmyHm, money } from '@/lib/format';
import { getT } from '@/i18n/server';
import { tOr } from '@/i18n/translate';
import { RemoveButton } from '@/components/remove-button';

export async function generateMetadata() { return { title: (await getT())('meta.product') }; }

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const user = await pagePerm('catalogo', 'V'); const { id } = await params; const db = await getDb();
  const [p] = await db.select().from(s.products).where(eq(s.products.id, id)); if (!p || p.deletedAt) notFound();
  const vars = await db.select().from(s.productVariants).where(and(eq(s.productVariants.productId, id), isNull(s.productVariants.deletedAt))).orderBy(asc(s.productVariants.sku));
  const mv = vars.length ? await db.select({ m: s.stockMovements, sku: s.productVariants.sku }).from(s.stockMovements).innerJoin(s.productVariants, eq(s.productVariants.id, s.stockMovements.variantId)).where(inArray(s.stockMovements.variantId, vars.map((v) => v.id))).orderBy(desc(s.stockMovements.createdAt)).limit(40) : [];
  const links = await db.select().from(s.referenceLinks).where(and(eq(s.referenceLinks.ownerType, 'product'), eq(s.referenceLinks.ownerId, id)));
  const photos = await db.select().from(s.photos).where(and(photoAccess(user),eq(s.photos.productId, id), isNull(s.photos.deletedAt))).limit(12);
  const mats = await db.select().from(s.materials).where(isNull(s.materials.deletedAt)); const models = await db.select({ id: s.modelFiles.id, name: s.modelFiles.name }).from(s.modelFiles).where(and(modelAccess(user),isNull(s.modelFiles.deletedAt)));
  const costs = canSeeCosts(user);
  return (
    <>
      <PageHeader back={{ href: '/catalogo', label: t('nav.catalog') }} title={p.name} subtitle={<span className="inline-flex gap-2"><Badge>{p.mode === 'simple' ? t('catalog.simple') : t('catalog.withVariants')}</Badge>{p.category}</span>} actions={can(user, 'catalogo', 'X') ? <RemoveButton kind="product" id={p.id} name={p.name} redirectTo="/catalogo" /> : undefined} />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 min-w-0 space-y-4">
          <Card title={t('catalog.variants')} pad={false}><Table><thead><tr><th className="th">{t('catalog.sku')}</th><th className="th">{t('catalog.attributes')}</th><th className="th text-right">{t('common.stock')}</th><th className="th text-right">{t('catalog.price')}</th>{costs && <th className="th text-right">{t('common.cost')}</th>}<th className="th text-right">{t('catalog.weightTime')}</th>{can(user, 'catalogo', 'X') && p.mode !== 'simple' && vars.length > 1 && <th className="th" />}</tr></thead><tbody>{vars.map((v) => <tr key={v.id} className={v.active ? '' : 'opacity-50'}><td className="td font-medium tabular">{v.sku}</td><td className="td">{Object.entries(v.attrs ?? {}).map(([k, x]) => `${k}: ${x}`).join(' · ') || '—'}</td><td className="td text-right tabular">{v.stock}</td><td className="td text-right tabular">{money(v.price)}</td>{costs && <td className="td text-right tabular">{money(v.avgCost)}</td>}<td className="td text-right text-xs tabular">{v.weightG} g · {v.printH} h</td>{can(user, 'catalogo', 'X') && p.mode !== 'simple' && vars.length > 1 && <td className="td text-right"><RemoveButton kind="variant" id={v.id} name={v.sku} /></td>}</tr>)}</tbody></Table></Card>
          <Card title={t('catalog.stockMovements')} pad={false}><Table><thead><tr><th className="th">{t('common.date')}</th><th className="th">{t('catalog.sku')}</th><th className="th">{t('common.typeLabel')}</th><th className="th text-right">{t('common.qty')}</th><th className="th">{t('common.reason')}</th></tr></thead><tbody>{mv.map(({ m, sku }) => <tr key={m.id}><td className="td tabular text-xs">{dmyHm(m.createdAt)}</td><td className="td tabular">{sku}</td><td className="td">{tOr(t, `catalog.kind.${m.kind}`, m.kind) ?? m.kind}</td><td className={`td text-right tabular ${m.qty < 0 ? 'text-danger' : m.qty > 0 ? 'text-emerald-600' : ''}`}>{m.qty > 0 ? '+' : ''}{m.qty}</td><td className="td text-xs muted">{m.reason}</td></tr>)}{mv.length === 0 && <tr><td className="td muted" colSpan={5}>{t('catalog.noMovements')}</td></tr>}</tbody></Table></Card>
          <Card title={t('catalog.photos')}><div className="mb-3">{can(user, 'galeria', 'C') && <PhotoCapture intent={{ productId: p.id, modelFileId: p.modelFileId }} />}</div><div className="grid grid-cols-4 sm:grid-cols-6 gap-2">{photos.map((x) => <img key={x.id} src={`/api/media/${x.variants?.['320'] ?? x.storageKey}`} alt="" className="rounded aspect-square object-cover" />)}</div></Card>
        </div>
        <div className="space-y-4">
          {can(user, 'catalogo', 'E') && <Card title={t('catalog.productDetails')}><ProductForm materials={mats.map((m) => ({ id: m.id, label: `${m.type} ${m.colorName}` }))} models={models} p={{ id: p.id, name: p.name, category: p.category, description: p.description, mode: p.mode, status: p.status, modelFileId: p.modelFileId, attributes: p.attributes ?? [], tags: p.tags ?? [] }} /></Card>}
          <Card title={t('common.referenceLinks')}><LinksEditor value={links.map((l) => ({ ...l }))} persist={{ ownerType: 'product', ownerId: p.id, revalidate: `/catalogo/${p.id}` }} readOnly={!can(user, 'catalogo', 'E')} compact /></Card>
          {p.modelFileId && <Link className="btn-ghost w-full" href={`/archivos/${p.modelFileId}`}>{t('catalog.viewLinked3dModel')}</Link>}
        </div>
      </div>
    </>
  );
}
