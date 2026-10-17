import { and, asc, eq, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { canSeeCosts, canSetFinalPrice } from '@/lib/perm';
import { PageHeader } from '@/components/ui';
import { QuickSale } from '@/components/quick-sale';
import { getT } from '@/i18n/server';

export async function generateMetadata() { return { title: (await getT())('meta.quickSale') }; }
export default async function NewSale() {
  const t = await getT();
  const user = await pagePerm('ventas', 'C'); const db = await getDb();
  const vs = await db.select({ v: s.productVariants, p: s.products }).from(s.productVariants).innerJoin(s.products, eq(s.products.id, s.productVariants.productId)).where(and(isNull(s.productVariants.deletedAt), eq(s.productVariants.active, true), eq(s.products.status, 'activo'))).orderBy(asc(s.products.name));
  const ch = await db.select().from(s.salesChannels).where(eq(s.salesChannels.active, true)).orderBy(asc(s.salesChannels.name));
  return (<><PageHeader back={{ href: '/ventas', label: t('nav.sales') }} title={t('common.quickSale')} subtitle={t('sales.counterFairOrMarketplaceFind')} />
    <QuickSale showCosts={canSeeCosts(user)} canPrice={canSetFinalPrice(user)} channels={ch.map((c) => ({ id: c.id, name: c.name, kind: c.kind, commissionPct: c.commissionPct, commissionFixed: c.commissionFixed, avgShipping: c.avgShipping }))} variants={vs.map(({ v, p }) => ({ id: v.id, sku: v.sku, label: `${p.name}${Object.values(v.attrs ?? {}).length ? ' · ' + Object.values(v.attrs ?? {}).join(' / ') : ''}`, stock: v.stock - v.reserved, price: v.price, cost: canSeeCosts(user) ? v.avgCost : 0, priceByChannel: v.priceByChannel ?? {} }))} /></>);
}
