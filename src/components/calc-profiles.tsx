'use client';
import { useMemo, useState } from 'react';
import { priceLine } from '@/lib/item-price';
import { profileDesc, profileName } from '@/lib/calc-presets';
import { resolveRates, type CalcProfile, type DeepPartial, type Rates } from '@/lib/pricing';
import { cn, money, pct } from '@/lib/format';
import { Badge } from './ui';
import { CopyButton, useToast } from './client';
import { CheckField, NumField, SelectField, pathGet, pathSet } from './calc-fields';
import { useT } from '@/i18n/client';

type Desc = { path: string; type: 'num' | 'bool' | 'sel'; unit?: string; options?: Array<[string, string]> };
/** Parámetros que un perfil puede cambiar (el IVA no es uno de ellos). */
const PARAMS: Desc[] = [
  { path: 'marginPct', type: 'num', unit: '%' }, { path: 'minMarginPct', type: 'num', unit: '%' }, { path: 'marginMode', type: 'sel', options: [['margen', 'margen'], ['recargo', 'recargo']] },
  { path: 'laborHour', type: 'num', unit: '$/h' }, { path: 'prepMinutes', type: 'num', unit: 'min' }, { path: 'supervisionMinPerHour', type: 'num', unit: 'min/h' }, { path: 'postMinutes', type: 'num', unit: 'min' },
  { path: 'wastePct', type: 'num', unit: '%' }, { path: 'failRatePct', type: 'num', unit: '%' }, { path: 'volumeMinMarginPct', type: 'num', unit: '%' },
  { path: 'minPrice', type: 'num', unit: '$' }, { path: 'floors.perGram', type: 'num', unit: '$/g' }, { path: 'floors.perOrder', type: 'num', unit: '$' },
  { path: 'payFeePct', type: 'num', unit: '%' }, { path: 'channelFeePct', type: 'num', unit: '%' }, { path: 'packPerUnit', type: 'num', unit: '$' },
  { path: 'setupHoursPerPlate', type: 'num', unit: 'h' }, { path: 'powerFactor', type: 'num', unit: '0–1' },
  { path: 'costBasis', type: 'sel', options: [['promedio', 'promedio'], ['reposicion', 'reposición'], ['max', 'máx.']] }, { path: 'useTimeFactor', type: 'bool' },
];
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'perfil';

export function ProfilesManager({ profiles, setProfiles, base, usage, canEdit, sample }: {
  profiles: CalcProfile[]; setProfiles: (p: CalcProfile[]) => void; base: Rates; usage: Record<string, { customers: number; channels: number }>; canEdit: boolean;
  sample: (rt: Rates) => { unit: number; margin: number | null } | null;
}) {
  const t = useT(); const toast = useToast();
  const [sel, setSel] = useState(profiles.find((p) => p.isDefault)?.id ?? profiles[0]?.id ?? '');
  const [imp, setImp] = useState(''); const [showImp, setShowImp] = useState(false);
  const p = profiles.find((x) => x.id === sel);
  const upd = (patch: Partial<CalcProfile>) => setProfiles(profiles.map((x) => (x.id === sel ? { ...x, ...patch } : x)));
  const setParam = (path: string, v: unknown) => upd({ params: pathSet(p!.params, path, v) as DeepPartial<Rates> });
  const readonly = !canEdit || p?.id === 'legacy';
  const eff = useMemo(() => (p ? resolveRates(base, p.params) : base), [p, base]);
  const smp = useMemo(() => (p ? sample(eff) : null), [p, eff, sample]);
  const baseSmp = useMemo(() => sample(base), [base, sample]);

  const make = (src?: CalcProfile) => {
    const name = src ? t('calc.prof.copyOf', { name: profileName(t, src) }) : t('calc.prof.newName');
    let id = slug(name); while (profiles.some((x) => x.id === id)) id += '-2';
    const np: CalcProfile = { id, name, description: src ? profileDesc(t, src) : '', params: src ? JSON.parse(JSON.stringify(src.params)) : {}, builtin: false, isDefault: false };
    setProfiles([...profiles, np]); setSel(id);
  };
  const remove = () => { if (!p || p.builtin || !window.confirm(t('calc.prof.confirmDelete'))) return; const rest = profiles.filter((x) => x.id !== p.id); if (p.isDefault && rest[0]) rest[0] = { ...rest[0], isDefault: true }; setProfiles(rest); setSel(rest[0]?.id ?? ''); };
  const makeDefault = () => setProfiles(profiles.map((x) => ({ ...x, isDefault: x.id === sel, archived: x.id === sel ? false : x.archived })));
  const doImport = () => {
    try {
      const data = JSON.parse(imp) as CalcProfile | CalcProfile[]; const list = Array.isArray(data) ? data : [data]; let next = [...profiles];
      for (const q of list) { if (!q?.name || typeof q.params !== 'object') throw new Error('x'); let id = slug(q.id || q.name); while (next.some((x) => x.id === id)) id += '-2'; next = [...next, { id, name: q.name, description: q.description ?? '', params: q.params, builtin: false, isDefault: false }]; }
      setProfiles(next); setImp(''); setShowImp(false); toast.push(t('calc.prof.imported', { n: list.length }));
    } catch { toast.push(t('calc.prof.importError'), 'err'); }
  };
  const u = p ? usage[p.id] : undefined;

  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr]" data-testid="profiles-manager">
      <div className="space-y-2">
        <ul className="space-y-1" role="listbox" aria-label={t('calc.prof.list')}>
          {profiles.map((x) => (
            <li key={x.id}><button type="button" role="option" aria-selected={x.id === sel} onClick={() => setSel(x.id)} data-testid={`profile-${x.id}`}
              className={cn('w-full text-left rounded-lg border px-2 py-1.5 text-sm min-h-[44px] md:min-h-[36px]', x.id === sel ? 'border-[var(--panel)] bg-[var(--panel)] text-[var(--panel-ink)] dark:bg-slate-700' : 'border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800', x.archived && 'opacity-60')}>
              <span className="block truncate">{profileName(t, x)}</span>
              <span className="text-[11px] opacity-80">{x.isDefault ? t('calc.prof.default') : ''}{x.archived ? ` ${t('calc.prof.archived')}` : ''}</span></button></li>))}
        </ul>
        {canEdit && <div className="flex flex-wrap gap-2"><button type="button" className="btn-ghost btn-sm" onClick={() => make()} data-testid="profile-new">{t('calc.prof.new')}</button><button type="button" className="btn-ghost btn-sm" onClick={() => setShowImp((v) => !v)}>{t('calc.prof.import')}</button></div>}
        {showImp && <div className="space-y-2"><textarea className="input h-28 font-mono text-xs" value={imp} onChange={(e) => setImp(e.target.value)} aria-label={t('calc.prof.import')} placeholder='{"name":"…","params":{…}}' /><button type="button" className="btn-primary btn-sm" onClick={doImport} disabled={!imp.trim()}>{t('calc.prof.importDo')}</button></div>}
      </div>
      {p && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block"><span className="label">{t('common.name')}</span><input className="input" value={profileName(t, p)} disabled={readonly} onChange={(e) => upd({ name: e.target.value })} data-testid="profile-name" /></label>
            <label className="block"><span className="label">{t('common.description')}</span><input className="input" value={profileDesc(t, p)} disabled={readonly} onChange={(e) => upd({ description: e.target.value })} /></label>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {p.isDefault ? <Badge tone="green">{t('calc.prof.default')}</Badge> : canEdit && !p.archived && <button type="button" className="btn-ghost btn-sm" onClick={makeDefault}>{t('calc.prof.makeDefault')}</button>}
            {canEdit && <button type="button" className="btn-ghost btn-sm" onClick={() => make(p)}>{t('calc.prof.duplicate')}</button>}
            {canEdit && !p.isDefault && <button type="button" className="btn-ghost btn-sm" onClick={() => upd({ archived: !p.archived })}>{p.archived ? t('calc.prof.restore') : t('calc.prof.archive')}</button>}
            {canEdit && !p.builtin && <button type="button" className="btn-ghost btn-sm" onClick={remove}>{t('common.deleteLabel')}</button>}
            <CopyButton text={JSON.stringify({ ...p, id: undefined, builtin: undefined }, null, 2)} label={t('calc.prof.export')} className="btn-ghost btn-sm" />
          </div>
          {u && <p className="text-xs" role="status" data-testid="profile-usage">{t('calc.prof.usage', { customers: u.customers, channels: u.channels })}</p>}
          {p.id === 'legacy' && <p className="text-sm muted">{t('calc.prof.legacyNote')}</p>}
          {smp && baseSmp && p.id !== 'legacy' && <p className="text-xs muted tabular" data-testid="profile-sample">{t('calc.prof.sample', { price: money(smp.unit), margin: smp.margin != null ? pct(smp.margin, 0) : '—', base: money(baseSmp.unit) })}</p>}
          {p.id !== 'legacy' && (
            <fieldset disabled={readonly} className="space-y-1">
              <legend className="label">{t('calc.prof.params')}</legend>
              <p className="text-xs muted mb-2">{t('calc.prof.paramsHelp')}</p>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
                {PARAMS.map((d) => {
                  const own = pathGet(p.params, d.path) !== undefined; const baseVal = pathGet(base, d.path); const cur = own ? pathGet(p.params, d.path) : baseVal;
                  const label = t(`calc.param.${d.path.replace('.', '_')}` as never);
                  return (
                    <div key={d.path} className="flex items-end gap-2" data-testid={`param-${d.path}`}>
                      <label className="flex items-center gap-1.5 text-sm pb-2 min-h-[44px] md:min-h-0"><input type="checkbox" checked={own} onChange={(e) => setParam(d.path, e.target.checked ? baseVal : undefined)} aria-label={t('calc.prof.override', { name: label })} /></label>
                      <div className="flex-1">
                        {d.type === 'num' && <NumField label={label} unit={d.unit} value={Number(cur ?? 0)} disabled={!own} onChange={(v) => setParam(d.path, v)} testid={`pp-${d.path}`} />}
                        {d.type === 'bool' && <CheckField label={label} checked={!!cur} disabled={!own} onChange={(v) => setParam(d.path, v)} />}
                        {d.type === 'sel' && <SelectField label={label} value={String(cur ?? '')} disabled={!own} onChange={(v) => setParam(d.path, v)} options={d.options!.map(([v, l]) => [v, d.path === 'marginMode' ? t(`calc.cfg.mode_${v}` as never) : d.path === 'costBasis' ? t(`calc.cfg.basis_${v}` as never) : l])} testid={`pp-${d.path}`} />}
                      </div>
                    </div>);
                })}
              </div>
              <div className="pt-2"><CheckField label={t('calc.prof.ownTiers')} checked={p.params.volumeTiers !== undefined} onChange={(v) => setParam('volumeTiers', v ? (base.volumeTiers ?? []).map((x) => ({ ...x })) : undefined)} />
                {p.params.volumeTiers !== undefined && (
                  <div className="mt-1 space-y-1.5">{(p.params.volumeTiers ?? []).map((tt, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 max-w-sm"><input type="number" min={1} className="input" aria-label={t('settings.fromUnits')} value={tt?.minQty ?? 0} onChange={(e) => setParam('volumeTiers', (p.params.volumeTiers ?? []).map((x, k) => (k === i ? { ...x, minQty: +e.target.value } : x)))} />
                      <input type="number" className="input" aria-label="%" value={tt?.pct ?? 0} onChange={(e) => setParam('volumeTiers', (p.params.volumeTiers ?? []).map((x, k) => (k === i ? { ...x, pct: +e.target.value } : x)))} />
                      <button type="button" className="btn-ghost btn-sm" aria-label={t('common.deleteLabel')} onClick={() => setParam('volumeTiers', (p.params.volumeTiers ?? []).filter((_, k) => k !== i))}>✕</button></div>))}
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setParam('volumeTiers', [...(p.params.volumeTiers ?? []), { minQty: 10, pct: -5 }])}>{t('calc.cfg.addTier')}</button></div>)}
              </div>
            </fieldset>
          )}
        </div>
      )}
    </div>
  );
}

/** Precio de un caso tipo con unas tarifas (para comparar perfiles y mostrar la vista previa en vivo). */
export function samplePrice(rt: Rates, profiles: CalcProfile[], machine: Parameters<typeof priceLine>[1]['machine'], material: Parameters<typeof priceLine>[1]['material'], c: { qty: number; g: number; h: number }) {
  const r = priceLine({ qty: c.qty, gramsTotal: c.g, hoursTotal: c.h, mode: 'manual', originKind: 'slicer' }, { rates: rt, profiles, material, machine });
  const total = r.suggestedUnit * c.qty;
  return { unit: r.suggestedUnit, total, margin: total > 0 ? ((total - r.cost) / total) * 100 : null, perHour: r.bd.pricePerHour ?? 0, bd: r.bd };
}
