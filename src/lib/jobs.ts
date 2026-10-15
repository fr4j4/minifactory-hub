import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';

/**
 * Cola persistente de trabajos en segundo plano. Un trabajo vive en la base: sobrevive a reinicios (los «running» vuelven a la cola),
 * se reintenta con espera creciente y, agotados los intentos, queda en «error» para reintentarlo a mano.
 */
export type JobKind = 'file.process';
type Handler = (payload: Record<string, any>) => Promise<void>;
type FailHook = (payload: Record<string, any>, error: Error) => Promise<void>;

const handlers: Record<JobKind, { run: Handler; onFail?: FailHook }> = {
  'file.process': {
    run: async (p) => {
      const db = await getDb(); const [v] = await db.select({ id: s.fileVersions.id }).from(s.fileVersions).where(eq(s.fileVersions.id, String(p.versionId)));
      if (!v) throw new Error('file version not found');
      const { processVersion } = await import('./files'); await processVersion(v.id);
    },
    onFail: async (p, e) => { const db = await getDb(); await db.update(s.fileVersions).set({ meta: { status: 'error', error: e.message } }).where(eq(s.fileVersions.id, String(p.versionId))); },
  },
};

const g = globalThis as unknown as { __jobWorker?: { timer?: ReturnType<typeof setInterval>; running: number } };
const CONCURRENCY = 2;
const backoffMs = (attempt: number) => Math.min(60_000, 2_000 * 2 ** (attempt - 1));

export async function enqueueJob(kind: JobKind, payload: Record<string, any>, o: { maxAttempts?: number; userId?: string | null } = {}): Promise<string> {
  const db = await getDb();
  const [row] = await db.insert(s.jobs).values({ workspaceId: WORKSPACE_ID, kind, payload, maxAttempts: o.maxAttempts ?? 3, createdBy: o.userId ?? null }).returning({ id: s.jobs.id });
  ensureJobWorker();
  return row.id;
}

/** Toma el trabajo (si sigue en cola) y lo ejecuta. Devuelve su estado final. */
async function execute(id: string): Promise<'done' | 'error' | 'retry' | 'skipped'> {
  const db = await getDb();
  const [job] = await db.update(s.jobs).set({ status: 'running', startedAt: new Date(), attempts: sql`${s.jobs.attempts} + 1`, updatedAt: new Date() }).where(and(eq(s.jobs.id, id), eq(s.jobs.status, 'queued'))).returning();
  if (!job) return 'skipped';
  const h = handlers[job.kind as JobKind];
  try {
    if (!h) throw new Error(`unknown job kind: ${job.kind}`);
    await h.run(job.payload);
    await db.update(s.jobs).set({ status: 'done', error: null, finishedAt: new Date(), updatedAt: new Date() }).where(eq(s.jobs.id, id));
    return 'done';
  } catch (e) {
    const err = e as Error;
    if (job.attempts < job.maxAttempts) {
      await db.update(s.jobs).set({ status: 'queued', error: err.message, runAfter: new Date(Date.now() + backoffMs(job.attempts)), updatedAt: new Date() }).where(eq(s.jobs.id, id));
      return 'retry';
    }
    await db.update(s.jobs).set({ status: 'error', error: err.message, finishedAt: new Date(), updatedAt: new Date() }).where(eq(s.jobs.id, id));
    await h?.onFail?.(job.payload, err).catch(() => {});
    return 'error';
  }
}

/** Ejecuta un trabajo ahora, en este proceso (pruebas, scripts y «esperar el resultado»). Reintenta sin espera hasta agotar intentos. */
export async function runJobNow(id: string): Promise<'done' | 'error' | 'skipped'> {
  const db = await getDb();
  for (;;) {
    const r = await execute(id);
    if (r !== 'retry') return r;
    await db.update(s.jobs).set({ runAfter: new Date() }).where(eq(s.jobs.id, id));
  }
}

async function tick() {
  const w = g.__jobWorker!; if (w.running >= CONCURRENCY) return;
  const db = await getDb();
  const rows = await db.select({ id: s.jobs.id }).from(s.jobs).where(and(eq(s.jobs.status, 'queued'), lte(s.jobs.runAfter, new Date()))).orderBy(asc(s.jobs.runAfter)).limit(CONCURRENCY - w.running);
  for (const r of rows) { w.running++; execute(r.id).catch(() => {}).finally(() => { w.running--; }); }
}

export function ensureJobWorker() {
  if (g.__jobWorker?.timer) return;
  g.__jobWorker = { running: 0 };
  // lo que estaba en ejecución cuando se reinició el servidor vuelve a la cola
  getDb().then((db) => db.update(s.jobs).set({ status: 'queued', runAfter: new Date() }).where(eq(s.jobs.status, 'running'))).catch(() => {});
  const t = setInterval(() => { tick().catch(() => {}); }, 700); t.unref?.();
  g.__jobWorker.timer = t;
}

export async function retryJob(id: string) {
  const db = await getDb();
  await db.update(s.jobs).set({ status: 'queued', attempts: 0, error: null, runAfter: new Date(), finishedAt: null, updatedAt: new Date() }).where(and(eq(s.jobs.id, id), eq(s.jobs.status, 'error')));
  ensureJobWorker();
}

export async function jobSummary() {
  const db = await getDb();
  const rows = await db.select({ status: s.jobs.status, n: sql<number>`count(*)::int` }).from(s.jobs).where(inArray(s.jobs.status, ['queued', 'running', 'error'])).groupBy(s.jobs.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)])) as Record<string, number>;
  return { queued: by.queued ?? 0, running: by.running ?? 0, error: by.error ?? 0 };
}
