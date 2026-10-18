import { describe,it,expect,vi,beforeEach } from 'vitest';
const http=vi.hoisted(()=>({json:vi.fn(),request:vi.fn()}));
vi.mock('@/lib/library/connectors/http',()=>http);
import { driveConnector } from '@/lib/library/connectors/drive';
import { cloudConnector } from '@/lib/library/connectors/cloud';
import { relativeKey,safeName } from '@/lib/library/connectors/types';
beforeEach(()=>vi.clearAllMocks());
describe('cloud connector contracts',()=>{
 it('Drive paginates folders including shared drives and preserves download restrictions',async()=>{http.json.mockResolvedValueOnce({id:'folder'}).mockResolvedValueOnce({files:[{id:'model',name:'piece.stl',size:'123',version:'7',mimeType:'model/stl',modifiedTime:'2026-01-01',capabilities:{canDownload:false}}],nextPageToken:'next'});const c=await driveConnector({root:'folder'},{accessToken:'test-token'});const page=await c.list('folder');expect(page.cursor).toBe('next');expect(page.entries[0].downloadable).toBe(false);const url=new URL(http.json.mock.calls[1][0]);expect(url.searchParams.get('q')).toBe("'folder' in parents and trashed=false");expect(url.searchParams.get('supportsAllDrives')).toBe('true');});
 it('Drive refuses incomplete listings instead of falsely reconciling deletions',async()=>{http.json.mockResolvedValueOnce({id:'folder'}).mockResolvedValueOnce({files:[],incompleteSearch:true});const c=await driveConnector({root:'folder'},{accessToken:'test'});await expect(c.list('folder')).rejects.toThrow('incompleta');});
 it('Drive checks per-file mutation permissions',async()=>{http.json.mockResolvedValueOnce({id:'folder'}).mockResolvedValueOnce({id:'file',capabilities:{canRename:false}});const c=await driveConnector({root:'folder'},{accessToken:'test'});await expect(c.rename!('file','new.stl')).rejects.toThrow('permite');expect(http.json).toHaveBeenCalledTimes(2);});
 it('OneDrive rejects a cursor pointing at another host',async()=>{const c=await cloudConnector('onedrive',{root:'root'},{accessToken:'test'});await expect(c.list('root','https://evil.example/steal')).rejects.toThrow('Cursor');expect(http.json).not.toHaveBeenCalled();});
 it('Dropbox follows server cursors without fetching the full account',async()=>{http.json.mockResolvedValueOnce({entries:[{'.tag':'file',path_lower:'/root/a.stl',name:'a.stl',size:12,rev:'abc',is_downloadable:false}],has_more:true,cursor:'opaque'});const c=await cloudConnector('dropbox',{root:'/root'},{accessToken:'test'});const r=await c.list('/root');expect(r.entries[0].revision).toBe('abc');expect(r.entries[0].downloadable).toBe(false);expect(JSON.parse(http.json.mock.calls[0][1].body).path).toBe('/root');expect(r.cursor).toBe('opaque');});
 it('rejects escapes and invisible filename mutations',()=>{for(const name of ['..','/tmp','a/b','a\\b','.hidden','x\0'])expect(()=>safeName(name)).toThrow();for(const key of ['../x','/etc','a/../x','a\\b'])expect(()=>relativeKey(key)).toThrow();expect(relativeKey('parts/model.stl')).toBe('parts/model.stl');});
});
