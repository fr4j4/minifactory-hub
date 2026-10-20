import type { CalcContext } from '@/lib/context';
import type { LinkRow } from '@/actions/links';

/** Estado de una línea y su constructor. Sin 'use client': lo usan tanto páginas de servidor como componentes de cliente. */
export interface ItemState {
  uid: string; id?: string; kind: 'modelo' | 'placa' | 'manual' | 'producto'; description: string; qty: number; optional: boolean; groupName: string;
  materialId: string | null; color: string; machineId: string | null; processProfileId: string | null;
  mode: 'auto' | 'semi' | 'manual'; gramsTotal: number; hoursTotal: number; unitGrams: number; unitHours: number;
  origin: { grams?: string; hours?: string; runId?: string; engine?: string; note?: string; stale?: boolean; corrected?: boolean; file?: string };
  postMinutes: number; postSupplies: number; prepMinutes: number; shipping: number; finalUnit: number | null; sliceRunId: string | null; variantId: string | null;
  models: Array<{ modelFileId: string; fileVersionId?: string | null; qty: number; name: string }>; links: LinkRow[]; open: boolean;
}

let seq = 0;
export const uid = () => `i${Date.now().toString(36)}${seq++}`;
export function newItem(ctx: CalcContext, over: Partial<ItemState> = {}): ItemState {
  const m = ctx.machines.find((x) => x.tech === 'FDM' && !x.simulated) ?? ctx.machines[0];
  const mat = ctx.materials.find((x) => x.tech === 'fdm');
  return {
    uid: uid(), kind: 'manual', description: '', qty: 1, optional: false, groupName: '', materialId: mat?.id ?? null, color: mat?.colorName ?? '', machineId: m?.id ?? null,
    processProfileId: m?.defaultProcessProfileId ?? null, mode: 'manual', gramsTotal: 0, hoursTotal: 0, unitGrams: 0, unitHours: 0, origin: { grams: 'manual', hours: 'manual' },
    postMinutes: 0, postSupplies: 0, prepMinutes: ctx.rates.prepMinutes, shipping: 0, finalUnit: null, sliceRunId: null, variantId: null, models: [], links: [], open: true, ...over,
  };
}
