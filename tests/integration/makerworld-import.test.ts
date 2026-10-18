import {beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {Readable} from 'node:stream';
import {zipSync,strToU8} from 'fflate';
import {eq} from 'drizzle-orm';
const state=vi.hoisted(()=>({userId:'00000000-0000-4000-8000-000000000010'}));
vi.mock('@/lib/auth',()=>({requirePerm:async()=>({id:state.userId,workspaceId:'00000000-0000-4000-8000-000000000001'}),loginThrottled:()=>false,loginFailed:()=>{},loginOk:()=>{}}));
vi.mock('@/actions/common',()=>({safe:async(fn:()=>Promise<any>)=>{try{return{ok:true,data:await fn()};}catch(e){return{ok:false,error:(e as Error).message};}}}));
vi.mock('@/lib/library/connectors/http',()=>({json:vi.fn(),request:vi.fn()}));
vi.mock('@/lib/library/makerworld-http',async original=>({...await original<typeof import('@/lib/library/makerworld-http')>(),makerworldJson:vi.fn()}));
import {getDb,s,WORKSPACE_ID} from '@/db';
import {request} from '@/lib/library/connectors/http';
import {makerworldJson as json,MakerworldError} from '@/lib/library/makerworld-http';
import {storeMakerworldToken,makerworldAccount,makerworldToken,resolveMakerworld} from '@/lib/library/makerworld';
import {prepareLibraryImport,confirmLibraryImport,libraryImportStatus,disconnectMakerworld,connectMakerworld,makerworldConnection} from '@/actions/library-import';
import {executeImport} from '@/lib/library/url-import';
const owner=state.userId,other='00000000-0000-4000-8000-000000000011';
const signed='https://cdn.example.com/file.3mf?signature=do-not-expose';
const design={id:3317662,title:'Pumpkin Test',designCreator:{name:'Author'},license:'Standard Digital File License',instances:[{id:3766961,profileId:1004749352,extention:{modelInfo:{f3mf:{size:100},plates:[{}],compatibility:{devModelName:'BL-P001'}}}}]};
beforeAll(async()=>{process.env.MF_EXTERNAL_WORKER='1';process.env.SESSION_SECRET='isolated-makerworld-test-secret-long-enough';const db=await getDb();for(const id of[owner,other])await db.insert(s.users).values({id,workspaceId:WORKSPACE_ID,email:id+'@test.local',name:'Test',passwordHash:'test'});});
beforeEach(()=>{state.userId=owner;vi.mocked(json).mockReset();vi.mocked(request).mockReset();});
it('returns actionable login errors through the server action',async()=>{
  vi.mocked(json).mockRejectedValue(new MakerworldError('credentials','Revisa el correo y la contraseña.'));
  expect(await connectMakerworld({method:'password',account:'test@example.com',credential:'not-a-real-password'})).toMatchObject({ok:false,code:'credentials',error:'Revisa el correo y la contraseña.'});
});
it('completes login, validates the token and verifies connection on the provider',async()=>{
  vi.mocked(json).mockResolvedValueOnce({accessToken:'new-private-token',expiresIn:60}).mockResolvedValue({uid:123});
  expect(await connectMakerworld({method:'password',account:' test@example.com ',credential:'not-a-real-password'})).toMatchObject({ok:true,data:{kind:'connected'}});
  expect(await makerworldConnection()).toMatchObject({ok:true,data:{connected:true,status:'verified'}});
  vi.mocked(json).mockRejectedValue(new MakerworldError('authentication','Expired'));
  expect(await makerworldConnection()).toMatchObject({ok:true,data:{connected:false,status:'expired'}});
  await disconnectMakerworld();
});
it('returns an email challenge instead of claiming a connected account',async()=>{
  vi.mocked(json).mockResolvedValueOnce({loginType:'verifyCode'}).mockResolvedValueOnce({code:0});
  expect(await connectMakerworld({method:'password',account:'test@example.com',credential:'not-a-real-password'})).toMatchObject({ok:true,data:{kind:'code'}});
  expect(await makerworldAccount(owner)).toBeUndefined();
});
it('seals the 2FA challenge and refuses its use by another user',async()=>{
  vi.mocked(json).mockResolvedValueOnce({loginType:'tfa',tfaKey:'private-challenge-key'});
  const r=await connectMakerworld({method:'password',account:'test@example.com',credential:'not-a-real-password'});
  expect(r).toMatchObject({ok:true,data:{kind:'tfa'}});expect(JSON.stringify(r)).not.toContain('private-challenge-key');
  if(!r.ok||r.data.kind!=='tfa')throw new Error('Expected challenge');
  state.userId=other;
  expect(await connectMakerworld({method:'tfa',credential:'123456',challenge:r.data.challenge})).toMatchObject({ok:false});
});
it('normalizes a pasted Bearer token without saving the prefix',async()=>{
  vi.mocked(json).mockResolvedValue({uid:123});await storeMakerworldToken(owner,'Bearer pasted-session');
  expect(await makerworldToken(owner)).toBe('pasted-session');await disconnectMakerworld();
});
it('encrypts personal sessions, verifies them and isolates users',async()=>{
  vi.mocked(json).mockResolvedValue({uid:123});
  await storeMakerworldToken(owner,'private-token',60);
  expect((await makerworldAccount(owner))?.secret).not.toContain('private-token');
  expect(await makerworldToken(owner)).toBe('private-token');expect(await makerworldToken(other)).toBeUndefined();
  vi.mocked(json).mockResolvedValue({url:signed,name:'part.3mf'});
  expect((await resolveMakerworld('3766961','BL-P001',owner)).url).toBe(signed);
  expect(vi.mocked(json).mock.calls.at(-1)).toEqual([expect.stringContaining('/instance/3766961/f3mf?'),{headers:{Authorization:'Bearer private-token'}}]);
  await disconnectMakerworld();expect(await makerworldAccount(owner)).toBeUndefined();
});
it('returns actionable login and expiry errors',async()=>{
  vi.mocked(json).mockRejectedValue(Object.assign(new Error('403'),{status:403}));
  await expect(resolveMakerworld('3766961','BL-P001',owner)).rejects.toThrow('iniciar sesión');
  vi.mocked(json).mockResolvedValue({uid:123});await storeMakerworldToken(owner,'expired-token',60);
  await(await getDb()).update(s.libraryAccounts).set({expiresAt:new Date(0)}).where(eq(s.libraryAccounts.userId,owner));
  await expect(makerworldToken(owner)).rejects.toThrow('caducó');await disconnectMakerworld();
});
it('prepares privately, confirms once, downloads without forwarding tokens and preserves provenance',async()=>{
  vi.mocked(json).mockResolvedValue(design);
  const prepared=await prepareLibraryImport({url:'https://makerworld.com/models/3317662#profileId-3766961',instanceId:'3766961',download:JSON.stringify({url:signed,name:'pumpkin.3mf'})});
  expect(prepared.ok).toBe(true);if(!prepared.ok)throw new Error(prepared.error);
  expect(JSON.stringify(prepared.data)).not.toContain('do-not-expose');
  const id=prepared.data.id,db=await getDb();
  expect((await db.select().from(s.libraryOperations).where(eq(s.libraryOperations.id,id)))[0].status).toBe('planned');
  await executeImport(id);expect(request).not.toHaveBeenCalled();
  state.userId=other;expect((await confirmLibraryImport(id)).ok).toBe(false);expect((await libraryImportStatus(id)).ok).toBe(false);state.userId=owner;
  expect((await confirmLibraryImport(id)).ok).toBe(true);expect((await confirmLibraryImport(id)).ok).toBe(false);
  const file=zipSync({'3D/3dmodel.model':strToU8('<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources/><build/></model>')});
  vi.mocked(request).mockResolvedValue(Object.assign(Readable.from([file]),{headers:{'content-type':'application/octet-stream'}}) as any);
  await executeImport(id);
  expect(request).toHaveBeenCalledWith(signed);
  expect((await libraryImportStatus(id))).toMatchObject({ok:true,data:{status:'done',modelId:id}});
  const [model]=await db.select().from(s.modelFiles).where(eq(s.modelFiles.id,id));expect(model).toMatchObject({name:'Pumpkin Test',author:'Author',license:'desconocida'});expect(model.sourceId).toBeTruthy();
  await executeImport(id);expect(request).toHaveBeenCalledTimes(1);
});
it('rejects HTML masquerading as a 3MF',async()=>{
  vi.mocked(json).mockResolvedValue(design);
  const p=await prepareLibraryImport({url:'https://makerworld.com/models/3317662',instanceId:'3766961',download:signed});if(!p.ok)throw new Error(p.error);
  await confirmLibraryImport(p.data.id);
  vi.mocked(request).mockResolvedValue(Object.assign(Readable.from(['<html>login</html>']),{headers:{'content-type':'text/html'}}) as any);
  await expect(executeImport(p.data.id)).rejects.toThrow('página/JSON');
  expect(await libraryImportStatus(p.data.id)).toMatchObject({ok:true,data:{status:'error'}});
});
