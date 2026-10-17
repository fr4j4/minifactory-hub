import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { seedDemo } from '@/lib/seed';
import { enqueueJob, jobSummary, recoverInterruptedJobs, retryJob, runJobNow } from '@/lib/jobs';

let db: Awaited<ReturnType<typeof getDb>>;
beforeAll(async () => { await seedDemo(); db = await getDb(); });

describe('cola persistente de trabajos', () => {
  it('un análisis de archivo se ejecuta desde la cola y deja el trabajo en «done»', async () => {
    const [v] = await db.select().from(s.fileVersions).limit(1);
    await db.update(s.fileVersions).set({ meta: { status: 'processing' } }).where(eq(s.fileVersions.id, v.id));
    const id = await enqueueJob('file.process', { versionId: v.id });
    expect(await runJobNow(id)).toBe('done');
    const [after] = await db.select().from(s.fileVersions).where(eq(s.fileVersions.id, v.id)); expect((after.meta as any).status).toBe('ready');
    const [j] = await db.select().from(s.jobs).where(eq(s.jobs.id, id)); expect(j.status).toBe('done'); expect(j.attempts).toBe(1);
  });

  it('reintenta y, agotados los intentos, queda en error y marca la versión; luego se puede reintentar', async () => {
    const [v] = await db.select().from(s.fileVersions).limit(1);
    const id = await enqueueJob('file.process', { versionId: '00000000-0000-4000-8000-0000000000aa' }, { maxAttempts: 2 });
    expect(await runJobNow(id)).toBe('error');
    const [j] = await db.select().from(s.jobs).where(eq(s.jobs.id, id)); expect(j.attempts).toBe(2); expect(j.status).toBe('error');
    expect((await jobSummary()).error).toBeGreaterThanOrEqual(1);
    await db.update(s.jobs).set({ payload: { versionId: v.id } }).where(eq(s.jobs.id, id));
    await retryJob(id);
    const [q] = await db.select().from(s.jobs).where(eq(s.jobs.id, id)); expect(q.status).toBe('queued'); expect(q.attempts).toBe(0);
    expect(await runJobNow(id)).toBe('done');
  });

  it('un trabajo «running» tras un reinicio vuelve a la cola', async () => {
    const [v] = await db.select().from(s.fileVersions).limit(1);
    const id = await enqueueJob('file.process', { versionId: v.id });
    await db.update(s.jobs).set({ status: 'running', attempts: 1, startedAt: new Date(Date.now() - 3600_000) }).where(eq(s.jobs.id, id));
    await recoverInterruptedJobs();
    expect(await runJobNow(id)).toBe('done');
  });

  it('un trabajo que agotó sus intentos y tumbó el proceso queda en error y no se repite sin fin', async () => {
    const [v] = await db.select().from(s.fileVersions).limit(1);
    const id = await enqueueJob('file.process', { versionId: v.id }, { maxAttempts: 2 });
    await db.update(s.jobs).set({ status: 'running', attempts: 2, startedAt: new Date(Date.now() - 3600_000) }).where(eq(s.jobs.id, id));
    const fresh = await enqueueJob('file.process', { versionId: v.id }, { claimed: true }); // tomado ahora por runJobNow: no se toca
    await recoverInterruptedJobs();
    const [j] = await db.select().from(s.jobs).where(eq(s.jobs.id, id)); expect(j.status).toBe('error');
    expect(((await db.select().from(s.fileVersions).where(eq(s.fileVersions.id, v.id)))[0].meta as any).status).toBe('error');
    expect(await runJobNow(fresh, { claimed: true })).toBe('done');
  });
});

describe('cancelar un laminado', () => {
  it('uno que ya corre (en otro proceso) queda cancelado en la base', async () => {
    const { cancelRun } = await import('@/lib/slicer/queue');
    const [v] = await db.select().from(s.fileVersions).limit(1);
    const [r] = await db.insert(s.sliceRuns).values({ workspaceId: v.workspaceId, fileVersionId: v.id, cacheKey: 'test-cancel', status: 'running' }).returning();
    expect(await cancelRun(r.id)).toBe('cancelado');
    expect((await db.select().from(s.sliceRuns).where(eq(s.sliceRuns.id, r.id)))[0].status).toBe('cancelado');
    expect(await cancelRun(r.id)).toBe('noop');
  });
});
