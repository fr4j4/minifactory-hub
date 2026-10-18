import {beforeEach,describe,expect,it,vi} from 'vitest';
import {Readable} from 'node:stream';
vi.mock('@/lib/library/connectors/http',async original=>({...await original<typeof import('@/lib/library/connectors/http')>(),request:vi.fn()}));
import {request} from '@/lib/library/connectors/http';
vi.mock('@/lib/library/makerworld-http',async original=>({...await original<typeof import('@/lib/library/makerworld-http')>(),makerworldJson:vi.fn()}));
import {makerworldJson as json} from '@/lib/library/makerworld-http';
import {inspectMakerworld,makerworldLogin,makerworldTfa,makerworldProfiles,makerworldReference,parseDownloadResponse} from '@/lib/library/makerworld';
const mock=vi.mocked(json);
beforeEach(()=>{mock.mockReset();vi.mocked(request).mockReset();});
describe('MakerWorld custom connector',()=>{
  it('keeps the session cookie returned by a 2FA redirect',async()=>{
    vi.mocked(request).mockResolvedValueOnce(Object.assign(Readable.from(['{}']),{statusCode:200,headers:{'set-cookie':['bbl_csrf_token=csrf; Path=/']}}) as any).mockResolvedValueOnce(Object.assign(Readable.from(['']),{statusCode:302,headers:{'set-cookie':['token=private-session; Path=/'],location:'/'}}) as any);
    expect(await makerworldTfa('challenge','123456')).toBe('private-session');
    expect(request).toHaveBeenLastCalledWith('https://bambulab.com/api/sign-in/tfa',expect.objectContaining({noRedirect:true,timeoutMs:15000,headers:expect.objectContaining({Cookie:'bbl_csrf_token=csrf'})}));
  });
  it('uses instance id, not the internal profile id',()=>{
    expect(makerworldReference('https://makerworld.com/es/models/3317662-pumpkin#profileId-3766961')).toEqual({designId:'3317662',instanceId:'3766961'});
    expect(makerworldReference('https://makerworld.com/api/v1/design-service/instance/3766961/f3mf?type=download')).toEqual({designId:undefined,instanceId:'3766961'});
    const profiles=makerworldProfiles({instances:[{id:3766961,profileId:1004749352,title:'Test',extention:{modelInfo:{f3mf:{size:16371927},plates:[{},{}],compatibility:{devModelName:'BL-P001',devProductName:'X1 Carbon'}}}}]});
    expect(profiles[0]).toMatchObject({id:'3766961',size:16371927,plates:2,printer:'X1 Carbon'});
  });
  it('rejects other origins and credential URLs',()=>{
    expect(makerworldReference('https://makerworld.com.evil.test/models/1')).toBeNull();
    expect(()=>makerworldReference('https://user:pass@makerworld.com/models/1')).toThrow();
  });
  it('reads JSON and direct signed URLs without dropping signatures',()=>{
    const url='https://example.com/model.3mf?X-Amz-Signature=private';
    expect(parseDownloadResponse(JSON.stringify({url,name:'part.3mf'}))).toEqual({url,filename:'part.3mf'});
    expect(parseDownloadResponse({data:{url,name:'folder/part.3mf'}}).filename).toBe('part.3mf');
    expect(parseDownloadResponse(url).url).toBe(url);
    expect(()=>parseDownloadResponse('{"error":"login required"}')).toThrow();
    expect(()=>parseDownloadResponse('http://example.com/model.3mf')).toThrow();
    expect(()=>parseDownloadResponse('https://user:secret@example.com/model.3mf')).toThrow();
  });
  it('gets metadata, cover and selected profile without downloading a file',async()=>{
    mock.mockResolvedValue({id:1,title:'Pumpkin',summary:'<p>Printable</p>',coverUrl:'https://example.com/a.jpg',license:'Standard Digital File License',designCreator:{name:'Author'},instances:[{id:2}]});
    expect(await inspectMakerworld('https://makerworld.com/models/1#profileId-2')).toMatchObject({title:'Pumpkin',description:'Printable',image:'https://example.com/a.jpg',selected:'2'});
    expect(mock).toHaveBeenCalledTimes(1);
    await expect(inspectMakerworld('https://makerworld.com/models/1#profileId-3')).rejects.toThrow('perfil');
  });
  it('authenticates only against the fixed Bambu origin',async()=>{
    mock.mockResolvedValue({accessToken:'token',expiresIn:60});
    expect(await makerworldLogin('test@example.com',{password:'test'})).toEqual({kind:'token',token:'token',expiresIn:60});
    expect(mock.mock.calls[0][0]).toBe('https://api.bambulab.com/v1/user-service/user/login');
  });
  it('requests the email verification code and handles second factor fallback',async()=>{
    mock.mockResolvedValueOnce({loginType:'verifyCode'}).mockResolvedValueOnce({});
    expect(await makerworldLogin('test@example.com',{password:'test'})).toEqual({kind:'code'});
    expect(mock.mock.calls[1][0]).toContain('/sendemail/code');
    mock.mockResolvedValueOnce({loginType:'tfa'});
    expect(await makerworldLogin('test@example.com',{password:'test'})).toEqual({kind:'browser'});
  });
});
