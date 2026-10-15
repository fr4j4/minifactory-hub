import { inArray } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { getSession } from '@/lib/auth';
import { RUN_FINISHED, runInfoOf } from '@/lib/slicer/run-info';

export const dynamic = 'force-dynamic';

/** Progreso de laminados en tiempo real (Server-Sent Events): manda un evento cuando cambia el estado o el avance y termina cuando todos acabaron. */
export async function GET(req: Request) {
  if (!(await getSession())) return new Response('unauthorized', { status: 401 });
  const ids = (new URL(req.url).searchParams.get('ids') ?? '').split(',').filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 20);
  if (!ids.length) return new Response('bad request', { status: 400 });
  const db = await getDb(); const enc = new TextEncoder(); const last = new Map<string, string>(); let closed = false;
  const stream = new ReadableStream({
    async start(ctl) {
      const send = (event: string, data: unknown) => { try { ctl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { closed = true; } };
      req.signal.addEventListener('abort', () => { closed = true; });
      const t0 = Date.now();
      while (!closed && Date.now() - t0 < 10 * 60_000) {
        const rows = await db.select().from(s.sliceRuns).where(inArray(s.sliceRuns.id, ids));
        for (const r of rows) { const info = runInfoOf(r); const sig = JSON.stringify(info); if (last.get(r.id) !== sig) { last.set(r.id, sig); send('run', info); } }
        if (rows.length && rows.every((r) => RUN_FINISHED.includes(r.status))) { send('end', {}); break; }
        await new Promise((res) => setTimeout(res, 400));
      }
      try { ctl.close(); } catch { /* ya cerrado */ }
    },
    cancel() { closed = true; },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' } });
}
