import { and, asc, eq, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { canSeeCosts } from '@/lib/perm';
import { PageHeader } from '@/components/ui';
import { QuickSale } from '@/components/quick-sale';

export const metadata = { title: 'Venta rápida' };
export default async function NewSale() {
  const user = await pagePerm('ventas', 'C'); const db = await getDb();
  const vs = await db.select({ v: s.productVariants, p: s.products }).from(s.productVariants).innerJoin(s.products, eq(s.products.id, s.productVariants.productId)).where(and(isNull(s.productVariants.deletedAt), eq(s.productVariants.active, true), eq(s.products.status, 'activo'))).orderBy(asc(s.products.name));
  const ch = await db.select().from(s.salesChannels).where(eq(s.salesChannels.active, true)).orderBy(asc(s.salesChannels.name));
  return (<><PageHeader back={{ href: '/ventas', label: 'Ventas' }} title="Venta rápida" subtitle="Mostrador, feria o marketplace: busca el producto, elige el canal y registra." />
    <QuickSale showCosts={canSeeCosts(user)} channels={ch.map((c) => ({ id: c.id, name: c.name, kind: c.kind, commissionPct: c.commissionPct, commissionFixed: c.commissionFixed, avgShipping: c.avgShipping }))} variants={vs.map(({ v, p }) => ({ id: v.id, sku: v.sku, label: `${p.name}${Object.values(v.attrs ?? {}).length ? ' · ' + Object.values(v.attrs ?? {}).join(' / ') : ''}`, stock: v.stock - v.reserved, price: v.price, cost: v.avgCost, priceByChannel: v.priceByChannel ?? {} }))} /></>);
}
