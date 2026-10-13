'use client';
import { useState } from 'react';
import { clearAiPromptLogsAction, saveAiSettingsAction, testAiConnectionAction, type AiSettingsInput } from '@/actions/ai';
import { FEATURES, FEATURE_KEYS } from '@/lib/ai/types';
import type { PublicAiSettings } from '@/lib/ai/config';
import { useAction, useToast } from './client';

const ROLES: Array<[string, string]> = [['admin', 'Administrador'], ['operador', 'Operador'], ['ventas', 'Ventas']];
const usd = (n: number) => `US$ ${n.toFixed(n < 1 ? 4 : 2)}`;

export function AiSettingsForm({ st, canClear }: { st: PublicAiSettings; canClear: boolean }) {
  const { run, pending } = useAction(); const toast = useToast();
  const [v, setV] = useState({
    enabled: st.enabled, provider: st.provider, baseUrl: st.baseUrl, models: st.models, localOnly: st.localOnly,
    features: Object.fromEntries(FEATURE_KEYS.map((k) => [k, st.features[k] === true])) as Record<string, boolean>,
    roles: Object.fromEntries(FEATURE_KEYS.map((k) => [k, st.roles[k] ?? ['admin']])) as Record<string, string[]>,
    privacy: st.privacy, budget: st.budget, retention: st.retention,
  });
  const [key, setKey] = useState(''); const [clearKey, setClearKey] = useState(false);
  const [test, setTest] = useState<null | { ok: boolean; text: string }>(null); const [testing, setTesting] = useState(false);
  const payload = (): AiSettingsInput => ({ ...v, apiKey: key || undefined, clearKey: clearKey || undefined } as AiSettingsInput);
  const off = st.forcedOff;
  const local = v.provider === 'openai-compat';

  async function probar() {
    setTesting(true); setTest(null);
    const r = await testAiConnectionAction(payload());
    setTesting(false);
    if (!r.ok) return setTest({ ok: false, text: r.error });
    const d = r.data as any;
    setTest(d.ok ? { ok: true, text: `Conexión correcta · modelo ${d.model} · ${d.latencyMs} ms${d.vision ? ' · admite imágenes' : ''}` } : { ok: false, text: d.error });
  }

  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); run(() => saveAiSettingsAction(payload()), { ok: 'Configuración de IA guardada', onOk: () => { setKey(''); setClearKey(false); } }); }} data-testid="ai-form">
      <p className="text-sm muted">La IA es <b>opcional</b>: mientras esté apagada no aparece ningún control de IA ni se envía información a ningún servicio. La IA solo propone; nada se aplica sin que una persona lo confirme.</p>
      {off && <p className="text-sm rounded-lg border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2" role="status">La variable <code>AI_FORCE_DISABLED=1</code> mantiene la IA apagada en este servidor.</p>}

      <section className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={v.enabled} onChange={(e) => setV({ ...v, enabled: e.target.checked })} data-testid="ai-enabled" /> Activar funciones de IA en este taller</label>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block"><span className="label">Proveedor</span>
            <select className="input" value={v.provider} onChange={(e) => setV({ ...v, provider: e.target.value as any })} data-testid="ai-provider">
              <option value="none">Ninguno</option><option value="anthropic">Anthropic (Claude)</option><option value="openai-compat">Compatible con OpenAI (Ollama, LM Studio, vLLM, OpenRouter…)</option>
            </select></label>
          {v.provider !== 'none' && <label className="block"><span className="label">URL base {v.provider === 'anthropic' ? '(opcional)' : ''}</span>
            <input className="input" value={v.baseUrl} onChange={(e) => setV({ ...v, baseUrl: e.target.value })} placeholder={local ? 'http://ollama:11434/v1' : 'https://api.anthropic.com'} data-testid="ai-base-url" /></label>}
          {v.provider !== 'none' && <label className="block"><span className="label">Clave de API {local ? '(si el servicio la exige)' : ''}</span>
            <input type="password" autoComplete="new-password" className="input" value={key} onChange={(e) => { setKey(e.target.value); setClearKey(false); }} placeholder={st.hasKey && !clearKey ? `guardada ••••${st.keyLast4}` : st.envKey ? 'se usa AI_API_KEY del servidor' : ''} data-testid="ai-key" />
            {st.hasKey && <button type="button" className="text-xs underline mt-1" onClick={() => { setClearKey(true); setKey(''); }}>{clearKey ? 'Se borrará al guardar' : 'Borrar la clave guardada'}</button>}</label>}
        </div>
        {v.provider !== 'none' && <div className="grid sm:grid-cols-3 gap-3">
          {(['fast', 'smart', 'vision'] as const).map((t) => <label key={t} className="block"><span className="label">Modelo {{ fast: 'rápido (clasificar, redactar)', smart: 'avanzado (perfiles, análisis)', vision: 'con imágenes (opcional)' }[t]}</span>
            <input className="input" value={v.models[t]} onChange={(e) => setV({ ...v, models: { ...v.models, [t]: e.target.value } })} data-testid={`ai-model-${t}`} /></label>)}
        </div>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-ghost" disabled={testing || v.provider === 'none'} onClick={probar} data-testid="ai-test">{testing ? 'Probando…' : 'Probar conexión'}</button>
          {test && <span role="status" className={test.ok ? 'text-sm text-emerald-700' : 'text-sm text-red-700'} data-testid="ai-test-result">{test.text}</span>}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-medium mb-1.5">Funciones</h3>
        <p className="text-xs muted mb-2">Cada función se activa por separado y se limita por rol. Las marcadas «próximamente» se irán habilitando en las siguientes fases.</p>
        <div className="divide-y divide-[var(--line)] border border-[var(--line)] rounded-xl">
          {FEATURE_KEYS.map((k) => { const f = FEATURES[k]; return (
            <div key={k} className="p-3 grid sm:grid-cols-[1fr_auto] gap-2 items-center">
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={v.features[k]} onChange={(e) => setV({ ...v, features: { ...v.features, [k]: e.target.checked } })} data-testid={`ai-feat-${k}`} />
                <span><span className="font-medium">{f.label}</span>{!f.available && <span className="ml-2 text-xs muted">(próximamente)</span>}<br /><span className="text-xs muted">{f.desc}{f.vision ? ' · usa imágenes' : ''}</span></span></label>
              <div className="flex gap-3 text-xs">{ROLES.map(([r, l]) => <label key={r} className="flex items-center gap-1"><input type="checkbox" checked={v.roles[k].includes(r)} onChange={(e) => setV({ ...v, roles: { ...v.roles, [k]: e.target.checked ? [...v.roles[k], r] : v.roles[k].filter((x) => x !== r) } })} />{l}</label>)}</div>
            </div>); })}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Privacidad</h3>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.privacy.redactPII} onChange={(e) => setV({ ...v, privacy: { ...v.privacy, redactPII: e.target.checked } })} /> Ocultar datos personales (correos, teléfonos, RUT y nombres de clientes) antes de enviar</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.privacy.sendImages} onChange={(e) => setV({ ...v, privacy: { ...v.privacy, sendImages: e.target.checked } })} /> Permitir enviar imágenes (las fotos marcadas «solo uso interno» nunca se envían)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.localOnly} onChange={(e) => setV({ ...v, localOnly: e.target.checked })} data-testid="ai-local-only" /> Solo local: bloquear cualquier proveedor que no esté en tu red</label>
        <label className="block max-w-xs"><span className="label">Guardar el texto de las consultas (días; 0 = no guardar)</span>
          <input type="number" min={0} max={90} className="input" value={v.retention.logPromptsDays} onChange={(e) => setV({ ...v, retention: { logPromptsDays: Math.max(0, Math.min(90, +e.target.value || 0)) } })} /></label>
        {canClear && <button type="button" className="btn-ghost btn-sm" onClick={() => run(() => clearAiPromptLogsAction(), { ok: 'Textos de consultas borrados' })}>Borrar textos guardados ahora</button>}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Presupuesto</h3>
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="block"><span className="label">Tope mensual (US$; vacío = sin tope)</span>
            <input type="number" min={0} step="0.5" className="input" value={v.budget.monthlyUsd ?? ''} onChange={(e) => setV({ ...v, budget: { ...v.budget, monthlyUsd: e.target.value === '' ? null : +e.target.value } })} data-testid="ai-budget" /></label>
          <label className="block"><span className="label">Usos por persona al día (0 = sin límite)</span>
            <input type="number" min={0} className="input" value={v.budget.perUserDailyCalls} onChange={(e) => setV({ ...v, budget: { ...v.budget, perUserDailyCalls: Math.max(0, Math.round(+e.target.value || 0)) } })} /></label>
          <label className="flex items-center gap-2 text-sm self-end pb-2"><input type="checkbox" checked={v.budget.hardStop} onChange={(e) => setV({ ...v, budget: { ...v.budget, hardStop: e.target.checked } })} /> Detener al llegar al tope</label>
        </div>
      </section>

      <div className="flex justify-end"><button className="btn-primary" disabled={pending} data-testid="ai-save" onClick={() => { if (v.enabled && v.provider === 'none') toast.push('Elige un proveedor para activar la IA', 'info'); }}>Guardar</button></div>
    </form>
  );
}

export function AiUsagePanel({ usage, budget }: { usage: { month: { costUsd: number; calls: number }; byFeature: Array<{ feature: string; n: number; cost: number; tin: number; tout: number }>; recent: Array<{ id: string; createdAt: Date | string; feature: string; model: string; inTokens: number; outTokens: number; costUsd: number; ok: boolean; cacheHit: boolean; error: string | null }> }; budget: number | null }) {
  const pct = budget ? Math.min(100, (usage.month.costUsd / budget) * 100) : null;
  return (
    <div className="space-y-4" data-testid="ai-usage">
      <p className="text-sm">Este mes: <b className="num">{usd(usage.month.costUsd)}</b> en <b className="num">{usage.month.calls}</b> llamadas{budget != null && <> · tope {usd(budget)} ({pct!.toFixed(0)} %)</>}. El costo es una estimación según tarifas públicas de Anthropic; en otros proveedores se asume 0 (puedes definir tarifas con AI_PRICES).</p>
      {pct != null && <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Consumo del presupuesto mensual"><div className={`h-2 rounded-full ${pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} /></div>}
      {usage.recent.length === 0 ? <p className="text-sm muted">Aún no hay llamadas registradas.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="th">Cuándo</th><th className="th">Función</th><th className="th">Modelo</th><th className="th">Tokens</th><th className="th">Costo</th><th className="th">Resultado</th></tr></thead>
          <tbody>{usage.recent.map((r) => <tr key={r.id}><td className="td num">{new Date(r.createdAt).toLocaleString('es-CL')}</td><td className="td">{(FEATURES as any)[r.feature]?.label ?? r.feature}</td><td className="td">{r.model}</td><td className="td num">{r.inTokens} / {r.outTokens}</td><td className="td num">{r.cacheHit ? 'caché' : usd(r.costUsd)}</td><td className="td">{r.ok ? 'OK' : r.error ?? 'Error'}</td></tr>)}</tbody></table></div>)}
    </div>
  );
}
