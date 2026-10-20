import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { json, request } from './http';
import { readOnly, safeName, type Connector, type RemoteEntry } from './types';
export async function driveConnector(c: Record<string, any>, s: Record<string, any>): Promise<Connector> {
    let token = s.accessToken as string;
    if (s.refreshToken) {
        const r = await json('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: s.refreshToken, client_id: s.clientId, client_secret: s.clientSecret }).toString() });
        token = r.access_token;
    }
    else if (s.client_email && s.private_key) {
        const now = Math.floor(Date.now() / 1000);
        const b64 = (x: unknown) => Buffer.from(JSON.stringify(x)).toString('base64url');
        const data = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: s.client_email, scope: 'https://www.googleapis.com/auth/drive', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
        const assertion = `${data}.${crypto.sign('RSA-SHA256', Buffer.from(data), s.private_key).toString('base64url')}`;
        token = (await json('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString() })).access_token;
    }
    if (!token)
        throw new Error('Configure OAuth o una cuenta de servicio compartida con la carpeta');
    const headers = { authorization: `Bearer ${token}` };
    const api = 'https://www.googleapis.com/drive/v3/files';
    const fields = 'id,name,mimeType,size,version,modifiedTime,md5Checksum,capabilities,parents';
    const map = (f: any): RemoteEntry => ({ id: f.id, name: f.name, directory: f.mimeType === 'application/vnd.google-apps.folder', size: Number(f.size || 0), revision: `${f.version || ''}:${f.md5Checksum || ''}:${f.modifiedTime || ''}`, downloadable: f.capabilities?.canDownload !== false && (!f.mimeType?.startsWith('application/vnd.google-apps.') || f.mimeType === 'application/vnd.google-apps.folder') });
    const get = (id: string) => json(`${api}/${encodeURIComponent(id)}?supportsAllDrives=true&fields=${fields}`, { headers });
    const root = c.root || 'root';
    await get(root);
    return {
        root, capabilities: { ...readOnly, rename: true, mkdir: true, trash: true, upload:true },
        async list(parent, cursor) { const q = new URLSearchParams({ q: `'${parent.replace(/['\\]/g, '')}' in parents and trashed=false`, pageSize: '100', fields: `nextPageToken,incompleteSearch,files(${fields})`, supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' }); if (cursor)
            q.set('pageToken', cursor); const r = await json(`${api}?${q}`, { headers }); if (r.incompleteSearch)
            throw new Error('Drive devolvió búsqueda incompleta'); return { entries: (r.files || []).map(map), cursor: r.nextPageToken }; },
        async stat(id) { return map(await get(id)); },
        async read(id) { const f = await get(id); if (f.capabilities?.canDownload === false)
            throw new Error('Drive no permite descargar este archivo'); return request(`${api}/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, { headers }); },
        async rename(id, name) { safeName(name); const f = await get(id); if (!f.capabilities?.canRename)
            throw new Error('Drive no permite renombrar'); await json(`${api}/${encodeURIComponent(id)}?supportsAllDrives=true`, { method: 'PATCH', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ name }) }); return id; },
        async mkdir(parent, name) { safeName(name); return (await json(`${api}?supportsAllDrives=true`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parent] }) })).id; },
        async trash(id) { const f = await get(id); if (!f.capabilities?.canTrash)
            throw new Error('Drive no permite enviar a papelera'); await json(`${api}/${encodeURIComponent(id)}?supportsAllDrives=true`, { method: 'PATCH', headers: { ...headers, 'content-type': 'application/json' }, body: '{"trashed":true}' });return id; },
        async upload(parent,name,local){safeName(name);if((await fs.stat(local)).size>64*1024*1024)throw new Error('Drive: carga limitada a 64 MiB');const boundary='mf_'+crypto.randomUUID();const meta=JSON.stringify({name,parents:[parent]});const data=await fs.readFile(local);const body=Buffer.concat([Buffer.from('--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+meta+'\r\n--'+boundary+'\r\nContent-Type: application/octet-stream\r\n\r\n'),data,Buffer.from('\r\n--'+boundary+'--')]);return (await json('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id',{method:'POST',headers:{...headers,'content-type':'multipart/related; boundary='+boundary},body})).id;},
        async restore(id){await json(`${api}/${encodeURIComponent(id)}?supportsAllDrives=true`,{method:'PATCH',headers:{...headers,'content-type':'application/json'},body:'{"trashed":false}'});return id;},
        async changes(cursor){if(!cursor){const r=await json('https://www.googleapis.com/drive/v3/changes/startPageToken?supportsAllDrives=true',{headers});return {cursor:r.startPageToken,changed:true};}let token=cursor,changed=false;for(let n=0;n<10000;n++){const q=new URLSearchParams({pageToken:token,pageSize:'1000',supportsAllDrives:'true',includeItemsFromAllDrives:'true',fields:'nextPageToken,newStartPageToken,changes(fileId)'});const r=await json('https://www.googleapis.com/drive/v3/changes?'+q,{headers});changed ||= !!r.changes?.length;if(r.newStartPageToken)return {cursor:r.newStartPageToken,changed};if(!r.nextPageToken||r.nextPageToken===token)throw new Error('Cursor de cambios inválido');token=r.nextPageToken;}throw new Error('Demasiados cambios pendientes');},
        async close() { },
    };
}
