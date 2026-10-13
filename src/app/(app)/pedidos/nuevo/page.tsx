import { pagePerm } from '@/lib/auth';
import { canSeeCosts, canSetFinalPrice } from '@/lib/perm';
import { PageHeader } from '@/components/ui';
import { OrderForm } from '@/components/order-form';
import { loadEditorData } from '@/lib/editor-data';
import { getT } from '@/i18n/server';

export async function generateMetadata() { return { title: (await getT())('meta.newOrder') }; }

export default async function NewOrder({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const t = await getT();
  const user = await pagePerm('pedidos', 'C'); const sp = await searchParams;
  const { ctx, customers, models, variants } = await loadEditorData();
  return (<><PageHeader back={{ href: '/pedidos', label: t('nav.orders') }} title={t('common.registerOrder')} subtitle={t('orders.whatCameInThroughWhatsapp')} />
    <OrderForm ctx={ctx} customers={customers} models={models} variants={variants} showCosts={canSeeCosts(user)} canPrice={canSetFinalPrice(user)} initialCustomer={sp.cliente} /></>);
}
