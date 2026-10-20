import { beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { libraryLiveState } from '@/lib/library/live';
import type { SessionUser } from '@/lib/auth';

const user = { id: crypto.randomUUID(), role: 'admin', workspaceId: WORKSPACE_ID } as SessionUser;
beforeAll(async () => { process.env.MF_EXTERNAL_WORKER = '1'; const db = await getDb(); await db.insert(s.users).values({ id: user.id, workspaceId: WORKSPACE_ID, email: user.id + '@test.local', name: 'Test', role: 'admin', passwordHash: 'test-only' }); });

async function model(name: string, status: string, tags: string[] = []) {
  const db = await getDb();
  const [f] = await db.insert(s.modelFiles).values({ workspaceId: WORKSPACE_ID, name, format: 'stl', tags }).returning();
  const [v] = await db.insert(s.fileVersions).values({ workspaceId: WORKSPACE_ID, modelFileId: f.id, number: 1, format: 'stl', storageKey: 'x', size: 1, meta: { status } } as any).returning();
  await db.update(s.modelFiles).set({ currentVersionId: v.id }).where(eq(s.modelFiles.id, f.id));
  return { db, f, v };
}

it('changes when a matching model arrives or finishes processing, and ignores models that the filters exclude', async () => {
  const base = await libraryLiveState(user, { tag: 'live-test' });
  expect(base.active).toBe(false);

  await model('otro', 'ready', ['otra']);   // no cumple el filtro: la lista de esta página no cambia
  expect((await libraryLiveState(user, { tag: 'live-test' })).signature).toBe(base.signature);

  const { db, v } = await model('nuevo', 'processing', ['live-test']);
  const arrived = await libraryLiveState(user, { tag: 'live-test' });
  expect(arrived.signature).not.toBe(base.signature); expect(arrived).toMatchObject({ active: true, processing: 1 });
  // la página en la que estás no cambia el resultado: el cursor se ignora
  expect((await libraryLiveState(user, { tag: 'live-test', cursor: 'abc' })).signature).toBe(arrived.signature);

  await db.update(s.fileVersions).set({ meta: { status: 'ready' } }).where(eq(s.fileVersions.id, v.id));
  const done = await libraryLiveState(user, { tag: 'live-test' });
  expect(done.signature).not.toBe(arrived.signature); expect(done).toMatchObject({ active: false, processing: 0 });
});

it('reports the user\'s own imports in progress and nobody else\'s', async () => {
  const db = await getDb(); const other = crypto.randomUUID();
  await db.insert(s.users).values({ id: other, workspaceId: WORKSPACE_ID, email: other + '@test.local', name: 'Otro', role: 'admin', passwordHash: 'test-only' });
  const before = await libraryLiveState(user, {});
  const [op] = await db.insert(s.libraryOperations).values({ workspaceId: WORKSPACE_ID, createdBy: user.id, kind: 'url.import', status: 'running', input: { preview: { title: 'Mi modelo' } } } as any).returning();
  await db.insert(s.libraryOperations).values({ workspaceId: WORKSPACE_ID, createdBy: other, kind: 'url.import', status: 'running', input: { preview: { title: 'Ajeno' } } } as any);
  const during = await libraryLiveState(user, {});
  expect(during.imports).toEqual([{ id: op.id, status: 'running', title: 'Mi modelo' }]); expect(during.active).toBe(true); expect(during.signature).not.toBe(before.signature);
  await db.update(s.libraryOperations).set({ status: 'done' }).where(eq(s.libraryOperations.id, op.id));
  const after = await libraryLiveState(user, {});
  expect(after.imports).toEqual([]); expect(after.signature).not.toBe(during.signature);
});
