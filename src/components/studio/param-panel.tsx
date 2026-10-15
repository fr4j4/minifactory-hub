'use client';
import { useMemo, useState } from 'react';
import { RotateCcw, Search } from 'lucide-react';
import { useLocale, useT } from '@/i18n/client';
import { modifiedKeys, PARAM_PAGES, searchParams, validateValue, normalizeValue, labelOf, tipOf, type ParamDef, type ParamMode, type ParamType } from '@/lib/slicer/schema';

export type Ov = { machine: Record<string, string>; process: Record<string, string>; filament: Record<string, string> };
const MODES: ParamMode[] = ['simple', 'advanced', 'expert'];

/** Panel de ajustes del Estudio: páginas como en Orca, buscador en es/en, valor modificado resaltado con «restablecer», niveles Simple/Avanzado/Experto y validación en línea. */
export function ParamPanel({ base, overrides, onChange, disabled }: { base: Ov; overrides: Ov; onChange: (type: ParamType, key: string, value: string | null) => void; disabled?: boolean }) {
  const t = useT(); const lang = useLocale() === 'en' ? 'en' : 'es';
  const [type, setType] = useState<ParamType>('process'); const [mode, setMode] = useState<ParamMode>('simple'); const [q, setQ] = useState(''); const [onlyMod, setOnlyMod] = useState(false);
  const mods = useMemo(() => ({ process: modifiedKeys(base.process, overrides.process), filament: modifiedKeys(base.filament, overrides.filament), machine: modifiedKeys(base.machine, overrides.machine) }), [base, overrides]);
  const list = useMemo(() => searchParams(q, type, mode).filter((p) => !onlyMod || mods[type].includes(p.key)), [q, type, mode, onlyMod, mods]);
  const pages = PARAM_PAGES[type];
  const row = (p: ParamDef) => {
    const ov = overrides[type][p.key]; const baseV = base[type][p.key] ?? ''; const val = ov ?? baseV; const modified = mods[type].includes(p.key); const issue = ov != null ? validateValue(type, p.key, ov) : null;
    const set = (v: string) => onChange(type, p.key, v === baseV ? null : v);
    return (
      <li key={p.key} className="py-2 border-b border-[var(--line)] last:border-0" data-testid={`param-row-${p.key}`}>
        <div className="flex items-center gap-2">
          <label className="flex-1 min-w-0 text-sm" htmlFor={`pp-${p.key}`}>{modified && <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent)] mr-1.5" aria-label={t('studio.modified')} />}{labelOf(p, lang)}{p.unit && <span className="muted"> ({p.unit})</span>}</label>
          {p.kind === 'select' ? <select id={`pp-${p.key}`} className="input !w-44 !min-h-[34px]" value={val} disabled={disabled} onChange={(e) => set(e.target.value)} data-testid={`param-${p.key}`}>{[...new Set([val, ...(p.options ?? [])].filter(Boolean))].map((o) => <option key={o} value={o}>{o}</option>)}</select>
            : p.kind === 'bool' ? <input id={`pp-${p.key}`} type="checkbox" className="h-5 w-5" checked={val === '1'} disabled={disabled} onChange={(e) => set(e.target.checked ? '1' : '0')} data-testid={`param-${p.key}`} />
            : <input id={`pp-${p.key}`} className={`input !w-28 !min-h-[34px] text-right tabular ${issue ? 'border-red-500' : ''}`} inputMode="decimal" value={val} disabled={disabled} onChange={(e) => set(normalizeValue(type, p.key, e.target.value))} aria-invalid={!!issue} data-testid={`param-${p.key}`} />}
          <button type="button" className={`btn-ghost btn-sm !px-1.5 ${modified ? '' : 'invisible'}`} onClick={() => onChange(type, p.key, null)} aria-label={t('studio.reset')} title={t('studio.reset')}><RotateCcw className="h-3.5 w-3.5" aria-hidden /></button>
        </div>
        <p className="muted text-xs mt-0.5">{tipOf(p, lang)}{modified && baseV !== '' && <span> · {t('studio.base')}: <b>{baseV}</b></span>}</p>
        {issue && <p role="alert" className="text-xs text-danger mt-0.5">{issue.kind === 'range' ? t('studio.issueRange', { min: issue.min ?? '—', max: issue.max ?? '—' }) : issue.kind === 'option' ? t('studio.issueOption') : t('studio.issueNumber')}</p>}
      </li>);
  };
  return (
    <div className="space-y-3" data-testid="param-panel">
      <div className="relative"><Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 muted" aria-hidden /><input className="input !pl-8" placeholder={t('studio.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('studio.search')} data-testid="param-search" /></div>
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex gap-1" role="tablist" aria-label={t('studio.profileType')}>{(['process', 'filament', 'machine'] as const).map((k) => <button key={k} role="tab" aria-selected={type === k} className={`btn-sm px-2.5 rounded-lg border ${type === k ? 'bg-[var(--panel)] text-[var(--panel-ink)] border-transparent' : 'btn-ghost'}`} onClick={() => setType(k)}>{t(`studio.type_${k}` as 'studio.type_process')}{mods[k].length > 0 && <span className="num ml-1.5 text-[11px]">{mods[k].length}</span>}</button>)}</div>
        <div className="flex gap-1" role="group" aria-label={t('studio.level')}>{MODES.map((m) => <button key={m} aria-pressed={mode === m} className={`btn-sm px-2 rounded-lg border text-xs ${mode === m ? 'border-[var(--accent)] font-semibold' : 'btn-ghost'}`} onClick={() => setMode(m)} data-testid={`level-${m}`}>{t(`studio.level_${m}` as 'studio.level_simple')}</button>)}</div>
      </div>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={onlyMod} onChange={(e) => setOnlyMod(e.target.checked)} data-testid="only-modified" />{t('studio.onlyModified')}</label>
      {list.length === 0 ? <p className="muted text-sm py-4 text-center">{t('studio.nothing')}</p> : q ? <ul>{list.map(row)}</ul> : pages.map((pg) => { const items = list.filter((p) => p.page === pg.id); if (!items.length) return null; const n = items.filter((p) => mods[type].includes(p.key)).length; return <section key={pg.id}><h4 className="eyebrow !text-[10px] mt-3 mb-1 flex items-center gap-2">{pg[lang]}{n > 0 && <span className="badge border-[var(--accent)] text-[10px] py-0">{t('studio.changes', { n })}</span>}</h4><ul>{items.map(row)}</ul></section>; })}
    </div>
  );
}
