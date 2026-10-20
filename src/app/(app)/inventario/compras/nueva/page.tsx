import { and, asc, eq, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { getT } from '@/i18n/server';
import { PurchaseForm } from '@/components/purchase-form';
import { listSuppliers } from '@/lib/services/inventory';
import { ymd } from '@/lib/format';

export async function generateMetadata() { return { title: (await getT())('buy.newTitle') }; }
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** `?material=id` o `?lines=material:id:cantidad,item:id:cantidad` precargan las líneas (desde Stock, la lista de compras o un código de barras). */
export default async function NewPurchasePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await getT(); await pagePerm('inventario', 'C'); const sp = await searchParams; const db = await getDb();
  const mats = await db.select().from(s.materials).where(and(isNull(s.materials.deletedAt), eq(s.materials.generic, false))).orderBy(asc(s.materials.type), asc(s.materials.manufacturer), asc(s.materials.colorName));
  const items = await db.select().from(s.inventoryItems).where(isNull(s.inventoryItems.deletedAt)).orderBy(asc(s.inventoryItems.name));
  const sup = await listSuppliers(db);
  const preset: Array<{ materialId?: string; itemId?: string; qty: number }> = [];
  const one1 = one(sp.material); if (one1) preset.push({ materialId: one1, qty: 1 });
  for (const part of one(sp.lines).split(',').filter(Boolean)) { const [kind, id, q] = part.split(':'); const qty = Math.max(1, Math.min(50, Number(q) || 1)); if (kind === 'material' && id) preset.push({ materialId: id, qty }); else if (kind === 'item' && id) preset.push({ itemId: id, qty }); }
  return (
    <>
      <PageHeader back={{ href: '/inventario?tab=compras', label: t('buy.backToPurchases') }} title={t('buy.newTitle')} subtitle={t('buy.newSubtitle')} />
      <PurchaseForm today={ymd()} preset={preset}
        suppliers={sup.map((x) => ({ id: x.id, name: x.name, recoversVat: x.recoversVat }))}
        materials={mats.map((m) => ({ id: m.id, label: `${m.manufacturer ? m.manufacturer + ' ' : ''}${m.type} ${m.colorName}`, hex: m.hex, type: m.type, tech: m.tech, packG: m.packG, costPerKg: m.costPerKg }))}
        items={items.map((i) => ({ id: i.id, name: i.name, unit: i.unit, unitCost: i.unitCost, category: i.category }))} />
    </>
  );
}
