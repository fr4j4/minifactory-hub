import Link from 'next/link';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can, canSeeCosts } from '@/lib/perm';
import { PageHeader, Card, Table, Tabs, Badge, Stat, Empty } from '@/components/ui';
import { ItemDialog, ItemMove, MaterialForm } from '@/components/inventory-bits';
import { listSuppliers, materialStock, shoppingList, weightedCostPerKg } from '@/lib/services/inventory';
import { listPurchases } from '@/lib/services/purchases';
import { listSupplyRules } from '@/lib/services/supplies';
import { CopyButton } from '@/components/client';
import { dmy, dmyHm, grams, money, num } from '@/lib/format';
import { getT } from '@/i18n/server';
import { tOr } from '@/i18n/translate';
import { LineBulkEdit } from '@/components/line-bulk-edit';
import { RemoveButton } from '@/components/remove-button';
import { Icon } from '@/components/shell';
import { FilamentStock, type StockFilter } from '@/components/filament-stock';
import { SupplyRules } from '@/components/supply-rules';

export async function generateMetadata() { return { title: (await getT())('meta.inventory') }; }

const FILTERS: StockFilter[] = ['todos', 'con', 'bajo', 'sin'];
export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; f?: string }> }) {
  const t = await getT();
  const user = await pagePerm('inventario', 'V'); const sp = await searchParams; const q = sp.q ?? '';
  // los nombres antiguos de pestaña (materiales, bobinas) siguen llevando al stock de filamentos
  const tab = ['compras', 'otros', 'movimientos'].includes(sp.tab ?? '') ? sp.tab! : 'filamentos';
  const filter: StockFilter = FILTERS.includes(sp.f as StockFilter) ? (sp.f as StockFilter) : 'todos';
  const db = await getDb(); const costs = canSeeCosts(user); const edit = can(user, 'inventario', 'E'); const create = can(user, 'inventario', 'C');
  const needle = q.trim().toLowerCase();
  const search = (ph: string, extra?: Record<string, string>) => <form className="flex gap-2 mb-4" role="search"><input type="hidden" name="tab" value={tab} />{extra && Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}<input name="q" defaultValue={q} className="input sm:max-w-sm" placeholder={ph} aria-label={ph} /><button className="btn-ghost">{t('common.search')}</button></form>;

  const profs = (await db.select().from(s.slicerProfiles).where(and(eq(s.slicerProfiles.type, 'filament'), isNull(s.slicerProfiles.deletedAt)))).map((p) => ({ id: p.id, name: p.name }));
  let low = 0; let body: React.ReactNode = null;

  if (tab === 'filamentos') {
    const all = await db.select().from(s.materials).where(and(isNull(s.materials.deletedAt), eq(s.materials.generic, false))).orderBy(asc(s.materials.type), asc(s.materials.colorName));
    const shownMats = needle ? all.filter((m) => [m.type, m.colorName, m.manufacturer, m.line].some((v) => v?.toLowerCase().includes(needle))) : all;
    const stock = await materialStock(db);
    const spools = await db.select().from(s.spools).where(and(isNull(s.spools.deletedAt), inArray(s.spools.status, ['nueva', 'abierta', 'en_uso']))).orderBy(asc(s.spools.code));
    const linkMap = await (await import('@/lib/slicer/links')).defaultLinkMap(db);
    const lineSpecs = new Map((await db.select({ id: s.filamentLines.id, specs: s.filamentLines.specs }).from(s.filamentLines).where(isNull(s.filamentLines.deletedAt))).map((l) => [l.id, l.specs]));
    const costMap = new Map<string, number>(); if (costs) for (const m of all) costMap.set(m.id, weightedCostPerKg(m, spools));
    const mine = new Set(all.map((m) => m.id)); const st = stock.filter((x) => mine.has(x.materialId));
    low = st.filter((x) => x.low && x.physicalG >= 0).length;
    const totalG = st.reduce((a, x) => a + x.physicalG, 0);
    const value = costs ? all.reduce((a, m) => a + ((st.find((x) => x.materialId === m.id)?.physicalG ?? 0) / 1000) * (costMap.get(m.id) ?? 0), 0) : 0;
    const withStock = st.filter((x) => x.physicalG > 0).length;
    const counts: Record<StockFilter, number> = { todos: all.length, con: withStock, bajo: low, sin: all.length - withStock };
    const lines = await (await import('@/lib/services/lines')).listLines(db);
    body = (
      <>
        {all.length > 0 && <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 max-md:[&>*:last-child:nth-child(odd)]:col-span-2"><Stat label={t('buy.statColors')} value={all.length} sub={t('buy.statColorsSub', { n: withStock })} /><Stat label={t('buy.statInStock')} value={`${num(totalG / 1000, 1)} kg`} /><Stat label={t('buy.statLow')} value={low} tone={low ? 'warn' : undefined} />{costs && <Stat label={t('common.stockValue')} value={money(Math.round(value))} />}</div>}
        {all.length > 0 && edit && <LineBulkEdit showCost={costs} profiles={profs} lines={lines} />}
        {all.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <nav className="flex flex-wrap gap-1.5" aria-label={t('buy.filterLabel')}>{FILTERS.map((k) => <Link key={k} href={`/inventario?${new URLSearchParams({ ...(q && { q }), ...(k !== 'todos' && { f: k }) })}`} aria-current={filter === k ? 'true' : undefined} className={filter === k ? 'btn-sm btn-primary' : 'btn-sm btn-ghost'} data-testid={`stock-filter-${k}`}>{t(`buy.filter.${k}`)} <span className="opacity-70 tabular">{counts[k]}</span></Link>)}</nav>
            {search(t('inventory.searchMaterials'), filter !== 'todos' ? { f: filter } : undefined)}
          </div>)}
        {all.length === 0 ? (
          <Card><Empty title={t('buy.emptyTitle')} hint={t('buy.emptyHint')} action={<span className="flex flex-wrap justify-center gap-2">{create && <Link className="btn-primary" href="/inventario/biblioteca">{t('buy.addFilament')}</Link>}{create && <Link className="btn-ghost" href="/inventario/compras/nueva">{t('buy.registerPurchase')}</Link>}</span>} /></Card>
        ) : (
          <FilamentStock mats={shownMats} stock={stock} spools={spools} costMap={costMap} canEdit={edit} canBuy={create} canRemove={can(user, 'inventario', 'X')} profiles={profs} linkMap={linkMap} lineSpecs={lineSpecs} filter={filter} replaceOptions={all.map((x) => ({ id: x.id, label: `${x.type} ${x.colorName}` }))} />)}
      </>);
  }

  if (tab === 'compras') {
    const shop = await shoppingList(); const purchases = await listPurchases({ q, limit: 100 });
    const month = new Date().toISOString().slice(0, 7); const monthTotal = purchases.filter((p) => p.status === 'recibida' && String(p.boughtAt).startsWith(month)).reduce((a, p) => a + p.total, 0);
    const toBuy = `/inventario/compras/nueva?lines=${shop.map((x) => (x.materialId ? `material:${x.materialId}:${x.qty}` : `item:${x.itemId}:${x.qty}`)).join(',')}`;
    body = (
      <>
        {shop.length > 0 && (
          <Card title={t('inventory.suggestedShoppingList')} className="mb-4" actions={<span className="flex gap-2"><CopyButton text={shop.map((x) => `• ${x.name}: ${x.missing}${x.supplier ? ' (' + x.supplier + ')' : ''}`).join('\n')} label={t('inventory.copyList')} />{create && <Link className="btn-primary btn-sm" href={toBuy} data-testid="shop-to-purchase">{t('buy.createPurchaseFromList')}</Link>}</span>}>
            <ul className="divide-y divide-[var(--line)]">{shop.map((x, i) => <li key={i} className="py-2.5 flex justify-between gap-3 text-sm"><span><b>{x.name}</b> <span className="muted">· {x.kind}</span></span><span className="tabular">{x.missing}{x.supplier ? ` · ${x.supplier}` : ''}</span></li>)}</ul>
          </Card>)}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4"><Stat label={t('buy.statPurchases')} value={purchases.filter((p) => p.status === 'recibida').length} />{costs && <Stat label={t('buy.statMonth')} value={money(monthTotal)} />}</div>
        {search(t('buy.searchPurchases'))}
        {purchases.length === 0 ? <Card><Empty title={needle ? t('common.noMatches') : t('buy.noPurchasesTitle')} hint={needle ? undefined : t('buy.noPurchasesHint')} action={create ? <Link className="btn-primary" href="/inventario/compras/nueva">{t('buy.registerPurchase')}</Link> : undefined} /></Card> : (
          <Card pad={false}><Table><thead><tr><th className="th">{t('common.date')}</th><th className="th">{t('buy.number')}</th><th className="th">{t('buy.supplier')}</th><th className="th">{t('buy.docNumber')}</th><th className="th text-right">{t('buy.spoolsKg')}</th>{costs && <th className="th text-right">{t('buy.total')}</th>}<th className="th" /></tr></thead>
            <tbody>{purchases.map((p) => <tr key={p.id} data-testid="purchase-row"><td className="td tabular">{dmy(p.boughtAt)}</td><td className="td font-medium tabular"><Link className="hover:underline" href={`/inventario/compras/${p.id}`}>{p.number}</Link></td><td className="td">{p.supplierText ?? '—'}</td><td className="td text-xs">{p.docNumber ?? '—'}</td><td className="td text-right tabular">{p.spools > 0 ? `${p.spools} · ${num(p.kg, 1)} kg` : t('buy.supplyOnly')}</td>{costs && <td className="td text-right tabular">{money(p.total)}</td>}<td className="td text-right">{p.status === 'anulada' && <Badge tone="red">{t('buy.voidedBadge')}</Badge>}</td></tr>)}</tbody></Table></Card>)}
      </>);
  }

  if (tab === 'otros') {
    const items = await db.select().from(s.inventoryItems).where(isNull(s.inventoryItems.deletedAt)).orderBy(asc(s.inventoryItems.category), asc(s.inventoryItems.name));
    const rules = await listSupplyRules();
    body = (
      <>
        <Card pad={false} actions={create ? <ItemDialog trigger={<button className="btn-primary btn-sm">{t('inventory.item')}</button>} /> : undefined}><Table><thead><tr><th className="th">{t('inventory.item2')}</th><th className="th">{t('common.category')}</th><th className="th text-right">{t('common.stock')}</th><th className="th text-right">{t('inventory.minimum')}</th>{costs && <th className="th text-right">{t('inventory.unitCost')}</th>}<th className="th">{t('inventory.supplier')}</th><th className="th" /></tr></thead>
          <tbody>{items.map((i) => <tr key={i.id}><td className="td font-medium">{i.name}<div className="text-xs muted">{i.sku}</div></td><td className="td capitalize">{i.category}</td><td className={`td text-right tabular ${i.stock <= i.minStock ? 'text-danger font-medium' : ''}`}>{num(i.stock, 1)} {i.unit}</td><td className="td text-right tabular muted">{i.minStock}</td>{costs && <td className="td text-right tabular">{money(i.unitCost)}</td>}<td className="td text-xs">{i.supplierText}</td><td className="td text-right whitespace-nowrap">{edit && <>{create && <Link className="btn-ghost btn-sm" href={`/inventario/compras/nueva?lines=item:${i.id}:1`}>{t('buy.buyThis')}</Link>} <ItemMove id={i.id} name={i.name} unit={i.unit} /> <ItemDialog item={i} trigger={<button className="btn-ghost btn-sm">{t('common.edit')}</button>} />{can(user, 'inventario', 'X') && <> <RemoveButton kind="item" id={i.id} name={i.name} /></>}</>}</td></tr>)}</tbody></Table></Card>
        <SupplyRules rules={rules.map((r) => ({ itemId: r.rule.itemId, name: r.name, unit: r.unit, qty: r.rule.qtyPerOrder, unitCost: r.unitCost }))} items={items.map((i) => ({ id: i.id, name: i.name, unit: i.unit }))} canEdit={edit} showCost={costs} />
      </>);
  }

  if (tab === 'movimientos') {
    const moves = await db.select({ m: s.inventoryMovements, code: s.spools.code, item: s.inventoryItems.name, pnum: s.purchases.number }).from(s.inventoryMovements).leftJoin(s.spools, eq(s.spools.id, s.inventoryMovements.spoolId)).leftJoin(s.inventoryItems, eq(s.inventoryItems.id, s.inventoryMovements.itemId)).leftJoin(s.purchases, eq(s.purchases.id, s.inventoryMovements.purchaseId)).orderBy(desc(s.inventoryMovements.createdAt)).limit(80);
    body = (
      <Card pad={false}><Table><thead><tr><th className="th">{t('common.date')}</th><th className="th">{t('common.typeLabel')}</th><th className="th">{t('inventory.spoolItem')}</th><th className="th text-right">{t('common.quantity')}</th><th className="th">{t('inventory.note')}</th></tr></thead><tbody>{moves.map(({ m, code, item }) => <tr key={m.id}><td className="td tabular text-xs">{dmyHm(m.createdAt)}</td><td className="td">{tOr(t, `inventory.moveKind.${m.kind}`, m.kind)}</td><td className="td">{code ?? item ?? '—'}</td><td className={`td text-right tabular ${m.qty < 0 ? 'text-danger' : m.qty > 0 ? 'text-emerald-600' : ''}`}>{m.qty > 0 ? '+' : ''}{num(m.qty, 1)}</td><td className="td text-xs muted">{m.note}</td></tr>)}</tbody></Table></Card>);
  }

  // la cabecera cambia según lo que se puede hacer: comprar es lo principal; lo demás es ocasional
  const profsForNew = profs;
  return (
    <>
      <PageHeader title={t('inventory.inventory')} subtitle={t('buy.subtitle')} actions={<>
        {create && <Link className="btn-primary" href="/inventario/compras/nueva" data-testid="new-purchase">{t('buy.registerPurchase')}</Link>}
        {create && <Link className="btn-ghost" href="/inventario/biblioteca" data-testid="lib-open">{t('buy.addFilament')}</Link>}
        <Link className="btn-ghost" href="/inventario/escanear"><Icon name="qr" className="h-4 w-4" />{t('inventory.scanQr2')}</Link>
        <details className="relative">
          <summary className="btn-ghost list-none cursor-pointer [&::-webkit-details-marker]:hidden" data-testid="inv-more">{t('buy.more')} ▾</summary>
          <div className="absolute right-0 z-30 mt-1 min-w-[15rem] rounded-xl border border-[var(--line)] bg-[var(--card)] shadow-lg p-1.5 flex flex-col text-sm">
            {create && <MaterialForm profiles={profsForNew} trigger={<button className="btn-ghost w-full !justify-start" data-testid="new-material">{t('buy.addByHand')}</button>} />}
            {create && <Link className="btn-ghost !justify-start" href="/inventario/alta-rapida" data-testid="bulk-open">{t('buy.loadExisting')}</Link>}
            {edit && <Link className="btn-ghost !justify-start" href="/inventario/completar" data-testid="fill-open">{t('inventory.catFillOpen')}</Link>}
            <Link className="btn-ghost !justify-start" href="/inventario/etiquetas">{t('inventory.printQrLabels')}</Link>
          </div>
        </details>
      </>} />
      <Tabs current={tab} tabs={[{ key: 'filamentos', label: t('buy.tabFilaments'), href: '/inventario', count: low || undefined }, { key: 'compras', label: t('buy.tabPurchases'), href: '/inventario?tab=compras' }, { key: 'otros', label: t('buy.tabSupplies'), href: '/inventario?tab=otros' }, { key: 'movimientos', label: t('inventory.tabMovements'), href: '/inventario?tab=movimientos' }]} />
      {body}
    </>
  );
}
