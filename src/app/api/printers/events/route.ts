import { getSession } from '@/lib/auth';
import { can } from '@/lib/perm';
import { liveRows, onUpdate, type LiveRow } from '@/lib/bambu/manager';
import { getT } from '@/i18n/server';

export const dynamic = 'force-dynamic';

/** Estado en vivo de todas las impresoras conectadas (Server-Sent Events). Máx. una actualización por segundo por impresora. */
export async function GET(req: Request) {
  const t = await getT();
  const u = await getSession(); if (!u || !can(u, 'maquinas', 'V')) return new Response(t('common.unauthorized'), { status: 401 });
  const enc = new TextEncoder(); let closed = false;
  const stream = new ReadableStream({
    start(ctl) {
      const send = (ev: string, data: unknown) => { if (!closed) ctl.enqueue(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`)); };
      send('snapshot', liveRows());
      const pending = new Map<string, LiveRow>(); const last = new Map<string, number>(); let tt: NodeJS.Timeout | null = null;
      const flush = () => { tt = null; for (const [id, r] of pending) { send('update', r); last.set(id, Date.now()); } pending.clear(); };
      const off = onUpdate((r) => {
        if (!r) { send('snapshot', liveRows()); return; }
        pending.set(r.id, r); const wait = Math.max(0, 1000 - (Date.now() - (last.get(r.id) ?? 0)));
        if (!tt) tt = setTimeout(flush, wait);
      });
      const ping = setInterval(() => { if (!closed) ctl.enqueue(enc.encode(': ping\n\n')); }, 20_000);
      req.signal.addEventListener('abort', () => { closed = true; off(); clearInterval(ping); if (tt) clearTimeout(tt); try { ctl.close(); } catch { /* ya cerrado */ } });
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
}
