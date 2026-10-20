'use client';
import { useEffect, useState } from 'react';
import { explainSliceErrorAction, explainSliceErrorAiAction } from '@/actions/slicer';
import { useT } from '@/i18n/client';
import type { Hint } from '@/lib/slicer/explain';

/** Acciones concretas para un laminado fallido: reglas siempre; explicación de IA solo si el taller la activó. */
export function SliceErrorHelp({ runId }: { runId: string }) {
  const t = useT();
  const [hints, setHints] = useState<Hint[]>([]); const [aiOk, setAiOk] = useState(false);
  const [ai, setAi] = useState<null | { summary: string; steps: string[] }>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { let off = false; explainSliceErrorAction(runId).then((r) => { if (!off && r.ok) { setHints(r.data.hints); setAiOk(r.data.aiAvailable); } }); return () => { off = true; }; }, [runId]);
  async function askAi() {
    setBusy(true); setErr(''); const r = await explainSliceErrorAiAction(runId); setBusy(false);
    if (r.ok) setAi(r.data); else setErr(r.error);
  }
  if (!hints.length && !aiOk) return null;
  return (
    <div className="mt-2 space-y-2" data-testid="slice-help">
      {hints.length > 0 && <div><div className="font-medium">{t('advisor.explain.title')}</div><ul className="list-disc pl-5">{hints.map((h, i) => <li key={i}>{t(h.key, h.params)}</li>)}</ul></div>}
      {aiOk && !ai && <button type="button" className="btn-ghost btn-sm" onClick={askAi} disabled={busy} data-testid="slice-ai-explain">{busy ? t('advisor.explain.asking') : t('advisor.explain.askAi')}</button>}
      {err && <p role="alert">{err}</p>}
      {ai && <div data-testid="slice-ai-result"><div className="font-medium">{t('advisor.explain.aiTitle')}</div><p>{ai.summary}</p><ul className="list-disc pl-5">{ai.steps.map((s, i) => <li key={i}>{s}</li>)}</ul><p className="text-xs opacity-80 mt-1">{t('advisor.explain.aiNote')}</p></div>}
    </div>
  );
}
