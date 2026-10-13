'use server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { createSession, destroySession, loginFailed, loginOk, loginThrottled, verifyPassword } from '@/lib/auth';
import { bootstrap } from '@/lib/seed';
import { getT } from '@/i18n/server';

export async function loginAction(_prev: { error?: string } | undefined, fd: FormData): Promise<{ error?: string }> {
  const t = await getT();
  const email = String(fd.get('email') ?? '').trim().toLowerCase();
  const password = String(fd.get('password') ?? '');
  const ip = (await headers()).get('x-forwarded-for') ?? 'local';
  const key = `${ip}|${email}`;
  if (loginThrottled(key)) return { error: t('auth.throttled') };
  await bootstrap(); // primer arranque: crea taller y administrador si la base está vacía
  const db = await getDb();
  const [u] = await db.select().from(s.users).where(eq(s.users.email, email));
  if (!u || !u.active || !(await verifyPassword(u.passwordHash, password))) { loginFailed(key); return { error: t('auth.invalidCredentials') }; }
  loginOk(key);
  await createSession(u.id);
  redirect(String(fd.get('next') || '/') || '/');
}

export async function logoutAction() { await destroySession(); redirect('/login'); }
