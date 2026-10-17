import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can } from '@/lib/perm';
import { PageHeader, Card, Table, StatusBadge } from '@/components/ui';
import { QueueBoard, type QJob } from '@/components/queue-board';
import { getSettings } from '@/lib/settings';
import { projectQueue } from '@/lib/services/production';
import { dmyHm, dur, grams } from '@/lib/format';
import { getT } from '@/i18n/server';
import { tOr } from '@/i18n/translate';

export async function generateMetadata() { return { title: (await getT())('meta.queue') }; }
export default async function QueuePage() {
  const t = await getT();
  const user = await pagePerm('cola', 'V'); const db = await getDb(); const st = await getSettings();
  const machines = await db.select().from(s.machines).where(and(isNull(s.machines.deletedAt), eq(s.machines.simulated, false))).orderBy(asc(s.machines.name));
  const rows = await db.select({ j: s.printJobs, o: s.orders.number, c: s.orders.customerName }).from(s.printJobs).leftJoin(s.orders, eq(s.orders.id, s.printJobs.orderId)).where(and(isNull(s.printJobs.deletedAt), inArray(s.printJobs.status, ['en_cola', 'imprimiendo', 'pausado'])));
  const done = await db.select({ j: s.printJobs }).from(s.printJobs).where(inArray(s.printJobs.status, ['terminado', 'fallido'])).orderBy(desc(s.printJobs.realEnd)).limit(12);
  const mats = await db.select().from(s.materials).where(isNull(s.materials.deletedAt)); const spools = await db.select().from(s.spools).where(and(isNull(s.spools.deletedAt), inArray(s.spools.status, ['nueva', 'abierta', 'en_uso'])));
  const plan = await projectQueue(db);
  const jobs: QJob[] = rows.map(({ j, o, c }) => ({ id: j.id, number: j.number, title: j.title ?? '', kind: j.kind, status: j.status, machineId: j.machineId, suggestedMachineId: j.machineId ? null : (plan.get(j.id)?.machineId ?? null), materialId: j.materialId, spoolId: j.spoolId, estG: j.estG, estH: j.estH, realG: j.realG, plannedStart: j.plannedStart?.toISOString() ?? null, plannedEnd: j.plannedEnd?.toISOString() ?? null, realStart: j.realStart?.toISOString() ?? null, qty: j.qty, orderId: j.orderId, orderNumber: o, reprint: !!j.reprintOfId, position: j.position, customer: c }));
  return (
    <>
      <PageHeader title={t('queue.productionQueue')} subtitle={t('queue.oneQueueIntro')} />
      <QueueBoard jobs={jobs} machines={machines.map((m) => ({ id: m.id, name: m.name, status: m.status, tech: m.tech }))} materials={mats.map((m) => ({ id: m.id, label: `${m.type} ${m.colorName}`, hex: m.hex, tech: m.tech }))} spools={spools.map((x) => ({ id: x.id, code: x.code, materialId: x.materialId, remainingG: x.remainingG }))} canEdit={can(user, 'cola', 'E')} canCreate={can(user, 'cola', 'C')} workStart={Number(st.workHours.start.split(':')[0])} workEnd={Number(st.workHours.end.split(':')[0])} nowIso={new Date().toISOString()} />
      <Card title={t('queue.recentlyFinished')} pad={false} className="mt-6"><Table><thead><tr><th className="th">{t('common.job')}</th><th className="th">{t('queue.result')}</th><th className="th text-right">{t('queue.estimated')}</th><th className="th text-right">{t('queue.actual')}</th><th className="th">{t('queue.finished')}</th><th className="th">{t('queue.cause')}</th></tr></thead><tbody>{done.map(({ j }) => <tr key={j.id}><td className="td font-medium">{j.number} <span className="muted font-normal">{j.title}</span></td><td className="td"><StatusBadge status={j.status} /> <span className="text-xs muted">{j.result ? tOr(t, `queue.resultKind.${j.result}`, j.result) : ''}</span></td><td className="td text-right tabular text-xs">{grams(j.estG)} · {dur(j.estH * 3600)}</td><td className="td text-right tabular text-xs">{grams(j.realG)} · {dur((j.realH ?? 0) * 3600)}</td><td className="td tabular text-xs">{dmyHm(j.realEnd)}</td><td className="td text-xs muted">{j.failCause}</td></tr>)}</tbody></Table></Card>
    </>
  );
}
