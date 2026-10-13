'use server';
import { z } from 'zod';
import { requirePerm } from '@/lib/auth';
import { getLocale, getT } from '@/i18n/server';
import { GOALS } from '@/lib/ai/features/profile-advisor/score';
import { applyCandidate, evaluateSuggestion, proposeProfiles, rankSuggestion, rejectSuggestion } from '@/lib/ai/features/profile-advisor/advisor';
import { safe } from './common';

const Propose = z.object({
  fileVersionId: z.string().uuid(), machineProfileId: z.string().uuid(), processProfileId: z.string().uuid(), filamentProfileId: z.string().uuid(),
  copies: z.number().int().min(1).max(200).optional(),
  mode: z.enum(['goal', 'symptom']), goal: z.enum(GOALS as [string, ...string[]]).optional(), text: z.string().max(800).optional(),
});

export async function proposeProfilesAction(raw: z.input<typeof Propose>) {
  return safe(async () => {
    const u = await requirePerm('laminador', 'V'); const input = Propose.parse(raw);
    return proposeProfiles(input as any, { user: u, locale: await getLocale() });
  });
}
export async function evaluateSuggestionAction(id: string) {
  return safe(async () => { const u = await requirePerm('laminador', 'V'); await requirePerm('ia', 'C'); return evaluateSuggestion(id, { userId: u.id }); });
}
export async function rankSuggestionAction(id: string) { return safe(async () => { await requirePerm('laminador', 'V'); return rankSuggestion(id); }); }
export async function applySuggestionAction(id: string, index: number, o: { mode: 'update' | 'copy'; name?: string }) {
  return safe(async () => {
    const u = await requirePerm('laminador', o.mode === 'update' ? 'E' : 'C'); const t = await getT();
    const { getSuggestion } = await import('@/lib/ai/features/profile-advisor/advisor');
    const sug = await getSuggestion(id); const what = sug.proposal.goal ? t(`advisor.goal.${sug.proposal.goal}` as any) : (sug.proposal.symptom ?? '').slice(0, 60);
    return applyCandidate(id, index, { ...o, userId: u.id, note: t('advisor.versionNote', { what }) });
  }, ['/laminador']);
}
export async function rejectSuggestionAction(id: string) { return safe(async () => { const u = await requirePerm('laminador', 'V'); await rejectSuggestion(id, u.id); }); }
