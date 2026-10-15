import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { seedDemo } from '@/lib/seed';
import { enqueueJob, jobSummary, retryJob, runJobNow } from '@/lib/jobs';

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
    await db.update(s.jobs).set({ status: 'running' }).where(eq(s.jobs.id, id));
    // lo que hace el arranque del worker
    await db.update(s.jobs).set({ status: 'queued', runAfter: new Date() }).where(eq(s.jobs.status, 'running'));
    expect(await runJobNow(id)).toBe('done');
  });
});
