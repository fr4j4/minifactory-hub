import Link from 'next/link';
import { asc, desc, eq, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { PageHeader, Card, Table, Tabs, Badge } from '@/components/ui';
import { ChannelDialog, PriceListDialog, RatesForm, ShopForm, SupplierDialog, TemplatesForm, UserDialog } from '@/components/config-forms';
import { getSettings, getSettingsRaw } from '@/lib/settings';
import { publicAiSettings } from '@/lib/ai/config';
import { aiUsage } from '@/lib/ai';
import { AiSettingsForm, AiUsagePanel } from '@/components/ai-settings';
import { dmyHm, money } from '@/lib/format';
import { getT } from '@/i18n/server';
import { systemHealth } from '@/lib/health';
import { reopenSetupAction } from '@/actions/setup';
import { DocTemplateEditor } from '@/components/doc-template-editor';
import { listSuppliers } from '@/lib/services/inventory';
import { tOr, type TFn } from '@/i18n/translate';
import type { QuoteDocData } from '@/components/quote-document';
import { RemoveButton } from '@/components/remove-button';
import { can } from '@/lib/perm';
import { RestoreButton } from '@/components/restore-button';
import { auditDetail } from '@/lib/audit-detail';
import { listArchived } from '@/lib/services/archive';
import { PresetsEditor } from '@/components/presets-editor';
import { presetRows } from '@/lib/slicer/presets';
import { JobsPanel } from '@/components/jobs-panel';
import { jobSummary } from '@/lib/jobs';
import { AutoTagSetting } from '@/components/auto-tag-setting';
import { REMOVAL_MODULE } from '@/lib/services/removal';
import { Icon } from '@/components/shell';
import { IntegrationSettings } from '@/components/bambu-account';

/** Datos de ejemplo de la vista previa: muestran todas las secciones (opcional, enlace, nota, despacho, descuento, IVA) y los montos cuadran. */
function docSample(st: Awaited<ReturnType<typeof getSettings>>, t: TFn): QuoteDocData {
  const shipping = 3000, discount = 2000, net = 18000 + 20000 + shipping - discount, tax = Math.round((net * st.rates.taxPct) / 100);
  return {
    shop: { name: st.shop.name, legalName: st.shop.legalName, taxId: st.shop.taxId, address: st.shop.address, phone: st.shop.phone, email: st.shop.email, brandColor: st.shop.brandColor },
    quote: { number: 'P-2026-0001', version: 1, createdAt: new Date(), validUntil: new Date(Date.now() + st.quoteValidDays * 86400_000), customerName: t('documents.sampleCustomer'), customerPhone: '+56 9 1234 5678', title: null, discount, shipping, total: net + tax, taxAmount: tax, notes: t('documents.sampleNote') },
    items: [{ id: 'a', description: t('documents.sampleItem'), qty: 1, unitPrice: 18000, total: 18000, optional: false, models: [{ name: 'soporte.stl' }], leadTime: t('quotes.approxPrintLeadTime', { time: '3:20 h' }) }, { id: 'b', description: t('documents.sampleItem2'), qty: 10, unitPrice: 2000, total: 20000, optional: false, models: [], leadTime: null }, { id: 'c', description: t('documents.sampleOptional'), qty: 1, unitPrice: 4500, total: 4500, optional: true, models: [], leadTime: null }],
    links: [{ id: 'l', title: t('documents.sampleLink'), url: 'https://www.printables.com/' }], tax: { label: t('quotes.plusVat', { pct: st.rates.taxPct }), showRow: true, netAmount: net }, terms: st.templates.terms,
  };
}
export async function generateMetadata() { return { title: (await getT())('meta.settings') }; }
export default async function ConfigPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const t = await getT();
  const user = await pagePerm('config', 'V'); const { tab = 'taller' } = await searchParams; const db = await getDb(); const st = await getSettings();
  const users = tab === 'usuarios' ? await db.select().from(s.users).where(isNull(s.users.deletedAt)).orderBy(asc(s.users.name)) : []; const ch = tab === 'canales' ? await db.select().from(s.salesChannels).where(isNull(s.salesChannels.deletedAt)).orderBy(asc(s.salesChannels.name)) : [];
  const pl = tab === 'listas' ? await db.select().from(s.priceLists).where(isNull(s.priceLists.deletedAt)) : []; const audit = tab === 'auditoria' ? await db.select().from(s.activityLog).orderBy(s.activityLog.createdAt).limit(0) : [];
  const archived = tab === 'archivados' ? (await listArchived()).filter((r) => can(user, REMOVAL_MODULE[r.kind], 'X')) : [];
  const log = tab === 'auditoria' ? (await db.select().from(s.activityLog)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 80) : [];
  const names = new Map((await db.select({ id: s.users.id, n: s.users.name }).from(s.users)).map((u) => [u.id, u.n]));
  return (
    <>
      <PageHeader title={t('settings.settings')} subtitle={t('settings.workshopDetailsRatesTemplatesUse')} />
      <Tabs current={tab} tabs={([['taller', t('settings.tabShop'), 'shop'], ['documentos', t('settings.tabDocuments'), 'shop'], ['plantillas', t('settings.tabTemplates'), 'shop'], ['tarifas', t('settings.tabRates'), 'prices'], ['listas', t('settings.tabPriceLists'), 'prices'], ['calidades', t('settings.tabQualities'), 'shop'], ['canales', t('settings.tabChannels'), 'prices'], ['usuarios', t('settings.tabUsers'), 'team'], ['proveedores', t('settings.tabSuppliers'), 'data'], ['archivados', t('settings.tabArchived'), 'data'], ['auditoria', t('settings.tabAudit'), 'data'], ['respaldo', t('settings.tabBackup'), 'data'], ['integraciones', t('settings.tabIntegrations'), 'system'], ['ia', t('ai.tab'), 'system'], ['sistema', t('settings.tabSystem'), 'system']] as const).map(([k, l, g]) => ({ key: k, label: l, group: t(`settings.group_${g}` as 'settings.group_shop'), href: `/configuracion?tab=${k}` }))} />
      {tab === 'ia' && <><Card title={t('ai.title')}><AiSettingsForm st={publicAiSettings((await getSettingsRaw()).ai)} canClear={can(user, 'ia', 'X')} /></Card><Card title={t('ai.usageTitle')} className="mt-6"><AiUsagePanel usage={await aiUsage()} budget={st.ai.budget.monthlyUsd} /></Card></>}
      {tab === 'taller' && <Card><ShopForm st={st} /></Card>}
      {tab === 'integraciones' && <IntegrationSettings canPrinters={can(user,'maquinas','C')} />}
      {tab === 'tarifas' && <Card><RatesForm st={st} /></Card>}
      {tab === 'documentos' && <DocTemplateEditor initial={st.documents.quote} hasLogo={!!st.shop.logoKey} sample={docSample(st, t)} />}
      {tab === 'plantillas' && <Card><TemplatesForm st={st} /></Card>}
      {tab === 'usuarios' && <Card pad={false} actions={<UserDialog selfId={user.id} trigger={<button className="btn-primary btn-sm" data-testid="new-user">{t('settings.user')}</button>} />}><Table><thead><tr><th className="th">{t('common.name')}</th><th className="th">{t('settings.email')}</th><th className="th">{t('settings.role')}</th><th className="th">{t('common.status')}</th><th className="th" /></tr></thead><tbody>{users.map((u) => <tr key={u.id}><td className="td font-medium">{u.name}</td><td className="td">{u.email}</td><td className="td"><Badge>{t(`roles.${u.role as 'admin'}`)}</Badge></td><td className="td">{u.active ? <Badge tone="green">{t('settings.active')}</Badge> : <Badge tone="red">{t('settings.inactive')}</Badge>}</td><td className="td text-right"><UserDialog selfId={user.id} u={{ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, permOverrides: u.permOverrides ?? {} }} trigger={<button className="btn-ghost btn-sm">{t('common.edit')}</button>} />{can(user, 'config', 'X') && <> <RemoveButton kind="user" id={u.id} name={u.name} /></>}</td></tr>)}</tbody></Table></Card>}
      {tab === 'canales' && <Card pad={false} actions={<ChannelDialog trigger={<button className="btn-primary btn-sm" data-testid="new-channel">{t('settings.channel')}</button>} />}><Table><thead><tr><th className="th">{t('common.channel')}</th><th className="th">{t('common.typeLabel')}</th><th className="th text-right">{t('common.commission')}</th><th className="th text-right">{t('settings.fixed')}</th><th className="th text-right">{t('settings.avgShipping')}</th><th className="th" /></tr></thead><tbody>{ch.map((c) => <tr key={c.id}><td className="td font-medium">{c.name} {!c.active && <Badge>{t('settings.inactive')}</Badge>}</td><td className="td">{tOr(t, `settings.channelKind.${c.kind}`, c.kind)}</td><td className="td text-right tabular">{c.commissionPct}%</td><td className="td text-right tabular">{money(c.commissionFixed)}</td><td className="td text-right tabular">{money(c.avgShipping)}</td><td className="td text-right"><ChannelDialog c={c} trigger={<button className="btn-ghost btn-sm">{t('common.edit')}</button>} />{can(user, 'config', 'X') && <> <RemoveButton kind="channel" id={c.id} name={c.name} /></>}</td></tr>)}</tbody></Table></Card>}
      {tab === 'listas' && <Card pad={false} actions={<PriceListDialog trigger={<button className="btn-primary btn-sm">{t('settings.priceList')}</button>} />}><Table><tbody>{pl.map((p) => <tr key={p.id}><td className="td font-medium">{p.name}</td><td className="td tabular">{p.adjustPct > 0 ? '+' : ''}{p.adjustPct}{t('settings.overSuggested')}</td><td className="td text-right"><PriceListDialog p={p} trigger={<button className="btn-ghost btn-sm">{t('common.edit')}</button>} />{can(user, 'config', 'X') && <> <RemoveButton kind="priceList" id={p.id} name={p.name} /></>}</td></tr>)}</tbody></Table></Card>}
      {tab === 'auditoria' && <Card title={t('settings.recentChangesToPricesStatuses')} pad={false}><Table><thead><tr><th className="th">{t('common.date')}</th><th className="th">{t('settings.who')}</th><th className="th">{t('settings.entity')}</th><th className="th">{t('settings.action')}</th><th className="th">{t('common.details')}</th></tr></thead><tbody>{log.map((a) => <tr key={a.id}><td className="td tabular text-xs">{dmyHm(a.createdAt)}</td><td className="td text-xs">{names.get(a.userId ?? '') ?? '—'}</td><td className="td">{tOr(t, `audit.entity.${a.entity}`, a.entity)}</td><td className="td">{tOr(t, `audit.${a.action}`, a.action)}</td><td className="td text-xs muted max-w-md truncate" title={JSON.stringify(a.changes)}>{auditDetail(a.changes, t)}</td></tr>)}</tbody></Table></Card>}
      {tab === 'archivados' && <Card title={t('archive.title')} pad={false}><p className="muted text-sm p-3">{t('archive.hint')}</p>{archived.length === 0 ? <p className="p-3 text-sm" data-testid="archive-empty">{t('archive.empty')}</p> : <Table><thead><tr><th className="th">{t('archive.type')}</th><th className="th">{t('archive.name')}</th><th className="th">{t('archive.deletedOn')}</th><th className="th" /></tr></thead><tbody>{archived.map((r) => <tr key={r.kind + r.id}><td className="td"><Badge>{t(`archive.kind.${r.kind}` as 'archive.kind.user')}</Badge></td><td className="td font-medium">{r.name}</td><td className="td tabular text-xs">{dmyHm(r.deletedAt)}</td><td className="td text-right"><RestoreButton kind={r.kind} id={r.id} /></td></tr>)}</tbody></Table>}</Card>}
      {tab === 'calidades' && <Card title={t('settings.tabQualities')}><PresetsEditor rows={await presetRows(db)} /></Card>}
      {tab === 'proveedores' && <Card pad={false} actions={<SupplierDialog trigger={<button className="btn-primary btn-sm" data-testid="new-supplier">{t('settings.supplier')}</button>} />}><p className="muted text-sm p-3">{t('settings.suppliersHint')}</p><Table><thead><tr><th className="th">{t('common.name')}</th><th className="th">{t('settings.supplierKind')}</th><th className="th">{t('settings.supplierCountry')}</th><th className="th" /></tr></thead><tbody>{(await listSuppliers(db, false)).map((x) => <tr key={x.id}><td className="td font-medium">{x.url ? <a className="underline" href={x.url} target="_blank" rel="noopener noreferrer">{x.name}</a> : x.name}{!x.verified && <Badge tone="amber" className="ml-2">{t('settings.supplierUnverified')}</Badge>}{x.verified && x.verifiedAt && <span className="ml-2 text-xs muted" data-testid="supplier-verified-at">{t('settings.supplierVerifiedOn', { date: dmyHm(x.verifiedAt) })}</span>}{!x.active && <Badge className="ml-2">{t('common.inactive')}</Badge>}</td><td className="td">{tOr(t, `settings.supplierKind_${x.kind}`, x.kind)}</td><td className="td">{x.country}{x.city ? ` · ${x.city}` : ''}</td><td className="td text-right"><SupplierDialog sp={x} trigger={<button className="btn-ghost btn-sm">{t('common.edit')}</button>} /></td></tr>)}</tbody></Table></Card>}
      {tab === 'sistema' && <Card title={t('settings.systemTitle')}><p className="muted text-sm mb-3">{t('settings.systemHint')}</p><ul className="divide-y divide-[var(--line)]" data-testid="health">{(await systemHealth()).map((c) => <li key={c.id} className="py-2 flex items-center justify-between gap-3 text-sm"><span>{t(`settings.health_${c.id}` as 'settings.health_orca')}<span className="muted block text-xs break-all">{c.detail}</span></span><Badge tone={c.ok ? 'green' : 'red'}>{c.ok ? t('settings.healthOk') : t('settings.healthMissing')}</Badge></li>)}</ul><JobsPanel summary={await jobSummary()} failed={(await db.select().from(s.jobs).where(eq(s.jobs.status, 'error')).orderBy(desc(s.jobs.updatedAt)).limit(10)).map((j) => ({ id: j.id, kind: j.kind, status: j.status, attempts: j.attempts, error: j.error, when: dmyHm(j.updatedAt) }))} />{can(user, 'config', 'E') && <AutoTagSetting initial={!!st.library?.autoTag} />}{user.role === 'admin' && <form action={reopenSetupAction} className="mt-4 pt-3 border-t border-[var(--line)]"><p className="muted text-xs mb-2">{t('setup.reopenHint')}</p><button className="btn-ghost btn-sm" data-testid="reopen-setup">{t('setup.reopen')}</button></form>}</Card>}
      {tab === 'respaldo' && <Card title={t('settings.fullBackupAndExport')}><p className="text-sm mb-3">{t('settings.downloadAllDataAsJson')} {user.role !== 'admin' && <b>{t('settings.onlyTheAdministratorCanExport')}</b>}</p><div className="flex gap-2"><a className="btn-primary" href="/api/backup" data-testid="backup"><Icon name="download" className="h-4 w-4" />{t('settings.fullBackupDataFiles')}</a><a className="btn-ghost" href="/api/backup?archivos=0">{t('settings.dataOnly')}</a></div><p className="text-xs muted mt-3">{t('settings.inProductionAlsoScheduleA')}</p></Card>}
    </>
  );
}
