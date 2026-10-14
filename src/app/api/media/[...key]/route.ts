import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { exists, stat, webStream } from '@/lib/storage';
import { getT } from '@/i18n/server';

const MIME: Record<string, string> = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', gcode: 'text/plain', '3mf': 'model/3mf', json: 'application/json' };

/** Archivos privados (fotos, comprobantes, G-code): solo con sesión activa. */
export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const t = await getT();
  const user = await getSession();
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 });
  const { key: parts } = await params;
  const key = parts.map(decodeURIComponent).join('/');
  if (key.includes('..') || !/^(photos|thumbs|attachments|gcode|preview)\//.test(key)) return NextResponse.json({ error: t('api.invalidPath') }, { status: 400 });
  if (!(await exists(key))) return NextResponse.json({ error: t('common.notFound') }, { status: 404 });
  const st = await stat(key); const ext = key.split('.').pop() ?? '';
  const range = req.headers.get('range');
  const headers: Record<string, string> = { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': 'private, max-age=86400', 'accept-ranges': 'bytes' };
  if (new URL(req.url).searchParams.get('download')) headers['content-disposition'] = `attachment; filename="${key.split('/').pop()}"`;
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/); const start = m?.[1] ? +m[1] : 0; const end = m?.[2] ? +m[2] : st.size - 1;
    return new Response(webStream(key, { start, end }), { status: 206, headers: { ...headers, 'content-range': `bytes ${start}-${end}/${st.size}`, 'content-length': String(end - start + 1) } });
  }
  return new Response(webStream(key), { headers: { ...headers, 'content-length': String(st.size) } });
}
