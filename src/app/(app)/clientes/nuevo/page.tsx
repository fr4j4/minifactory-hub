import { pagePerm } from '@/lib/auth';
import { getDb, s } from '@/db';
import { PageHeader, Card } from '@/components/ui';
import { CustomerForm } from '@/components/customer-form';

export const metadata = { title: 'Nuevo cliente' };
export default async function NewCustomer() {
  await pagePerm('clientes', 'C'); const db = await getDb(); const pl = await db.select().from(s.priceLists);
  return (<><PageHeader back={{ href: '/clientes', label: 'Clientes' }} title="Nuevo cliente" /><Card><CustomerForm priceLists={pl} /></Card></>);
}
