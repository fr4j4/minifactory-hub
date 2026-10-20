import { isNull } from 'drizzle-orm';
import { pagePerm } from '@/lib/auth';
import { getDb, s } from '@/db';
import { PageHeader, Card } from '@/components/ui';
import { CustomerForm } from '@/components/customer-form';
import { getT } from '@/i18n/server';

export async function generateMetadata() { return { title: (await getT())('meta.newCustomer') }; }
export default async function NewCustomer() {
  const t = await getT();
  await pagePerm('clientes', 'C'); const db = await getDb(); const pl = await db.select().from(s.priceLists).where(isNull(s.priceLists.deletedAt));
  return (<><PageHeader back={{ href: '/clientes', label: t('nav.customers') }} title={t('customers.newCustomer')} /><Card><CustomerForm priceLists={pl} /></Card></>);
}
