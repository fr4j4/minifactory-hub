import { eq, and, sql } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import type { Rates } from './pricing';
import { DEFAULT_AI, type AiSettings } from './ai/types';
import type { DocTemplate } from './documents';

export interface AppSettings {
  shop: { name: string; legalName: string; taxId: string; address: string; phone: string; email: string; logoKey?: string; currency: string; timezone: string; lang: string; brandColor: string; /** paleta por defecto de la interfaz (cada persona puede elegir otra en su navegador) */ palette?: string };
  rates: Rates;
  quoteValidDays: number;
  /** días después de enviar un presupuesto en que se avisa para hacer seguimiento (vacío = sin avisos) */
  quoteFollowUpDays: number[];
  reservationDays: number;
  minDepositPct: number;
  numbering: { quote: string; order: string; sale: string; job: string; production: string };
  templates: { terms: string; whatsappQuote: string; whatsappReady: string; whatsappShipped: string };
  workHours: { start: string; end: string; days: number[]; holidays: string[] };
  defaults: { processProfileId?: string; infillPct: number; failRatePct: number };
  watermark: { enabled: boolean; opacity: number; position: string };
  ai: AiSettings;
  /** Asistente de configuración inicial (N10). `pending` = cuenta creada pero asistente sin terminar. */
  documents: { quote: Partial<DocTemplate> };
  setup: { pending: boolean; mode?: 'rapido' | 'completo'; completedAt: string | null; steps: Record<string, 'hecho' | 'omitido'>; tokenHash: string };
}

export const DEFAULT_SETTINGS: AppSettings = {
  shop: { name: 'MiniFactory', legalName: '', taxId: '', address: '', phone: '', email: '', currency: 'CLP', timezone: 'America/Santiago', lang: 'es-CL', brandColor: '#1d62f0' },
  rates: {
    kwh: 180, laborHour: 6000, wastePct: 8, failRatePct: 5, marginPct: 70, marginByCategory: {},
    minPrice: 3000, minMarginPct: 25, rounding: { mode: 'step', step: 100 }, taxPct: 19, taxMode: 'incluido',
    urgency: [{ key: 'normal', label: 'Normal', pct: 0 }, { key: '48h', label: 'Urgente 48 h', pct: 25 }, { key: '24h', label: 'Urgente 24 h', pct: 50 }],
    volumeTiers: [{ minQty: 10, pct: -10 }, { minQty: 50, pct: -20 }], prepMinutes: 10,
  },
  quoteValidDays: 15, quoteFollowUpDays: [3, 7], reservationDays: 15, minDepositPct: 50,
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
  documents: { quote: {} },
  setup: { pending: false, completedAt: null, steps: {}, tokenHash: '' },
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
  return merge(DEFAULT_SETTINGS, row?.data ?? {});
}
/** Ajustes seguros para páginas y componentes: sin la clave de IA. */
export async function getSettings(): Promise<AppSettings> {
  const st = await getSettingsRaw();
  return { ...st, ai: { ...st.ai, apiKeySealed: '' }, setup: { ...st.setup, tokenHash: '' } };
}
export async function saveSettings(patch: Partial<AppSettings>) {
  const db = await getDb();
  const cur = await getSettingsRaw();
  const next = merge(cur, patch);
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
