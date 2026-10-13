import { and, asc, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { PageHeader, Card } from '@/components/ui';
import { ProductForm } from '@/components/catalog-bits';

export const metadata = { title: 'Nuevo producto' };
export default async function NewProduct() {
  await pagePerm('catalogo', 'C'); const db = await getDb();
  const mats = await db.select().from(s.materials).where(isNull(s.materials.deletedAt)); const models = await db.select({ id: s.modelFiles.id, name: s.modelFiles.name }).from(s.modelFiles).where(isNull(s.modelFiles.deletedAt)).orderBy(asc(s.modelFiles.name));
  return (<><PageHeader back={{ href: '/catalogo', label: 'Catálogo' }} title="Nuevo producto" subtitle="Elige si es simple o con variantes; se generan todas las combinaciones de atributos." /><Card><ProductForm materials={mats.map((m) => ({ id: m.id, label: `${m.type} ${m.colorName}` }))} models={models} /></Card></>);
}
