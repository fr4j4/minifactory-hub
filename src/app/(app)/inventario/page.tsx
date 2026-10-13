import Link from 'next/link';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can, canSeeCosts } from '@/lib/perm';
import { PageHeader, Card, Table, Tabs, Badge, Meter, Swatch, StatusBadge, Empty } from '@/components/ui';
import { AddSpoolButton, ItemDialog, ItemMove, MaterialForm } from '@/components/inventory-bits';
import { materialStock, shoppingList, materialCostPerKg } from '@/lib/services/inventory';
import { CopyButton } from '@/components/client';
import { dmyHm, grams, money, num } from '@/lib/format';

export const metadata = { title: 'Inventario' };
const MV: Record<string, string> = { entrada: 'Entrada', consumo: 'Consumo', falla: 'Falla', ajuste: 'Ajuste', reserva: 'Reserva', transferencia: 'Traslado', descarte: 'Descarte' };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await pagePerm('inventario', 'V'); const { tab = 'materiales' } = await searchParams; const db = await getDb(); const costs = canSeeCosts(user); const edit = can(user, 'inventario', 'E');
  const mats = await db.select().from(s.materials).where(isNull(s.materials.deletedAt)).orderBy(asc(s.materials.type), asc(s.materials.colorName));
  const stock = await materialStock(db); const spools = await db.select().from(s.spools).where(isNull(s.spools.deletedAt)).orderBy(asc(s.spools.code));
  const profs = (await db.select().from(s.slicerProfiles).where(and(eq(s.slicerProfiles.type, 'filament'), isNull(s.slicerProfiles.deletedAt)))).map((p) => ({ id: p.id, name: p.name }));
  const machines = await db.select().from(s.machines);
  const items = tab === 'otros' ? await db.select().from(s.inventoryItems).where(isNull(s.inventoryItems.deletedAt)).orderBy(asc(s.inventoryItems.category), asc(s.inventoryItems.name)) : [];
  const moves = tab === 'movimientos' ? await db.select({ m: s.inventoryMovements, code: s.spools.code, item: s.inventoryItems.name }).from(s.inventoryMovements).leftJoin(s.spools, eq(s.spools.id, s.inventoryMovements.spoolId)).leftJoin(s.inventoryItems, eq(s.inventoryItems.id, s.inventoryMovements.itemId)).orderBy(desc(s.inventoryMovements.createdAt)).limit(80) : [];
  const shop = tab === 'compras' ? await shoppingList() : [];
  const costMap = new Map<string, number>(); if (costs) for (const m of mats) costMap.set(m.id, await materialCostPerKg(m.id, db));
  const low = stock.filter((x) => x.low).length;
  return (
    <>
      <PageHeader title="Inventario" subtitle="Por bobina o botella individual: peso real restante, descuento automático al terminar cada trabajo y alertas de stock." actions={<>{can(user, 'inventario', 'V') && <Link className="btn-ghost" href="/inventario/escanear">📷 Escanear QR</Link>}{can(user, 'inventario', 'C') && <><MaterialForm profiles={profs} trigger={<button className="btn-ghost" data-testid="new-material">+ Material</button>} /><AddSpoolButton materials={mats.map((m) => ({ id: m.id, label: `${m.type} ${m.colorName}${m.manufacturer ? ' · ' + m.manufacturer : ''}`, costPerKg: m.costPerKg }))} /></>}</>} />
      <Tabs current={tab} tabs={[{ key: 'materiales', label: 'Materiales', href: '/inventario', count: low || undefined }, { key: 'bobinas', label: 'Bobinas y botellas', href: '/inventario?tab=bobinas' }, { key: 'otros', label: 'Repuestos e insumos', href: '/inventario?tab=otros' }, { key: 'compras', label: 'Lista de compras', href: '/inventario?tab=compras' }, { key: 'movimientos', label: 'Movimientos', href: '/inventario?tab=movimientos' }]} />
      {tab === 'materiales' && (mats.length === 0 ? <Card><Empty title="Sin materiales" hint="Crea el catálogo de materiales (tipo y color) y luego registra las bobinas que compraste." /></Card> : (
        <Card pad={false}><Table><thead><tr><th className="th">Material</th><th className="th">Stock físico</th><th className="th text-right">Reservado</th><th className="th text-right">Disponible</th><th className="th text-right">Mínimo</th><th className="th text-right">Bobinas</th>{costs && <th className="th text-right">Costo/kg</th>}<th className="th" /></tr></thead>
          <tbody>{mats.map((m) => { const st = stock.find((x) => x.materialId === m.id)!; return (
            <tr key={m.id} data-testid="material-row"><td className="td"><div className="font-medium"><Swatch hex={m.hex} /> {m.type} {m.colorName}</div><div className="text-xs muted">{m.manufacturer} {m.line} {m.tech === 'resina' && '· resina'}</div></td>
              <td className="td min-w-[140px]"><div className="tabular text-sm mb-1">{grams(st.physicalG)}</div><Meter value={st.physicalG} max={Math.max(m.stockMinG * 3, st.physicalG)} tone={st.low ? 'bad' : 'ok'} /></td><td className="td text-right tabular muted">{grams(st.reservedG)}</td><td className={`td text-right tabular font-medium ${st.low ? 'text-red-600 dark:text-red-400' : ''}`}>{grams(st.availableG)}{st.low && <Badge tone="red" className="ml-1">Bajo</Badge>}</td><td className="td text-right tabular muted">{grams(m.stockMinG)}</td><td className="td text-right tabular">{st.spools}</td>{costs && <td className="td text-right tabular">{money(costMap.get(m.id))}</td>}
              <td className="td text-right">{edit && <MaterialForm m={m} profiles={profs} trigger={<button className="btn-ghost btn-sm">Editar</button>} />}</td></tr>); })}</tbody></Table></Card>))}
      {tab === 'bobinas' && (
        <Card pad={false} actions={<Link className="btn-ghost btn-sm" href="/inventario/etiquetas">🏷 Imprimir etiquetas QR</Link>}><Table><thead><tr><th className="th">Código</th><th className="th">Material</th><th className="th">Peso restante</th><th className="th">Ubicación</th><th className="th">Estado</th></tr></thead>
          <tbody>{spools.map((x) => { const m = mats.find((q) => q.id === x.materialId)!; return <tr key={x.id} data-testid="spool-row"><td className="td font-medium tabular"><Link className="hover:underline" href={`/inventario/bobinas/${x.id}`}>{x.code}</Link></td><td className="td"><Swatch hex={m.hex} /> {m.type} {m.colorName}</td><td className="td min-w-[160px]"><div className="tabular text-sm">{grams(x.remainingG)} <span className="muted">/ {grams(x.initialG)}</span></div><Meter value={x.remainingG} max={x.initialG} tone={x.remainingG < x.initialG * 0.15 ? 'bad' : 'ok'} /></td><td className="td text-xs">{x.location}</td><td className="td"><StatusBadge status={x.status} /></td></tr>; })}</tbody></Table></Card>)}
      {tab === 'otros' && (
        <Card pad={false} actions={can(user, 'inventario', 'C') ? <ItemDialog trigger={<button className="btn-primary btn-sm">+ Ítem</button>} /> : undefined}><Table><thead><tr><th className="th">Ítem</th><th className="th">Categoría</th><th className="th text-right">Stock</th><th className="th text-right">Mínimo</th>{costs && <th className="th text-right">Costo u.</th>}<th className="th">Proveedor</th><th className="th" /></tr></thead>
          <tbody>{items.map((i) => <tr key={i.id}><td className="td font-medium">{i.name}<div className="text-xs muted">{i.sku}</div></td><td className="td capitalize">{i.category}</td><td className={`td text-right tabular ${i.stock <= i.minStock ? 'text-red-600 dark:text-red-400 font-medium' : ''}`}>{num(i.stock, 1)} {i.unit}</td><td className="td text-right tabular muted">{i.minStock}</td>{costs && <td className="td text-right tabular">{money(i.unitCost)}</td>}<td className="td text-xs">{i.supplierText}</td><td className="td text-right whitespace-nowrap">{edit && <><ItemMove id={i.id} name={i.name} unit={i.unit} /> <ItemDialog item={i} trigger={<button className="btn-ghost btn-sm">Editar</button>} /></>}</td></tr>)}</tbody></Table></Card>)}
      {tab === 'compras' && (
        <Card title="Lista de compras sugerida" actions={shop.length ? <CopyButton text={shop.map((x) => `• ${x.name}: ${x.missing}${x.supplier ? ' (' + x.supplier + ')' : ''}`).join('\n')} label="Copiar lista" /> : undefined}>
          {shop.length === 0 ? <p className="text-sm muted">Nada que reponer: todo está sobre el mínimo.</p> : <ul className="divide-y divide-slate-100 dark:divide-slate-800">{shop.map((x, i) => <li key={i} className="py-2.5 flex justify-between gap-3 text-sm"><span><b>{x.name}</b> <span className="muted">· {x.kind}</span></span><span className="tabular">{x.missing}{x.supplier ? ` · ${x.supplier}` : ''}</span></li>)}</ul>}
          <p className="text-xs muted mt-3">Cuando compres, registra la “Entrada de compra”; el proveedor es solo un texto opcional.</p></Card>)}
      {tab === 'movimientos' && (
        <Card pad={false}><Table><thead><tr><th className="th">Fecha</th><th className="th">Tipo</th><th className="th">Bobina / ítem</th><th className="th text-right">Cantidad</th><th className="th">Nota</th></tr></thead><tbody>{moves.map(({ m, code, item }) => <tr key={m.id}><td className="td tabular text-xs">{dmyHm(m.createdAt)}</td><td className="td">{MV[m.kind] ?? m.kind}</td><td className="td">{code ?? item}</td><td className={`td text-right tabular ${m.qty < 0 ? 'text-red-600 dark:text-red-400' : m.qty > 0 ? 'text-emerald-600' : ''}`}>{m.qty > 0 ? '+' : ''}{num(m.qty, 1)}</td><td className="td text-xs muted">{m.note}</td></tr>)}</tbody></Table></Card>)}
    </>
  );
}
