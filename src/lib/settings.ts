import { eq, and, sql, isNull } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import type { CalcProfile, Rates } from './pricing';
import { DEFAULT_RATES } from './calc-defaults';
import { DEFAULT_CALC_PROFILES } from './calc-presets';
import { DEFAULT_AI, type AiSettings } from './ai/types';

export interface AppSettings {
  shop: { name: string; legalName: string; taxId: string; address: string; phone: string; email: string; logoKey?: string; currency: string; timezone: string; lang: string; brandColor: string };
  rates: Rates;
  quoteValidDays: number;
  reservationDays: number;
  minDepositPct: number;
  numbering: { quote: string; order: string; sale: string; job: string; production: string };
  templates: { terms: string; whatsappQuote: string; whatsappReady: string; whatsappShipped: string };
  workHours: { start: string; end: string; days: number[]; holidays: string[] };
  defaults: { processProfileId?: string; infillPct: number; failRatePct: number };
  watermark: { enabled: boolean; opacity: number; position: string };
  ai: AiSettings;
  calcProfiles: CalcProfile[];
  calcSetup: { done: boolean; preset?: string };
}

export const DEFAULT_SETTINGS: AppSettings = {
  shop: { name: 'MiniFactory', legalName: '', taxId: '', address: '', phone: '', email: '', currency: 'CLP', timezone: 'America/Santiago', lang: 'es-CL', brandColor: '#1d62f0' },
  rates: DEFAULT_RATES,
  quoteValidDays: 15, reservationDays: 15, minDepositPct: 50,
  numbering: { quote: 'P-{YYYY}-{NNNN}', order: 'OT-{YYYY}-{NNNN}', sale: 'V-{YYYY}-{NNNN}', job: 'T-{YYYY}-{NNNN}', production: 'OP-{YYYY}-{NNNN}' },
  templates: {
    terms: 'Precios en pesos chilenos. Vigencia del presupuesto según fecha indicada. Plazo de entrega a contar de la confirmación del pedido y el abono. Los colores pueden variar levemente según el lote del material. Piezas funcionales: el taller no se responsabiliza por usos estructurales o de seguridad no informados.',
    whatsappQuote: 'Hola {cliente}, te envío el presupuesto {numero} por {total}. Vigencia hasta {vigencia}. ¿Lo confirmamos?',
    whatsappReady: 'Hola {cliente}, tu pedido {numero} está listo para retiro/despacho. ¡Gracias!',
    whatsappShipped: 'Hola {cliente}, despachamos tu pedido {numero}. Seguimiento: {seguimiento}.',
  },
  workHours: { start: '09:00', end: '19:00', days: [1, 2, 3, 4, 5, 6], holidays: [] },
  defaults: { infillPct: 15, failRatePct: 5 },
  watermark: { enabled: false, opacity: 0.4, position: 'abajo-derecha' },
  ai: DEFAULT_AI,
  calcProfiles: DEFAULT_CALC_PROFILES,
  calcSetup: { done: false },
};

function merge<T>(base: T, over: any): T {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return (over === undefined ? base : over) as T;
  const out: any = { ...base };
  for (const k of Object.keys(over ?? {})) {
    out[k] = typeof (base as any)[k] === 'object' && !Array.isArray((base as any)[k]) && (base as any)[k] !== null
      ? merge((base as any)[k], over[k]) : over[k];
  }
  return out;
}

/** Ajustes completos, con la clave de IA cifrada. Solo para uso interno del servidor (nunca pasarlos a componentes de cliente). */
export async function getSettingsRaw(): Promise<AppSettings> {
  const db = await getDb();
  const [row] = await db.select().from(s.settings).where(eq(s.settings.workspaceId, WORKSPACE_ID));
  const data: any = row?.data ?? {};
  // cuentas anteriores a la calculadora v2 siguen con la fórmula antigua hasta que el administrador migre
  if (data.rates && data.rates.engine === undefined) data.rates = { ...data.rates, engine: 'legacy' };
  return merge(DEFAULT_SETTINGS, data);
}
/** Ajustes seguros para páginas y componentes: sin la clave de IA. */
export async function getSettings(): Promise<AppSettings> {
  const st = await getSettingsRaw();
  return { ...st, ai: { ...st.ai, apiKeySealed: '' } };
}
export async function saveSettings(patch: Partial<AppSettings>) {
  const db = await getDb();
  const cur = await getSettingsRaw();
  const next = merge(cur, patch);
  // las tarifas se envían completas: se reemplazan (un merge profundo no podría quitar claves, p. ej. un riesgo por material)
  if (patch.rates) next.rates = { ...cur.rates, ...patch.rates };
  await db.insert(s.settings).values({ workspaceId: WORKSPACE_ID, data: next as any })
    .onConflictDoUpdate({ target: s.settings.workspaceId, set: { data: next as any, updatedAt: new Date() } });
  return next;
}

/** Numeración de documentos: P-2026-0001, OT-2026-0001… reinicia cada año. */
export async function nextNumber(kind: keyof AppSettings['numbering'], tx?: any): Promise<string> {
  const db = tx ?? (await getDb());
  const st = await getSettings();
  const year = new Date().getFullYear();
  const res = await db.execute(sql`
    insert into sequences (workspace_id, key, year, value) values (${WORKSPACE_ID}, ${kind}, ${year}, 1)
    on conflict (workspace_id, key, year) do update set value = sequences.value + 1
    returning value`);
  const rows = (res as any).rows ?? res;
  const n = Number(rows[0].value);
  return st.numbering[kind].replace('{YYYY}', String(year)).replace(/\{N+\}/, (m: string) => String(n).padStart(m.length - 2, '0'));
}

export const fmtMoney = (n: number | null | undefined, cur = 'CLP') =>
  n == null ? '—' : new Intl.NumberFormat('es-CL', { style: 'currency', currency: cur, maximumFractionDigits: cur === 'CLP' ? 0 : 2 }).format(n);

/** Tarifas con el número de máquinas activas (los costos fijos se reparten entre todas). */
export async function getRates(): Promise<Rates> {
  const db = await getDb(); const st = await getSettings();
  const ms = await db.select({ sim: s.machines.simulated }).from(s.machines).where(isNull(s.machines.deletedAt));
  return { ...st.rates, machineCount: Math.max(1, ms.filter((m) => !m.sim).length) };
}
