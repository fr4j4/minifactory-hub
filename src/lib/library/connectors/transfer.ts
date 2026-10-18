import path from 'node:path';
import { PassThrough } from 'node:stream';
import { Client } from 'basic-ftp';
import { relativeKey, safeName, type Connector, type RemoteEntry } from './types';
export async function transferConnector(kind: 'ftp' | 'ftps' | 'sftp', c: Record<string, any>, s: Record<string, any>): Promise<Connector> {
    const root = path.posix.resolve('/', c.root || '/');
    const full = (id: string) => path.posix.join(root, relativeKey(id));
    let ftp: Client | undefined;
    let ssh: any;
    if (kind === 'sftp') {
        if (!s.hostFingerprint || !/^[a-f0-9]{64}$/i.test(s.hostFingerprint))
            throw new Error('SFTP requiere la huella SHA-256 hexadecimal del servidor');
        const Sftp = (await import('ssh2-sftp-client')).default;
        ssh = new Sftp();
        await ssh.connect({ host: c.host, port: Number(c.port || 22), username: s.username, password: s.password, privateKey: s.privateKey, hostHash: 'sha256', hostVerifier: (hash: string) => hash.toLowerCase() === s.hostFingerprint.toLowerCase(), readyTimeout: 15000 });
    }
    else {
        ftp = new Client(15000);
        await ftp.access({ host: c.host, port: Number(c.port || 21), user: s.username, password: s.password, secure: kind === 'ftps' });
    }
    const listing = async (parent: string): Promise<RemoteEntry[]> => {
        const rows = ssh ? await ssh.list(full(parent)) : await ftp!.list(full(parent));
        return rows.filter((f: any) => !f.name.startsWith('.') && (ssh ? f.type !== 'l' : !f.isSymbolicLink)).map((f: any) => ({ id: path.posix.join(parent, f.name), name: f.name, directory: ssh ? f.type === 'd' : f.isDirectory, size: Number(f.size || 0), revision: `${f.size}:${ssh ? f.modifyTime : f.rawModifiedAt}` }));
    };
    const stat = async (id: string) => { if (!id)
        return { id: '', name: root, directory: true, size: 0, revision: 'root' }; const found = (await listing(path.posix.dirname(id) === '.' ? '' : path.posix.dirname(id))).find(f => f.id === id); if (!found)
        throw new Error('Archivo no encontrado'); return found; };
    const absent = async (parent: string, name: string) => { safeName(name); if ((await listing(parent)).some(f => f.name === name))
        throw new Error('El destino ya existe'); return path.posix.join(parent, name); };
    return { root: '', capabilities: { rename: true, mkdir: true, upload: true, trash: false }, stat,
        async list(parent, cursor) { const all = (await listing(parent)).sort((a, b) => a.name.localeCompare(b.name)); const start = cursor ? Number(cursor) : 0; return { entries: all.slice(start, start + 100), cursor: start + 100 < all.length ? String(start + 100) : undefined }; },
        async read(id) { const out = new PassThrough(); const task = ssh ? ssh.get(full(id), out) : ftp!.downloadTo(out, full(id)); Promise.resolve(task).then(() => out.end()).catch((e: Error) => out.destroy(e)); return out; },
        async rename(id, name) { const dest = await absent(path.posix.dirname(id) === '.' ? '' : path.posix.dirname(id), name); if (ssh)
            await ssh.rename(full(id), full(dest));
        else
            await ftp!.rename(full(id), full(dest)); return dest; },
        async mkdir(parent, name) { const dest = await absent(parent, name); if (ssh)
            await ssh.mkdir(full(dest));
        else
            await ftp!.ensureDir(full(dest)); return dest; },
        async upload(parent, name, local) { const dest = await absent(parent, name); if (ssh)
            await ssh.put(local, full(dest));
        else
            await ftp!.uploadFrom(local, full(dest)); return dest; },
        async close() { if (ssh)
            await ssh.end(); ftp?.close(); },
    };
}
