import { and, eq } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { audit } from '@/lib/audit';
import { enqueueSlice } from '@/lib/slicer/queue';
import { createProfileRow } from '@/lib/slicer/setup';
import { normalizeFailCause } from '@/lib/production/fail-causes';
import { LocalizedError } from '@/i18n/errors';
import type { Locale } from '@/i18n/config';
import { runTask, type RunContext } from '../../run';
import { hashInput } from '../../cache';
import { dataBlock, replyLanguage, UNTRUSTED_NOTE } from '../shared';
import { loadSubject, priorSuggestions, type AdvisorSubject } from './context';
import { KB, relevantRules } from './kb';
import { PARAM_REGISTRY, describeParam, first, numOf } from './params';
import { AdvisorOut, type AdvisorOutput } from './schema';
import { goalGain, scoreProfile, type Goal, type Measured, type Scores } from './score';
import { applyAccepted, validateChanges, type Accepted, type Rejected } from './validate';

export const PROMPT_VERSION = 'profile-advisor@1';
const CANDIDATE_NOTE = 'ai-candidate:';

export interface ProposalCandidate {
  name: 'conservador' | 'equilibrado' | 'agresivo'; summary: string; expected: AdvisorOutput['candidates'][number]['expected']; risks: string[];
  changes: Accepted[]; rejected: Rejected[]; scores: Scores;
  runId?: string; processCandidateId?: string; filamentCandidateId?: string;
}
export interface Proposal {
  mode: 'goal' | 'symptom'; goal?: Goal; symptom?: string; confidence: 'baja' | 'media' | 'alta'; testPlan: string; needsMoreInfo?: string[];
  diagnosis?: AdvisorOutput['diagnosis'];
  base: { processName: string; filamentName: string; processVersion: number; filamentVersion: number; scores: Scores };
  inputs: { fileVersionId: string; machineProfileId: string; processProfileId: string; filamentProfileId: string; copies: number };
  candidates: ProposalCandidate[];
  dropped: Array<{ name: string; rejected: Rejected[] }>;
  baselineRunId?: string;
}
export interface ProposeInput {
  fileVersionId: string; machineProfileId: string; processProfileId: string; filamentProfileId: string; copies?: number;
  mode: 'goal' | 'symptom'; goal?: Goal; text?: string;
}

function systemPrompt(locale: Locale, mode: 'goal' | 'symptom') {
  return [
    'Eres el asesor de perfiles de impresión 3D FDM de un taller que lamina con OrcaSlicer. Propones cambios MÍNIMOS y justificados a un perfil de proceso y/o de filamento existente.',
    mode === 'goal' ? 'Tarea: lograr el objetivo del usuario con el mejor equilibrio.' : 'Tarea: diagnosticar el problema descrito, ordenar las causas probables y proponer los cambios que más probablemente lo corrijan.',
    'Reglas estrictas:',
    '- Entrega entre 1 y 3 candidatos con nombres «conservador», «equilibrado», «agresivo» (en ese orden de cambio creciente); cada uno con pocos cambios (idealmente ≤6).',
    '- Usa SOLO los parámetros de la lista «parametros_permitidos», con valores dentro de sus rangos y del rango de temperatura del material. No inventes parámetros.',
    '- Cada cambio debe incluir `reason` y `evidence` (el dato de la entrada que lo justifica: medida de la pieza, historial de fallas, valor actual, regla).',
    '- No repitas valores que ya tiene el perfil. No cambies velocidades por encima del caudal volumétrico máximo del filamento.',
    '- Usa las «reglas_dominio» como guía, pero adáptalas a los datos; el historial real del taller pesa más que una regla general.',
    '- Si falta información importante, completa `needsMoreInfo` y baja `confidence`; no inventes certeza. Siempre propone una prueba corta en `testPlan` (pieza pequeña antes de un lote).',
    `- Redacta summary, reason, evidence, risks y testPlan en ${replyLanguage(locale)}.`,
    UNTRUSTED_NOTE,
  ].join('\n');
}

function userPrompt(sub: AdvisorSubject, i: ProposeInput, extra: { prior: unknown; rules: unknown; baseScores: Scores }) {
  const a = sub.analysis ?? {}; const P = sub.effective.process, F = sub.effective.filament;
  const pick = (m: Record<string, any>, keys: string[]) => Object.fromEntries(keys.map((k) => [k, first(m[k])]).filter(([, v]) => v !== undefined));
  const h = (x: AdvisorSubject['health']['process']) => ({ trabajos: x.total.jobs, exito_pct: x.total.successPct == null ? null : Math.round(x.total.successPct), causas: x.total.causes, desvio_tiempo_pct: x.total.timeDevPct == null ? null : Math.round(x.total.timeDevPct), desvio_g_pct: x.total.gramsDevPct == null ? null : Math.round(x.total.gramsDevPct) });
  return [
    dataBlock('pedido', i.mode === 'goal' ? { objetivo: i.goal ?? 'equilibrado', restricciones: (i.text ?? '').slice(0, 500) } : { problema: (i.text ?? '').slice(0, 800) }),
    dataBlock('contexto', {
      pieza: sub.dims ? { dim_mm: sub.dims.map((n) => Math.round(n * 10) / 10), volumen_cm3: a.volumeCm3 ?? null, voladizo_pct: a.overhangPct ?? null, cerrada: a.closed ?? null, conchas: a.shells ?? null } : null,
      maquina: { modelo: sub.machineRow ? `${sub.machineRow.brand ?? ''} ${sub.machineRow.model ?? ''}`.trim() || sub.machineRow.name : sub.machine.name, boquilla_mm: sub.validate.nozzle, cerrada: sub.machineRow?.enclosed ?? null, factor_tiempo: sub.machineRow?.timeFactor ?? null },
      material: { tipo: sub.material?.type ?? null, temp_boquilla_rango: [numOf(F.nozzle_temperature_range_low), numOf(F.nozzle_temperature_range_high)], caudal_max_mm3s: numOf(F.filament_max_volumetric_speed) },
      perfil_proceso: { nombre: sub.process.name, version: sub.process.version, base: sub.process.baseName, cambios_del_taller: sub.process.changes, valores: pick(P, PARAM_REGISTRY.filter((p) => p.scope === 'process').map((p) => p.key)) },
      perfil_filamento: { nombre: sub.filament.name, version: sub.filament.version, valores: pick(F, PARAM_REGISTRY.filter((p) => p.scope === 'filament').map((p) => p.key)) },
      puntajes_actuales: extra.baseScores,
      historial_proceso: h(sub.health.process), historial_filamento: h(sub.health.filament),
      sugerencias_previas_aplicadas: extra.prior,
    }),
    dataBlock('reglas_dominio', extra.rules),
    dataBlock('parametros_permitidos', PARAM_REGISTRY.map(describeParam)),
  ].join('\n\n');
}

/** Pide candidatos al modelo, los valida y los guarda como propuesta (nada se aplica ni se lamina todavía). */
export async function proposeProfiles(i: ProposeInput, ctx: RunContext & { locale: Locale }) {
  const sub = await loadSubject(i);
  const symptomCause = i.mode === 'symptom' ? normalizeFailCause(i.text) : null;
  const rules = relevantRules({ goal: i.mode === 'goal' ? i.goal : null, causes: symptomCause ? [symptomCause] : [] })
    .map((r) => ({ id: r.id, mover: r.moves, por_que: r.why, evitar: r.avoid }));
  const overhang = (sub.analysis?.overhangPct as number | undefined) ?? null;
  const histOk = (h: AdvisorSubject['health']['process']) => (h.total.jobs >= 8 ? h.total.successPct : null);
  const baseScores = scoreProfile({ process: sub.effective.process, filament: sub.effective.filament, overhangPct: overhang, historySuccessPct: histOk(sub.health.process) });
  const prior = await priorSuggestions(sub.process.id);
  const feature = i.mode === 'goal' ? 'profile.advisor' : 'profile.diagnose';

  const r = await runTask({
    feature, tier: 'smart', maxOutputTokens: 2500, temperature: 0.2,
    system: systemPrompt(ctx.locale, i.mode), user: userPrompt(sub, i, { prior, rules: rules.length ? rules : KB.map((k) => ({ id: k.id, por_que: k.why })).slice(0, 0), baseScores }),
    schema: AdvisorOut,
  }, { ...ctx, promptVersion: PROMPT_VERSION });

  const candidates: ProposalCandidate[] = []; const dropped: Proposal['dropped'] = [];
  for (const c of r.data.candidates) {
    const { accepted, rejected } = validateChanges(c.changes, sub.validate);
    if (!accepted.length) { dropped.push({ name: c.name, rejected }); continue; }
    const scores = scoreProfile({ process: applyAccepted(sub.effective.process, accepted, 'process'), filament: applyAccepted(sub.effective.filament, accepted, 'filament'), overhangPct: overhang, historySuccessPct: histOk(sub.health.process) });
    candidates.push({ name: c.name, summary: c.summary, expected: c.expected, risks: c.risks, changes: accepted, rejected, scores });
  }
  const proposal: Proposal = {
    mode: i.mode, goal: i.mode === 'goal' ? i.goal ?? 'equilibrado' : undefined, symptom: i.mode === 'symptom' ? (i.text ?? '').slice(0, 800) : undefined,
    confidence: r.data.confidence, testPlan: r.data.testPlan, needsMoreInfo: r.data.needsMoreInfo, diagnosis: r.data.diagnosis,
    base: { processName: sub.process.name, filamentName: sub.filament.name, processVersion: sub.process.version, filamentVersion: sub.filament.version, scores: baseScores },
    inputs: { fileVersionId: i.fileVersionId, machineProfileId: i.machineProfileId, processProfileId: i.processProfileId, filamentProfileId: i.filamentProfileId, copies: Math.max(1, i.copies ?? 1) },
    candidates, dropped,
  };
  const db = await getDb();
  const [row] = await db.insert(s.aiSuggestions).values({
    workspaceId: WORKSPACE_ID, feature, subjectType: 'process_profile', subjectId: sub.process.id,
    inputHash: hashInput(feature, PROMPT_VERSION, i, sub.process.version, sub.filament.version), provider: 'ai', model: r.model, promptVersion: PROMPT_VERSION,
    proposal: proposal as any, rationale: { costUsd: r.costUsd, cached: r.cacheHit, rulesUsed: rules.map((x) => x.id) }, status: 'proposed', createdBy: ctx.user?.id ?? null,
  }).returning({ id: s.aiSuggestions.id });
  return { id: row.id, proposal, costUsd: r.costUsd };
}

async function loadSuggestion(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(s.aiSuggestions).where(eq(s.aiSuggestions.id, id));
  if (!row || !['profile.advisor', 'profile.diagnose'].includes(row.feature)) throw new LocalizedError('advisor.err.notFound');
  return { db, row, proposal: row.proposal as unknown as Proposal };
}
export async function getSuggestion(id: string) { const { row, proposal } = await loadSuggestion(id); return { id: row.id, status: row.status, proposal, feature: row.feature }; }

/** Perfil «fantasma» (borrado lógico, invisible) con los cambios del candidato: permite laminarlo con la cola normal sin tocar el perfil real. */
async function hiddenCandidate(db: Awaited<ReturnType<typeof getDb>>, base: typeof s.slicerProfiles.$inferSelect, label: string, accepted: Accepted[], scope: 'process' | 'filament', suggestionId: string) {
  const mine = accepted.filter((a) => a.scope === scope);
  if (!mine.length) return base.id;
  const changes = { ...(base.changes ?? {}), ...Object.fromEntries(mine.map((a) => [a.key, a.to])) };
  const [r] = await db.insert(s.slicerProfiles).values({ workspaceId: WORKSPACE_ID, type: scope, name: `IA · ${label} · ${base.name}`, vendor: base.vendor, baseName: base.baseName, changes, notes: CANDIDATE_NOTE + suggestionId, deletedAt: new Date(), simulated: base.simulated }).returning({ id: s.slicerProfiles.id });
  await db.insert(s.slicerProfileVersions).values({ profileId: r.id, version: 1, baseName: base.baseName, changes, note: 'ia-candidate' });
  return r.id;
}

/** Lamina el perfil actual (base) y cada candidato en la cola normal; devuelve los ids de laminado. Máximo 1 + 3 laminados. */
export async function evaluateSuggestion(id: string, o: { userId?: string | null; enqueue?: typeof enqueueSlice } = {}) {
  const { db, row, proposal } = await loadSuggestion(id);
  if (row.status !== 'proposed') throw new LocalizedError('advisor.err.notOpen');
  if (proposal.baselineRunId) return { baselineRunId: proposal.baselineRunId, runIds: proposal.candidates.map((c) => c.runId!) };
  const enqueue = o.enqueue ?? enqueueSlice; const inp = proposal.inputs;
  const sub = await loadSubject(inp);
  const base = { fileVersionId: inp.fileVersionId, machineProfileId: inp.machineProfileId, copies: inp.copies, groupId: id, userId: o.userId ?? undefined };
  proposal.baselineRunId = await enqueue({ ...base, processProfileId: inp.processProfileId, filamentProfileId: inp.filamentProfileId, label: 'IA · base' });
  for (const c of proposal.candidates) {
    c.processCandidateId = await hiddenCandidate(db, sub.process, c.name, c.changes, 'process', id);
    c.filamentCandidateId = await hiddenCandidate(db, sub.filament, c.name, c.changes, 'filament', id);
    c.runId = await enqueue({ ...base, processProfileId: c.processCandidateId, filamentProfileId: c.filamentCandidateId, label: `IA · ${c.name}` });
  }
  await db.update(s.aiSuggestions).set({ proposal: proposal as any, updatedAt: new Date() }).where(eq(s.aiSuggestions.id, id));
  return { baselineRunId: proposal.baselineRunId, runIds: proposal.candidates.map((c) => c.runId!) };
}

export interface Ranked { index: number; gain: number; measured: Measured; deltaTimePct: number | null; deltaGramsPct: number | null }
/** Compara con medidas reales (laminador) y ordena según el objetivo. Los candidatos sin laminar bien quedan fuera del ranking. */
export async function rankSuggestion(id: string): Promise<{ ranked: Ranked[]; best: number | null; baseline: Measured | null }> {
  const { db, proposal } = await loadSuggestion(id);
  if (!proposal.baselineRunId) return { ranked: [], best: null, baseline: null };
  const runs = new Map((await db.select().from(s.sliceRuns).where(eq(s.sliceRuns.groupId, id))).map((r) => [r.id, r]));
  const meas = (rid?: string): Measured | null => { const r = rid ? runs.get(rid) : null; return r?.status === 'done' ? { timeS: r.timeS, grams: (r.filament ?? []).reduce((a, f) => a + f.g, 0), layers: r.layers } : null; };
  const b = meas(proposal.baselineRunId); if (!b) return { ranked: [], best: null, baseline: null };
  const goal: Goal = proposal.goal ?? 'equilibrado';
  const ranked: Ranked[] = [];
  proposal.candidates.forEach((c, index) => {
    const m = meas(c.runId); if (!m) return;
    ranked.push({ index, measured: m, gain: goalGain(goal, { m: b, s: proposal.base.scores }, { m, s: c.scores }),
      deltaTimePct: b.timeS && m.timeS != null ? ((m.timeS - b.timeS) / b.timeS) * 100 : null, deltaGramsPct: b.grams && m.grams != null ? ((m.grams - b.grams) / b.grams) * 100 : null });
  });
  ranked.sort((x, y) => y.gain - x.gain);
  return { ranked, best: ranked.length && ranked[0].gain > 0 ? ranked[0].index : null, baseline: b };
}

/** Guarda una nueva versión del perfil con el cambio de uno o más parámetros. Devuelve la versión resultante. */
async function bump(db: Awaited<ReturnType<typeof getDb>>, p: typeof s.slicerProfiles.$inferSelect, patch: Accepted[], userId: string | null, note: string) {
  const changes = { ...(p.changes ?? {}), ...Object.fromEntries(patch.map((a) => [a.key, a.to])) };
  const version = p.version + 1;
  await db.insert(s.slicerProfileVersions).values({ profileId: p.id, version, baseName: p.baseName, changes, createdBy: userId, note });
  await db.update(s.slicerProfiles).set({ changes, version, updatedAt: new Date() }).where(eq(s.slicerProfiles.id, p.id));
  await audit('slicer_profile', p.id, 'editar', { version, keys: patch.map((a) => a.key), via: 'ia' }, userId);
  return version;
}

/** Aplica un candidato elegido: nueva versión del perfil actual (reversible) o copia como perfil nuevo. */
export async function applyCandidate(id: string, index: number, o: { mode: 'update' | 'copy'; name?: string; userId: string | null; note: string }) {
  const { db, row, proposal } = await loadSuggestion(id);
  if (row.status !== 'proposed') throw new LocalizedError('advisor.err.notOpen');
  const c = proposal.candidates[index]; if (!c) throw new LocalizedError('advisor.err.notFound');
  const inp = proposal.inputs;
  const [proc] = await db.select().from(s.slicerProfiles).where(eq(s.slicerProfiles.id, inp.processProfileId));
  const [fil] = await db.select().from(s.slicerProfiles).where(eq(s.slicerProfiles.id, inp.filamentProfileId));
  if (!proc || !fil) throw new LocalizedError('slicer.profileNotFound');
  const pAcc = c.changes.filter((a) => a.scope === 'process'), fAcc = c.changes.filter((a) => a.scope === 'filament');
  const out: Array<{ id: string; version: number; type: 'process' | 'filament' }> = [];
  if (o.mode === 'update') {
    if (proc.version !== proposal.base.processVersion || fil.version !== proposal.base.filamentVersion) throw new LocalizedError('advisor.err.stale');
    if (pAcc.length) out.push({ id: proc.id, version: await bump(db, proc, pAcc, o.userId, o.note), type: 'process' });
    if (fAcc.length) out.push({ id: fil.id, version: await bump(db, fil, fAcc, o.userId, o.note), type: 'filament' });
  } else {
    const nm = (o.name ?? '').trim();
    if (pAcc.length) out.push({ id: await createProfileRow({ type: 'process', name: nm || `${proc.name} · IA ${c.name}`, baseName: proc.baseName, vendor: proc.vendor ?? undefined, changes: { ...(proc.changes ?? {}), ...Object.fromEntries(pAcc.map((a) => [a.key, a.to])) }, userId: o.userId, note: o.note }), version: 1, type: 'process' });
    if (fAcc.length) out.push({ id: await createProfileRow({ type: 'filament', name: nm ? `${nm} (filamento)` : `${fil.name} · IA ${c.name}`, baseName: fil.baseName, vendor: fil.vendor ?? undefined, changes: { ...(fil.changes ?? {}), ...Object.fromEntries(fAcc.map((a) => [a.key, a.to])) }, userId: o.userId, note: o.note }), version: 1, type: 'filament' });
  }
  const proc0 = out.find((x) => x.type === 'process');
  await db.update(s.aiSuggestions).set({ status: 'applied', appliedAt: new Date(), appliedBy: o.userId, outcome: { candidate: c.name, mode: o.mode, profiles: out, version: proc0?.version ?? null, profileId: proc0?.id ?? null, keys: c.changes.map((a) => a.key) }, updatedAt: new Date() }).where(eq(s.aiSuggestions.id, id));
  await audit('ai_suggestion', id, 'aplicar', { candidate: c.name, mode: o.mode, profiles: out, keys: c.changes.map((a) => a.key) }, o.userId);
  return out;
}

export async function rejectSuggestion(id: string, userId: string | null) {
  const { db, row } = await loadSuggestion(id);
  if (row.status !== 'proposed') return;
  await db.update(s.aiSuggestions).set({ status: 'rejected', updatedAt: new Date() }).where(and(eq(s.aiSuggestions.id, id)));
  await audit('ai_suggestion', id, 'descartar', {}, userId);
}
export const isCandidateProfile = (notes: string | null | undefined) => !!notes?.startsWith(CANDIDATE_NOTE);
