'use server';
import { and, eq } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { requirePerm } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { safe } from './common';
import { parseCsv } from '@/lib/csv';

export interface CustomerInput { id?: string; type: string; name: string; phone?: string; email?: string; taxId?: string; addresses?: Array<{ label: string; text: string }>; priceListId?: string | null; photoConsent: string; tags?: string[]; notes?: string; depositPct?: number | null }
export async function saveCustomerAction(i: CustomerInput) {
  return safe(async () => {
    const u = await requirePerm('clientes', i.id ? 'E' : 'C'); const db = await getDb();
    if (!i.name.trim()) throw new Error('El nombre es obligatorio');
    const v = { type: i.type, name: i.name.trim(), phone: i.phone || null, email: i.email || null, taxId: i.taxId || null, addresses: i.addresses ?? [], priceListId: i.priceListId || null, photoConsent: i.photoConsent, tags: i.tags ?? [], notes: i.notes || null, depositPct: i.depositPct ?? null, isOccasional: false, updatedAt: new Date() };
    if (i.id) { await db.update(s.customers).set(v).where(eq(s.customers.id, i.id)); await audit('customer', i.id, 'editar', {}, u.id); return i.id; }
    const [c] = await db.insert(s.customers).values({ workspaceId: WORKSPACE_ID, createdBy: u.id, ...v }).returning({ id: s.customers.id });
    await audit('customer', c.id, 'crear', { name: i.name }, u.id); return c.id;
  }, ['/clientes']);
}

/** Importa clientes desde CSV (columnas: nombre, telefono, email, rut, tipo, etiquetas). */
export async function importCustomersAction(csv: string) {
  return safe(async () => {
    const u = await requirePerm('clientes', 'C'); const db = await getDb();
    const rows = parseCsv(csv); if (rows.length < 2) throw new Error('El CSV está vacío');
    const head = rows[0].map((h) => h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
    const col = (names: string[]) => head.findIndex((h) => names.includes(h));
    const iN = col(['nombre', 'name', 'razon social']), iP = col(['telefono', 'phone', 'whatsapp', 'celular']), iE = col(['email', 'correo']), iR = col(['rut', 'id tributario', 'tax_id']), iT = col(['tipo', 'type']), iG = col(['etiquetas', 'tags']);
    if (iN < 0) throw new Error('Falta la columna “nombre”');
    let created = 0, skipped = 0;
    for (const r of rows.slice(1)) {
      const name = r[iN]?.trim(); if (!name) { skipped++; continue; }
      const phone = iP >= 0 ? r[iP]?.trim() : '';
      const [dup] = await db.select({ id: s.customers.id }).from(s.customers).where(and(eq(s.customers.name, name))).limit(1);
      if (dup) { skipped++; continue; }
      const type = iT >= 0 && ['particular', 'empresa', 'revendedor'].includes(r[iT]?.trim().toLowerCase()) ? r[iT].trim().toLowerCase() : 'particular';
      await db.insert(s.customers).values({ workspaceId: WORKSPACE_ID, name, phone: phone || null, email: iE >= 0 ? r[iE]?.trim() || null : null, taxId: iR >= 0 ? r[iR]?.trim() || null : null, type, tags: iG >= 0 && r[iG] ? r[iG].split(/[;|]/).map((t) => t.trim()).filter(Boolean) : [], createdBy: u.id });
      created++;
    }
    return { created, skipped };
  }, ['/clientes']);
}

