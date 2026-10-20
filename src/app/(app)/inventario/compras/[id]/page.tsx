import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pagePerm } from '@/lib/auth';
import { can, canSeeCosts } from '@/lib/perm';
import { PageHeader, Card, Table, Badge, StatusBadge } from '@/components/ui';
import { SpoolIcon } from '@/components/spool-icon';
import { VoidPurchase } from '@/components/void-purchase';
import { getT } from '@/i18n/server';
import { getPurchase } from '@/lib/services/purchases';
import { dmy, grams, money, num } from '@/lib/format';

export async function generateMetadata() { return { title: (await getT())('buy.detailTitle') }; }
export default async function PurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT(); const user = await pagePerm('inventario', 'V'); const { id } = await params;
  const d = await getPurchase(id); if (!d) notFound();
  const { purchase: p, lines } = d; const costs = canSeeCosts(user);
  return (
    <>
      <PageHeader back={{ href: '/inventario?tab=compras', label: t('buy.backToPurchases') }} title={<>{p.number} {p.status === 'anulada' && <Badge tone="red">{t('buy.voidedBadge')}</Badge>}</>}
        subtitle={[dmy(p.boughtAt), p.supplierText, p.docNumber && t('buy.docShort', { n: p.docNumber })].filter(Boolean).join(' · ')}
        actions={<>{p.status === 'recibida' && lines.some((l) => l.kind === 'filamento') && <Link className="btn-ghost" href="/inventario/etiquetas">{t('inventory.printQrLabels')}</Link>}{p.status === 'recibida' && can(user, 'inventario', 'X') && <VoidPurchase id={p.id} number={p.number} />}</>} />
      <Card pad={false} title={t('buy.linesTitle')}>
        <Table><thead><tr><th className="th">{t('buy.item')}</th><th className="th text-right">{t('common.quantity')}</th>{costs && <th className="th text-right">{t('buy.paidEach')}</th>}{costs && <th className="th text-right">{t('buy.realEach')}</th>}{costs && <th className="th text-right">{t('buy.costKg')}</th>}<th className="th">{t('buy.spoolsCreated')}</th></tr></thead>
          <tbody>{lines.map((l) => (
            <tr key={l.id} data-testid="purchase-line">
              <td className="td"><div className="flex items-center gap-2.5">{l.hex ? <SpoolIcon hex={l.hex} label={l.type ?? ''} size={32} /> : null}<span className="font-medium">{l.label}</span></div></td>
              <td className="td text-right tabular">{l.kind === 'filamento' ? <>{num(l.qty, 0)} × {grams(l.netG)}</> : num(l.qty, 1)}</td>
              {costs && <td className="td text-right tabular">{money(l.unitPrice)}</td>}{costs && <td className="td text-right tabular">{money(l.unitCost)}</td>}{costs && <td className="td text-right tabular">{l.costPerKg != null ? money(l.costPerKg) : '—'}</td>}
              <td className="td text-xs"><span className="flex flex-wrap gap-1.5">{l.spools.map((sp) => <Link key={sp.id} href={`/inventario/bobinas/${sp.id}`} className="tabular underline underline-offset-2">{sp.code}</Link>)}</span></td>
            </tr>))}</tbody></Table>
      </Card>
      {costs && (
        <div className="mt-4 grid sm:grid-cols-2 gap-4">
          <Card title={t('buy.totalsTitle')}><dl className="text-sm space-y-1.5">
            <div className="flex justify-between"><dt className="muted">{t('buy.subtotal')}</dt><dd className="tabular">{money(p.total - p.shipping + p.discount)}</dd></div>
            <div className="flex justify-between"><dt className="muted">{t('buy.shipping')}</dt><dd className="tabular">{money(p.shipping)}</dd></div>
            <div className="flex justify-between"><dt className="muted">{t('buy.discount')}</dt><dd className="tabular">−{money(p.discount)}</dd></div>
            <div className="flex justify-between border-t border-[var(--line)] pt-1.5 font-semibold"><dt>{t('buy.total')}</dt><dd className="tabular">{money(p.total)}</dd></div>
            {p.recoversVat && <p className="text-xs muted pt-1">{t('buy.vatRecoveredNote', { pct: p.vatPct })}</p>}
          </dl></Card>
          {p.notes && <Card title={t('buy.notes')}><p className="text-sm whitespace-pre-wrap">{p.notes}</p></Card>}
        </div>)}
    </>
  );
}
