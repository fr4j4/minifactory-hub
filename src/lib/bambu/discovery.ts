import dgram from 'node:dgram';
import { modelFromCode } from './models';

/**
 * Detección en la red local. Las impresoras Bambu anuncian su presencia por SSDP (NOTIFY a los puertos
 * UDP 2021 y 1990) con cabeceras propias: número de serie (USN), IP (Location), modelo, nombre, si está en
 * «Modo LAN» y la señal Wi-Fi. Además se envía un M-SEARCH para que respondan las que estén escuchando.
 */
export interface Found { serial: string; ip: string; model: string | null; modelName: string | null; name: string | null; connect: string | null; bind: string | null; secure: boolean; firmware: string | null; signal: string | null; seenAt: number }

export function parseSsdp(text: string, fromIp: string): Found | null {
  const h: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) { const i = line.indexOf(':'); if (i > 0) h[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim(); }
  const nt = h.nt ?? h.st ?? '';
  if (!/bambulab/i.test(nt) && !h['devmodel.bambu.com']) return null;
  const serial = (h.usn ?? '').replace(/^uuid:/i, '').split('::')[0].trim();
  if (!serial) return null;
  const ip = (h.location ?? '').replace(/^https?:\/\//, '').split(/[:/]/)[0] || fromIp;
  const code = h['devmodel.bambu.com'] ?? null; const m = modelFromCode(code, serial);
  return {
    serial, ip, model: code, modelName: m?.name ?? null, name: h['devname.bambu.com'] ?? null, connect: h['devconnect.bambu.com'] ?? null,
    bind: h['devbind.bambu.com'] ?? null, secure: /secure/i.test(h['devseclink.bambu.com'] ?? ''), firmware: h['devversion.bambu.com'] ?? null, signal: h['devsignal.bambu.com'] ?? null, seenAt: Date.now(),
  };
}

const PORTS = () => (process.env.BAMBU_SSDP_PORTS ?? '2021,1990').split(',').map(Number).filter(Boolean);
const MSEARCH = Buffer.from('M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1990\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: urn:bambulab-com:device:3dprinter:1\r\n\r\n');

/** Escucha durante `ms` y devuelve las impresoras vistas (sin duplicados). */
export async function scan(ms = 6000): Promise<{ found: Found[]; listening: number[]; errors: string[] }> {
  const found = new Map<string, Found>(); const socks: dgram.Socket[] = []; const listening: number[] = []; const errors: string[] = [];
  await Promise.all(PORTS().map((port) => new Promise<void>((res) => {
    const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    s.on('message', (msg, rinfo) => { const f = parseSsdp(msg.toString('utf8'), rinfo.address); if (f) found.set(f.serial, f); });
    s.on('error', (e) => { errors.push(`UDP ${port}: ${e.message}`); res(); });
    s.bind(port, () => {
      listening.push(port);
      try { s.setBroadcast(true); if (port === 1990) s.addMembership('239.255.255.250'); } catch { /* sin multicast en esta red */ }
      socks.push(s); res();
    });
  })));
  const search = () => { for (const s of socks) for (const [h, p] of [['239.255.255.250', 1990], ['255.255.255.255', 1990], ...(process.env.BAMBU_SSDP_EXTRA ?? '').split(',').filter(Boolean).map((x) => [x.split(':')[0], Number(x.split(':')[1] || 1990)] as [string, number])] as Array<[string, number]>) s.send(MSEARCH, p, h, () => {}); };
  search(); const t = setInterval(search, 2000);
  await new Promise((r) => setTimeout(r, ms));
  clearInterval(t); for (const s of socks) s.close();
  return { found: [...found.values()], listening, errors };
}
