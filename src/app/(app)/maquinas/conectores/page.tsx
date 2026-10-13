import { asc, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can } from '@/lib/perm';
import { PageHeader } from '@/components/ui';
import { ConnectorsBoard, type LinkedRow } from '@/components/printer-connect';
import { accountOnline, liveRows } from '@/lib/bambu/manager';

export const metadata = { title: 'Conectar impresoras' };
export const dynamic = 'force-dynamic';

export default async function ConnectorsPage() {
  const user = await pagePerm('maquinas', 'V'); const db = await getDb();
  const links = await db.select().from(s.printerLinks).where(isNull(s.printerLinks.deletedAt)).orderBy(asc(s.printerLinks.createdAt));
  const machines = await db.select({ id: s.machines.id, name: s.machines.name, connection: s.machines.connection }).from(s.machines).where(isNull(s.machines.deletedAt)).orderBy(asc(s.machines.name));
  const accs = await db.select().from(s.cloudAccounts).where(isNull(s.cloudAccounts.deletedAt)).orderBy(asc(s.cloudAccounts.createdAt));
  const accounts = accs.filter((a) => a.status !== 'cerrada' || links.some((l) => l.cloudAccountId === a.id)).map((a) => ({ id: a.id, email: a.email, region: a.region, status: a.status, displayName: a.displayName, expiresAt: a.tokenExpiresAt?.toISOString() ?? null, lastError: a.lastError, online: accountOnline(a.id) }));
  const live = Object.fromEntries(liveRows().map((r) => [r.id, r]));
  const rows: LinkedRow[] = links.map((l) => ({ id: l.id, machineId: l.machineId, machineName: machines.find((m) => m.id === l.machineId)?.name ?? l.name ?? l.serial, serial: l.serial, host: l.host, mode: l.mode, model: l.model, name: l.name, enabled: l.enabled, syncQueue: l.syncQueue, fingerprint: l.fingerprint, lastError: l.lastError, live: live[l.id] ?? null }));
  const free = machines.filter((m) => !links.some((l) => l.machineId === m.id)).map((m) => ({ id: m.id, name: m.name }));
  return (
    <>
      <PageHeader back={{ href: '/maquinas', label: 'Máquinas' }} title="Conectar impresoras" subtitle="Conecta tus Bambu Lab por la red local o con tu cuenta de Bambu Cloud y míralas en vivo: estado, avance por capas, filamento del AMS y cámara." />
      <ConnectorsBoard linked={rows} machines={free} accounts={accounts} canCreate={can(user, 'maquinas', 'C')} canEdit={can(user, 'maquinas', 'E')} canRemove={can(user, 'maquinas', 'X')} />
    </>
  );
}
