import { money } from './format';
import { tOr, type TFn } from '@/i18n/translate';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONEY = new Set(['total', 'suggested', 'final', 'amount', 'unitCost', 'costPerKg', 'commission', 'budget']);
/** Diccionario donde se traduce el valor de cada campo (estados, etapas, origen). */
const VALUE_NS: Record<string, string> = { status: 'status', from: 'status', to: 'status', stage: 'gallery.stage', source: 'sources' };

/** Detalle legible de un registro de auditoría: «campo: valor · …», con nombres traducidos y sin identificadores internos. */
export function auditDetail(changes: unknown, t: TFn): string {
  if (!changes || typeof changes !== 'object') return changes == null ? '' : String(changes);
  if (Array.isArray(changes)) return changes.map((k) => tOr(t, `audit.field.${k}`, String(k))).join(', ');
  const val = (k: string, v: unknown) =>
    v == null || v === '' ? '—'
    : typeof v === 'number' && MONEY.has(k) ? money(v)
    : typeof v === 'boolean' ? t(v ? 'audit.yes' : 'audit.no')
    : typeof v === 'string' && VALUE_NS[k] ? tOr(t, `${VALUE_NS[k]}.${v}`, v)
    : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return Object.entries(changes as Record<string, unknown>).filter(([, v]) => !(typeof v === 'string' && UUID.test(v)))
    .map(([k, v]) => `${tOr(t, `audit.field.${k}`, k)}: ${val(k, v)}`).join(' · ');
}
