import { json, request } from './http';
import { readOnly, type Connector, type RemoteEntry } from './types';
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
        return { root: c.root || 'root', capabilities: readOnly,
            async list(parent, cursor) { const endpoint = cursor || `${item(parent)}/children?$top=100`; if (!endpoint.startsWith('https://graph.microsoft.com/'))
                throw new Error('Cursor Graph inválido'); const r = await json(endpoint, { headers }); return { entries: (r.value || []).map(map), cursor: r['@odata.nextLink'] }; },
            async stat(id) { return map(await json(item(id), { headers })); }, async read(id) { return request(`${item(id)}/content`, { headers }); }, async close() { },
        };
    }
    const call = (method: string, input: any) => json(`https://api.dropboxapi.com/2/files/${method}`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(input) });
    const map = (f: any): RemoteEntry => ({ id: f.path_lower, name: f.name, directory: f['.tag'] === 'folder', size: Number(f.size || 0), revision: f.rev || f.server_modified || 'folder', downloadable: f.is_downloadable !== false });
    return { root: c.root || '', capabilities: readOnly,
        async list(parent, cursor) { const r = await call(cursor ? 'list_folder/continue' : 'list_folder', cursor ? { cursor } : { path: parent, limit: 100, include_non_downloadable_files: true }); return { entries: (r.entries || []).filter((f: any) => f['.tag'] !== 'deleted').map(map), cursor: r.has_more ? r.cursor : undefined }; },
        async stat(id) { return map(await call('get_metadata', { path: id })); }, async read(id) { return request('https://content.dropboxapi.com/2/files/download', { method: 'POST', headers: { ...headers, 'Dropbox-API-Arg': JSON.stringify({ path: id }) } }); }, async close() { },
    };
}
