import fs from 'node:fs/promises';
import { XMLParser } from 'fast-xml-parser';
import { body, request } from './http';
import { relativeKey, safeName, type Connector, type RemoteEntry } from './types';
export async function webdavConnector(c: Record<string, any>, s: Record<string, any>): Promise<Connector> {
    const root = new URL(c.endpoint.endsWith('/') ? c.endpoint : c.endpoint + '/');
    const url = (id: string) => new URL(relativeKey(id).split('/').map(encodeURIComponent).join('/'), root).toString();
    const headers = { authorization: `Basic ${Buffer.from(`${s.username}:${s.password}`).toString('base64')}` };
    const opts = { headers, privateNetwork: !!c.privateNetwork };
    const prop = async (id: string, depth: string) => { const r = await request(url(id), { ...opts, method: 'PROPFIND', headers: { ...headers, depth }, body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:allprop/></d:propfind>' }); const doc = new XMLParser({ removeNSPrefix: true }).parse(await body(r)); const rows = doc.multistatus?.response; if (!rows)
        throw new Error('Respuesta WebDAV inválida'); return (Array.isArray(rows) ? rows : [rows]).map((x: any) => { const stats = Array.isArray(x.propstat) ? x.propstat : [x.propstat]; const p = stats.find((v: any) => String(v.status).includes('200'))?.prop; if (!p)
        throw new Error('Permisos WebDAV incompletos'); const u = new URL(x.href, root); if (u.origin !== root.origin || !u.pathname.startsWith(root.pathname))
        throw new Error('Ruta DAV fuera de raíz'); const rid = decodeURIComponent(u.pathname.slice(root.pathname.length)).replace(/\/$/, ''); return { id: rid, name: p.displayname || rid.split('/').at(-1) || '/', directory: p.resourcetype?.collection !== undefined, size: Number(p.getcontentlength || 0), revision: `${p.getetag || ''}:${p.getlastmodified || ''}` } as RemoteEntry; }); };
    return { root: '', capabilities: { rename: true, mkdir: true, upload: true, trash: false },
        async list(parent, cursor) { const all = (await prop(parent, '1')).filter((x: RemoteEntry) => x.id !== parent); const start = Number(cursor || 0); return { entries: all.slice(start, start + 100), cursor: start + 100 < all.length ? String(start + 100) : undefined }; },
        async stat(id) { const rows = await prop(id, '0'); return rows[0]; }, async read(id) { return request(url(id), opts); },
        async rename(id, name) { safeName(name); const dest = [...id.split('/').slice(0, -1), name].join('/'); const r = await request(url(id), { ...opts, method: 'MOVE', headers: { ...headers, destination: url(dest), overwrite: 'F' } }); r.resume(); return dest; },
        async mkdir(parent, name) { safeName(name); const dest = [parent, name].filter(Boolean).join('/'); const r = await request(url(dest), { ...opts, method: 'MKCOL' }); r.resume(); return dest; },
        async upload(parent, name, local) { safeName(name); const dest = [parent, name].filter(Boolean).join('/'); if ((await fs.stat(local)).size > 64 * 1024 * 1024)
            throw new Error('Carga WebDAV limitada a 64 MiB'); const r = await request(url(dest), { ...opts, method: 'PUT', headers: { ...headers, 'if-none-match': '*' }, body: await fs.readFile(local) }); r.resume(); return dest; }, async close() { },
    };
}
