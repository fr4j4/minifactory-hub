'use client';
import { useEffect, useState } from 'react';
import { applySuggestionAction, evaluateSuggestionAction, proposeProfilesAction, rankSuggestionAction, rejectSuggestionAction } from '@/actions/advisor';
import type { Proposal, Ranked } from '@/lib/ai/features/profile-advisor/advisor';
import { PARAM_BY_KEY } from '@/lib/ai/features/profile-advisor/params';
import { GOALS, type Goal } from '@/lib/ai/features/profile-advisor/score';
import type { MessageKey } from '@/i18n/translate';
import { useT } from '@/i18n/client';
import { dur, grams, num, cn } from '@/lib/format';
import { Modal, useToast } from './client';
import { useRunPolling } from './slice-panel';
import { Icon } from '@/components/shell';

export interface AdvisorTarget { fileVersionId: string; machineProfileId: string; processProfileId: string; filamentProfileId: string; copies: number }
const LEVEL: Record<string, 'down' | 'same' | 'up'> = { '-': 'down', '=': 'same', '+': 'up' };

function Bar({ label, v, base, bad }: { label: string; v: number; base: number; bad?: boolean }) {
  return (
    <div className="text-xs"><div className="flex justify-between"><span>{label}</span><span className="num">{v} <span className="muted">({v - base >= 0 ? '+' : ''}{v - base})</span></span></div>
      <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700" role="presentation"><div className={cn('h-1.5 rounded-full', bad ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${Math.max(2, v)}%` }} /></div></div>
  );
}

/** Asesor de perfiles con IA: propone → lamina de verdad → compara → el usuario decide. */
export function AdvisorPanel({ target, open, features, canEdit, canCreate, onClose }: { target: AdvisorTarget; open: boolean; features: { advisor: boolean; diagnose: boolean }; canEdit: boolean; canCreate: boolean; onClose: () => void }) {
  const t = useT(); const toast = useToast();
  const [mode, setMode] = useState<'goal' | 'symptom'>(features.advisor ? 'goal' : 'symptom');
  const [goal, setGoal] = useState<Goal>('equilibrado'); const [text, setText] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [sug, setSug] = useState<null | { id: string; proposal: Proposal }>(null);
  const [runIds, setRunIds] = useState<string[]>([]); const [rank, setRank] = useState<null | { ranked: Ranked[]; best: number | null }>(null);
  const [copyName, setCopyName] = useState(''); const [done, setDone] = useState(false);
  const runs = useRunPolling(runIds);
  const allDone = runIds.length > 0 && runIds.every((id) => runs[id] && (runs[id].status === 'done' || runs[id].status === 'error'));
  useEffect(() => { if (allDone && sug) rankSuggestionAction(sug.id).then((r) => { if (r.ok) setRank(r.data); }); }, [allDone]); // eslint-disable-line

  async function propose() {
    setBusy(true); setErr(''); setSug(null); setRunIds([]); setRank(null);
    const r = await proposeProfilesAction({ ...target, mode, goal: mode === 'goal' ? goal : undefined, text: text.trim() || undefined });
    setBusy(false); if (!r.ok) setErr(r.error); else setSug({ id: r.data.id, proposal: r.data.proposal });
  }
  async function evaluate() {
    if (!sug) return; setBusy(true); setErr('');
    const r = await evaluateSuggestionAction(sug.id); setBusy(false);
    if (!r.ok) return setErr(r.error);
    // asocia cada laminado a su candidato (el servidor devuelve los ids en el mismo orden)
    setSug({ id: sug.id, proposal: { ...sug.proposal, baselineRunId: r.data.baselineRunId, candidates: sug.proposal.candidates.map((c, k) => ({ ...c, runId: r.data.runIds[k] })) } });
    setRunIds([r.data.baselineRunId, ...r.data.runIds]);
  }
  async function apply(index: number, mode: 'update' | 'copy') {
    if (!sug) return; setBusy(true); const r = await applySuggestionAction(sug.id, index, { mode, name: copyName || undefined }); setBusy(false);
    if (!r.ok) return toast.push(r.error, 'err'); toast.push(t('advisor.applied', { n: r.data.length })); setDone(true);
  }
  async function discard() { if (sug) await rejectSuggestionAction(sug.id); toast.push(t('advisor.discarded'), 'info'); onClose(); }
  const p = sug?.proposal; const evaluating = runIds.length > 0 && !allDone;
  const baseRun = p?.baselineRunId ? runs[p.baselineRunId] ?? runs[runIds[0]] : runs[runIds[0]];
  const label = (k: string) => { const d = PARAM_BY_KEY.get(k); return d ? t(d.label) : k; };

  return (
    <Modal open={open} onClose={onClose} title={t('advisor.title')} wide>
      <div className="space-y-4" data-testid="advisor-panel">
        <p className="text-sm muted">{t('advisor.intro')}</p>
        {!sug && (
          <div className="space-y-3">
            {features.advisor && features.diagnose && <div role="tablist" className="flex gap-2">{(['goal', 'symptom'] as const).map((m) => <button key={m} role="tab" aria-selected={mode === m} className={cn('btn-ghost btn-sm', mode === m && '!bg-[var(--panel)] !text-[var(--panel-ink)]')} onClick={() => setMode(m)} data-testid={`advisor-mode-${m}`}>{t(m === 'goal' ? 'advisor.modeGoal' : 'advisor.modeSymptom')}</button>)}</div>}
            {mode === 'goal' && <div><span className="label">{t('advisor.goalLabel')}</span><div role="radiogroup" aria-label={t('advisor.goalLabel')} className="flex flex-wrap gap-2">{GOALS.map((g) => <button key={g} role="radio" aria-checked={goal === g} className={cn('btn-ghost btn-sm', goal === g && '!bg-[var(--panel)] !text-[var(--panel-ink)]')} onClick={() => setGoal(g)} data-testid={`advisor-goal-${g}`}>{t(`advisor.goal.${g}` as MessageKey)}</button>)}</div></div>}
            <label className="block"><span className="label">{mode === 'goal' ? t('advisor.constraintsLabel') : t('advisor.symptomLabel')}</span>
              <textarea className="input min-h-[72px]" maxLength={800} value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === 'goal' ? t('advisor.constraintsPh') : t('advisor.symptomPh')} data-testid="advisor-text" /></label>
            <div className="flex items-center gap-3"><button className="btn-primary" disabled={busy || (mode === 'symptom' && text.trim().length < 3)} onClick={propose} data-testid="advisor-propose">{busy ? t('advisor.proposing') : t('advisor.propose')}</button><span className="text-xs muted">{t('advisor.costNote')}</span></div>
          </div>
        )}
        {err && <p className="text-sm text-red-700" role="alert" data-testid="advisor-error">{err}</p>}

        {p && (
          <div className="space-y-4" data-testid="advisor-result">
            <p className="text-xs muted">{t('advisor.basedOn', { process: p.base.processName, version: p.base.processVersion, filament: p.base.filamentName })} · {t('advisor.confidenceLabel')}: <b>{t(`advisor.confidence.${p.confidence}` as MessageKey)}</b> · <span className="badge">{t('advisor.aiBadge')}</span></p>
            {p.diagnosis && p.diagnosis.length > 0 && <div><h4 className="text-sm font-medium">{t('advisor.diagnosisTitle')}</h4><ul className="text-sm list-disc pl-5">{p.diagnosis.map((d, i) => <li key={i}><b>{d.cause}</b> ({Math.round(d.likelihood * 100)} %): {d.why}</li>)}</ul></div>}
            {p.needsMoreInfo && p.needsMoreInfo.length > 0 && <div className="text-sm"><b>{t('advisor.needsMore')}</b><ul className="list-disc pl-5">{p.needsMoreInfo.map((q, i) => <li key={i}>{q}</li>)}</ul></div>}
            {p.dropped.length > 0 && <p className="text-xs muted">{t('advisor.dropped', { n: p.dropped.length })}</p>}
            {p.candidates.length === 0 && <p className="text-sm" data-testid="advisor-none">{t('advisor.noValid')}</p>}
            <div className="grid gap-3 lg:grid-cols-3">
              {p.candidates.map((c, i) => {
                const r = rank?.ranked.find((x) => x.index === i); const run = c.runId ? runs[c.runId] : null; const isBest = rank?.best === i;
                return (
                  <section key={i} className={cn('rounded-xl border p-3 space-y-2 text-sm', isBest ? 'border-emerald-500' : 'border-[var(--line)]')} data-testid={`advisor-cand-${c.name}`}>
                    <header className="flex items-center justify-between gap-2"><h4 className="font-semibold">{t(`advisor.candidate.${c.name}` as MessageKey)}</h4>{isBest && <span className="badge" data-testid="advisor-best">{t('advisor.best')}</span>}</header>
                    <p>{c.summary}</p>
                    <table className="w-full text-xs"><thead><tr><th className="th">{t('advisor.colParam')}</th><th className="th">{t('advisor.colFrom')}</th><th className="th">{t('advisor.colTo')}</th></tr></thead>
                      <tbody>{c.changes.map((a) => <tr key={a.key}><td className="td" title={`${a.reason}${a.evidence ? ' — ' + a.evidence : ''}`}>{label(a.key)}</td><td className="td num">{a.from ?? '—'}</td><td className="td num font-medium">{String(a.to)}{a.clamped ? ' *' : ''}{a.risk === 'moderate' && <Icon name="alert" className="inline h-3.5 w-3.5 ml-1 -mt-0.5 text-warn" />}</td></tr>)}</tbody></table>
                    <ul className="text-xs muted list-disc pl-4">{c.changes.map((a) => <li key={a.key}>{a.reason}</li>)}</ul>
                    {c.rejected.length > 0 && <p className="text-xs muted" data-testid="advisor-rejected">{t('advisor.rejectedNote', { n: c.rejected.length })}</p>}
                    {c.changes.some((a) => a.clamped) && <p className="text-xs muted">* {t('advisor.clamped')}</p>}
                    {c.changes.some((a) => a.risk === 'moderate') && <p className="text-xs muted"><Icon name="alert" className="inline h-3.5 w-3.5 mr-1 -mt-0.5 text-warn" />{t('advisor.tryFirst')}</p>}
                    <div className="text-xs"><b>{t('advisor.expectedTitle')}:</b> {(['time', 'material', 'strength', 'quality'] as const).map((k) => `${t(({ time: 'advisor.expTime', material: 'advisor.expMaterial', strength: 'advisor.expStrength', quality: 'advisor.expQuality' } as const)[k])} ${t(`advisor.level.${LEVEL[c.expected[k]]}` as MessageKey)}`).join(' · ')}</div>
                    <div className="space-y-1"><div className="text-xs font-medium">{t('advisor.scoresTitle')}</div>
                      <Bar label={t('advisor.scoreStrength')} v={c.scores.strength} base={p.base.scores.strength} /><Bar label={t('advisor.scoreQuality')} v={c.scores.quality} base={p.base.scores.quality} /><Bar label={t('advisor.scoreRisk')} v={c.scores.risk} base={p.base.scores.risk} bad /></div>
                    {c.risks.length > 0 && <div className="text-xs"><b>{t('advisor.risksTitle')}:</b><ul className="list-disc pl-4">{c.risks.map((x, k) => <li key={k}>{x}</li>)}</ul></div>}
                    {run?.status === 'done' && <div className="text-xs rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-2" data-testid={`advisor-measured-${c.name}`}><b>{t('advisor.measuredTitle')}</b><br />{t('advisor.mTime')}: {dur(run.timeS)}{r?.deltaTimePct != null && ` (${t('advisor.vsBase', { pct: (r.deltaTimePct > 0 ? '+' : '') + num(r.deltaTimePct, 0) })})`}<br />{t('advisor.mGrams')}: {grams(run.filament.reduce((a, f) => a + f.g, 0))}{r?.deltaGramsPct != null && ` (${t('advisor.vsBase', { pct: (r.deltaGramsPct > 0 ? '+' : '') + num(r.deltaGramsPct, 0) })})`}<br />{t('advisor.mLayers')}: {run.layers ?? '—'}</div>}
                    {run?.status === 'error' && <p className="text-xs text-red-700">{t('advisor.sliceFailed')} {run.error}</p>}
                    {allDone && !run && <p className="text-xs muted">{t('advisor.notTested')}</p>}
                    {!done && c.changes.some((a) => a.scope === 'filament') && <p className="text-xs text-amber-700">{t('advisor.filamentWarn', { name: p.base.filamentName })}</p>}
                    {!done && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {canEdit && <button className="btn-primary btn-sm" disabled={busy || (!!runIds.length && !allDone)} onClick={() => apply(i, 'update')} data-testid={`advisor-apply-${c.name}`}>{t('advisor.applyUpdate')}</button>}
                        {canCreate && <button className="btn-ghost btn-sm" disabled={busy || (!!runIds.length && !allDone)} onClick={() => apply(i, 'copy')} data-testid={`advisor-copy-${c.name}`}>{t('advisor.applyCopy')}</button>}
                      </div>)}
                  </section>
                );
              })}
            </div>
            {p.testPlan && <p className="text-sm"><b>{t('advisor.testPlan')}:</b> {p.testPlan}</p>}
            {canCreate && !done && p.candidates.length > 0 && <label className="block max-w-sm"><span className="label">{t('advisor.newName')}</span><input className="input" value={copyName} onChange={(e) => setCopyName(e.target.value)} /></label>}
            {baseRun?.status === 'done' && <p className="text-xs muted">{t('advisor.baseLabel')}: {dur(baseRun.timeS)} · {grams(baseRun.filament.reduce((a, f) => a + f.g, 0))} · {baseRun.layers ?? '—'} {t('advisor.mLayers').toLowerCase()}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              {!done && p.candidates.length > 0 && runIds.length === 0 && <button className="btn-primary" disabled={busy} onClick={evaluate} data-testid="advisor-evaluate">{t('advisor.evaluate')}</button>}
              {evaluating && <span className="text-sm muted self-center" role="status">{t('advisor.evaluating')}</span>}
              {!done && <button className="btn-ghost" onClick={discard} data-testid="advisor-discard">{t('advisor.discard')}</button>}
              {done && <button className="btn-primary" onClick={onClose}>{t('advisor.close')}</button>}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
