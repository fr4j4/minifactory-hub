import dns from 'node:dns/promises';
import net from 'node:net';
import { LocalizedError } from '@/i18n/errors';

/** Valida un link de referencia: solo http/https. */
export function normalizeUrl(raw: string): string {
  let u = raw.trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  const url = new URL(u);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new LocalizedError('links.onlyHttp');
  return url.toString();
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const l = ip.toLowerCase();
  return l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:127.') || l === '::';
}

export const SITE_LABEL: Array<[RegExp, string]> = [
  [/printables\.com/, 'Printables'], [/thingiverse\.com/, 'Thingiverse'], [/makerworld\.com/, 'MakerWorld'], [/cults3d\.com/, 'Cults'],
  [/instagram\.com/, 'Instagram'], [/drive\.google\.com|docs\.google\.com/, 'Google Drive'], [/mercadolibre/, 'Mercado Libre'], [/youtube\.com|youtu\.be/, 'YouTube'], [/pinterest\./, 'Pinterest'],
];
export function siteLabel(url: string) { try { const h = new URL(url).hostname; return SITE_LABEL.find(([r]) => r.test(h))?.[1] ?? h.replace(/^www\./, ''); } catch { return url; } }

/** Título e imagen de vista previa del link. Se hace en el servidor con límite de tiempo y sin acceder a direcciones internas. */
export async function fetchLinkPreview(rawUrl: string): Promise<{ url: string; title: string | null; image: string | null; site: string }> {
  const url = normalizeUrl(rawUrl);
  const out = { url, title: null as string | null, image: null as string | null, site: siteLabel(url) };
  try {
    const host = new URL(url).hostname;
    if (!net.isIP(host)) {
      const addrs = await dns.lookup(host, { all: true });
      if (addrs.some((a) => isPrivateIp(a.address))) return out;
    } else if (isPrivateIp(host)) return out;
    const ctl = new AbortController(); const tt = setTimeout(() => ctl.abort(), 4000);
    const res = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (compatible; MiniFactoryBot/1.0)', accept: 'text/html' } });
    clearTimeout(tt);
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return out;
    const reader = res.body?.getReader(); let html = ''; let n = 0;
    while (reader && n < 512 * 1024) { const { done, value } = await reader.read(); if (done) break; n += value.length; html += new TextDecoder().decode(value); if (/<\/head>/i.test(html)) break; }
    const meta = (p: string) => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1] ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${p}["']`, 'i'))?.[1];
    out.title = (meta('og:title') ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? null)?.trim().slice(0, 200) ?? null;
    const img = meta('og:image');
    if (img) { try { const u = new URL(img, url); if (u.protocol === 'http:' || u.protocol === 'https:') out.image = u.toString(); } catch { /* ignorar */ } }
  } catch { /* sin vista previa: se guarda la URL tal cual */ }
  return out;
}
