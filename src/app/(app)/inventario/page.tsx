import Link from 'next/link';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can, canSeeCosts } from '@/lib/perm';
import { PageHeader, Card, Table, Tabs, Badge, Meter, Swatch, StatusBadge, Empty } from '@/components/ui';
import { AddSpoolButton, ItemDialog, ItemMove, MaterialForm } from '@/components/inventory-bits';
import { listSuppliers, materialStock, shoppingList, materialCostPerKg } from '@/lib/services/inventory';
import { CopyButton } from '@/components/client';
import { dmyHm, grams, money, num } from '@/lib/format';
import { getT } from '@/i18n/server';
import { tOr } from '@/i18n/translate';
import { LineBulkEdit } from '@/components/line-bulk-edit';
import { RemoveButton } from '@/components/remove-button';

export async function generateMetadata() { return { title: (await getT())('meta.inventory') }; }

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const t = await getT();
  const user = await pagePerm('inventario', 'V'); const { tab = 'materiales' } = await searchParams; const db = await getDb(); const costs = canSeeCosts(user); const edit = can(user, 'inventario', 'E');
  const mats = await db.select().from(s.materials).where(isNull(s.materials.deletedAt)).orderBy(asc(s.materials.type), asc(s.materials.colorName));
  const linkMap = await (await import('@/lib/slicer/links')).defaultLinkMap(db);
  const stock = await materialStock(db); const spools = await db.select().from(s.spools).where(isNull(s.spools.deletedAt)).orderBy(asc(s.spools.code));
  const profs = (await db.select().from(s.slicerProfiles).where(and(eq(s.slicerProfiles.type, 'filament'), isNull(s.slicerProfiles.deletedAt)))).map((p) => ({ id: p.id, name: p.name }));
  const machines = await db.select().from(s.machines);
  const sup = await listSuppliers(db);
  const items = tab === 'otros' ? await db.select().from(s.inventoryItems).where(isNull(s.inventoryItems.deletedAt)).orderBy(asc(s.inventoryItems.category), asc(s.inventoryItems.name)) : [];
  const moves = tab === 'movimientos' ? await db.select({ m: s.inventoryMovements, code: s.spools.code, item: s.inventoryItems.name }).from(s.inventoryMovements).leftJoin(s.spools, eq(s.spools.id, s.inventoryMovements.spoolId)).leftJoin(s.inventoryItems, eq(s.inventoryItems.id, s.inventoryMovements.itemId)).orderBy(desc(s.inventoryMovements.createdAt)).limit(80) : [];
  const shop = tab === 'compras' ? await shoppingList() : [];
  const costMap = new Map<string, number>(); if (costs) for (const m of mats) costMap.set(m.id, await materialCostPerKg(m.id, db));
  const low = stock.filter((x) => x.low).length;
  return (
    <>
      <PageHeader title={t('inventory.inventory')} subtitle={t('inventory.perIndividualSpoolOrBottle')} actions={<>{can(user, 'inventario', 'V') && <Link className="btn-ghost" href="/inventario/escanear">{t('inventory.scanQr2')}</Link>}{can(user, 'inventario', 'C') && <><Link className="btn-ghost" href="/inventario/alta-rapida" data-testid="bulk-open">{t('inventory.bulkOpen')}</Link><MaterialForm profiles={profs} trigger={<button className="btn-ghost" data-testid="new-material">{t('inventory.material')}</button>} /><AddSpoolButton suppliers={sup.map((x) => ({ id: x.id, name: x.name }))} materials={mats.map((m) => ({ id: m.id, label: `${m.type} ${m.colorName}${m.manufacturer ? ' · ' + m.manufacturer : ''}`, costPerKg: m.costPerKg }))} /></>}</>} />
      <Tabs current={tab} tabs={[{ key: 'materiales', label: t('inventory.tabMaterials'), href: '/inventario', count: low || undefined }, { key: 'bobinas', label: t('inventory.tabSpools'), href: '/inventario?tab=bobinas' }, { key: 'otros', label: t('inventory.tabOther'), href: '/inventario?tab=otros' }, { key: 'compras', label: t('inventory.tabShopping'), href: '/inventario?tab=compras' }, { key: 'movimientos', label: t('inventory.tabMovements'), href: '/inventario?tab=movimientos' }]} />
      {tab === 'materiales' && mats.length > 0 && can(user, 'inventario', 'E') && <LineBulkEdit showCost={costs} lines={[...mats.reduce((a, m) => { const k = `${m.manufacturer ?? ''}|${m.line ?? ''}`; const e = a.get(k) ?? { manufacturer: m.manufacturer, line: m.line, count: 0, costPerKg: m.costPerKg as number | null, stockMinG: m.stockMinG as number | null }; e.count++; if (e.costPerKg !== m.costPerKg) e.costPerKg = null; if (e.stockMinG !== m.stockMinG) e.stockMinG = null; a.set(k, e); return a; }, new Map<string, { manufacturer: string | null; line: string | null; count: number; costPerKg: number | null; stockMinG: number | null }>()).values()]} />}
      {tab === 'materiales' && (mats.length === 0 ? <Card><Empty title={t('inventory.noMaterials')} hint={t('inventory.createTheMaterialCatalogType')} /></Card> : (
        <Card pad={false}><Table><thead><tr><th className="th">{t('common.material')}</th><th className="th">{t('inventory.physicalStock')}</th><th className="th text-right">{t('inventory.reserved')}</th><th className="th text-right">{t('inventory.available')}</th><th className="th text-right">{t('inventory.minimum')}</th><th className="th text-right">{t('inventory.spools')}</th>{costs && <th className="th text-right">{t('inventory.costKg')}</th>}<th className="th" /></tr></thead>
          <tbody>{mats.map((m) => { const st = stock.find((x) => x.materialId === m.id)!; return (
            <tr key={m.id} data-testid="material-row"><td className="td"><div className="font-medium"><Swatch hex={m.hex} /> {m.type} {m.colorName}</div><div className="text-xs muted">{m.manufacturer} {m.line} {m.tech === 'resina' && `· ${t('inventory.resinLower')}`}</div></td>
              <td className="td min-w-[140px]"><div className="tabular text-sm mb-1">{grams(st.physicalG)}</div><Meter value={st.physicalG} max={Math.max(m.stockMinG * 3, st.physicalG)} tone={st.low ? 'bad' : 'ok'} /></td><td className="td text-right tabular muted">{grams(st.reservedG)}</td><td className={`td text-right tabular font-medium ${st.low ? 'text-danger' : ''}`}>{grams(st.availableG)}{st.low && <Badge tone="red" className="ml-1">{t('inventory.low')}</Badge>}</td><td className="td text-right tabular muted">{grams(m.stockMinG)}</td><td className="td text-right tabular">{st.spools}</td>{costs && <td className="td text-right tabular">{money(costMap.get(m.id))}</td>}
              <td className="td text-right">{edit && <span className="whitespace-nowrap"><MaterialForm m={{ ...m, filamentProfileId: linkMap.get(m.id) ?? null }} profiles={profs} trigger={<button className="btn-ghost btn-sm">{t('common.edit')}</button>} />{can(user, 'inventario', 'X') && <> <RemoveButton kind="material" id={m.id} name={`${m.type} ${m.colorName}`} replaceOptions={mats.map((x) => ({ id: x.id, label: `${x.type} ${x.colorName}` }))} /></>}</span>}</td></tr>); })}</tbody></Table></Card>))}
      {tab === 'bobinas' && (
        <Card pad={false} actions={<Link className="btn-ghost btn-sm" href="/inventario/etiquetas">{t('inventory.printQrLabels')}</Link>}><Table><thead><tr><th className="th">{t('inventory.code')}</th><th className="th">{t('common.material')}</th><th className="th">{t('inventory.remainingWeight')}</th><th className="th">{t('common.location')}</th><th className="th">{t('common.status')}</th></tr></thead>
          <tbody>{spools.map((x) => { const m = mats.find((q) => q.id === x.materialId)!; return <tr key={x.id} data-testid="spool-row"><td className="td font-medium tabular"><Link className="hover:underline" href={`/inventario/bobinas/${x.id}`}>{x.code}</Link></td><td className="td"><Swatch hex={m.hex} /> {m.type} {m.colorName}</td><td className="td min-w-[160px]"><div className="tabular text-sm">{grams(x.remainingG)} <span className="muted">/ {grams(x.initialG)}</span></div><Meter value={x.remainingG} max={x.initialG} tone={x.remainingG < x.initialG * 0.15 ? 'bad' : 'ok'} /></td><td className="td text-xs">{x.location}</td><td className="td"><StatusBadge status={x.status} /></td></tr>; })}</tbody></Table></Card>)}
      {tab === 'otros' && (
        <Card pad={false} actions={can(user, 'inventario', 'C') ? <ItemDialog trigger={<button className="btn-primary btn-sm">{t('inventory.item')}</button>} /> : undefined}><Table><thead><tr><th className="th">{t('inventory.item2')}</th><th className="th">{t('common.category')}</th><th className="th text-right">{t('common.stock')}</th><th className="th text-right">{t('inventory.minimum')}</th>{costs && <th className="th text-right">{t('inventory.unitCost')}</th>}<th className="th">{t('inventory.supplier')}</th><th className="th" /></tr></thead>
          <tbody>{items.map((i) => <tr key={i.id}><td className="td font-medium">{i.name}<div className="text-xs muted">{i.sku}</div></td><td className="td capitalize">{i.category}</td><td className={`td text-right tabular ${i.stock <= i.minStock ? 'text-danger font-medium' : ''}`}>{num(i.stock, 1)} {i.unit}</td><td className="td text-right tabular muted">{i.minStock}</td>{costs && <td className="td text-right tabular">{money(i.unitCost)}</td>}<td className="td text-xs">{i.supplierText}</td><td className="td text-right whitespace-nowrap">{edit && <><ItemMove id={i.id} name={i.name} unit={i.unit} /> <ItemDialog item={i} trigger={<button className="btn-ghost btn-sm">{t('common.edit')}</button>} />{can(user, 'inventario', 'X') && <> <RemoveButton kind="item" id={i.id} name={i.name} /></>}</>}</td></tr>)}</tbody></Table></Card>)}
      {tab === 'compras' && (
        <Card title={t('inventory.suggestedShoppingList')} actions={shop.length ? <CopyButton text={shop.map((x) => `• ${x.name}: ${x.missing}${x.supplier ? ' (' + x.supplier + ')' : ''}`).join('\n')} label={t('inventory.copyList')} /> : undefined}>
          {shop.length === 0 ? <p className="text-sm muted">{t('inventory.nothingToRestockEverythingIs')}</p> : <ul className="divide-y divide-slate-100 dark:divide-slate-800">{shop.map((x, i) => <li key={i} className="py-2.5 flex justify-between gap-3 text-sm"><span><b>{x.name}</b> <span className="muted">· {x.kind}</span></span><span className="tabular">{x.missing}{x.supplier ? ` · ${x.supplier}` : ''}</span></li>)}</ul>}
          <p className="text-xs muted mt-3">{t('inventory.whenYouBuyRecordThe')}</p></Card>)}
      {tab === 'movimientos' && (
        <Card pad={false}><Table><thead><tr><th className="th">{t('common.date')}</th><th className="th">{t('common.typeLabel')}</th><th className="th">{t('inventory.spoolItem')}</th><th className="th text-right">{t('common.quantity')}</th><th className="th">{t('inventory.note')}</th></tr></thead><tbody>{moves.map(({ m, code, item }) => <tr key={m.id}><td className="td tabular text-xs">{dmyHm(m.createdAt)}</td><td className="td">{tOr(t, `inventory.moveKind.${m.kind}`, m.kind)}</td><td className="td">{code ?? item}</td><td className={`td text-right tabular ${m.qty < 0 ? 'text-danger' : m.qty > 0 ? 'text-emerald-600' : ''}`}>{m.qty > 0 ? '+' : ''}{num(m.qty, 1)}</td><td className="td text-xs muted">{m.note}</td></tr>)}</tbody></Table></Card>)}
    </>
  );
}
