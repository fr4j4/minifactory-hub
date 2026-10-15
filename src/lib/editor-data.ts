import { and, asc, eq, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { getCalcContext } from './context';
import type { CustomerOpt } from '@/components/customer-picker';
import type { ModelBrief } from '@/actions/quotes';
import type { VariantOpt } from '@/components/quote-editor';
import { normalizeLicense } from './library/source';

/** Datos para los editores de presupuestos y pedidos: contexto de cálculo, clientes, biblioteca y catálogo. */
export async function loadEditorData() {
  const db = await getDb(); const ctx = await getCalcContext();
  const pls = await db.select().from(s.priceLists); const plMap = new Map(pls.map((p) => [p.id, p.adjustPct]));
  const cs = await db.select().from(s.customers).where(isNull(s.customers.deletedAt)).orderBy(asc(s.customers.name));
  const customers: CustomerOpt[] = cs.map((c) => ({ id: c.id, name: c.name, phone: c.phone, type: c.type, priceAdj: c.priceListId ? plMap.get(c.priceListId) ?? 0 : 0, occasional: c.isOccasional }));
  const rows = await db.select({ m: s.modelFiles, v: s.fileVersions }).from(s.modelFiles).innerJoin(s.fileVersions, eq(s.fileVersions.id, s.modelFiles.currentVersionId)).where(isNull(s.modelFiles.deletedAt)).orderBy(asc(s.modelFiles.name));
  const models: ModelBrief[] = rows.map(({ m, v }) => { const sm: any = (v.meta as any)?.sliced; return { commercial: normalizeLicense(m.license).commercial, licenseCode: m.license ?? undefined, id: m.id, name: m.name, versionId: v.id, format: m.format ?? '', dimX: m.dimX, dimY: m.dimY, dimZ: m.dimZ, volumeCm3: m.volumeCm3, areaCm2: m.areaCm2, hasSliced: !!(v.meta as any)?.hasSlicedData, sliced: sm ? { timeS: sm.timeS, totalG: sm.totalG, filaments: sm.filaments ?? [], slicer: sm.slicer, notes: sm.notes ?? [], layers: sm.layers } : null, thumb: !!v.thumbKey }; });
  const vs = await db.select({ v: s.productVariants, p: s.products }).from(s.productVariants).innerJoin(s.products, eq(s.products.id, s.productVariants.productId)).where(and(isNull(s.productVariants.deletedAt), eq(s.productVariants.active, true), eq(s.products.status, 'activo')));
  const variants: VariantOpt[] = vs.map(({ v, p }) => ({ id: v.id, label: `${p.name}${Object.values(v.attrs ?? {}).length ? ' · ' + Object.values(v.attrs ?? {}).join(' / ') : ''} (${v.sku})`, price: v.price, avgCost: v.avgCost, stock: v.stock - v.reserved }));
  return { ctx, customers, models, variants };
}
