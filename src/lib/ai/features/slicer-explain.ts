import { z } from 'zod';
import { runTask, type RunContext } from '../run';
import { dataBlock, replyLanguage, UNTRUSTED_NOTE } from './shared';
import type { Locale } from '@/i18n/config';

export const PROMPT_VERSION = 'slicer-explain@1';
export const ExplainOut = z.object({
  summary: z.string().min(1).max(400),
  steps: z.array(z.string().min(1).max(240)).min(1).max(5),
});
export type ExplainOutput = z.infer<typeof ExplainOut>;

/** Explica un error de laminado desconocido (el caso conocido se resuelve con reglas, sin IA). */
export async function explainSliceErrorAi(i: { error: string; code: string | null; dims?: number[] | null; volume?: number[] | null; copies: number; changedKeys: string[]; locale: Locale }, ctx: RunContext) {
  const r = await runTask({
    feature: 'slicer.explain', tier: 'fast', maxOutputTokens: 600,
    system: `Eres un asistente de un taller de impresión 3D FDM que usa OrcaSlicer. Explica por qué falló el laminado y qué hacer, en ${replyLanguage(i.locale)}, con pasos concretos y cortos (máximo 5). No inventes valores: si no estás seguro, dilo. ${UNTRUSTED_NOTE}`,
    user: dataBlock('laminado', { error: i.error.slice(0, 500), codigo: i.code, pieza_mm: i.dims ?? null, volumen_mm: i.volume ?? null, copias: i.copies, parametros_modificados: i.changedKeys.slice(0, 40) }),
    schema: ExplainOut,
  }, { ...ctx, promptVersion: PROMPT_VERSION });
  return { ...r.data, costUsd: r.costUsd, cached: r.cacheHit };
}
