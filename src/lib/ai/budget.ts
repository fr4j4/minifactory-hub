import { and, eq, gte, sql } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { AIError } from './types';

/** USD por millón de tokens (entrada, salida). Referencial: se puede sobrescribir con AI_PRICES='{"modelo":[in,out]}'. Fuera de Anthropic cuestan 0 salvo que AI_PRICES lo indique. */
const PRICES: Array<[RegExp, [number, number]]> = [
  [/haiku/i, [1, 5]],
  [/sonnet/i, [3, 15]],
  [/opus|fable/i, [15, 75]],
];
export function priceOf(model: string, provider: string): [number, number] {
  try { const o = JSON.parse(process.env.AI_PRICES || '{}'); if (o[model]) return o[model]; } catch { /* sin sobreescritura */ }
  // Solo Anthropic tiene tarifas por defecto; en proveedores compatibles (Ollama, OpenRouter…) el costo es 0 salvo que se indique en AI_PRICES.
  if (provider !== 'anthropic') return [0, 0];
  return PRICES.find(([re]) => re.test(model))?.[1] ?? [3, 15];
}
export function costOf(model: string, provider: string, inTokens: number, outTokens: number) {
  const [i, o] = priceOf(model, provider); return (inTokens * i + outTokens * o) / 1_000_000;
}
/** Estimación gruesa de tokens (~4 caracteres por token) para mostrar costo antes de ejecutar. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); };
const dayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

export async function spendThisMonth(): Promise<{ costUsd: number; calls: number }> {
  const db = await getDb();
  const [r] = await db.select({ c: sql<number>`coalesce(sum(${s.aiCalls.costUsd}),0)`, n: sql<number>`count(*)::int` }).from(s.aiCalls)
    .where(and(eq(s.aiCalls.workspaceId, WORKSPACE_ID), gte(s.aiCalls.createdAt, monthStart()), eq(s.aiCalls.cacheHit, false)));
  return { costUsd: Number(r.c), calls: Number(r.n) };
}

/** Lanza AIError('budget') si se alcanzó el tope mensual (con hardStop) o el límite diario del usuario. */
export async function assertBudget(b: { monthlyUsd: number | null; perUserDailyCalls: number; hardStop: boolean }, userId?: string | null) {
  const db = await getDb();
  if (b.hardStop && b.monthlyUsd != null) {
    const { costUsd } = await spendThisMonth();
    if (costUsd >= b.monthlyUsd) throw new AIError('ai.err.budgetMonthly', 'budget', { params: { usd: b.monthlyUsd.toFixed(2) } });
  }
  if (userId && b.perUserDailyCalls > 0) {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(s.aiCalls)
      .where(and(eq(s.aiCalls.workspaceId, WORKSPACE_ID), eq(s.aiCalls.userId, userId), gte(s.aiCalls.createdAt, dayStart()), eq(s.aiCalls.cacheHit, false)));
    if (Number(r.n) >= b.perUserDailyCalls) throw new AIError('ai.err.budgetDaily', 'budget');
  }
}
