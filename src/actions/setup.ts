'use server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { z } from 'zod';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { createSession, hashPassword, loginFailed, loginOk, loginThrottled, requireUser } from '@/lib/auth';
import { bootstrap } from '@/lib/seed';
import { getSettingsRaw, saveSettings } from '@/lib/settings';
import { checkSetupToken, completeSetup, hasUsers, markStep, SETUP_STEPS, type SetupStep } from '@/lib/setup';
import { getT } from '@/i18n/server';

type R = { error?: string; ok?: boolean };
const ipKey = async () => `setup|${(await headers()).get('x-forwarded-for') ?? 'local'}`;

/** Paso 0: verifica el token impreso en el registro del servidor. */
export async function checkTokenAction(token: string): Promise<R> {
  const t = await getT();
  if (await hasUsers()) return { error: t('setup.alreadyDone') };
  const key = await ipKey();
  if (loginThrottled(key)) return { error: t('auth.throttled') };
  if (!(await checkSetupToken(token))) { loginFailed(key); return { error: t('setup.badToken') }; }
  loginOk(key);
  return { ok: true };
}

const Account = z.object({
  token: z.string(), lang: z.enum(['es-CL', 'en-US']), currency: z.enum(['CLP', 'USD', 'EUR']), timezone: z.string().min(1),
  name: z.string().trim().min(2), email: z.string().trim().toLowerCase().email(), password: z.string().min(10),
  shopName: z.string().trim().min(2),
});
/** Pasos 1–3: región, cuenta de administrador y nombre del taller. Una sola transacción lógica; invalida el token. */
export async function createAccountAction(input: unknown): Promise<R> {
  const t = await getT();
  if (await hasUsers()) return { error: t('setup.alreadyDone') };
  const key = await ipKey();
  if (loginThrottled(key)) return { error: t('auth.throttled') };
  const p = Account.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.path[0] === 'password' ? t('setup.weakPassword') : t('setup.invalidData') };
  const d = p.data;
  if (!(await checkSetupToken(d.token))) { loginFailed(key); return { error: t('setup.badToken') }; }
  await bootstrap({ shopName: d.shopName }); // taller, canales y listas de precios (sin cuenta: no hay contraseña por entorno)
  const db = await getDb();
  const [u] = await db.insert(s.users).values({ workspaceId: WORKSPACE_ID, email: d.email, name: d.name, role: 'admin', passwordHash: await hashPassword(d.password) }).returning({ id: s.users.id });
  const st = await getSettingsRaw();
  await saveSettings({ shop: { ...st.shop, name: d.shopName, lang: d.lang, currency: d.currency, timezone: d.timezone }, setup: { ...st.setup, pending: true, tokenHash: '' } });
  await createSession(u.id);
  loginOk(key);
  return { ok: true };
}

const Fiscal = z.object({ legalName: z.string().trim().max(200), taxId: z.string().trim().max(40), address: z.string().trim().max(300), phone: z.string().trim().max(40), email: z.string().trim().max(200), });
const Brand = z.object({ brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/) });

/** Pasos opcionales con formulario propio (fiscal, marca). El resto enlaza a su pantalla y solo se marca. */
export async function saveSetupStepAction(step: SetupStep, input: unknown): Promise<R> {
  const t = await getT();
  const u = await requireUser();
  if (u.role !== 'admin') return { error: t('auth.noPermission', { mod: 'config', action: 'E' }) };
  if (!(SETUP_STEPS as readonly string[]).includes(step)) return { error: t('setup.invalidData') };
  const st = await getSettingsRaw();
  if (step === 'fiscal') { const p = Fiscal.safeParse(input); if (!p.success) return { error: t('setup.invalidData') }; await saveSettings({ shop: { ...st.shop, ...p.data } }); }
  else if (step === 'brand') { const p = Brand.safeParse(input); if (!p.success) return { error: t('setup.invalidData') }; await saveSettings({ shop: { ...st.shop, ...p.data } }); }
  await markStep(step, 'hecho');
  return { ok: true };
}
export async function skipSetupStepAction(step: SetupStep): Promise<R> {
  const u = await requireUser(); if (u.role !== 'admin') return { error: 'forbidden' };
  if (!(SETUP_STEPS as readonly string[]).includes(step)) return { error: 'invalid' };
  await markStep(step, 'omitido');
  return { ok: true };
}
export async function finishSetupAction() {
  const u = await requireUser(); if (u.role !== 'admin') redirect('/');
  await completeSetup();
  redirect('/');
}
