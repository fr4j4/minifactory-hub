import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq, and, gt } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { can, type Action, type Module, type Role } from './perm';
import { sessionSecret } from './config';
import { getT } from '@/i18n/server';

const COOKIE = 'mf_session';
const TTL_MS = 1000 * 60 * 60 * 24 * 14;

export interface SessionUser {
  id: string; email: string; name: string; role: Role;
  permOverrides: Record<string, string>; notifPrefs: Record<string, boolean>; workspaceId: string; calcLevel: 'basico' | 'avanzado';
}

export async function hashPassword(pw: string) {
  const { hash } = await import('@node-rs/argon2');
  return hash(pw);
}
export async function verifyPassword(hashStr: string, pw: string) {
  const { verify } = await import('@node-rs/argon2');
  try { return await verify(hashStr, pw); } catch { return false; }
}

/* limitación de intentos de inicio de sesión (en memoria) */
const attempts = new Map<string, { n: number; first: number }>();
export function loginThrottled(key: string) {
  const a = attempts.get(key);
  if (!a) return false;
  if (Date.now() - a.first > 15 * 60_000) { attempts.delete(key); return false; }
  return a.n >= 8;
}
export function loginFailed(key: string) {
  const now = Date.now();
  for (const [k, v] of attempts) if (now - v.first > 15 * 60_000) attempts.delete(k); // poda: el mapa no crece sin límite
  const a = attempts.get(key);
  if (!a || Date.now() - a.first > 15 * 60_000) attempts.set(key, { n: 1, first: Date.now() });
  else a.n++;
}
export function loginOk(key: string) { attempts.delete(key); }
/*
 * Navegador de confianza: donde ya se inició sesión con ese correo queda una cookie firmada y su contador de intentos es otro.
 * Así quien prueba claves desde otro equipo no bloquea al dueño de la cuenta (no hay IP de confianza: x-forwarded-for lo pone el cliente).
 */
const DEV_COOKIE = 'mf_dev';
const deviceTag = (email: string) => crypto.createHmac('sha256', sessionSecret()).update(`login-device:${email}`).digest('base64url');
export function loginKeyFor(email: string, deviceCookie?: string) {
  const a = Buffer.from(deviceCookie ?? ''), b = Buffer.from(deviceTag(email));
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? `login|${email}|dev` : `login|${email}`;
}
export async function loginKey(email: string) { return loginKeyFor(email, (await cookies()).get(DEV_COOKIE)?.value); }
export async function rememberDevice(email: string) {
  (await cookies()).set(DEV_COOKIE, deviceTag(email), { httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === '1', path: '/', maxAge: 60 * 60 * 24 * 365 });
}
/** Destino tras iniciar sesión: solo rutas internas («/x», no «//host», «/\\host» ni caracteres de control que el navegador descarta). */
export function safeNextPath(next: unknown) {
  const n = String(next ?? '');
  return /^\/(?![\/\\])[^\x00-\x1f]*$/.test(n) ? n : '/';
}

export async function createSession(userId: string) {
  const db = await getDb();
  const id = crypto.randomBytes(32).toString('base64url');
  await db.insert(s.sessions).values({ id, userId, expiresAt: new Date(Date.now() + TTL_MS) });
  const jar = await cookies();
  jar.set(COOKIE, id, { httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === '1', path: '/', maxAge: TTL_MS / 1000 });
}
export async function destroySession() {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (id) { const db = await getDb(); await db.delete(s.sessions).where(eq(s.sessions.id, id)); }
  jar.delete(COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (!id) return null;
  const db = await getDb();
  const rows = await db.select({
    id: s.users.id, email: s.users.email, name: s.users.name, role: s.users.role, active: s.users.active,
    permOverrides: s.users.permOverrides, notifPrefs: s.users.notifPrefs, workspaceId: s.users.workspaceId, calcLevel: s.users.calcLevel,
  }).from(s.sessions).innerJoin(s.users, eq(s.users.id, s.sessions.userId))
    .where(and(eq(s.sessions.id, id), gt(s.sessions.expiresAt, new Date())));
  const u = rows[0];
  if (!u || !u.active) return null;
  return { ...u, role: u.role as Role, permOverrides: u.permOverrides ?? {}, notifPrefs: u.notifPrefs ?? {}, calcLevel: u.calcLevel === 'avanzado' ? 'avanzado' : 'basico' };
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getSession();
  if (!u) redirect('/login');
  return u;
}
/** Verifica permiso en el servidor; si falla redirige (páginas) o lanza (acciones). */
export async function requirePerm(mod: Module, action: Action = 'V'): Promise<SessionUser> {
  const t = await getT();
  const u = await requireUser();
  if (!can(u, mod, action)) throw new Error(t('auth.noPermission', { mod, action }));
  return u;
}
export async function pagePerm(mod: Module, action: Action = 'V'): Promise<SessionUser> {
  const u = await requireUser();
  if (!can(u, mod, action)) redirect('/?sin_permiso=' + mod);
  return u;
}
export const wid = () => WORKSPACE_ID;
