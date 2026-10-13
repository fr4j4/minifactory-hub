import Link from 'next/link';
import { asc, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { PageHeader, Card, Table, Tabs, Badge } from '@/components/ui';
import { ChannelDialog, PriceListDialog, ShopForm, TemplatesForm, UserDialog } from '@/components/config-forms';
import { CalcConfig } from '@/components/calc-config';
import { getCalcContext } from '@/lib/context';
import { draftQuotesCount, profileUsage, ratesHistory } from '@/lib/services/calibration';
import { getSettings, getSettingsRaw } from '@/lib/settings';
import { publicAiSettings } from '@/lib/ai/config';
import { aiUsage } from '@/lib/ai';
import { AiSettingsForm, AiUsagePanel } from '@/components/ai-settings';
import { dmyHm, money } from '@/lib/format';
import { getT } from '@/i18n/server';
import { tOr } from '@/i18n/translate';
import { RemoveButton } from '@/components/remove-button';
import { can } from '@/lib/perm';
import { RestoreButton } from '@/components/restore-button';
import { listArchived } from '@/lib/services/archive';
import { REMOVAL_MODULE } from '@/lib/services/removal';

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
      <Tabs current={tab} tabs={[['taller', t('settings.tabShop')], ['tarifas', t('settings.tabRates')], ['plantillas', t('settings.tabTemplates')], ['usuarios', t('settings.tabUsers')], ['canales', t('settings.tabChannels')], ['listas', t('settings.tabPriceLists')], ['ia', t('ai.tab')], ['auditoria', t('settings.tabAudit')], ['archivados', t('settings.tabArchived')], ['respaldo', t('settings.tabBackup')]].map(([k, l]) => ({ key: k, label: l, href: `/configuracion?tab=${k}` }))} />
      {tab === 'ia' && <><Card title={t('ai.title')}><AiSettingsForm st={publicAiSettings((await getSettingsRaw()).ai)} canClear={can(user, 'ia', 'X')} /></Card><Card title={t('ai.usageTitle')} className="mt-6"><AiUsagePanel usage={await aiUsage()} budget={st.ai.budget.monthlyUsd} /></Card></>}
      {tab === 'taller' && <Card><ShopForm st={st} /></Card>}
      {tab === 'tarifas' && <Card><CalcConfig st={st} ctx={await getCalcContext()} canEdit={can(user, 'config', 'E')} draftCount={await draftQuotesCount()} usage={await profileUsage()} history={await ratesHistory()} /></Card>}
      {tab === 'plantillas' && <Card><TemplatesForm st={st} /></Card>}
      {tab === 'usuarios' && <Card pad={false} actions={<UserDialog selfId={user.id} trigger={<button className="btn-primary btn-sm" data-testid="new-user">{t('settings.user')}</button>} />}><Table><thead><tr><th className="th">{t('common.name')}</th><th className="th">{t('settings.email')}</th><th className="th">{t('settings.role')}</th><th className="th">{t('common.status')}</th><th className="th" /></tr></thead><tbody>{users.map((u) => <tr key={u.id}><td className="td font-medium">{u.name}</td><td className="td">{u.email}</td><td className="td"><Badge>{t(`roles.${u.role as 'admin'}`)}</Badge></td><td className="td">{u.active ? <Badge tone="green">{t('settings.active')}</Badge> : <Badge tone="red">{t('settings.inactive')}</Badge>}</td><td className="td text-right"><UserDialog selfId={user.id} u={{ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, permOverrides: u.permOverrides ?? {} }} trigger={<button className="btn-ghost btn-sm">{t('common.edit')}</button>} />{can(user, 'config', 'X') && <> <RemoveButton kind="user" id={u.id} name={u.name} /></>}</td></tr>)}</tbody></Table></Card>}
      {tab === 'canales' && <Card pad={false} actions={<ChannelDialog calcProfiles={st.calcProfiles} trigger={<button className="btn-primary btn-sm" data-testid="new-channel">{t('settings.channel')}</button>} />}><Table><thead><tr><th className="th">{t('common.channel')}</th><th className="th">{t('common.typeLabel')}</th><th className="th text-right">{t('common.commission')}</th><th className="th text-right">{t('settings.fixed')}</th><th className="th text-right">{t('settings.avgShipping')}</th><th className="th" /></tr></thead><tbody>{ch.map((c) => <tr key={c.id}><td className="td font-medium">{c.name} {!c.active && <Badge>{t('settings.inactive')}</Badge>}</td><td className="td">{tOr(t, `settings.channelKind.${c.kind}`, c.kind)}</td><td className="td text-right tabular">{c.commissionPct}%</td><td className="td text-right tabular">{money(c.commissionFixed)}</td><td className="td text-right tabular">{money(c.avgShipping)}</td><td className="td text-right"><ChannelDialog c={c} calcProfiles={st.calcProfiles} trigger={<button className="btn-ghost btn-sm">{t('common.edit')}</button>} />{can(user, 'config', 'X') && <> <RemoveButton kind="channel" id={c.id} name={c.name} /></>}</td></tr>)}</tbody></Table></Card>}
      {tab === 'listas' && <Card pad={false} actions={<PriceListDialog trigger={<button className="btn-primary btn-sm">{t('settings.priceList')}</button>} />}><Table><tbody>{pl.map((p) => <tr key={p.id}><td className="td font-medium">{p.name}</td><td className="td tabular">{p.adjustPct > 0 ? '+' : ''}{p.adjustPct}{t('settings.overSuggested')}</td><td className="td text-right"><PriceListDialog p={p} trigger={<button className="btn-ghost btn-sm">{t('common.edit')}</button>} />{can(user, 'config', 'X') && <> <RemoveButton kind="priceList" id={p.id} name={p.name} /></>}</td></tr>)}</tbody></Table></Card>}
      {tab === 'auditoria' && <Card title={t('settings.recentChangesToPricesStatuses')} pad={false}><Table><thead><tr><th className="th">{t('common.date')}</th><th className="th">{t('settings.who')}</th><th className="th">{t('settings.entity')}</th><th className="th">{t('settings.action')}</th><th className="th">{t('common.details')}</th></tr></thead><tbody>{log.map((a) => <tr key={a.id}><td className="td tabular text-xs">{dmyHm(a.createdAt)}</td><td className="td text-xs">{names.get(a.userId ?? '') ?? '—'}</td><td className="td">{tOr(t, `audit.entity.${a.entity}`, a.entity)}</td><td className="td">{tOr(t, `audit.${a.action}`, a.action)}</td><td className="td text-xs muted max-w-md truncate">{JSON.stringify(a.changes)}</td></tr>)}</tbody></Table></Card>}
      {tab === 'archivados' && <Card title={t('archive.title')} pad={false}><p className="muted text-sm p-3">{t('archive.hint')}</p>{archived.length === 0 ? <p className="p-3 text-sm" data-testid="archive-empty">{t('archive.empty')}</p> : <Table><thead><tr><th className="th">{t('archive.type')}</th><th className="th">{t('archive.name')}</th><th className="th">{t('archive.deletedOn')}</th><th className="th" /></tr></thead><tbody>{archived.map((r) => <tr key={r.kind + r.id}><td className="td"><Badge>{t(`archive.kind.${r.kind}` as 'archive.kind.user')}</Badge></td><td className="td font-medium">{r.name}</td><td className="td tabular text-xs">{dmyHm(r.deletedAt)}</td><td className="td text-right"><RestoreButton kind={r.kind} id={r.id} /></td></tr>)}</tbody></Table>}</Card>}
      {tab === 'respaldo' && <Card title={t('settings.fullBackupAndExport')}><p className="text-sm mb-3">{t('settings.downloadAllDataAsJson')} {user.role !== 'admin' && <b>{t('settings.onlyTheAdministratorCanExport')}</b>}</p><div className="flex gap-2"><a className="btn-primary" href="/api/backup" data-testid="backup">{t('settings.fullBackupDataFiles')}</a><a className="btn-ghost" href="/api/backup?archivos=0">{t('settings.dataOnly')}</a></div><p className="text-xs muted mt-3">{t('settings.inProductionAlsoScheduleA')}</p></Card>}
    </>
  );
}
