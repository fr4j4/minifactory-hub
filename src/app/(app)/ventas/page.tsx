import Link from 'next/link';
import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can, canSeeCosts } from '@/lib/perm';
import { PageHeader, Card, Table, StatusBadge, Empty, Badge } from '@/components/ui';
import { SaleActions } from '@/components/sale-actions';
import { dmy, money } from '@/lib/format';
import { EditButton } from '@/components/edit-button';
import { editFields } from '@/lib/edit-fields';
import { getT } from '@/i18n/server';

export async function generateMetadata() { return { title: (await getT())('meta.sales') }; }
export default async function SalesPage({ searchParams }: { searchParams: Promise<{ st?: string; ch?: string }> }) {
  const t = await getT();
  const user = await pagePerm('ventas', 'V'); const sp = await searchParams; const db = await getDb(); const costs = canSeeCosts(user);
  const channels = await db.select().from(s.salesChannels);
  const conds = [isNull(s.sales.deletedAt)]; if (sp.st) conds.push(eq(s.sales.status, sp.st)); if (sp.ch) conds.push(eq(s.sales.channelId, sp.ch));
  const rows = await db.select().from(s.sales).where(and(...conds)).orderBy(desc(s.sales.createdAt)).limit(120);
  const pending = rows.filter((r) => r.status === 'por_despachar');
  return (
    <>
      <PageHeader title={t('sales.quickSales')} subtitle={t('sales.salesOfCatalogProductsCounter')} actions={can(user, 'ventas', 'C') && <Link href="/ventas/nueva" className="btn-primary" data-testid="new-sale">{t('sales.quickSale')}</Link>} />
      {pending.length > 0 && <div className="rounded-lg box-warn p-3 text-sm mb-4" role="status">{t('sales.pendingMarketplace', { count: pending.length })}: {pending.map((x) => x.externalOrder || x.number).join(', ')}</div>}
      <form className="flex flex-wrap gap-2 mb-4"><select name="ch" defaultValue={sp.ch ?? ''} className="input sm:!w-48" aria-label={t('common.channel')}><option value="">{t('sales.allChannels')}</option>{channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><select name="st" defaultValue={sp.st ?? ''} className="input sm:!w-44" aria-label={t('common.status')}><option value="">{t('sales.allStatuses')}</option>{['registrada', 'por_despachar', 'despachada', 'entregada', 'anulada'].map((x) => <option key={x} value={x}>{t(`status.${x}` as 'status.listo')}</option>)}</select><button className="btn-ghost">{t('common.filter')}</button></form>
      {rows.length === 0 ? <Card><Empty title={t('sales.noSales')} hint={t('sales.registerTheFirstQuickSale')} /></Card> : (
        <Card pad={false}><Table><thead><tr><th className="th">{t('common.noLabel')}</th><th className="th">{t('common.date')}</th><th className="th">{t('common.channel')}</th><th className="th">{t('sales.customerOrder')}</th><th className="th text-right">{t('common.total')}</th>{costs && <th className="th text-right">{t('common.commission')}</th>}{costs && <th className="th text-right">{t('common.netMargin')}</th>}<th className="th">{t('common.status')}</th><th className="th" /></tr></thead>
          <tbody>{rows.map((x) => <tr key={x.id}><td className="td font-medium">{x.number}</td><td className="td tabular">{dmy(x.date)}</td><td className="td">{channels.find((c) => c.id === x.channelId)?.name ?? '—'}</td><td className="td text-xs">{x.customerName ?? ''} {x.externalOrder && <Badge>{x.externalOrder}</Badge>}{x.tracking && <div className="muted">{t('sales.tracking')} {x.tracking}</div>}</td><td className="td text-right tabular font-medium">{money(x.total)}</td>{costs && <td className="td text-right tabular muted">{money(x.commission)}</td>}{costs && <td className={`td text-right tabular ${x.netMargin < 0 ? 'text-danger' : ''}`}>{money(x.netMargin)}</td>}<td className="td"><StatusBadge status={x.status} /></td><td className="td text-right">{x.status !== 'anulada' && can(user, 'ventas', 'E') && <EditButton kind="sale" id={x.id} fields={editFields('sale', t)} values={x} label="✎" className="btn-ghost btn-sm !px-2" testId="edit-sale" />}<SaleActions id={x.id} status={x.status} canEdit={can(user, 'ventas', 'E')} /></td></tr>)}</tbody></Table></Card>
      )}
    </>
  );
}
