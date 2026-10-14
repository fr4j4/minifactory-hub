'use client';
import { useState } from 'react';
import { clearAiPromptLogsAction, discoverAiAction, listAiModelsAction, saveAiSettingsAction, testAiConnectionAction, type AiSettingsInput } from '@/actions/ai';
import { PRESETS, PRESET_BY_ID, presetOf } from '@/lib/ai/presets';
import type { Found } from '@/lib/ai/discovery';
import { FEATURES, FEATURE_KEYS, featureI18n } from '@/lib/ai/types';
import type { PublicAiSettings } from '@/lib/ai/config';
import { useT, useLocale } from '@/i18n/client';
import type { MessageKey } from '@/i18n/translate';
import { useAction, useToast } from './client';

const ROLES = ['admin', 'operador', 'ventas'] as const;
const usd = (n: number) => `US$ ${n.toFixed(n < 1 ? 4 : 2)}`;
const featureLabel = (t: ReturnType<typeof useT>, k: string, part: 'label' | 'desc') => t(`ai.features.${featureI18n(k)}.${part}` as MessageKey);

export function AiSettingsForm({ st, canClear }: { st: PublicAiSettings; canClear: boolean }) {
  const t = useT(); const { run, pending } = useAction(); const toast = useToast();
  const [v, setV] = useState({
    enabled: st.enabled, provider: st.provider, preset: presetOf(st), baseUrl: st.baseUrl, models: st.models, localOnly: st.localOnly,
    features: Object.fromEntries(FEATURE_KEYS.map((k) => [k, st.features[k] === true])) as Record<string, boolean>,
    roles: Object.fromEntries(FEATURE_KEYS.map((k) => [k, st.roles[k] ?? ['admin']])) as Record<string, string[]>,
    privacy: st.privacy, budget: st.budget, retention: st.retention,
  });
  const [key, setKey] = useState(''); const [clearKey, setClearKey] = useState(false);
  const [test, setTest] = useState<null | { ok: boolean; text: string }>(null); const [testing, setTesting] = useState(false);
  const [modelList, setModelList] = useState<string[]>([]); const [loadingModels, setLoadingModels] = useState(false); const [modelsNote, setModelsNote] = useState('');
  const [finding, setFinding] = useState(false); const [found, setFound] = useState<Found[] | null>(null); const [extra, setExtra] = useState(''); const [findErr, setFindErr] = useState('');
  const payload = (): AiSettingsInput => ({ ...v, apiKey: key || undefined, clearKey: clearKey || undefined } as AiSettingsInput);
  const preset = PRESET_BY_ID.get(v.preset);
  const local = v.provider === 'openai-compat';

  function pickPreset(id: string) {
    const p = PRESET_BY_ID.get(id); setModelList([]); setModelsNote(''); setTest(null);
    if (!p) return setV({ ...v, preset: '', provider: 'none' });
    // los genéricos conservan lo que ya escribiste; los demás traen su dirección y modelos
    setV({ ...v, preset: p.id, provider: p.kind, baseUrl: p.group === 'generic' ? v.baseUrl : p.baseUrl, models: p.group === 'generic' ? v.models : p.models });
  }
  const fill = (list: string[], pick: { fast: string; smart: string; vision: string }) =>
    setV((cur) => ({ ...cur, models: { fast: list.includes(cur.models.fast) ? cur.models.fast : pick.fast, smart: list.includes(cur.models.smart) ? cur.models.smart : pick.smart, vision: list.includes(cur.models.vision) ? cur.models.vision : pick.vision } }));
  async function loadModels() {
    setLoadingModels(true); setModelsNote('');
    const r = await listAiModelsAction({ provider: v.provider as 'anthropic' | 'openai-compat', baseUrl: v.baseUrl, localOnly: v.localOnly, apiKey: key || undefined });
    setLoadingModels(false);
    if (!r.ok) return setModelsNote(r.error);
    setModelList(r.data.models); fill(r.data.models, r.data.suggested); setModelsNote(t('ai.modelsLoaded', { n: r.data.models.length }));
  }
  async function find() {
    setFinding(true); setFindErr(''); setFound(null);
    const r = await discoverAiAction(extra.trim() || undefined); setFinding(false);
    if (!r.ok) return setFindErr(r.error); setFound(r.data);
  }
  function useFound(f: Found) {
    const p = PRESET_BY_ID.get(f.presetId);
    setModelList(f.models); setModelsNote(''); setTest(null);
    setV((cur) => ({ ...cur, preset: f.presetId, provider: 'openai-compat', baseUrl: f.baseUrl, models: { fast: f.suggested.fast, smart: f.suggested.smart, vision: f.suggested.vision || (p?.models.vision ?? '') } }));
  }

  async function probar() {
    setTesting(true); setTest(null);
    const r = await testAiConnectionAction(payload());
    setTesting(false);
    if (!r.ok) return setTest({ ok: false, text: r.error });
    const d = r.data as any;
    setTest(d.ok ? { ok: true, text: t('ai.testOk', { model: d.model, ms: d.latencyMs }) + (d.vision ? t('ai.testOkVision') : '') } : { ok: false, text: d.error });
  }

  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); run(() => saveAiSettingsAction(payload()), { ok: t('ai.saved'), onOk: () => { setKey(''); setClearKey(false); } }); }} data-testid="ai-form">
      <p className="text-sm muted">{t('ai.intro')}</p>
      {st.forcedOff && <p className="text-sm rounded-lg border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2" role="status">{t('ai.forcedOff')}</p>}

      <section className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={v.enabled} onChange={(e) => setV({ ...v, enabled: e.target.checked })} data-testid="ai-enabled" /> {t('ai.enable')}</label>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block"><span className="label">{t('ai.provider')}</span>
            <select className="input" value={v.preset} onChange={(e) => pickPreset(e.target.value)} data-testid="ai-provider">
              <option value="">{t('ai.providerNone')}</option>
              {(['local', 'cloud', 'generic'] as const).map((g) => <optgroup key={g} label={t(({ local: 'ai.groupLocal', cloud: 'ai.groupCloud', generic: 'ai.groupGeneric' } as const)[g])}>
                {PRESETS.filter((p) => p.group === g).map((p) => <option key={p.id} value={p.id}>{t(`ai.presets.${p.id}.label` as MessageKey)}</option>)}</optgroup>)}
            </select></label>
          {v.provider !== 'none' && <label className="block"><span className="label">{v.provider === 'anthropic' ? t('ai.baseUrlOptional') : t('ai.baseUrl')}</span>
            <input className="input" value={v.baseUrl} onChange={(e) => setV({ ...v, baseUrl: e.target.value })} placeholder={local ? 'http://ollama:11434/v1' : 'https://api.anthropic.com'} data-testid="ai-base-url" /></label>}
          {v.provider !== 'none' && <label className="block"><span className="label">{local ? t('ai.apiKeyIfRequired') : t('ai.apiKey')}</span>
            <input type="password" autoComplete="new-password" className="input" value={key} onChange={(e) => { setKey(e.target.value); setClearKey(false); }} placeholder={st.hasKey && !clearKey ? t('ai.keyStored', { last4: st.keyLast4 }) : st.envKey ? t('ai.keyFromEnv') : ''} data-testid="ai-key" />
            {st.hasKey && <button type="button" className="text-xs underline mt-1" onClick={() => { setClearKey(true); setKey(''); }}>{clearKey ? t('ai.keyWillDelete') : t('ai.keyDelete')}</button>}</label>}
        </div>
        {preset && <p className="text-xs muted" data-testid="ai-preset-note">{t(`ai.presets.${preset.id}.note` as MessageKey)}{preset.needsKey && !st.hasKey && !key && !st.envKey ? ' ' + t('ai.presetNeedsKey') : ''}</p>}
        {preset && preset.group === 'cloud' && v.localOnly && <p className="text-xs text-amber-700" role="status">{t('ai.cloudVsLocalOnly')}</p>}
        {v.provider !== 'none' && <div className="grid sm:grid-cols-3 gap-3">
          {(['fast', 'smart', 'vision'] as const).map((m) => <label key={m} className="block"><span className="label">{t(({ fast: 'ai.modelFast', smart: 'ai.modelSmart', vision: 'ai.modelVision' } as const)[m])}</span>
            <input className="input" value={v.models[m]} onChange={(e) => setV({ ...v, models: { ...v.models, [m]: e.target.value } })} list="ai-models" data-testid={`ai-model-${m}`} /></label>)}
          <datalist id="ai-models">{modelList.map((m) => <option key={m} value={m} />)}</datalist>
        </div>}
        {v.provider !== 'none' && <div className="flex flex-wrap items-center gap-3"><button type="button" className="btn-ghost btn-sm" onClick={loadModels} disabled={loadingModels} data-testid="ai-load-models">{loadingModels ? t('ai.loadingModels') : t('ai.loadModels')}</button>{modelsNote && <span className="text-xs muted" role="status" data-testid="ai-models-note">{modelsNote}</span>}</div>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-ghost" disabled={testing || v.provider === 'none'} onClick={probar} data-testid="ai-test">{testing ? t('ai.testing') : t('ai.test')}</button>
          {test && <span role="status" className={test.ok ? 'text-sm text-emerald-700' : 'text-sm text-red-700'} data-testid="ai-test-result">{test.text}</span>}
        </div>
      </section>

      <section className="space-y-2" data-testid="ai-discovery">
        <h3 className="text-sm font-medium">{t('ai.discoverTitle')}</h3>
        <p className="text-xs muted">{t('ai.discoverHelp')}</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block grow max-w-sm"><span className="label">{t('ai.discoverOther')}</span><input className="input" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder={t('ai.discoverOtherPh')} data-testid="ai-discover-extra" /></label>
          <button type="button" className="btn-ghost" onClick={find} disabled={finding} data-testid="ai-discover">{finding ? t('ai.discovering') : t('ai.discover')}</button>
        </div>
        {findErr && <p className="text-sm text-red-700" role="alert">{findErr}</p>}
        {found && (found.length === 0 ? <p className="text-sm muted" role="status" data-testid="ai-discover-none">{t('ai.discoverNone')}</p> : (
          <div role="status"><p className="text-sm">{t('ai.discoverFound', { n: found.length })}</p>
            <ul className="divide-y divide-[var(--line)] border border-[var(--line)] rounded-xl mt-1" data-testid="ai-discover-list">{found.map((f) => (
              <li key={f.baseUrl} className="p-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span><b>{t(`ai.presets.${f.presetId}.label` as MessageKey)}</b> · <span className="num">{f.baseUrl}</span> · {f.authRequired ? t('ai.discoverAuth') : t('ai.discoverModels', { n: f.models.length })}</span>
                <button type="button" className="btn-primary btn-sm" onClick={() => useFound(f)} data-testid={`ai-discover-use-${f.port}`}>{t('ai.discoverUse')}</button></li>))}</ul></div>))}
      </section>

      <section>
        <h3 className="text-sm font-medium mb-1.5">{t('ai.functions')}</h3>
        <p className="text-xs muted mb-2">{t('ai.functionsHelp')}</p>
        <div className="divide-y divide-[var(--line)] border border-[var(--line)] rounded-xl">
          {FEATURE_KEYS.map((k) => { const f = FEATURES[k]; return (
            <div key={k} className="p-3 grid sm:grid-cols-[1fr_auto] gap-2 items-center">
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={v.features[k]} onChange={(e) => setV({ ...v, features: { ...v.features, [k]: e.target.checked } })} data-testid={`ai-feat-${k}`} />
                <span><span className="font-medium">{featureLabel(t, k, 'label')}</span>{!f.available && <span className="ml-2 text-xs muted">{t('ai.soon')}</span>}<br /><span className="text-xs muted">{featureLabel(t, k, 'desc')}{f.vision ? t('ai.usesImages') : ''}</span></span></label>
              <div className="flex gap-3 text-xs">{ROLES.map((r) => <label key={r} className="flex items-center gap-1"><input type="checkbox" checked={v.roles[k].includes(r)} onChange={(e) => setV({ ...v, roles: { ...v.roles, [k]: e.target.checked ? [...v.roles[k], r] : v.roles[k].filter((x) => x !== r) } })} />{t(`roles.${r}`)}</label>)}</div>
            </div>); })}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">{t('ai.privacy')}</h3>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.privacy.redactPII} onChange={(e) => setV({ ...v, privacy: { ...v.privacy, redactPII: e.target.checked } })} /> {t('ai.redactPII')}</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.privacy.sendImages} onChange={(e) => setV({ ...v, privacy: { ...v.privacy, sendImages: e.target.checked } })} /> {t('ai.sendImages')}</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.localOnly} onChange={(e) => setV({ ...v, localOnly: e.target.checked })} data-testid="ai-local-only" /> {t('ai.localOnly')}</label>
        <label className="block max-w-xs"><span className="label">{t('ai.retention')}</span>
          <input type="number" min={0} max={90} className="input" value={v.retention.logPromptsDays} onChange={(e) => setV({ ...v, retention: { logPromptsDays: Math.max(0, Math.min(90, +e.target.value || 0)) } })} /></label>
        {canClear && <button type="button" className="btn-ghost btn-sm" onClick={() => run(() => clearAiPromptLogsAction(), { ok: t('ai.promptsCleared') })}>{t('ai.clearPrompts')}</button>}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">{t('ai.budget')}</h3>
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="block"><span className="label">{t('ai.monthlyCap')}</span>
            <input type="number" min={0} step="0.5" className="input" value={v.budget.monthlyUsd ?? ''} onChange={(e) => setV({ ...v, budget: { ...v.budget, monthlyUsd: e.target.value === '' ? null : +e.target.value } })} data-testid="ai-budget" /></label>
          <label className="block"><span className="label">{t('ai.dailyCalls')}</span>
            <input type="number" min={0} className="input" value={v.budget.perUserDailyCalls} onChange={(e) => setV({ ...v, budget: { ...v.budget, perUserDailyCalls: Math.max(0, Math.round(+e.target.value || 0)) } })} /></label>
          <label className="flex items-center gap-2 text-sm self-end pb-2"><input type="checkbox" checked={v.budget.hardStop} onChange={(e) => setV({ ...v, budget: { ...v.budget, hardStop: e.target.checked } })} /> {t('ai.hardStop')}</label>
        </div>
      </section>

      <div className="flex justify-end"><button className="btn-primary" disabled={pending} data-testid="ai-save" onClick={() => { if (v.enabled && v.provider === 'none') toast.push(t('ai.chooseProvider'), 'info'); }}>{t('common.save')}</button></div>
    </form>
  );
}

type CallRow = { id: string; createdAt: Date | string; feature: string; model: string; inTokens: number; outTokens: number; costUsd: number; ok: boolean; cacheHit: boolean; error: string | null };
export function AiUsagePanel({ usage, budget }: { usage: { month: { costUsd: number; calls: number }; byFeature: unknown[]; recent: CallRow[] }; budget: number | null }) {
  const t = useT(); const locale = useLocale();
  const pct = budget ? Math.min(100, (usage.month.costUsd / budget) * 100) : null;
  const when = (d: Date | string) => new Date(d).toLocaleString(locale === 'en' ? 'en-US' : 'es-CL');
  return (
    <div className="space-y-4" data-testid="ai-usage">
      <p className="text-sm">{t('ai.usageSummary', { cost: usd(usage.month.costUsd), calls: usage.month.calls })}{budget != null && t('ai.usageCap', { cap: usd(budget), pct: pct!.toFixed(0) })}. {t('ai.usageNote')}</p>
      {pct != null && <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={t('ai.budgetBar')}><div className={`h-2 rounded-full ${pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} /></div>}
      {usage.recent.length === 0 ? <p className="text-sm muted">{t('ai.noCalls')}</p> : (
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="th">{t('ai.colWhen')}</th><th className="th">{t('ai.colFeature')}</th><th className="th">{t('ai.colModel')}</th><th className="th">{t('ai.colTokens')}</th><th className="th">{t('ai.colCost')}</th><th className="th">{t('ai.colResult')}</th></tr></thead>
          <tbody>{usage.recent.map((r) => <tr key={r.id}><td className="td num">{when(r.createdAt)}</td><td className="td">{r.feature in FEATURES || r.feature === 'system.ping' ? featureLabel(t, r.feature === 'system.ping' ? 'system.ping' : r.feature, 'label') : r.feature}</td><td className="td">{r.model}</td><td className="td num">{r.inTokens} / {r.outTokens}</td><td className="td num">{r.cacheHit ? t('ai.cached') : usd(r.costUsd)}</td><td className="td">{r.ok ? t('ai.resultOk') : r.error === 'invalid_output' ? t('ai.invalidOutput') : r.error ?? t('ai.resultError')}</td></tr>)}</tbody></table></div>)}
    </div>
  );
}
