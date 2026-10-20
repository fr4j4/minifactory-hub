import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { getSettings } from '../settings';

const median = (a: number[]) => { if (!a.length) return null; const s2 = [...a].sort((x, y) => x - y); const m = Math.floor(s2.length / 2); return s2.length % 2 ? s2[m] : (s2[m - 1] + s2[m]) / 2; };

export interface CalibrationData {
  samples: number;
  waste: { current: number; measured: number | null; samples: number };
  fail: { current: number; measured: number | null; samples: number };
  machines: Array<{ id: string; name: string; samples: number; currentFactor: number; measuredFactor: number | null }>;
}

/** Compara lo que usa la calculadora con lo que midieron los trabajos terminados (nunca aplica cambios solo). */
export async function calibrationData(): Promise<CalibrationData> {
  const db = await getDb(); const st = await getSettings();
  const jobs = await db.select().from(s.printJobs).where(inArray(s.printJobs.status, ['terminado', 'fallido']));
  const machines = await db.select().from(s.machines).where(isNull(s.machines.deletedAt));
  const ok = jobs.filter((j) => j.result === 'exito');
  const wasteS = ok.filter((j) => j.estG > 0 && j.realG != null && j.realG > 0).map((j) => (j.realG! / j.estG - 1) * 100);
  const failed = jobs.filter((j) => j.result && j.result !== 'exito').length;
  return {
    samples: jobs.length,
    waste: { current: st.rates.wastePct, measured: wasteS.length >= 3 ? Math.max(0, median(wasteS)!) : null, samples: wasteS.length },
    fail: { current: st.rates.failRatePct, measured: jobs.length >= 10 ? (failed / jobs.length) * 100 : null, samples: jobs.length },
    machines: machines.map((m) => {
      const r = ok.filter((j) => j.machineId === m.id && j.estH > 0 && j.realH && j.realH > 0).map((j) => j.realH! / j.estH);
      return { id: m.id, name: m.name, samples: r.length, currentFactor: m.timeFactor, measuredFactor: r.length >= 3 ? median(r) : null };
    }),
  };
}

/** Historial de cambios de tarifas (con lo anterior, para restaurar). */
export async function ratesHistory(limit = 30) {
  const db = await getDb();
  const rows = await db.select().from(s.activityLog).where(and(eq(s.activityLog.entity, 'settings'), eq(s.activityLog.action, 'tarifas'))).orderBy(desc(s.activityLog.createdAt)).limit(limit);
  const users = await db.select({ id: s.users.id, n: s.users.name }).from(s.users); const names = new Map(users.map((u) => [u.id, u.n]));
  return rows.map((r) => ({ id: r.id, at: r.createdAt, who: r.userId ? names.get(r.userId) ?? '—' : '—', before: (r.changes as any)?.before ?? null, after: (r.changes as any)?.after ?? null }));
}

/** Presupuestos en borrador que se recalcularían con las tarifas nuevas al guardarse. */
export async function draftQuotesCount() {
  const db = await getDb();
  const rows = await db.select({ id: s.quotes.id }).from(s.quotes).where(and(eq(s.quotes.status, 'borrador'), isNull(s.quotes.deletedAt)));
  return rows.length;
}

/** Cuántos clientes y canales usan cada perfil de cálculo (para avisar antes de editarlo). */
export async function profileUsage() {
  const db = await getDb();
  const cs = await db.select({ p: s.customers.calcProfileId }).from(s.customers).where(isNull(s.customers.deletedAt));
  const ch = await db.select({ p: s.salesChannels.calcProfileId }).from(s.salesChannels).where(isNull(s.salesChannels.deletedAt));
  const out: Record<string, { customers: number; channels: number }> = {};
  for (const c of cs) if (c.p) (out[c.p] ??= { customers: 0, channels: 0 }).customers++;
  for (const c of ch) if (c.p) (out[c.p] ??= { customers: 0, channels: 0 }).channels++;
  return out;
}
