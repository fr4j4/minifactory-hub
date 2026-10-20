import {beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {Readable} from 'node:stream';
import {zipSync,strToU8} from 'fflate';
import {eq} from 'drizzle-orm';
const state=vi.hoisted(()=>({userId:'00000000-0000-4000-8000-000000000010'}));
vi.mock('@/lib/auth',()=>({getSession:async()=>({id:state.userId,role:'admin',workspaceId:'00000000-0000-4000-8000-000000000001'}),requireUser:async()=>({id:state.userId,role:'admin',workspaceId:'00000000-0000-4000-8000-000000000001'}),requirePerm:async()=>({id:state.userId,workspaceId:'00000000-0000-4000-8000-000000000001'}),loginThrottled:()=>false,loginFailed:()=>{},loginOk:()=>{}}));
vi.mock('@/actions/common',()=>({safe:async(fn:()=>Promise<any>)=>{try{return{ok:true,data:await fn()};}catch(e){return{ok:false,error:(e as Error).message};}}}));
vi.mock('@/lib/library/connectors/http',()=>({json:vi.fn(),request:vi.fn()}));
vi.mock('@/lib/library/makerworld-http',async original=>({...await original<typeof import('@/lib/library/makerworld-http')>(),makerworldJson:vi.fn()}));
vi.mock('@/lib/library/browser-service',()=>({browserService:vi.fn()}));
import {getDb,s,WORKSPACE_ID} from '@/db';
import {request} from '@/lib/library/connectors/http';
import {makerworldJson as json,MakerworldError} from '@/lib/library/makerworld-http';
import {storeMakerworldToken,makerworldAccount,makerworldToken,resolveMakerworld} from '@/lib/library/makerworld';
import {prepareLibraryImport,confirmLibraryImport,libraryImportStatus,disconnectMakerworld,connectMakerworld,makerworldConnection} from '@/actions/library-import';
import {executeImport} from '@/lib/library/url-import';
import {browserOperation,completeBrowserImport} from '@/lib/library/browser-import';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {GET as browserGet,POST as browserPost} from '@/app/api/library/browser/[id]/route';
import {browserService} from '@/lib/library/browser-service';
import {watchBrowserDownload} from '@/lib/library/browser-download';
const owner=state.userId,other='00000000-0000-4000-8000-000000000011';
const signed='https://cdn.example.com/file.3mf?signature=do-not-expose';
const design={id:3317662,title:'Pumpkin Test',coverUrl:'https://cdn.example.com/cover.jpg',designCreator:{name:'Author'},license:'Standard Digital File License',instances:[{id:3766961,profileId:1004749352,extention:{modelInfo:{f3mf:{size:100},plates:[{}],compatibility:{devModelName:'BL-P001'}}}}]};
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
  expect(json).toHaveBeenCalledTimes(1);
});
it('completes email verification and stores a validated session',async()=>{
  vi.mocked(json).mockResolvedValueOnce({accessToken:'email-verified-session',expiresIn:60}).mockResolvedValueOnce({uid:123});
  expect(await connectMakerworld({method:'code',account:'test@example.com',credential:'123456'})).toMatchObject({ok:true,data:{kind:'connected'}});
  expect(await makerworldToken(owner)).toBe('email-verified-session');
  await disconnectMakerworld();
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
  vi.mocked(json).mockResolvedValue({...design,tags:['Halloween','calabaza',{name:'Decoración'}],categoryName:'Seasonal',likeCount:42,downloadCount:900,createTime:'2026-01-02T00:00:00Z'});
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
  const imageJobs=await db.select().from(s.jobs).where(eq(s.jobs.kind,'source.images'));
  expect(imageJobs.filter(j=>j.payload.modelId===id)).toHaveLength(1);
  const [source]=await db.select().from(s.modelSources).where(eq(s.modelSources.id,model.sourceId!));
  expect(source.images).toEqual([{url:'https://cdn.example.com/cover.jpg'}]);
  // etiquetas, estadísticas, fechas y categoría del autor se conservan y las etiquetas sirven para filtrar
  expect(source.tags).toEqual(['Halloween','calabaza','Decoración']);expect(source.stats).toMatchObject({likes:42,downloads:900});expect(source.remoteCreatedAt).toBe('2026-01-02T00:00:00Z');
  expect(model.tags).toEqual(expect.arrayContaining(['halloween','calabaza','decoracion']));expect(model.tagMeta?.halloween).toMatchObject({source:'import'});
  const [details]=await db.select().from(s.libraryDetails).where(eq(s.libraryDetails.modelId,id));expect(details.data).toMatchObject({category:'Seasonal'});
});
it('rejects HTML masquerading as a 3MF',async()=>{
  vi.mocked(json).mockResolvedValue(design);
  const p=await prepareLibraryImport({url:'https://makerworld.com/models/3317662',instanceId:'3766961',download:signed});if(!p.ok)throw new Error(p.error);
  await confirmLibraryImport(p.data.id);
  vi.mocked(request).mockResolvedValue(Object.assign(Readable.from(['<html>login</html>']),{headers:{'content-type':'text/html'}}) as any);
  await expect(executeImport(p.data.id)).rejects.toThrow('página/JSON');
  expect(await libraryImportStatus(p.data.id)).toMatchObject({ok:true,data:{status:'error'}});
});
it('pauses repeated password requests after a real challenge while allowing session association',async()=>{
  state.userId=other;
  vi.mocked(json).mockRejectedValue(new MakerworldError('browser_required','Browser verification',300));
  const input={method:'password',account:'test@example.com',credential:'not-a-real-password'};
  expect(await connectMakerworld(input)).toMatchObject({ok:false,code:'browser_required'});
  expect(await connectMakerworld(input)).toMatchObject({ok:false,code:'browser_required'});
  expect(json).toHaveBeenCalledTimes(1);
  vi.mocked(json).mockResolvedValue({uid:456});
  expect(await connectMakerworld({method:'token',credential:'browser-session'})).toMatchObject({ok:true,data:{kind:'connected'}});
});

it('preserves the selected profile on CAPTCHA and ingests an owner-supplied file exactly once',async()=>{
  vi.mocked(json).mockResolvedValueOnce(design).mockRejectedValueOnce(new MakerworldError('browser_required','CAPTCHA'));
  const result=await prepareLibraryImport({url:'https://makerworld.com/models/3317662',instanceId:'3766961'});
  expect(result).toMatchObject({ok:true,data:{browserRequired:true,profile:{id:'3766961'}}});if(!result.ok)throw Error('prepare');
  const id=result.data.id,user={id:owner,workspaceId:WORKSPACE_ID};
  const op=await browserOperation(id,user);expect(op.status).toBe('awaiting_file');expect(op.input.secretUrl).toBeUndefined();
  expect((await confirmLibraryImport(id)).ok).toBe(false);
  await expect(browserOperation(id,{...user,id:other})).rejects.toThrow('no encontrada');
  await expect(browserOperation(id,{...user,workspaceId:other})).rejects.toThrow('Taller');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mf-browser-test-')),file=path.join(dir,'model.3mf');
  try{
    await fs.writeFile(file,'<html>Challenge</html>');await expect(completeBrowserImport(id,user,file,'model.3mf')).rejects.toThrow('3MF válido');
    await fs.writeFile(file,zipSync({'readme.txt':strToU8('not a model')}));await expect(completeBrowserImport(id,user,file,'model.3mf')).rejects.toThrow('estructura');
    await fs.writeFile(file,zipSync({'[Content_Types].xml':strToU8('<Types/>'),'3D/3dmodel.model':strToU8('<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources/><build/></model>')}));
    await expect(completeBrowserImport(id,user,file,'model.stl')).rejects.toThrow('3MF');
    const attempts=await Promise.allSettled([completeBrowserImport(id,user,file,'model.3mf'),completeBrowserImport(id,user,file,'model.3mf')]);
    expect(attempts.filter(r=>r.status==='fulfilled').length).toBeGreaterThan(0);
    expect(await completeBrowserImport(id,user,file,'model.3mf')).toEqual({modelFileId:id});
    const db=await getDb(),versions=await db.select().from(s.fileVersions).where(eq(s.fileVersions.modelFileId,id));expect(versions).toHaveLength(1);
    const [model]=await db.select().from(s.modelFiles).where(eq(s.modelFiles.id,id));expect(model).toMatchObject({name:'Pumpkin Test',author:'Author'});expect(model.sourceId).toBeTruthy();
    expect(await libraryImportStatus(id)).toMatchObject({ok:true,data:{status:'done',modelId:id}});
    const jobs=await db.select().from(s.jobs).where(eq(s.jobs.kind,'source.images'));expect(jobs.filter(j=>j.payload.modelId===id)).toHaveLength(1);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
it('allows a browser session without repeating a blocked login and rejects unrelated provider errors',async()=>{
  vi.mocked(json).mockResolvedValue(design);
  const result=await prepareLibraryImport({url:'https://makerworld.com/models/3317662',instanceId:'3766961',browser:true});
  expect(result).toMatchObject({ok:true,data:{browserRequired:true}});expect(json).toHaveBeenCalledTimes(1);
  vi.mocked(json).mockResolvedValueOnce(design).mockRejectedValueOnce(new MakerworldError('permission','No permission'));
  expect(await prepareLibraryImport({url:'https://makerworld.com/models/3317662',instanceId:'3766961'})).toMatchObject({ok:false,code:'permission'});
});
it('protects remote controls by owner and origin and queues automatic background ingestion',async()=>{
  vi.mocked(json).mockResolvedValue(design);
  const p=await prepareLibraryImport({url:'https://makerworld.com/models/3317662',instanceId:'3766961',browser:true});if(!p.ok)throw Error('prepare');
  const id=p.data.id,context={params:Promise.resolve({id})},url=`http://test.local/api/library/browser/${id}?action=start`;
  vi.mocked(browserService).mockReset();vi.mocked(browserService).mockImplementation(async(_id,action)=>Response.json({phase:'verification',expiresAt:new Date(Date.now()+120000).toISOString()}));
  expect((await browserPost(new Request(url,{method:'POST',headers:{origin:'http://evil.local'}}),context)).status).toBe(403);
  expect(browserService).not.toHaveBeenCalled();
  state.userId=other;expect((await browserGet(new Request(url.replace('start','frame')),context)).status).toBe(400);expect(browserService).not.toHaveBeenCalled();state.userId=owner;
  expect((await browserPost(new Request(url,{method:'POST',headers:{origin:'http://test.local'}}),context)).status).toBe(200);
  expect((await browserPost(new Request(url,{method:'POST',headers:{origin:'http://test.local'}}),context)).status).toBe(200);
  const db=await getDb(),jobs=await db.select().from(s.jobs).where(eq(s.jobs.kind,'browser.import'));expect(jobs.filter(j=>j.payload.operationId===id)).toHaveLength(1);
  const file=zipSync({'[Content_Types].xml':strToU8('<Types/>'),'3D/3dmodel.model':strToU8('<model/>')});
  vi.mocked(browserService).mockImplementation(async(_id,action)=>action==='file'?new Response(Buffer.from(file)):Response.json({phase:'downloaded',file:{filename:'fixture.3mf'}}));
  await watchBrowserDownload({operationId:id,userId:owner,deadline:Date.now()+60000});
  expect(await libraryImportStatus(id)).toMatchObject({ok:true,data:{status:'done',modelId:id}});
  const versions=await db.select().from(s.fileVersions).where(eq(s.fileVersions.modelFileId,id));expect(versions).toHaveLength(1);
  expect(vi.mocked(browserService).mock.calls.some(c=>c[2]==='DELETE')).toBe(true);
  const status=await browserGet(new Request(url.replace('start','status')),context);expect(await status.json()).toMatchObject({phase:'done',modelId:id});
});
