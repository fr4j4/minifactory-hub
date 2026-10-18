'use server';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { requirePerm } from '@/lib/auth';
import { unseal } from '@/lib/secret';
import { makerworldToken, makerworldAccount, storeMakerworldToken } from '@/lib/library/makerworld';
import { makerworldJson } from '@/lib/library/makerworld-http';
import { safe } from './common';
import { integrationUser } from '@/lib/integrations-access';

export async function ownBambuAccounts() { return safe(async () => {
  const user = await integrationUser();
  return (await (await getDb()).select({ id:s.cloudAccounts.id, email:s.cloudAccounts.email, region:s.cloudAccounts.region, status:s.cloudAccounts.status, expiresAt:s.cloudAccounts.tokenExpiresAt }).from(s.cloudAccounts).where(and(eq(s.cloudAccounts.workspaceId,WORKSPACE_ID),eq(s.cloudAccounts.createdBy,user.id),eq(s.cloudAccounts.region,'global'),isNull(s.cloudAccounts.deletedAt)))).map(a=>({...a,expiresAt:a.expiresAt?.toISOString()||null}));
}); }
/** A shared workshop account is not permission to use another person's MakerWorld identity. */
export async function useBambuAccount(id:string) { return safe(async () => {
  const user = await integrationUser(); z.uuid().parse(id);
  const [account] = await (await getDb()).select().from(s.cloudAccounts).where(and(eq(s.cloudAccounts.id,id),eq(s.cloudAccounts.workspaceId,WORKSPACE_ID),eq(s.cloudAccounts.createdBy,user.id),eq(s.cloudAccounts.region,'global'),isNull(s.cloudAccounts.deletedAt)));
  if (!account?.tokenEnc || account.status!=='activa' || account.tokenExpiresAt && account.tokenExpiresAt.getTime()<=Date.now()) throw new Error('Esta sesión no está disponible. Vuelve a asociar la cuenta.');
  await storeMakerworldToken(user.id,unseal(account.tokenEnc),account.tokenExpiresAt ? (account.tokenExpiresAt.getTime()-Date.now())/1000 : null);
}, ['/configuracion']); }
/** Opt-in sharing with the existing workshop printer connector; never auto-add printers. */
export async function enableBambuPrinters(email:string) { return safe(async () => {
  const user = await requirePerm('maquinas','C'); email=z.email().parse(email.trim().toLowerCase());
  const token = await makerworldToken(user.id); if (!token) throw new Error('Asocia primero tu cuenta.');
  const profile = await makerworldJson('https://api.bambulab.com/v1/design-user-service/my/preference',{headers:{Authorization:`Bearer ${token}`}});
  if (!profile?.uid) throw new Error('La sesión no pudo validarse.');
  const db=await getDb();
  const existing=await db.select().from(s.cloudAccounts).where(and(eq(s.cloudAccounts.workspaceId,WORKSPACE_ID),eq(s.cloudAccounts.email,email),eq(s.cloudAccounts.region,'global'),isNull(s.cloudAccounts.deletedAt)));
  if(existing.some(a=>a.createdBy!==user.id))throw new Error('Esta cuenta ya fue configurada por otra persona del taller. Gestiona sus impresoras desde Conectores.');
  if(existing.some(a=>a.uid && a.uid!==String(profile.uid)))throw new Error('El correo corresponde a otra cuenta Bambu. Usa el correo de la sesión asociada.');
  const account=await makerworldAccount(user.id);
  const expires=account?.expiresAt?Math.max(1,(account.expiresAt.getTime()-Date.now())/1000):null;
  await (await import('@/lib/services/printers')).saveCloudAccount('global',email,token,expires,user.id);
}, ['/configuracion','/maquinas/conectores']); }
