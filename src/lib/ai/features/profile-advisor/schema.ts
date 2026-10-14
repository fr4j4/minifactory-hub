import { z } from 'zod';

const Level = z.enum(['-', '=', '+']);
export const CandidateOut = z.object({
  name: z.enum(['conservador', 'equilibrado', 'agresivo']),
  summary: z.string().min(1).max(280),
  changes: z.array(z.object({
    scope: z.enum(['process', 'filament']),
    key: z.string().max(80),
    to: z.union([z.string().max(60), z.number()]),
    reason: z.string().max(240),
    evidence: z.string().max(200),
  })).min(1).max(12),
  expected: z.object({ time: Level, material: Level, strength: Level, quality: Level }),
  risks: z.array(z.string().max(200)).max(4),
});
export const AdvisorOut = z.object({
  diagnosis: z.array(z.object({ cause: z.string().max(120), likelihood: z.number().min(0).max(1), why: z.string().max(300) })).max(4).optional(),
  candidates: z.array(CandidateOut).min(1).max(3),
  testPlan: z.string().max(500),
  needsMoreInfo: z.array(z.string().max(200)).max(3).optional(),
  confidence: z.enum(['baja', 'media', 'alta']),
});
export type AdvisorOutput = z.infer<typeof AdvisorOut>;
