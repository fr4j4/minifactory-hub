import https from 'node:https';
import http from 'node:http';
import dns from 'node:dns/promises';
import net from 'node:net';
import { isPrivateIp } from '../source';
/** Pin resolution to the socket, bound time and redirects; credentials never cross origins. */
export async function request(url: string, o: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | Buffer;
    privateNetwork?: boolean;
    redirects?: number;
} = {}): Promise<http.IncomingMessage> {
    const u = new URL(url);
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password)
        throw new Error('URL no permitida');
    const addresses = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await dns.lookup(host, { all: true });
    if (!addresses.length || addresses.some(x => (!o.privateNetwork && isPrivateIp(x.address)) || x.address.startsWith('169.254.') || x.address === '100.100.100.200'))
        throw new Error('Destino de red no permitido');
    if (!o.privateNetwork && u.protocol !== 'https:')
        throw new Error('Use HTTPS');
    const a = addresses[0];
    const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
        const req = (u.protocol === 'https:' ? https : http).request(u, { method: o.method || 'GET', headers: o.headers, lookup: ((_h: any, options: any, cb: any) => options?.all ? cb(null, [a]) : cb(null, a.address, a.family)) as any }, resolve);
        const deadline = setTimeout(() => req.destroy(new Error('Tiempo de descarga agotado')), 120000);
        req.on('error', reject);
        req.on('close', () => clearTimeout(deadline));
        req.end(o.body);
    });
    if ([301, 302, 303, 307, 308].includes(res.statusCode || 0)) {
        res.resume();
        if ((o.redirects || 0) >= 4 || !res.headers.location)
            throw new Error('Redirección inválida');
        const next = new URL(res.headers.location, u);
        const headers = { ...o.headers };
        if (next.origin !== u.origin) {
            delete headers.authorization;
            delete headers.Authorization;
            delete headers.cookie;
        }
        return request(next.toString(), { ...o, headers, redirects: (o.redirects || 0) + 1 });
    }
    if ((res.statusCode || 500) >= 400) {
        res.resume();
        throw new Error(`Proveedor HTTP ${res.statusCode}${res.statusCode === 429 ? ' · reintente después' : ''}`);
    }
    return res;
}
export async function body(res: http.IncomingMessage, limit = 4 * 1024 * 1024) {
    const chunks: Buffer[] = [];
    let n = 0;
    for await (const chunk of res) {
        n += chunk.length;
        if (n > limit) {
            res.destroy();
            throw new Error('Respuesta demasiado grande');
        }
        chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf8');
}
export async function json(url: string, o: Parameters<typeof request>[1] = {}) { return JSON.parse(await body(await request(url, o))); }
