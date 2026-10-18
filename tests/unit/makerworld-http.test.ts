import {beforeEach,expect,it,vi} from 'vitest';
import {Readable} from 'node:stream';
vi.mock('@/lib/library/connectors/http',async original=>({...await original<typeof import('@/lib/library/connectors/http')>(),request:vi.fn()}));
import {request} from '@/lib/library/connectors/http';
import {makerworldJson} from '@/lib/library/makerworld-http';
function response(status:number,data:unknown,headers={}){vi.mocked(request).mockResolvedValue(Object.assign(Readable.from([typeof data==='string'?data:JSON.stringify(data)]),{statusCode:status,headers}) as any);}
beforeEach(()=>{vi.mocked(request).mockReset();});
it('preserves verification challenges on HTTP 400',async()=>{response(400,{loginType:'verifyCode'});expect(await makerworldJson('https://api.bambulab.com/v1/user-service/user/login')).toEqual({loginType:'verifyCode'});});
it('explains invalid credentials without echoing provider or account data',async()=>{response(400,{error:'invalid password for private@example.com'});await expect(makerworldJson('https://api.bambulab.com/v1/login')).rejects.toMatchObject({code:'credentials'});try{await makerworldJson('https://api.bambulab.com/v1/login');}catch(e){expect((e as Error).message).not.toContain('private@example.com');}});
it('explains browser verification rather than exposing HTML',async()=>{response(403,'<html>Just a moment Cloudflare</html>');await expect(makerworldJson('https://api.bambulab.com')).rejects.toMatchObject({code:'browser_required'});});
it('classifies rate limits and authentication',async()=>{response(429,{error:'slow down'},{'retry-after':'120'});await expect(makerworldJson('https://api.bambulab.com')).rejects.toMatchObject({code:'rate_limit',retryAfter:120});response(403,{error:'Please log in to download models.'});await expect(makerworldJson('https://api.bambulab.com')).rejects.toMatchObject({code:'authentication'});});
it('bounds login wait and reports network failure',async()=>{vi.mocked(request).mockRejectedValue(new Error('socket timeout'));await expect(makerworldJson('https://api.bambulab.com')).rejects.toMatchObject({code:'network'});expect(request).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({timeoutMs:15000,acceptHttpErrors:true}));});
it('rejects application errors even on HTTP 200',async()=>{response(200,{code:1,error:'verification code expired'});await expect(makerworldJson('https://api.bambulab.com')).rejects.toMatchObject({code:'invalid_code'});});
