import { getT } from '@/i18n/server';
/**
 * Cliente de la API en la nube de Bambu Lab (no oficial: documentada por la comunidad, p. ej. ha-bambulab
 * y OpenBambuAPI). Bambu puede cambiarla sin aviso.
 *
 *  - Login: POST /v1/user-service/user/login {account, password} →
 *      accessToken | loginType "verifyCode" (código por correo) | loginType "tfa" + tfaKey (app autenticadora)
 *  - Código por correo: POST /v1/user-service/user/sendemail/code {email, type:"codeLogin"}; luego login {account, code}
 *  - 2FA: GET https://bambulab.com/api/csrf (cookie bbl_csrf_token) → POST https://bambulab.com/api/sign-in/tfa
 *      {tfaKey, tfaCode} con x-bbl-csrf-token; el token llega en la cookie `token`
 *  - Usuario MQTT: u_<uid>, desde el JWT (campo username) o GET /v1/design-user-service/my/preference
 *  - Impresoras: GET /v1/iot-service/api/user/bind · Trabajos (con miniatura): GET /v1/user-service/my/tasks
 *  - China: los mismos caminos con dominio .cn y broker cn.mqtt.bambulab.com
 */
export type Region = 'global' | 'china';

export function cloudEndpoints(region: Region) {
  const tld = region === 'china' ? 'cn' : 'com';
  return {
    api: process.env.BAMBU_CLOUD_API ?? `https://api.bambulab.${tld}`,
    web: process.env.BAMBU_CLOUD_WEB ?? `https://bambulab.${tld}`,
    mqttHost: (process.env.BAMBU_CLOUD_MQTT ?? `${region === 'china' ? 'cn' : 'us'}.mqtt.bambulab.com:8883`).split(':')[0],
    mqttPort: Number((process.env.BAMBU_CLOUD_MQTT ?? ':8883').split(':')[1] || 8883),
  };
}

const UA = () => process.env.BAMBU_CLOUD_USER_AGENT ?? 'MiniFactory/1.0 (gestion de taller)';
export class CloudError extends Error { constructor(message: string, readonly code: string, readonly status?: number) { super(message); } }

async function call(url: string, o: { method?: 'GET' | 'POST'; body?: unknown; token?: string; headers?: Record<string, string> } = {}) {
  const t = await getT();
  let r: Response;
  try {
    r = await fetch(url, { method: o.method ?? (o.body ? 'POST' : 'GET'), headers: { 'User-Agent': UA(), 'Content-Type': 'application/json', Accept: 'application/json', ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}), ...o.headers }, body: o.body ? JSON.stringify(o.body) : undefined, signal: AbortSignal.timeout(15_000), redirect: 'manual' });
  } catch (e) { throw new CloudError(t('machines.couldNotReachBambuCloud', { error: (e as Error).message }), 'network'); }
  const text = await r.text(); let json: any = null; try { json = text ? JSON.parse(text) : null; } catch { /* no JSON */ }
  if (r.status === 401) throw new CloudError(t('machines.theBambuCloudSessionHas'), 'unauthorized', 401);
  if (r.status === 403 && /cloudflare|captcha/i.test(text)) throw new CloudError(t('machines.bambuCloudBlockedTheRequest'), 'blocked', 403);
  return { status: r.status, json, headers: r.headers };
}

export type LoginResult = { kind: 'token'; token: string; expiresIn: number | null } | { kind: 'code' } | { kind: 'tfa'; tfaKey: string };

/** Paso 1: correo y contraseña. Si Bambu pide código por correo, lo solicita de inmediato. */
export async function loginPassword(region: Region, account: string, password: string): Promise<LoginResult> {
  const t = await getT();
  const E = cloudEndpoints(region);
  const r = await call(`${E.api}/v1/user-service/user/login`, { body: { account, password, apiError: '' } });
  const j = r.json ?? {};
  if (j.accessToken) return { kind: 'token', token: j.accessToken, expiresIn: Number(j.expiresIn) || null };
  if (j.loginType === 'verifyCode') { await requestEmailCode(region, account); return { kind: 'code' }; }
  if (j.loginType === 'tfa' && j.tfaKey) return { kind: 'tfa', tfaKey: j.tfaKey };
  throw new CloudError(j.message || j.error || (r.status === 400 ? t('machines.incorrectEmailOrPassword') : t('machines.bambuCloudResponded', { status: r.status })), 'login_failed', r.status);
}

export async function requestEmailCode(region: Region, email: string) {
  const t = await getT();
  const E = cloudEndpoints(region);
  const r = await call(`${E.api}/v1/user-service/user/sendemail/code`, { body: { email, type: 'codeLogin' } });
  if (r.status >= 400) throw new CloudError(t('machines.couldNotSendTheCode'), 'code_send', r.status);
}

/** Paso 2a: código de 6 dígitos que llegó al correo. */
export async function loginWithCode(region: Region, account: string, code: string): Promise<{ token: string; expiresIn: number | null }> {
  const t = await getT();
  const E = cloudEndpoints(region);
  const r = await call(`${E.api}/v1/user-service/user/login`, { body: { account, code } });
  if (r.status === 200 && r.json?.accessToken) return { token: r.json.accessToken, expiresIn: Number(r.json.expiresIn) || null };
  if (r.json?.code === 1) { await requestEmailCode(region, account); throw new CloudError(t('machines.theCodeExpiredWeSent'), 'code_expired', r.status); }
  throw new CloudError(t('machines.incorrectCode'), 'code_wrong', r.status);
}

/** Paso 2b: código de la app autenticadora (2FA). */
export async function loginWithTfa(region: Region, tfaKey: string, tfaCode: string): Promise<{ token: string; expiresIn: number | null }> {
  const t = await getT();
  const E = cloudEndpoints(region);
  const c = await call(`${E.web}/api/csrf`);
  const csrf = /bbl_csrf_token=([^;]+)/.exec(c.headers.get('set-cookie') ?? '')?.[1];
  if (!csrf) throw new CloudError(t('machines.couldNotStartTwoStep'), 'csrf');
  const r = await call(`${E.web}/api/sign-in/tfa`, { body: { tfaKey, tfaCode }, headers: { 'x-bbl-csrf-token': csrf, Cookie: `bbl_csrf_token=${csrf}` } });
  const token = /(?:^|[,;\s])token=([^;]+)/.exec(r.headers.get('set-cookie') ?? '')?.[1];
  if (r.status >= 400 || !token) throw new CloudError(t('machines.incorrectVerificationCode'), 'tfa_wrong', r.status);
  return { token, expiresIn: null };
}

/** Usuario MQTT (u_<uid>): del JWT si lo trae, si no desde las preferencias del usuario. */
export async function cloudUsername(region: Region, token: string): Promise<{ username: string; uid: string; name: string | null }> {
  const t = await getT();
  const parts = token.split('.');
  if (parts.length === 3) {
    try { const p = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); if (typeof p.username === 'string' && p.username.startsWith('u_')) return { username: p.username, uid: p.username.slice(2), name: p.nickname ?? null }; } catch { /* token opaco */ }
  }
  const r = await call(`${cloudEndpoints(region).api}/v1/design-user-service/my/preference`, { token });
  const uid = r.json?.uid; if (!uid) throw new CloudError(t('machines.couldNotGetTheBambu'), 'uid', r.status);
  return { username: `u_${uid}`, uid: String(uid), name: r.json?.name ?? null };
}

export interface CloudDevice { serial: string; name: string; online: boolean; printStatus: string | null; model: string | null; productName: string | null; accessCode: string | null; nozzle: string | null }
export async function cloudDevices(region: Region, token: string): Promise<CloudDevice[]> {
  const t = await getT();
  const r = await call(`${cloudEndpoints(region).api}/v1/iot-service/api/user/bind`, { token });
  if (r.status >= 400) throw new CloudError(t('machines.couldNotReadThePrinter', { status: r.status }), 'devices', r.status);
  return (r.json?.devices ?? []).map((d: any) => ({ serial: String(d.dev_id), name: d.name ?? d.dev_id, online: !!d.online, printStatus: d.print_status ?? null, model: d.dev_model_name ?? null, productName: d.dev_product_name ?? null, accessCode: d.dev_access_code ?? null, nozzle: d.nozzle_diameter != null ? String(d.nozzle_diameter) : null }));
}

export interface CloudTask { id: string; serial: string; title: string; cover: string | null; status: number | null; weight: number | null; costTimeS: number | null; startTime: string | null; endTime: string | null }
export async function cloudTasks(region: Region, token: string, serial?: string, limit = 20): Promise<CloudTask[]> {
  const t = await getT();
  const q = new URLSearchParams({ limit: String(limit) }); if (serial) q.set('deviceId', serial);
  const r = await call(`${cloudEndpoints(region).api}/v1/user-service/my/tasks?${q}`, { token });
  if (r.status >= 400) return [];
  return (r.json?.hits ?? []).filter((tt: any) => !serial || tt.deviceId === serial).map((tt: any) => ({ id: String(tt.id), serial: tt.deviceId, title: tt.title ?? tt.designTitle ?? t('common.job'), cover: tt.cover ?? null, status: tt.status ?? null, weight: tt.weight ?? null, costTimeS: tt.costTime ?? null, startTime: tt.startTime ?? null, endTime: tt.endTime ?? null }));
}

/** Solo se descargan miniaturas desde los servidores de imágenes de Bambu (evita usar el servidor como proxy abierto). */
export function isAllowedCoverUrl(u: string) {
  try {
    const url = new URL(u);
    if (process.env.BAMBU_CLOUD_API && u.startsWith(process.env.BAMBU_CLOUD_API)) return true; // nube simulada en pruebas
    return url.protocol === 'https:' && (/\.aliyuncs\.com$/.test(url.hostname) || /(^|\.)bambulab\.(com|cn)$/.test(url.hostname) || /\.amazonaws\.com$/.test(url.hostname));
  } catch { return false; }
}

/** Fecha de expiración según `expiresIn`, o leída del JWT (exp). */
export function tokenExpiry(token: string, expiresIn: number | null): Date | null {
  if (expiresIn) return new Date(Date.now() + expiresIn * 1000);
  const p = token.split('.'); if (p.length !== 3) return null;
  try { const j = JSON.parse(Buffer.from(p[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); return j.exp ? new Date(j.exp * 1000) : null; } catch { return null; }
}
