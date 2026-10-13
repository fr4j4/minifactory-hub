import { and, eq, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { audit } from '../audit';
import { LocalizedError } from '@/i18n/errors';
import type { Module } from '../perm';
import { recomputePaid } from './orders';

/**
 * Edición de campos de registros ya creados. Cada tipo declara qué campos admite y de qué tipo son:
 * `s` texto opcional, `r` texto obligatorio, `n` número, `d` fecha (AAAA-MM-DD), y una lista = valor entre opciones.
 * Lo que no está en la lista se ignora, así que el cliente no puede tocar totales, estados ni claves.
 */
type Spec = 's' | 'r' | 'n' | 'N' | 'd' | readonly string[];
export const EDIT_SPEC = {
  payment: { module: 'pagos', fields: { amount: 'N', method: ['transferencia', 'efectivo', 'tarjeta', 'marketplace', 'otro'], paidAt: 'd', note: 's', taxDocType: ['', 'boleta', 'factura'], taxDocFolio: 's' } },
  order: { module: 'pedidos', fields: { title: 's', customerName: 's', customerPhone: 's', source: ['', 'whatsapp', 'instagram', 'facebook', 'correo', 'marketplace', 'feria', 'presencial', 'recomendacion', 'otro'], dueDate: 'd', priority: ['normal', 'alta', 'baja'], shipMethod: ['retiro', 'despacho'], shipAddress: 's', tracking: 's', notes: 's' } },
  sale: { module: 'ventas', fields: { customerName: 's', date: 'd', externalOrder: 's', shipBy: 'd', tracking: 's', notes: 's' } },
  spool: { module: 'inventario', fields: { lot: 's', boughtAt: 'd', unitCost: 'n' } },
  plan: { module: 'maquinas', fields: { task: 'r', intervalHours: 'n', intervalDays: 'n' } },
  incident: { module: 'maquinas', fields: { kind: ['atasco', 'desnivel', 'capa_desplazada', 'otro'], description: 'r' } },
  collection: { module: 'galeria', fields: { name: 'r', description: 's' } },
  contact: { module: 'pedidos', fields: { channel: ['whatsapp', 'instagram', 'facebook', 'correo', 'marketplace', 'feria', 'presencial', 'recomendacion', 'otro'], summary: 'r' } },
} as const satisfies Record<string, { module: Module; fields: Record<string, Spec> }>;
export type EditKind = keyof typeof EDIT_SPEC;
export const isEditable = (k: string): k is EditKind => k in EDIT_SPEC;

const TABLE = { payment: s.payments, order: s.orders, sale: s.sales, spool: s.spools, plan: s.maintenancePlans, incident: s.incidents, collection: s.collections, contact: s.contactLog } as const;

function clean(spec: Record<string, Spec>, input: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, sp] of Object.entries(spec)) {
    if (!(k in input)) continue; const raw = input[k];
    if (Array.isArray(sp)) { const v = String(raw ?? ''); if (!sp.includes(v)) throw new LocalizedError('edit.invalid'); out[k] = v === '' ? null : v; continue; }
    if (sp === 'n' || sp === 'N') {
      if (raw === '' || raw == null) { if (sp === 'N') throw new LocalizedError('edit.invalid'); out[k] = null; continue; }
      const v = Number(raw); if (!Number.isFinite(v) || v < 0 || (sp === 'N' && v <= 0)) throw new LocalizedError('edit.invalid'); out[k] = v; continue;
    }
    const v = String(raw ?? '').trim();
    if (sp === 'r') { if (!v) throw new LocalizedError('edit.required'); out[k] = v; continue; }
    if (sp === 'd') { if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new LocalizedError('edit.invalid'); out[k] = v || null; continue; }
    out[k] = v || null;
  }
  return out;
}

/** Aplica los cambios permitidos a un registro y deja constancia en la auditoría. */
export async function editRecord(kind: EditKind, id: string, input: Record<string, unknown>, userId?: string | null) {
  const db = await getDb(); const spec = EDIT_SPEC[kind]; const patch = clean(spec.fields, input);
  if (kind === 'plan' && 'intervalHours' in patch && 'intervalDays' in patch && patch.intervalHours == null && patch.intervalDays == null) throw new LocalizedError('edit.planNeedsInterval');
  if ((kind === 'payment' && 'paidAt' in patch && !patch.paidAt) || (kind === 'sale' && 'date' in patch && !patch.date)) throw new LocalizedError('edit.required');
  if (kind === 'payment' && patch.taxDocType == null) patch.taxDocFolio = null;
  if (!Object.keys(patch).length) return;
  const table = TABLE[kind] as any;
  const [row] = await db.select().from(table).where(and(eq(table.id, id), isNull(table.deletedAt)));
  if (!row) throw new LocalizedError('remove.notFound');
  if (kind === 'order' && (row as any).status === 'cancelado') throw new LocalizedError('edit.orderCancelled');
  if (kind === 'sale' && (row as any).status === 'anulada') throw new LocalizedError('edit.saleVoided');
  const set: Record<string, unknown> = { ...patch };
  if ('updatedAt' in table) set.updatedAt = new Date();
  await db.update(table).set(set).where(eq(table.id, id));
  if (kind === 'payment') { const p = row as typeof s.payments.$inferSelect; await recomputePaid(db, { orderId: p.orderId, saleId: p.saleId }); }
  await audit(kind, id, 'editar', patch, userId);
}
