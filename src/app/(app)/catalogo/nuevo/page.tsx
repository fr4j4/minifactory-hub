import {modelAccess,photoAccess} from '@/lib/library/access';
import { and, asc, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { PageHeader, Card } from '@/components/ui';
import { ProductForm } from '@/components/catalog-bits';
import { getT } from '@/i18n/server';

export async function generateMetadata() { return { title: (await getT())('meta.newProduct') }; }
export default async function NewProduct() {
  const t = await getT();
  const user=await pagePerm('catalogo', 'C'); const db = await getDb();
  const mats = await db.select().from(s.materials).where(isNull(s.materials.deletedAt)); const models = await db.select({ id: s.modelFiles.id, name: s.modelFiles.name }).from(s.modelFiles).where(and(modelAccess(user),isNull(s.modelFiles.deletedAt))).orderBy(asc(s.modelFiles.name));
  return (<><PageHeader back={{ href: '/catalogo', label: t('nav.catalog') }} title={t('catalog.newProduct')} subtitle={t('catalog.chooseWhetherItIsSimple')} /><Card><ProductForm materials={mats.map((m) => ({ id: m.id, label: `${m.type} ${m.colorName}` }))} models={models} /></Card></>);
}
