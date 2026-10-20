import dns from 'node:dns/promises';
import net from 'node:net';

/* ── Origen de un modelo (N3): reconocer el sitio, leer metadatos públicos y normalizar la licencia ── */
export type Provider = 'makerworld' | 'printables' | 'thingiverse' | 'otro';
export type LicenseCode = 'cc0' | 'cc-by' | 'cc-by-sa' | 'cc-by-nc' | 'cc-by-nd' | 'cc-by-nc-sa' | 'cc-by-nc-nd' | 'makerworld-comercial' | 'propia' | 'desconocida';
export type CommercialUse = 'si' | 'no' | 'requiere_membresia' | 'desconocido';

export interface ParsedUrl { provider: Provider; externalId: string | null; url: string }
export function parseSourceUrl(input: string): ParsedUrl | null {
  let u: URL; try { u = new URL(input.trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'makerworld.com' || host.endsWith('.makerworld.com')) {
    const m = u.pathname.match(/\/models\/(\d+)/);
    const profileId = u.hash.match(/^#profileId-(\d+)$/i)?.[1];
    return { provider: 'makerworld', externalId: m?.[1] ?? null, url: m ? `https://makerworld.com/models/${m[1]}${profileId ? `#profileId-${profileId}` : ''}` : u.toString() };
  }
  if (host === 'printables.com') { const m = u.pathname.match(/\/model\/(\d+)/); return { provider: 'printables', externalId: m?.[1] ?? null, url: u.toString() }; }
  if (host === 'thingiverse.com') { const m = u.pathname.match(/thing:(\d+)/); return { provider: 'thingiverse', externalId: m?.[1] ?? null, url: m ? `https://www.thingiverse.com/thing:${m[1]}` : u.toString() }; }
  return { provider: 'otro', externalId: null, url: u.toString() };
}

export function normalizeLicense(text: string | null | undefined): { code: LicenseCode; commercial: CommercialUse } {
  const t = (text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (!t) return { code: 'desconocida', commercial: 'desconocido' };
  if (/cc0|public-?domain|dominio-publico/.test(t)) return { code: 'cc0', commercial: 'si' };
  const nc = /(^|-)nc(-|$)/.test(t) || /non-?commercial/.test(t), nd = /(^|-)nd(-|$)/.test(t) || /no-?deriv/.test(t), sa = /(^|-)sa(-|$)/.test(t) || /share-?alike/.test(t);
  if (/cc-?by|creative-?commons|attribution|licenses-by/.test(t)) {
    const code = (nc && nd ? 'cc-by-nc-nd' : nc && sa ? 'cc-by-nc-sa' : nc ? 'cc-by-nc' : nd ? 'cc-by-nd' : sa ? 'cc-by-sa' : 'cc-by') as LicenseCode;
    return { code, commercial: nc ? 'no' : 'si' };
  }
  if (/commercial.*(licen|member)|membres/.test(t)) return { code: 'makerworld-comercial', commercial: 'requiere_membresia' };
  if (/^(propia|own)$/.test(t)) return { code: 'propia', commercial: 'desconocido' };
  return { code: 'desconocida', commercial: 'desconocido' };
}

export const LICENSE_LABEL: Record<LicenseCode, string> = { cc0: 'CC0', 'cc-by': 'CC BY', 'cc-by-sa': 'CC BY-SA', 'cc-by-nc': 'CC BY-NC', 'cc-by-nd': 'CC BY-ND', 'cc-by-nc-sa': 'CC BY-NC-SA', 'cc-by-nc-nd': 'CC BY-NC-ND', 'makerworld-comercial': 'MakerWorld · comercial', propia: 'Propia', desconocida: '—' };

/* ── Descarga segura (anti-SSRF) ── */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  // IPv4 mapeada (::ffff:10.0.0.1 o, como la normaliza URL, ::ffff:a00:1): se evalúa como IPv4
  const m = v.match(/^::ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/);
  if (m) return isPrivateIp(m[1] ?? [parseInt(m[2], 16) >> 8, parseInt(m[2], 16) & 255, parseInt(m[3], 16) >> 8, parseInt(m[3], 16) & 255].join('.'));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}
export type Fetcher = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal; redirect?: 'manual' }) => Promise<{ status: number; headers: { get(k: string): string | null }; text(): Promise<string> }>;
/** GET a una URL pública: solo http(s), sin IP privadas (también tras redirecciones), con tope de tiempo y de tamaño. */
export async function safeGet(url: string, opts: { fetcher?: Fetcher; resolve?: (host: string) => Promise<string[]>; maxBytes?: number; timeoutMs?: number; headers?: Record<string, string> } = {}): Promise<{ status: number; body: string; finalUrl: string; contentType: string }> {
  if (!opts.fetcher && !opts.resolve) { const h = await import('./connectors/http'); const res = await h.request(url, {headers: opts.headers}); return {status: res.statusCode || 200, body: await h.body(res, opts.maxBytes ?? 2_000_000), finalUrl: url, contentType: String(res.headers['content-type'] || '')}; }
  const fetcher = opts.fetcher ?? (fetch as unknown as Fetcher);
  const resolve = opts.resolve ?? (async (h: string) => (net.isIP(h) ? [h] : (await dns.lookup(h, { all: true })).map((r) => r.address)));
  let cur = url;
  for (let hop = 0; hop < 4; hop++) {
    const u = new URL(cur); if (!/^https?:$/.test(u.protocol)) throw new Error('protocolo no permitido');
    const ips = await resolve(u.hostname.replace(/^\[|\]$/g, '')); if (!ips.length || ips.some(isPrivateIp)) throw new Error('dirección no permitida');
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 10_000);
    try {
      const res = await fetcher(cur, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; MiniFactoryHub/1.0)', accept: 'text/html,application/json;q=0.9,*/*;q=0.5', ...opts.headers }, signal: ctl.signal, redirect: 'manual' });
      if ([301, 302, 303, 307, 308].includes(res.status)) { const loc = res.headers.get('location'); if (!loc) throw new Error('redirección sin destino'); cur = new URL(loc, cur).toString(); continue; }
      const text = await res.text(); const max = opts.maxBytes ?? 2_000_000;
      return { status: res.status, body: text.length > max ? text.slice(0, max) : text, finalUrl: cur, contentType: res.headers.get('content-type') ?? '' };
    } finally { clearTimeout(to); }
  }
  throw new Error('demasiadas redirecciones');
}

/* ── Metadatos ── */
export interface SourceMeta {
  title: string | null; description: string | null; authorName: string | null; authorUid: string | null; authorUrl: string | null; imageUrls: string[];
  licenseText: string | null; category?: string | null; tags: string[]; stats: { likes?: number; downloads?: number; comments?: number; rating?: number }; plates: Array<{ name?: string; printTimeS?: number; weightG?: number; filaments?: string[] }>;
  remoteCreatedAt: string | null; remoteUpdatedAt: string | null; status: 'ok' | 'parcial' | 'error'; raw?: unknown;
}
const empty = (): SourceMeta => ({ title: null, description: null, authorName: null, authorUid: null, authorUrl: null, imageUrls: [], licenseText: null, tags: [], stats: {}, plates: [], remoteCreatedAt: null, remoteUpdatedAt: null, status: 'error' });
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** OpenGraph / JSON-LD de una página HTML (rutas «otros sitios» y respaldo de MakerWorld). */
export function parseOpenGraph(html: string): SourceMeta {
  const m = empty();
  const meta = (k: string) => { const r = new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${k}["']`, 'i').exec(html); return r ? decode(r[1] ?? r[2] ?? '').trim() || null : null; };
  m.title = meta('og:title') ?? (/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ? decode(/<title[^>]*>([^<]*)<\/title>/i.exec(html)![1]).trim() : null);
  m.description = meta('og:description') ?? meta('description');
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (!/(?:property|name)=["'](?:og:image(?::url)?|twitter:image)["']/i.test(tag[0])) continue;
    const image = /content=["']([^"']+)["']/i.exec(tag[0]);
    if (image) m.imageUrls.push(decode(image[1]));
  }
  m.authorName = meta('author') ?? meta('article:author');
  const kw = meta('keywords'); if (kw) m.tags = kw.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 20);
  for (const blk of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(blk[1]); const node = Array.isArray(j) ? j[0] : j;
      if (node?.license) m.licenseText = String(typeof node.license === 'string' ? node.license : node.license?.url ?? '');
      if (!m.authorName && node?.author) m.authorName = String(node.author?.name ?? node.author);
      for (const image of Array.isArray(node?.image) ? node.image : [node?.image]) {
        const url = typeof image === 'string' ? image : image?.contentUrl ?? image?.url;
        if (typeof url === 'string') m.imageUrls.push(url);
      }
    } catch { /* JSON-LD inválido */ }
  }
  m.imageUrls = [...new Set(m.imageUrls.filter(url => /^https:\/\//i.test(url)))].slice(0, 12);
  m.status = m.title ? (m.description || m.imageUrls.length ? 'ok' : 'parcial') : 'error';
  return m;
}

/** Respuesta JSON de `design-service/design/{id}` (sin documentación oficial: se leen los campos conocidos y se ignora el resto). */
export function parseMakerworldDesign(json: any): SourceMeta {
  const m = empty(); const d = json?.design ?? json; if (!d || typeof d !== 'object') return m;
  m.title = d.title ?? d.name ?? null; const description = d.summary ?? d.description; m.description = typeof description === 'string' ? description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000) : null;
  const c = d.designCreator ?? d.creator ?? {}; m.authorName = c.name ?? null; m.authorUid = c.uid != null ? String(c.uid) : null; m.authorUrl = c.uid != null ? `https://makerworld.com/en/@${c.name ?? c.uid}` : null;
  const imgs = [d.coverUrl ?? d.cover, ...(Array.isArray(d.designExtension?.design_pictures) ? d.designExtension.design_pictures.map((p: any) => p?.url) : []), ...(Array.isArray(d.images) ? d.images.map((p: any) => (typeof p === 'string' ? p : p?.url)) : [])];
  m.imageUrls = [...new Set(imgs.filter((x: unknown): x is string => typeof x === 'string' && /^https?:\/\//.test(x)))].slice(0, 12);
  m.tags = (Array.isArray(d.tags) ? d.tags : []).map((t: any) => String(typeof t === 'string' ? t : t?.name ?? '')).filter(Boolean).slice(0, 20);
  m.licenseText = d.license ?? d.licenseCode ?? d.designExtension?.license ?? null;
  // la categoría no tiene un campo fijo conocido: se prueban los nombres habituales y se ignora lo que no sea texto
  const cat = d.categoryName ?? d.category?.name ?? d.category ?? d.categories?.[0]?.name ?? d.categories?.[0] ?? d.designExtension?.categoryName;
  m.category = typeof cat === 'string' && cat.trim() ? cat.trim().slice(0, 60) : null;
  m.stats = { likes: num(d.likeCount), downloads: num(d.downloadCount), comments: num(d.commentCount), rating: num(d.rating ?? d.ratingAvg) };
  m.plates = (Array.isArray(d.instances) ? d.instances : []).flatMap((i: any) => (Array.isArray(i.plates) && i.plates.length ? i.plates : [i])).slice(0, 20).map((p: any) => ({ name: p.name ?? p.title, printTimeS: num(p.prediction ?? p.printTime), weightG: num(p.weight), filaments: Array.isArray(p.filaments) ? p.filaments.map((f: any) => String(f?.type ?? f)) : undefined }));
  m.remoteCreatedAt = d.createTime ?? d.createdAt ?? null; m.remoteUpdatedAt = d.updateTime ?? d.updatedAt ?? null;
  m.status = m.title ? (m.authorName && m.imageUrls.length ? 'ok' : 'parcial') : 'error'; m.raw = json;
  return m;
}
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Trae los metadatos públicos: MakerWorld por su API (mejor esfuerzo) con respaldo en la página; el resto por OpenGraph. */
export async function fetchSourceMeta(p: ParsedUrl, getter: typeof safeGet = safeGet): Promise<SourceMeta> {
  if (p.provider === 'makerworld' && p.externalId) {
    for (const base of ['https://makerworld.com/api/v1', 'https://api.bambulab.com/v1']) {
      try {
        const r = await getter(`${base}/design-service/design/${p.externalId}`, { headers: { accept: 'application/json' } });
        if (r.status === 200 && /json/.test(r.contentType)) { const m = parseMakerworldDesign(JSON.parse(r.body)); if (m.status !== 'error') return m; }
      } catch { /* API sin respuesta (Cloudflare, red): se prueba lo siguiente */ }
    }
  }
  try { const r = await getter(p.url); if (r.status === 200) { const m = parseOpenGraph(r.body); if (m.status !== 'error') return { ...m, status: m.status === 'ok' ? 'parcial' : m.status }; } } catch { /* sin acceso */ }
  return empty();
}
