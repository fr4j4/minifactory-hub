import crypto from 'node:crypto';
import { sql } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { getSettingsRaw, saveSettings } from './settings';

/** Pasos del asistente inicial (N10). Los obligatorios se resuelven en la primera fase; el resto es opcional y queda en la lista de puesta en marcha. */
export const SETUP_STEPS = ['fiscal', 'brand', 'documents', 'rates', 'machines', 'slicer', 'materials', 'team', 'channels', 'ai', 'demo'] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];
/** Destino de cada paso opcional que ya tiene su propia pantalla. */
export const SETUP_LINKS: Record<Exclude<SetupStep, 'fiscal' | 'brand'>, string> = {
  documents: '/configuracion', rates: '/calculadora', machines: '/maquinas', slicer: '/laminador', materials: '/inventario', team: '/configuracion', channels: '/configuracion', ai: '/configuracion', demo: '/configuracion',
};

const hash = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

export async function hasUsers() {
  const db = await getDb();
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(s.users);
  return Number(r.n) > 0;
}
/** Hay que mostrar el asistente: no existe ninguna cuenta, o la cuenta se creó pero el asistente no terminó. */
export async function needsSetup() {
  if (!(await hasUsers())) return true;
  return (await getSettingsRaw()).setup.pending;
}

/** Genera un token de un solo uso; solo se guarda su hash. Se imprime una vez en el registro del servidor. */
export async function issueSetupToken(print = true) {
  const token = crypto.randomBytes(9).toString('base64url').replace(/[-_]/g, 'x').slice(0, 12).toUpperCase();
  await saveSettings({ setup: { tokenHash: hash(token) } as any });
  if (print) console.log(`\n  ┌─ MiniFactory · configuración inicial ─────────────────\n  │ Abre /bienvenida e ingresa este código: ${token}\n  │ (de un solo uso; se regenera en cada arranque mientras no haya cuentas)\n  └───────────────────────────────────────────────────────\n`);
  return token;
}
export async function ensureSetupToken(print = true) {
  if (await hasUsers()) return;
  if (!(await getSettingsRaw()).setup.tokenHash) await issueSetupToken(print);
}
export async function checkSetupToken(token: string) {
  const h = (await getSettingsRaw()).setup.tokenHash;
  const a = Buffer.from(h), b = Buffer.from(hash(token.trim().toUpperCase()));
  return !!h && a.length === b.length && crypto.timingSafeEqual(a, b);
}
export async function markStep(step: SetupStep, state: 'hecho' | 'omitido') {
  const st = await getSettingsRaw();
  await saveSettings({ setup: { ...st.setup, steps: { ...st.setup.steps, [step]: state } } });
}
export async function completeSetup() {
  const st = await getSettingsRaw();
  await saveSettings({ setup: { ...st.setup, pending: false, completedAt: new Date().toISOString(), tokenHash: '' } });
}
