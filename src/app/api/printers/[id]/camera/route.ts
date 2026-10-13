import { getSession } from '@/lib/auth';
import { can } from '@/lib/perm';
import { camHub, cameraSnapshot } from '@/lib/bambu/manager';

export const dynamic = 'force-dynamic';

/** Foto de la cámara (JPEG) o, con ?stream=1, video MJPEG compartido entre todos los visores. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSession(); if (!u || !can(u, 'maquinas', 'V')) return new Response('No autorizado', { status: 401 });
  const { id } = await params; const url = new URL(req.url);
  if (url.searchParams.get('stream') !== '1') {
    try { const jpg = await cameraSnapshot(id); return new Response(new Uint8Array(jpg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' } }); }
    catch (e) { return new Response((e as Error).message, { status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); }
  }
  let hub; try { hub = camHub(id); } catch (e) { return new Response((e as Error).message, { status: 404 }); }
  const B = 'mfframe'; let closed = false; let un: (() => void) | null = null;
  const stream = new ReadableStream({
    start(ctl) {
      un = hub.subscribe((f) => {
        if (closed) return;
        if (!f.length) { closed = true; un?.(); try { ctl.close(); } catch { /* */ } return; }
        ctl.enqueue(new Uint8Array(Buffer.concat([Buffer.from(`--${B}\r\nContent-Type: image/jpeg\r\nContent-Length: ${f.length}\r\n\r\n`), f, Buffer.from('\r\n')])));
      });
      req.signal.addEventListener('abort', () => { closed = true; un?.(); try { ctl.close(); } catch { /* */ } });
    },
    cancel() { closed = true; un?.(); },
  });
  return new Response(stream, { headers: { 'Content-Type': `multipart/x-mixed-replace; boundary=${B}`, 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}
