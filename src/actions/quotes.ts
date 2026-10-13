'use server';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { requirePerm } from '@/lib/auth';
import { canSetFinalPrice } from '@/lib/perm';
import { approveQuote, planProduction } from '@/lib/services/orders';
import { newQuoteVersion, rejectQuote, saveQuote, sendQuote, type QuoteInput } from '@/lib/services/quotes';
import { safe } from './common';

export async function saveQuoteAction(input: QuoteInput) {
  return safe(async () => {
    const u = await requirePerm('presupuestos', input.id ? 'E' : 'C');
    if (!canSetFinalPrice(u)) { for (const it of input.items) it.finalUnit = null; input.finalTotal = null; }
    return saveQuote(input, u);
  }, ['/presupuestos']);
}
export async function sendQuoteAction(id: string) { return safe(async () => { const u = await requirePerm('presupuestos', 'E'); await sendQuote(id, u.id); }, ['/presupuestos', `/presupuestos/${id}`]); }
export async function rejectQuoteAction(id: string, reason: string) { return safe(async () => { const u = await requirePerm('presupuestos', 'E'); await rejectQuote(id, reason, u.id); }, ['/presupuestos', `/presupuestos/${id}`]); }
export async function newVersionAction(id: string, recalc = false) { return safe(async () => { const u = await requirePerm('presupuestos', 'C'); return newQuoteVersion(id, u, recalc); }, ['/presupuestos']); }
export async function approveQuoteAction(id: string, i: { by: string; channel: string; depositAmount?: number; depositMethod?: string; dueDate?: string | null; plan?: boolean }) {
  return safe(async () => {
    const u = await requirePerm('pedidos', 'C'); await requirePerm('presupuestos', 'E');
    if (!i.by.trim()) throw new Error('Indica quién aprobó el presupuesto');
    const orderId = await approveQuote(id, { by: i.by, channel: i.channel, deposit: i.depositAmount ? { amount: i.depositAmount, method: i.depositMethod ?? 'transferencia' } : null, dueDate: i.dueDate }, u);
    if (i.plan) await planProduction(orderId, u);
    return orderId;
  }, ['/presupuestos', '/pedidos', `/presupuestos/${id}`]);
}

export interface ModelBrief { id: string; name: string; versionId: string; format: string; dimX: number | null; dimY: number | null; dimZ: number | null; volumeCm3: number | null; areaCm2: number | null; hasSliced: boolean; sliced: { timeS: number | null; totalG: number | null; filaments: Array<{ g: number | null; color?: string }>; slicer: string | null; notes: string[]; layers: number | null } | null; thumb: boolean }
export async function modelBriefAction(modelFileId: string) {
  return safe(async (): Promise<ModelBrief> => {
    await requirePerm('archivos', 'V'); const db = await getDb();
    const [m] = await db.select().from(s.modelFiles).where(eq(s.modelFiles.id, modelFileId));
    if (!m?.currentVersionId) throw new Error('Archivo no encontrado');
    const [v] = await db.select().from(s.fileVersions).where(eq(s.fileVersions.id, m.currentVersionId));
    const meta: any = v?.meta ?? {}; const sm = meta.sliced;
    return { id: m.id, name: m.name, versionId: v.id, format: m.format ?? '', dimX: m.dimX, dimY: m.dimY, dimZ: m.dimZ, volumeCm3: m.volumeCm3, areaCm2: m.areaCm2, hasSliced: !!meta.hasSlicedData, sliced: sm ? { timeS: sm.timeS, totalG: sm.totalG, filaments: sm.filaments ?? [], slicer: sm.slicer, notes: sm.notes ?? [], layers: sm.layers } : null, thumb: !!v.thumbKey };
  });
}
