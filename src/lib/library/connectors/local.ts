import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '@/lib/config';
import { relativeKey, safeName, type Connector, type RemoteEntry } from './types';
export async function localConnector(rootInput: string): Promise<Connector> {
    const root = await fsp.realpath(rootInput);
    const allowed = (process.env.LIBRARY_LOCAL_ROOTS || path.join(config.dataDir, 'library-sources')).split(path.delimiter);
    const roots = await Promise.all(allowed.map(p => fsp.realpath(p).catch(() => path.resolve(p))));
    if (!roots.some(p => root === p || root.startsWith(p + path.sep)))
        throw new Error('Carpeta fuera de LIBRARY_LOCAL_ROOTS');
    const resolve = async (id: string) => {
        const target = path.join(root, relativeKey(id));
        const real = await fsp.realpath(target);
        if (real !== root && !real.startsWith(root + path.sep))
            throw new Error('Enlace fuera de la raíz');
        if ((await fsp.lstat(target)).isSymbolicLink())
            throw new Error('No se siguen enlaces simbólicos');
        return real;
    };
    const stat = async (id: string): Promise<RemoteEntry> => { const s = await fsp.stat(await resolve(id)); return { id, name: path.basename(id) || path.basename(root), directory: s.isDirectory(), size: s.size, revision: `${s.dev}:${s.ino}:${s.size}:${s.mtimeMs}:${s.ctimeMs}` }; };
    const target = async (parent: string, name: string) => { safeName(name); const p = path.join(await resolve(parent), name); if (await fsp.lstat(p).then(() => true, () => false))
        throw new Error('El destino ya existe'); return p; };
    return {
        root: '', capabilities: { rename: true, mkdir: true, upload: true, trash: true }, stat,
        async list(parent, cursor) {
            const names = (await fsp.readdir(await resolve(parent), { withFileTypes: true })).filter(x => !x.isSymbolicLink() && !x.name.startsWith('.') && (x.isFile() || x.isDirectory())).map(x => x.name).sort();
            const filtered = cursor ? names.filter(n => n > cursor) : names;
            const page = filtered.slice(0, 100);
            return { entries: await Promise.all(page.map(n => stat(path.posix.join(parent, n)))), cursor: filtered.length > page.length ? page.at(-1) : undefined };
        },
        async read(id) { return fs.createReadStream(await resolve(id)); },
        async rename(id, name) { const src = await resolve(id); const dest = await target(path.posix.dirname(id) === '.' ? '' : path.posix.dirname(id), name); await fsp.rename(src, dest); return path.relative(root, dest).split(path.sep).join('/'); },
        async move(id,parent,name){const src=await resolve(id),dest=await target(parent,name);if(dest.startsWith(src+path.sep))throw new Error('No se mueve una carpeta dentro de sí misma');await fsp.rename(src,dest);return path.relative(root,dest).split(path.sep).join('/');},
        async mkdir(parent, name) { const dest = await target(parent, name); await fsp.mkdir(dest); return path.relative(root, dest).split(path.sep).join('/'); },
        async upload(parent, name, source) { const dest = await target(parent, name); await fsp.copyFile(source, dest, fs.constants.COPYFILE_EXCL); return path.relative(root, dest).split(path.sep).join('/'); },
        async trash(id, token) { if (!id)
            throw new Error('No se elimina la raíz'); const src = await resolve(id); const trash = path.join(root, '.mf-trash'); await fsp.mkdir(trash, { recursive: true }); const real = await fsp.realpath(trash); if (real !== trash)
            throw new Error('Papelera inválida'); const key=`.mf-trash/${token||crypto.randomUUID()}-${path.basename(id)}`;await fsp.rename(src,path.join(root,key));return key; },
        async restore(id,parent,name){if(!id.startsWith('.mf-trash/'))throw new Error('Papelera inválida');const src=await resolve(id);const dest=await target(parent,name);await fsp.rename(src,dest);return path.relative(root,dest).split(path.sep).join('/');},
        async close() { },
    };
}
