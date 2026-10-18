import { and, eq } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { seal, unseal } from '@/lib/secret';
import { json, request, body } from './connectors/http';
import { parseMakerworldDesign } from './source';

// Custom integration. Credentials only go to this fixed origin, never to a CDN.
const API = 'https://api.bambulab.com/v1';
export const accountWhere = (userId: string) => and(eq(s.libraryAccounts.workspaceId, WORKSPACE_ID), eq(s.libraryAccounts.userId, userId), eq(s.libraryAccounts.provider, 'makerworld'));
export async function makerworldAccount(userId: string) {
  const [row] = await (await getDb()).select().from(s.libraryAccounts).where(accountWhere(userId));
  return row;
}
export async function makerworldToken(userId: string) {
  const row = await makerworldAccount(userId);
  if (!row) return undefined;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) throw new Error('La sesión de MakerWorld caducó. Vuelve a conectar.');
  return unseal(row.secret);
}
export async function checkMakerworld(userId:string){
  const token=await makerworldToken(userId);
  if(!token)throw new Error('Conecta tu cuenta de MakerWorld');
  try{const p=await json(`${API}/design-user-service/my/preference`,{headers:{Authorization:`Bearer ${token}`}});if(!p?.uid)throw new Error('invalid');}
  catch{throw new Error('No se pudo validar la sesión. Reintenta o conecta tu cuenta de nuevo.');}
}
export async function storeMakerworldToken(userId: string, token: string, expiresIn?: number | null) {
  if (!token || token.length > 16000 || /\s/.test(token)) throw new Error('Token inválido');
  const profile = await json(`${API}/design-user-service/my/preference`, { headers: { Authorization: `Bearer ${token}` } });
  if (!profile?.uid) throw new Error('MakerWorld no pudo validar esta sesión');
  const values = { secret: seal(token), expiresAt: expiresIn && expiresIn > 0 ? new Date(Date.now() + Math.min(expiresIn, 31536000) * 1000) : null, updatedAt: new Date() };
  await (await getDb()).insert(s.libraryAccounts).values({ workspaceId: WORKSPACE_ID, userId, provider: 'makerworld', ...values }).onConflictDoUpdate({ target: [s.libraryAccounts.workspaceId, s.libraryAccounts.userId, s.libraryAccounts.provider], set: values });
}
export async function makerworldLogin(account: string, credential: {password: string} | {code: string}) {
  const result = await json(`${API}/user-service/user/login`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({account,...credential}) });
  if (result.accessToken) return { kind: 'token' as const, token: String(result.accessToken), expiresIn: Number(result.expiresIn) || null };
  if (result.loginType === 'verifyCode') {
    await json(`${API}/user-service/user/sendemail/code`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:account,type:'codeLogin'})});
    return {kind:'code' as const};
  }
  if (result.loginType === 'tfa' && result.tfaKey) return {kind:'tfa' as const,tfaKey:String(result.tfaKey)};
  if (result.loginType === 'tfa') return {kind:'browser' as const};
  throw new Error('No se pudo iniciar sesión. Revisa las credenciales o utiliza un token de sesión del navegador.');
}
export async function makerworldTfa(tfaKey:string,tfaCode:string){
  const csrfResponse=await request('https://bambulab.com/api/csrf');
  const csrf=(csrfResponse.headers['set-cookie']||[]).map(c=>/bbl_csrf_token=([^;]+)/.exec(c)?.[1]).find(Boolean);
  await body(csrfResponse);
  if(!csrf)throw new Error('No se pudo iniciar el segundo factor. Usa el acceso del navegador.');
  const response=await request('https://bambulab.com/api/sign-in/tfa',{method:'POST',headers:{'Content-Type':'application/json','x-bbl-csrf-token':csrf,Cookie:`bbl_csrf_token=${csrf}`},body:JSON.stringify({tfaKey,tfaCode})});
  const token=(response.headers['set-cookie']||[]).map(c=>/^token=([^;]+)/.exec(c)?.[1]).find(Boolean);
  await body(response);
  if(!token)throw new Error('Código incorrecto o sesión bloqueada. Usa el acceso del navegador.');
  return token;
}
export function makerworldReference(raw: string) {
  const u = new URL(raw);
  if (u.protocol !== 'https:' || u.username || u.password) throw new Error('Use HTTPS sin credenciales');
  if (!['makerworld.com','www.makerworld.com','api.bambulab.com'].includes(u.hostname)) return null;
  const designId = u.pathname.match(/\/models\/(\d+)/)?.[1];
  const instanceId = u.hash.match(/^#profileId-(\d+)$/)?.[1] || u.pathname.match(/\/design-service\/instance\/(\d+)\/f3mf$/)?.[1];
  return designId || instanceId ? {designId,instanceId} : null;
}
export function makerworldProfiles(d: any) {
  return (Array.isArray(d?.instances) ? d.instances : []).slice(0,100).map((p:any) => {
    const info = p.extention?.modelInfo || {};
    return {id:String(p.id),title:String(p.title || p.id),size:Number(info.f3mf?.size)||null,plates:Array.isArray(info.plates)?info.plates.length:0,printer:String(info.compatibility?.devProductName || ''),devModelName:String(info.compatibility?.devModelName || 'BL-P001')};
  }).filter((p:any)=>/^\d+$/.test(p.id));
}
export async function inspectMakerworld(raw: string) {
  const ref = makerworldReference(raw);
  if (!ref) throw new Error('URL de MakerWorld inválida');
  if (!ref.designId) return { title:`MakerWorld · ${ref.instanceId}`,author:null,license:null,description:null,image:null,profiles:[{id:ref.instanceId!,title:ref.instanceId!,size:null,plates:0,printer:'',devModelName:'BL-P001'}],selected:ref.instanceId!,url:`https://makerworld.com/api/v1/design-service/instance/${ref.instanceId}/f3mf?type=download&fileType=&devModelName=BL-P001` };
  const data = await json(`${API}/design-service/design/${ref.designId}`);
  const d = data.design || data, meta = parseMakerworldDesign(d), profiles = makerworldProfiles(d);
  const selected = ref.instanceId || String(d.defaultInstanceId || profiles[0]?.id || '');
  if (ref.instanceId && !profiles.some((p:any)=>p.id===ref.instanceId)) throw new Error('El perfil solicitado no pertenece a este modelo o ya no está disponible');
  return {title:meta.title,author:meta.authorName,license:meta.licenseText,description:meta.description,image:meta.imageUrls[0]||null,profiles,selected,url:`https://makerworld.com/models/${ref.designId}#profileId-${selected}`};
}
/** Accept explicit download fields only; never scrape arbitrary URLs from provider text. */
export function parseDownloadResponse(input: string | Record<string, any>, fallback = 'modelo.3mf') {
  let value:any = input;
  if (typeof input === 'string') {
    if(input.length>65536) throw new Error('Respuesta demasiado grande');
    try { value = input.trim().startsWith('{') ? JSON.parse(input) : {url:input.trim()}; }
    catch { throw new Error('JSON de descarga inválido'); }
  }
  value = value?.data || value;
  if (typeof value?.url !== 'string') throw new Error('El JSON no contiene una URL de descarga');
  const u = new URL(value.url);
  if(u.protocol!=='https:'||u.username||u.password) throw new Error('Use HTTPS sin credenciales');
  const filename = String(value.name || value.fileName || decodeURIComponent(u.pathname.split('/').at(-1)||'') || fallback).split(/[\\/]/).at(-1)!.replace(/[\x00-\x1f]/g,'').slice(0,240);
  return {url:u.toString(),filename:/\.3mf$/i.test(filename)?filename:fallback};
}
export async function resolveMakerworld(instanceId: string, devModelName: string, userId: string) {
  if(!/^\d+$/.test(instanceId)||!/^[-\w]{1,64}$/.test(devModelName)) throw new Error('Perfil inválido');
  const token = await makerworldToken(userId);
  try {
    const result = await json(`${API}/design-service/instance/${instanceId}/f3mf?${new URLSearchParams({type:'download',fileType:'',devModelName})}`, {headers:token?{Authorization:`Bearer ${token}`}:{}});
    return parseDownloadResponse(result,`makerworld-${instanceId}.3mf`);
  } catch(e) {
    const status = (e as any).status;
    if(status===401||status===403) throw new Error(token ? 'MakerWorld rechazó la descarga. Reconecta la cuenta; también puede requerir permisos del modelo. Puedes pegar el JSON del navegador.' : 'MakerWorld requiere iniciar sesión para descargar. Conecta tu cuenta o pega el JSON del navegador.');
    throw new Error('No se pudo resolver la descarga de MakerWorld. Reintenta o pega el JSON del navegador.');
  }
}
