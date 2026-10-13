import { pagePerm } from '@/lib/auth';
import { canSeeCosts, canSetFinalPrice } from '@/lib/perm';
import { PageHeader } from '@/components/ui';
import { OrderForm } from '@/components/order-form';
import { loadEditorData } from '@/lib/editor-data';

export const metadata = { title: 'Nuevo pedido' };

export default async function NewOrder({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const user = await pagePerm('pedidos', 'C'); const sp = await searchParams;
  const { ctx, customers, models, variants } = await loadEditorData();
  return (<><PageHeader back={{ href: '/pedidos', label: 'Pedidos' }} title="Registrar pedido" subtitle="Lo que llegó por WhatsApp, Instagram, marketplace, feria o en persona. Con o sin presupuesto previo." />
    <OrderForm ctx={ctx} customers={customers} models={models} variants={variants} showCosts={canSeeCosts(user)} canPrice={canSetFinalPrice(user)} initialCustomer={sp.cliente} /></>);
}
