import { LocalizedError } from '@/i18n/errors';
import { safeGet } from './library/source';

/** Valida un link de referencia: solo http/https. */
export function normalizeUrl(raw: string): string {
  let u = raw.trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  const url = new URL(u);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new LocalizedError('links.onlyHttp');
  return url.toString();
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
    // safeGet revisa la IP en cada redirección (una redirección a una IP interna ya no se sigue)
    const res = await safeGet(url, { maxBytes: 512 * 1024, timeoutMs: 4000, headers: { accept: 'text/html' } });
    if (res.status < 200 || res.status >= 300 || !res.contentType.includes('html')) return out;
    const html = res.body;
    const meta = (p: string) => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1] ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${p}["']`, 'i'))?.[1];
    out.title = (meta('og:title') ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? null)?.trim().slice(0, 200) ?? null;
    const img = meta('og:image');
    if (img) { try { const u = new URL(img, res.finalUrl); if (u.protocol === 'http:' || u.protocol === 'https:') out.image = u.toString(); } catch { /* ignorar */ } }
  } catch { /* sin vista previa: se guarda la URL tal cual */ }
  return out;
}
