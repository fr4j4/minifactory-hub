import Link from 'next/link';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { desc, eq, asc } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can } from '@/lib/perm';
import { PageHeader, Card, StatusBadge, Meter, Swatch, Table } from '@/components/ui';
import { SpoolEditor, WeighForm } from '@/components/inventory-bits';
import { dmy, dmyHm, grams, num } from '@/lib/format';
import { EditButton } from '@/components/edit-button';
import { editFields } from '@/lib/edit-fields';
import { getT } from '@/i18n/server';
import { RemoveButton } from '@/components/remove-button';

export async function generateMetadata() { return { title: (await getT())('meta.spool') }; }
export default async function SpoolPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const user = await pagePerm('inventario', 'V'); const { id } = await params; const db = await getDb();
  const [sp] = await db.select().from(s.spools).where(eq(s.spools.id, id)); if (!sp || sp.deletedAt) notFound();
  const [m] = await db.select().from(s.materials).where(eq(s.materials.id, sp.materialId));
  const mv = await db.select().from(s.inventoryMovements).where(eq(s.inventoryMovements.spoolId, id)).orderBy(desc(s.inventoryMovements.createdAt)).limit(30);
  const machines = await db.select().from(s.machines).orderBy(asc(s.machines.name));
  const [buy] = sp.purchaseLineId ? await db.select({ id: s.purchases.id, number: s.purchases.number, supplier: s.purchases.supplierText }).from(s.purchaseLines).innerJoin(s.purchases, eq(s.purchases.id, s.purchaseLines.purchaseId)).where(eq(s.purchaseLines.id, sp.purchaseLineId)) : [];
  const qr = await QRCode.toDataURL(`MF:${sp.code}`, { margin: 1, width: 220 });
  return (
    <>
      <PageHeader back={{ href: '/inventario', label: t('nav.inventory') }} title={<span>{sp.code} · <Swatch hex={m.hex} /> {m.type} {m.colorName} <StatusBadge status={sp.status} /></span>} subtitle={`${m.manufacturer ?? ''} ${m.line ?? ''} · ${t('inventory.lotBought', { lot: sp.lot ?? '—', date: dmy(sp.boughtAt) })}`} actions={<>{can(user, 'inventario', 'E') && <EditButton kind="spool" id={sp.id} fields={editFields('spool', t)} values={sp} className="btn-ghost" testId="edit-spool" />}{can(user, 'inventario', 'X') && <RemoveButton kind="spool" id={sp.id} name={sp.code} redirectTo="/inventario?tab=bobinas" />}</>} />
      {buy && <p className="text-sm muted -mt-3 mb-4" data-testid="spool-purchase">{t('buy.fromPurchase')} <Link className="underline underline-offset-2" href={`/inventario/compras/${buy.id}`}>{buy.number}</Link>{buy.supplier ? ` · ${buy.supplier}` : ''}</p>}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 min-w-0 space-y-4">
          <Card title={t('inventory.remainingWeight')}><div className="flex items-end justify-between mb-2"><div className="text-3xl font-bold tabular" data-testid="spool-remaining">{grams(sp.remainingG)}</div><div className="muted text-sm">{t('inventory.ofTare', { total: grams(sp.initialG), tare: sp.tareG })}</div></div><Meter value={sp.remainingG} max={sp.initialG} tone={sp.remainingG < sp.initialG * 0.15 ? 'bad' : 'ok'} /></Card>
          <Card title={t('inventory.movements')} pad={false}><Table><tbody>{mv.map((x) => <tr key={x.id}><td className="td text-xs tabular">{dmyHm(x.createdAt)}</td><td className="td">{x.kind}</td><td className={`td text-right tabular ${x.qty < 0 ? 'text-danger' : x.qty > 0 ? 'text-emerald-600' : ''}`}>{x.qty > 0 ? '+' : ''}{num(x.qty, 1)} g</td><td className="td text-xs muted">{x.note}</td></tr>)}</tbody></Table></Card>
        </div>
        <div className="space-y-4">
          <Card title={t('inventory.qrLabel')}><div className="flex items-center gap-4"><img src={qr} alt={t('inventory.qrCodeOf', { code: sp.code })} width={110} height={110} /><div><div className="font-semibold tabular">{sp.code}</div><div className="text-xs muted">{m.type} {m.colorName}</div></div></div></Card>
          {can(user, 'inventario', 'E') && <Card title={t('inventory.weighSpool')}><WeighForm id={sp.id} tare={sp.tareG} remaining={sp.remainingG} /></Card>}
          {can(user, 'inventario', 'E') && <Card title={t('inventory.locationAndStatus')}><SpoolEditor s={{ id: sp.id, location: sp.location, machineId: sp.machineId, slot: sp.slot, status: sp.status, lastDriedAt: sp.lastDriedAt }} machines={machines.map((x) => ({ id: x.id, name: x.name }))} /></Card>}
        </div>
      </div>
    </>
  );
}
