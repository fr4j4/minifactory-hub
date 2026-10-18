import fs from 'node:fs/promises';
import path from 'node:path';
import { json, request } from './http';
import { readOnly, safeName, type Connector, type RemoteEntry } from './types';
/** Token scopes are supplied by the administrator. Refresh tokens never leave the server. */
export async function cloudConnector(kind: 'onedrive' | 'dropbox', c: Record<string, any>, s: Record<string, any>): Promise<Connector> {
    let token = s.accessToken;
    if (s.refreshToken) {
        const endpoint = kind === 'dropbox' ? 'https://api.dropboxapi.com/oauth2/token' : `https://login.microsoftonline.com/${encodeURIComponent(c.tenant || 'common')}/oauth2/v2.0/token`;
        const form = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: s.refreshToken, client_id: s.clientId, client_secret: s.clientSecret });
        token = (await json(endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() })).access_token;
    }
    if (!token)
        throw new Error('Configure un token OAuth');
    const headers = { authorization: `Bearer ${token}` };
    if (kind === 'onedrive') {
        const base = `https://graph.microsoft.com/v1.0/${c.driveId ? 'drives/' + encodeURIComponent(c.driveId) : 'me/drive'}`;
        const item = (id: string) => `${base}/${id === 'root' ? 'root' : 'items/' + encodeURIComponent(id)}`;
        const map = (f: any): RemoteEntry => ({ id: f.id, name: f.name, directory: !!f.folder, size: Number(f.size || 0), revision: f.cTag || f.eTag || f.lastModifiedDateTime || '', downloadable: !f.remoteItem });
        return { root: c.root || 'root', capabilities: {...readOnly,rename:true,mkdir:true},
            async list(parent, cursor) { const endpoint = cursor || `${item(parent)}/children?$top=100`; if (!endpoint.startsWith('https://graph.microsoft.com/'))
                throw new Error('Cursor Graph inválido'); const r = await json(endpoint, { headers }); return { entries: (r.value || []).map(map), cursor: r['@odata.nextLink'] }; },
            async stat(id) { return map(await json(item(id), { headers })); }, async read(id) { return request(`${item(id)}/content`, { headers }); },
            async rename(id,name){safeName(name);const before=await json(item(id),{headers});const r=await json(item(id),{method:'PATCH',headers:{...headers,'content-type':'application/json','if-match':before.eTag},body:JSON.stringify({name})});return r.id;},
            async mkdir(parent,name){safeName(name);return(await json(`${item(parent)}/children`,{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({name,folder:{},'@microsoft.graph.conflictBehavior':'fail'})})).id;},async changes(cursor){let endpoint=cursor||`${item(c.root||'root')}/delta?token=latest`,changed=!cursor;for(let n=0;n<10000;n++){if(!endpoint.startsWith(base+'/'))throw new Error('Cursor Graph inválido');const r=await json(endpoint,{headers});changed ||= !!r.value?.length;if(r['@odata.deltaLink'])return {cursor:r['@odata.deltaLink'],changed};if(!r['@odata.nextLink']||r['@odata.nextLink']===endpoint)throw new Error('Cursor Graph incompleto');endpoint=r['@odata.nextLink'];}throw new Error('Demasiados cambios pendientes');},async close() { },
        };
    }
    const validate=(id:string)=>{const root=String(c.root||'').toLowerCase().replace(/\/$/,'');if(root&&id.toLowerCase()!==root&&!id.toLowerCase().startsWith(root+'/'))throw new Error('Ruta fuera de la raíz Dropbox');return id;};
    const call = (method: string, input: any) => json(`https://api.dropboxapi.com/2/files/${method}`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(input) });
    const map = (f: any): RemoteEntry => ({ id: f.path_lower, name: f.name, directory: f['.tag'] === 'folder', size: Number(f.size || 0), revision: f.rev || f.server_modified || 'folder', downloadable: f.is_downloadable !== false });
    return { root: c.root || '', capabilities: {...readOnly,rename:true,mkdir:true,upload:true},
        async list(parent, cursor) { const r = await call(cursor ? 'list_folder/continue' : 'list_folder', cursor ? { cursor } : { path: validate(parent), limit: 100, include_non_downloadable_files: true }); return { entries: (r.entries || []).filter((f: any) => f['.tag'] !== 'deleted').map(map), cursor: r.has_more ? r.cursor : undefined }; },
        async stat(id) { return map(await call('get_metadata', { path: validate(id) })); }, async read(id) { return request('https://content.dropboxapi.com/2/files/download', { method: 'POST', headers: { ...headers, 'Dropbox-API-Arg': JSON.stringify({ path: validate(id) }) } }); },
        async rename(id,name){safeName(name);const to=path.posix.join(path.posix.dirname(id),name);const r=await call('move_v2',{from_path:validate(id),to_path:validate(to),autorename:false});return r.metadata.path_lower;},
        async mkdir(parent,name){safeName(name);const r=await call('create_folder_v2',{path:validate(path.posix.join(parent||'/',name)),autorename:false});return r.metadata.path_lower;},
        async upload(parent,name,local){safeName(name);if((await fs.stat(local)).size>64*1024*1024)throw new Error('Dropbox: carga limitada a 64 MiB');const r=await json('https://content.dropboxapi.com/2/files/upload',{method:'POST',headers:{...headers,'content-type':'application/octet-stream','Dropbox-API-Arg':JSON.stringify({path:validate(path.posix.join(parent||'/',name)),mode:'add',autorename:false,strict_conflict:true,mute:true})},body:await fs.readFile(local)});return r.path_lower;},async changes(cursor){if(!cursor){const r=await call('list_folder/get_latest_cursor',{path:c.root||'',recursive:true,include_non_downloadable_files:true});return {cursor:r.cursor,changed:true};}let token=cursor,changed=false;for(let n=0;n<10000;n++){const r=await call('list_folder/continue',{cursor:token});changed ||= !!r.entries?.length;if(!r.has_more)return {cursor:r.cursor,changed};if(r.cursor===token)throw new Error('Cursor Dropbox repetido');token=r.cursor;}throw new Error('Demasiados cambios pendientes');},async close() { },
    };
}
