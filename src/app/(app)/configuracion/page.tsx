import Link from 'next/link';
import { asc, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { PageHeader, Card, Table, Tabs, Badge } from '@/components/ui';
import { ChannelDialog, PriceListDialog, RatesForm, ShopForm, TemplatesForm, UserDialog } from '@/components/config-forms';
import { getSettings, getSettingsRaw } from '@/lib/settings';
import { can } from '@/lib/perm';
import { publicAiSettings } from '@/lib/ai/config';
import { aiUsage } from '@/lib/ai';
import { AiSettingsForm, AiUsagePanel } from '@/components/ai-settings';
import { ROLE_LABEL } from '@/lib/perm';
import { dmyHm, money } from '@/lib/format';

export const metadata = { title: 'Configuración' };
export default async function ConfigPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await pagePerm('config', 'V'); const { tab = 'taller' } = await searchParams; const db = await getDb(); const st = await getSettings();
  const users = tab === 'usuarios' ? await db.select().from(s.users).orderBy(asc(s.users.name)) : []; const ch = tab === 'canales' ? await db.select().from(s.salesChannels).orderBy(asc(s.salesChannels.name)) : [];
  const pl = tab === 'listas' ? await db.select().from(s.priceLists) : []; const audit = tab === 'auditoria' ? await db.select().from(s.activityLog).orderBy(s.activityLog.createdAt).limit(0) : [];
  const log = tab === 'auditoria' ? (await db.select().from(s.activityLog)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 80) : [];
  const names = new Map((await db.select({ id: s.users.id, n: s.users.name }).from(s.users)).map((u) => [u.id, u.n]));
  return (
    <>
      <PageHeader title="Configuración" subtitle="Datos del taller, tarifas, plantillas, usuarios, canales de venta y respaldo." />
      <Tabs current={tab} tabs={[['taller', 'Taller'], ['tarifas', 'Tarifas'], ['plantillas', 'Plantillas y numeración'], ['usuarios', 'Usuarios y permisos'], ['canales', 'Canales de venta'], ['listas', 'Listas de precios'], ['ia', 'Inteligencia artificial'], ['auditoria', 'Auditoría'], ['respaldo', 'Respaldo']].map(([k, l]) => ({ key: k, label: l, href: `/configuracion?tab=${k}` }))} />
      {tab === 'ia' && <><Card title="Inteligencia artificial (opcional)"><AiSettingsForm st={publicAiSettings((await getSettingsRaw()).ai)} canClear={can(user, 'ia', 'X')} /></Card><Card title="Consumo" className="mt-6"><AiUsagePanel usage={await aiUsage()} budget={st.ai.budget.monthlyUsd} /></Card></>}
      {tab === 'taller' && <Card><ShopForm st={st} /></Card>}
      {tab === 'tarifas' && <Card><RatesForm st={st} /></Card>}
      {tab === 'plantillas' && <Card><TemplatesForm st={st} /></Card>}
      {tab === 'usuarios' && <Card pad={false} actions={<UserDialog selfId={user.id} trigger={<button className="btn-primary btn-sm" data-testid="new-user">+ Usuario</button>} />}><Table><thead><tr><th className="th">Nombre</th><th className="th">Correo</th><th className="th">Rol</th><th className="th">Estado</th><th className="th" /></tr></thead><tbody>{users.map((u) => <tr key={u.id}><td className="td font-medium">{u.name}</td><td className="td">{u.email}</td><td className="td"><Badge>{ROLE_LABEL[u.role as 'admin']}</Badge></td><td className="td">{u.active ? <Badge tone="green">Activo</Badge> : <Badge tone="red">Inactivo</Badge>}</td><td className="td text-right"><UserDialog selfId={user.id} u={{ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, permOverrides: u.permOverrides ?? {} }} trigger={<button className="btn-ghost btn-sm">Editar</button>} /></td></tr>)}</tbody></Table></Card>}
      {tab === 'canales' && <Card pad={false} actions={<ChannelDialog trigger={<button className="btn-primary btn-sm" data-testid="new-channel">+ Canal</button>} />}><Table><thead><tr><th className="th">Canal</th><th className="th">Tipo</th><th className="th text-right">Comisión</th><th className="th text-right">Fija</th><th className="th text-right">Envío prom.</th><th className="th" /></tr></thead><tbody>{ch.map((c) => <tr key={c.id}><td className="td font-medium">{c.name} {!c.active && <Badge>Inactivo</Badge>}</td><td className="td capitalize">{c.kind}</td><td className="td text-right tabular">{c.commissionPct}%</td><td className="td text-right tabular">{money(c.commissionFixed)}</td><td className="td text-right tabular">{money(c.avgShipping)}</td><td className="td text-right"><ChannelDialog c={c} trigger={<button className="btn-ghost btn-sm">Editar</button>} /></td></tr>)}</tbody></Table></Card>}
      {tab === 'listas' && <Card pad={false} actions={<PriceListDialog trigger={<button className="btn-primary btn-sm">+ Lista</button>} />}><Table><tbody>{pl.map((p) => <tr key={p.id}><td className="td font-medium">{p.name}</td><td className="td tabular">{p.adjustPct > 0 ? '+' : ''}{p.adjustPct}% sobre el sugerido</td><td className="td text-right"><PriceListDialog p={p} trigger={<button className="btn-ghost btn-sm">Editar</button>} /></td></tr>)}</tbody></Table></Card>}
      {tab === 'auditoria' && <Card title="Cambios recientes en precios, estados y stock" pad={false}><Table><thead><tr><th className="th">Fecha</th><th className="th">Quién</th><th className="th">Entidad</th><th className="th">Acción</th><th className="th">Detalle</th></tr></thead><tbody>{log.map((a) => <tr key={a.id}><td className="td tabular text-xs">{dmyHm(a.createdAt)}</td><td className="td text-xs">{names.get(a.userId ?? '') ?? '—'}</td><td className="td">{a.entity}</td><td className="td">{a.action}</td><td className="td text-xs muted max-w-md truncate">{JSON.stringify(a.changes)}</td></tr>)}</tbody></Table></Card>}
      {tab === 'respaldo' && <Card title="Respaldo y exportación completa"><p className="text-sm mb-3">Descarga todos los datos en JSON (una tabla por archivo) y todos los archivos (modelos, G-code y fotos) en un ZIP. Guárdalo fuera del servidor. {user.role !== 'admin' && <b>Solo el administrador puede exportar.</b>}</p><div className="flex gap-2"><a className="btn-primary" href="/api/backup" data-testid="backup">⬇ Respaldo completo (datos + archivos)</a><a className="btn-ghost" href="/api/backup?archivos=0">Solo datos</a></div><p className="text-xs muted mt-3">En producción, programa además un respaldo diario de la base (pg_dump) y del directorio de archivos con retención de 30 días: ver README.</p></Card>}
    </>
  );
}
