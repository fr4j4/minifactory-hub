import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
const state=vi.hoisted(()=>({id:'00000000-0000-4000-8000-000000000020',printers:true,role:'admin'}));
vi.mock('@/lib/auth',()=>({requireUser:async()=>({id:state.id,role:state.role,workspaceId:'00000000-0000-4000-8000-000000000001'}),requirePerm:async()=>{if(!state.printers)throw new Error('No permission');return{id:state.id};}}));
vi.mock('@/actions/common',()=>({safe:async(fn:()=>Promise<any>)=>{try{return{ok:true,data:await fn()};}catch(e){return{ok:false,error:(e as Error).message};}}}));
vi.mock('@/lib/library/makerworld-http',async original=>({...await original<typeof import('@/lib/library/makerworld-http')>(),makerworldJson:vi.fn()}));
vi.mock('@/lib/services/printers',()=>({saveCloudAccount:vi.fn()}));
import {getDb,s,WORKSPACE_ID} from '@/db';
import {seal} from '@/lib/secret';
import {makerworldJson} from '@/lib/library/makerworld-http';
import {makerworldToken,storeMakerworldToken} from '@/lib/library/makerworld';
import {ownBambuAccounts,useBambuAccount,enableBambuPrinters} from '@/actions/integrations';
import {saveCloudAccount} from '@/lib/services/printers';
const owner=state.id,other='00000000-0000-4000-8000-000000000021';
let ownId:string,otherId:string;
beforeAll(async()=>{
  process.env.MF_EXTERNAL_WORKER='1';process.env.SESSION_SECRET='integration-test-isolated-secret-long-enough';
  const db=await getDb();
  for(const id of [owner,other])await db.insert(s.users).values({id,workspaceId:WORKSPACE_ID,email:id+'@example.invalid',name:'Test',passwordHash:'test'});
  for(const id of [owner,other]){const [a]=await db.insert(s.cloudAccounts).values({workspaceId:WORKSPACE_ID,createdBy:id,email:id+'@example.invalid',uid:id===owner?'123':'456',tokenEnc:seal('private-token-'+id)}).returning();if(id===owner)ownId=a.id;else otherId=a.id;}
});
beforeEach(()=>{state.id=owner;state.printers=true;state.role='admin';vi.mocked(makerworldJson).mockReset().mockResolvedValue({uid:'123'});vi.mocked(saveCloudAccount).mockReset().mockResolvedValue('saved');});
it('lists only owned accounts without returning tokens',async()=>{const r=await ownBambuAccounts();expect(r.ok).toBe(true);if(!r.ok)return;expect(r.data.map(a=>a.id)).toEqual([ownId]);expect(JSON.stringify(r)).not.toMatch(/private-token|tokenEnc|secret/);});
it('validates and reuses an owned printer session for MakerWorld',async()=>{expect(await useBambuAccount(ownId)).toMatchObject({ok:true});expect(await makerworldToken(owner)).toBe('private-token-'+owner);expect(makerworldJson).toHaveBeenCalled();});
it('cannot adopt another users shared printer account',async()=>{expect(await useBambuAccount(otherId)).toMatchObject({ok:false});expect(makerworldJson).not.toHaveBeenCalled();});
it('cannot reuse a closed or expired printer session',async()=>{const db=await getDb();await db.update(s.cloudAccounts).set({tokenExpiresAt:new Date(0)}).where(eq(s.cloudAccounts.id,ownId));expect(await useBambuAccount(ownId)).toMatchObject({ok:false});await db.update(s.cloudAccounts).set({tokenExpiresAt:null}).where(eq(s.cloudAccounts.id,ownId));});
it('publishes a verified session to printers only with permission',async()=>{await storeMakerworldToken(owner,'personal-session',60);state.printers=false;expect(await enableBambuPrinters(owner+'@example.invalid')).toMatchObject({ok:false});expect(saveCloudAccount).not.toHaveBeenCalled();state.printers=true;expect(await enableBambuPrinters(owner+'@example.invalid')).toMatchObject({ok:true});expect(saveCloudAccount).toHaveBeenCalledWith('global',owner+'@example.invalid','personal-session',expect.any(Number),owner);});
it('does not replace someone elses workshop account',async()=>{await storeMakerworldToken(owner,'personal-session',60);expect(await enableBambuPrinters(other+'@example.invalid')).toMatchObject({ok:false});expect(saveCloudAccount).not.toHaveBeenCalled();});
it('rejects accounts without either module permission',async()=>{state.role='unknown';expect(await ownBambuAccounts()).toMatchObject({ok:false});});
