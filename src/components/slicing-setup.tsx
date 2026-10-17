'use client';
import { TONES } from '@/components/badge';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCustomFilamentAction, customFilamentDefaultsAction, previewImportAction, importSelectedAction, processesForAction, setupAllFilamentsAction, setupFilamentAction, setupMachineAction } from '@/actions/slicer';
import { cn } from '@/lib/format';
import { Icon } from '@/components/shell';
import { Modal, useAction, useToast } from './client';
import { useT } from '@/i18n/client';
import type { TFn, MessageKey } from '@/i18n/translate';

export interface SetupData {
  machines: Array<{ id: string; name: string; brand: string | null; model: string | null; nozzle: string; nozzles: string[]; variants: Array<{ nozzle: string; base: string }>; setups: Array<{ nozzle: string; machineProfile: string; process: string | null }>; simulated: boolean; machineProfile: { id: string; name: string; baseName: string } | null; suggestedMachine: string | null; defaultProcess: { id: string; name: string } | null; processes: string[] }>;
  materials: Array<{ id: string; label: string; type: string; hex: string; filamentProfile: { id: string; name: string } | null; profileType: string | null; mismatch: boolean; suggested: string | null }>;
  machineOptions: Array<{ name: string; vendor: string }>; filamentOptions: Array<{ name: string; group: string }>; filamentProfiles: Array<{ id: string; name: string }>;
  done: { machines: number; materials: number };
}
const pretty = (n: string, t: TFn) => n.replace(/ @System$/, '').replace(/ @BBL (.+)$/, ` (${t('machines.bambuLab', { model: '$1' })})`).replace(/ nozzle$/, ` (${t('slicer.nozzleWord')})`);

function Step({ n, title, done, total, children, hint }: { n: number; title: string; done: number; total: number; children: React.ReactNode; hint: React.ReactNode }) {
  const ok = total > 0 && done === total;
  return (
    <section className="card overflow-hidden" data-testid={`setup-step-${n}`}>
      <header className="flex items-start gap-3 px-4 py-3.5 border-b border-[var(--line)]">
        <span className={cn('h-8 w-8 shrink-0 rounded-full grid place-items-center font-display font-semibold', ok ? 'bg-emerald-600 text-white' : 'bg-[var(--panel)] text-[var(--panel-ink)] dark:bg-slate-700')} aria-hidden>{ok ? <Icon name="check" className="h-4 w-4" /> : n}</span>
        <div className="min-w-0 flex-1"><h2 className="font-display text-lg font-semibold tracking-tight leading-tight">{title}</h2><p className="text-sm muted mt-0.5">{hint}</p></div>
        <span className={cn('num text-xs shrink-0 mt-1', ok ? 'text-ok' : 'muted')} data-testid={`setup-step-${n}-count`}>{done}/{total}</span>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function MachineRow({ m, options }: { m: SetupData['machines'][number]; options: SetupData['machineOptions'] }) {
  const t = useT();
  const { run, pending } = useAction();
  const [base, setBase] = useState(m.machineProfile?.baseName ?? m.suggestedMachine ?? ''); const [procs, setProcs] = useState<string[]>(m.processes); const [proc, setProc] = useState(m.processes[0] ?? '');
  const [q, setQ] = useState(''); const [pick, setPick] = useState(!m.machineProfile && !m.suggestedMachine);
  useEffect(() => { if (!base) return; if (base === (m.machineProfile?.baseName ?? m.suggestedMachine)) { setProcs(m.processes); setProc(m.processes[0] ?? ''); return; } processesForAction(base).then((r) => { if (r.ok) { setProcs(r.data); setProc(r.data[0] ?? ''); } }); }, [base]); // eslint-disable-line
  const ready = !!m.machineProfile && !!m.defaultProcess;
  const filtered = useMemo(() => { const tt = q.toLowerCase(); return options.filter((o) => !tt || o.name.toLowerCase().includes(tt)).slice(0, 80); }, [q, options]);
  return (
    <li className="rounded-2xl border border-[var(--line)] p-3.5 space-y-3" data-testid="setup-machine">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0"><div className="font-medium">{m.name}</div><div className="text-xs muted">{[m.brand, m.model].filter(Boolean).join(' ') || t('slicer.noBrandModelOnThe')} · {t('slicer.nozzleMm', { mm: m.nozzle })}{m.simulated ? ` · ${t('slicer.simulatedLower')}` : ''}</div></div>
        {ready ? <span className={cn('badge badge-led', TONES.green)}>{t('slicer.readyLabel')} {pretty(m.machineProfile!.baseName, t)} · {m.defaultProcess!.name}</span> : <span className={cn('badge badge-led', TONES.amber)}>{t('slicer.needsSetup')}</span>}
      </div>
      <div className="grid gap-3 md:grid-cols-[1.3fr_1fr_auto] items-end">
        <div>
          <span className="label">{t('slicer.whichPrinterIsIt')}</span>
          {!pick && base ? <div className="flex items-center gap-2"><div className="input flex items-center !bg-slate-50 dark:!bg-slate-800/40" data-testid="setup-machine-base">{pretty(base, t)}</div><button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => setPick(true)}>{t('slicer.change')}</button></div>
            : <div className="space-y-1.5"><input className="input" placeholder={t('slicer.searchA1P1sPrusaMk4')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('slicer.searchPrinter')} /><select className="input" size={5} value={base} onChange={(e) => { setBase(e.target.value); setPick(false); }} aria-label={t('slicer.printer')} data-testid="setup-machine-select">{filtered.map((o) => <option key={o.name} value={o.name}>{pretty(o.name, t)}{o.vendor !== 'BBL' ? ` · ${o.vendor}` : ''}</option>)}</select></div>}
        </div>
        <label className="block"><span className="label">{t('slicer.defaultQuality')}</span><select className="input" value={proc} onChange={(e) => setProc(e.target.value)} disabled={!procs.length} data-testid="setup-process">{procs.map((p) => <option key={p} value={p}>{pretty(p, t)}</option>)}</select></label>
        <button className={ready ? 'btn-ghost' : 'btn-primary'} disabled={pending || !base || !proc} onClick={() => run(() => setupMachineAction(m.id, base, proc), { ok: t('slicer.readyToSlice3', { material: m.name }) })} data-testid="setup-machine-save">{ready ? t('slicer.update') : t('slicer.use')}</button>
      </div>
      {m.variants.length > 1 && (
        <div data-testid="setup-nozzles"><span className="label">{t('nozzle.nozzleSetLabel')}</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('nozzle.nozzleSetLabel')}>{m.variants.map((v) => { const on = v.base === base; const done = m.setups.some((x) => x.nozzle === v.nozzle); return (
            <button key={v.nozzle} type="button" role="radio" aria-checked={on} onClick={() => { setBase(v.base); setPick(false); }} data-testid={`setup-nozzle-${v.nozzle}`}
              className={cn('num min-h-[36px] px-3 rounded-xl border text-sm', on ? 'bg-[var(--panel)] text-[var(--panel-ink)] border-transparent dark:bg-slate-700' : 'border-[var(--line)] hover:bg-slate-100 dark:hover:bg-slate-800')}>{t('nozzle.mm', { n: v.nozzle.replace('.', ',') })}{done && <><Icon name="check" className="inline h-3.5 w-3.5 ml-1 -mt-0.5" /><span className="sr-only"> ({t('nozzle.nozzleReady')})</span></>}</button>); })}</div>
          <p className="text-xs muted mt-1">{t('nozzle.setupNozzleHelp')}</p>
        </div>)}
      <p className="text-xs muted">{t('slicer.theQualitiesAreTheOrcaslicer')}</p>
    </li>
  );
}

function MaterialRow({ m, options, profiles }: { m: SetupData['materials'][number]; options: SetupData['filamentOptions']; profiles: SetupData['filamentProfiles'] }) {
  const t = useT();
  const { run, pending } = useAction();
  const [val, setVal] = useState(m.mismatch && m.suggested ? `b:${m.suggested}` : m.filamentProfile ? `p:${m.filamentProfile.id}` : m.suggested ? `b:${m.suggested}` : '');
  const groups = useMemo(() => [...new Set(options.map((o) => o.group))], [options]);
  return (
    <li className="py-2.5 flex flex-wrap items-center gap-3" data-testid="setup-material">
      <span className="h-5 w-5 rounded-full border border-black/15 shrink-0" style={{ background: m.hex }} aria-hidden />
      <div className="min-w-[160px] flex-1"><div className="text-sm font-medium" data-testid="setup-material-label">{m.label}</div><div className="text-xs muted">{m.filamentProfile ? <>{t('slicer.profile')} <b>{m.filamentProfile.name}</b></> : t('slicer.noFilamentProfileThisMaterial')}</div>
        {m.mismatch && <div className="text-xs text-red-700 dark:text-red-400 mt-0.5" role="alert" data-testid="setup-material-mismatch"><Icon name="alert" className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />{t('slicer.profileMismatch', { profile: m.profileType, material: m.type })}</div>}</div>
      <select className="input !w-auto min-w-[240px] max-w-full" value={val} onChange={(e) => setVal(e.target.value)} aria-label={t('slicer.filamentProfileFor', { material: m.label })} data-testid="setup-material-select">
        <option value="">{t('slicer.chooseProfile')}</option>
        {profiles.length > 0 && <optgroup label={t('slicer.myProfiles')}>{profiles.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.name}</option>)}</optgroup>}
        {groups.map((g) => <optgroup key={g} label={t('slicer.factory', { group: g})}>{options.filter((o) => o.group === g).map((o) => <option key={o.name} value={`b:${o.name}`}>{pretty(o.name, t)}{o.name === m.suggested ? ` ★ ${t('slicer.suggestedWord')}` : ''}</option>)}</optgroup>)}
      </select>
      <button className="btn-ghost btn-sm" disabled={pending || !val || val === `p:${m.filamentProfile?.id}`} onClick={() => run(() => setupFilamentAction(m.id, val.startsWith('p:') ? { profileId: val.slice(2) } : { base: val.slice(2) }), { ok: t('slicer.profileAssigned2') })} data-testid="setup-material-save">{t('slicer.assign')}</button>
      <CustomFilamentButton small materialId={m.id} type={m.type} label={t('slicer.custom')} />
    </li>
  );
}

export function SlicingSetup({ data, canEdit }: { data: SetupData; canEdit: boolean }) {
  const t = useT();
  const { run, pending } = useAction();
  const missing = data.materials.filter((m) => (!m.filamentProfile || m.mismatch) && m.suggested);
  const ready = data.machines.length > 0 && data.done.machines === data.machines.length;
  return (
    <div className="space-y-5">
      <section className={cn('rounded-3xl p-5 md:p-6 ring-1', ready ? 'bg-emerald-50 ring-emerald-200 dark:bg-emerald-950/30 dark:ring-emerald-900' : 'bg-[var(--panel)] text-[var(--panel-ink)] ring-black/5 dark:ring-white/[.07]')} data-testid="setup-summary">
        <h2 className="font-display text-xl font-semibold tracking-tight">{ready ? t('slicer.readyToSlice') : t('slicer.whatIsNeededToSlice')}</h2>
        <p className={cn('text-sm mt-1.5 max-w-3xl', ready ? 'text-emerald-900 dark:text-emerald-200' : 'text-white/75')}>
          {t('slicer.introSameProfiles')} <b>{t('slicer.whichPrinterEachMachineIs')}</b>, <b>{t('slicer.whichQualityToUseBy')}</b> {t('slicer.andWord')} <b>{t('slicer.whichFilamentEachMaterialIs')}</b> {t('slicer.introFromInventory')}</p>
        {canEdit && <div className="mt-4 flex flex-wrap gap-2"><ImportPresetsButton dark={!ready} /><CustomFilamentButton label={t('slicer.customFilament')} dark={!ready} /></div>}
      </section>
      <Step n={1} title={t('slicer.printersAndQuality')} done={data.done.machines} total={data.machines.length} hint={t('slicer.chooseTheModelOfEach')}>
        {data.machines.length === 0 ? <p className="text-sm muted">{t('slicer.noFdm')} <Link className="underline" href="/maquinas/nueva">{t('slicer.addOne')}</Link> {t('slicer.orWord')} <Link className="underline" href="/maquinas/conectores">{t('slicer.connectYourBambuLab')}</Link>.</p>
          : <ul className="space-y-3">{data.machines.map((m) => <MachineRow key={m.id} m={m} options={data.machineOptions} />)}</ul>}
      </Step>
      <Step n={2} title={t('slicer.filamentsFromYourInventory')} done={data.done.materials} total={data.materials.length} hint={t('slicer.eachMaterialNeedsAFilament')}>
        {missing.length > 1 && canEdit && <button className="btn-primary btn-sm mb-3" disabled={pending} onClick={() => run(() => setupAllFilamentsAction(missing.map((m) => ({ materialId: m.id, base: m.suggested! }))), { ok: t('slicer.materialsConfigured2', { missing: missing.length }) })} data-testid="setup-all-filaments">{t('slicer.useSuggestedRemaining', { n: missing.length })}</button>}
        {data.materials.length === 0 ? <p className="text-sm muted">{t('slicer.noMaterials')} <Link className="underline" href="/inventario">{t('slicer.addThem')}</Link> {t('slicer.orCreateCustom')}</p>
          : <ul className="divide-y divide-[var(--line)]">{data.materials.map((m) => <MaterialRow key={m.id} m={m} options={data.filamentOptions} profiles={data.filamentProfiles} />)}</ul>}
      </Step>
      <Step n={3} title={t('slicer.slice2')} done={ready ? 1 : 0} total={1} hint={t('slicer.onceTheAboveIsReady')}>
        <div className="flex flex-wrap gap-2"><Link className={ready ? 'btn-primary' : 'btn-ghost'} href="/archivos">{t('slicer.goTo3dFiles')}</Link><Link className="btn-ghost" href="/laminador">{t('slicer.viewAndAdjustProfiles')}</Link></div>
      </Step>
    </div>
  );
}

/* ── Importar desde Bambu Studio / OrcaSlicer ─────────────────────────────────────────────────── */
type Prev = { key: string; type: 'machine' | 'process' | 'filament'; name: string; baseName: string | null; keys: number; source: string; note: string | null; ok: boolean; exists: boolean };
const TYPE_ES = { machine: 'slicer.printer', process: 'slicer.process', filament: 'slicer.filament' } as const;
export function ImportPresetsButton({ dark }: { dark?: boolean }) {
  const t = useT();
  const router = useRouter(); const toast = useToast();
  const [open, setOpen] = useState(false); const [files, setFiles] = useState<File[]>([]); const [prev, setPrev] = useState<Prev[] | null>(null); const [sel, setSel] = useState<Set<string>>(new Set()); const [busy, setBusy] = useState(false); const [how, setHow] = useState<'3mf' | 'bundle' | 'json'>('3mf');
  const fd = (extra?: Record<string, string>) => { const f = new FormData(); for (const x of files) f.append('files', x); for (const [k, v] of Object.entries(extra ?? {})) f.append(k, v); return f; };
  const analyze = async (list: File[]) => {
    setFiles(list); setPrev(null); if (!list.length) return; setBusy(true);
    const f = new FormData(); for (const x of list) f.append('files', x);
    const r = await previewImportAction(f); setBusy(false);
    if (!r.ok) { toast.push(r.error, 'err'); return; }
    setPrev(r.data); setSel(new Set(r.data.filter((p) => p.ok).map((p) => p.key)));
  };
  const save = async () => {
    setBusy(true); const r = await importSelectedAction(fd({ keys: [...sel].join('\n') })); setBusy(false);
    if (!r.ok) { toast.push(r.error, 'err'); return; }
    toast.push(t('slicer.importedNew2', { count: r.data.created, v: r.data.updated ? t('slicer.updatedNewVersion', { count: r.data.updated }) : '' })); setOpen(false); setFiles([]); setPrev(null); router.refresh();
  };
  return (
    <>
      <button className={dark ? 'btn-ghost !bg-transparent !text-white !border-white/25 hover:!bg-white/10' : 'btn-ghost'} onClick={() => setOpen(true)} data-testid="import-presets">{t('slicer.importFromBambuStudioOrcaslicer')}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('slicer.importYourProfiles')} wide>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1 rounded-xl border border-[var(--line)] p-1 w-fit" role="tablist">{([['3mf', t('slicer.easiestA3mfProject')], ['bundle', t('slicer.profileBundle')], ['json', t('slicer.jsonFiles')]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={how === k} className={cn('px-3 min-h-[36px] rounded-lg text-sm', how === k ? 'bg-[var(--panel)] text-[var(--panel-ink)] dark:bg-slate-700' : 'muted hover:bg-slate-100 dark:hover:bg-slate-800')} onClick={() => setHow(k)}>{l}</button>)}</div>
          {how === '3mf' && <ol className="list-decimal pl-5 text-sm space-y-1"><li>{t('slicer.step3mf1')} <b>{t('slicer.yourPrinter')}</b>, <b>{t('slicer.yourFilaments')}</b> {t('slicer.andWord')} <b>{t('slicer.yourProcess')}</b> {t('slicer.step3mf1b')}</li><li>{t('slicer.step3mf2')} <b>{t('slicer.fileSaveProjectAs')}</b> {t('slicer.step3mf2b')}</li><li>{t('slicer.uploadItHereWeImport')}</li></ol>}
          {how === 'bundle' && <ol className="list-decimal pl-5 text-sm space-y-1"><li>{t('slicer.stepBundle1')} <b>{t('slicer.fileExportExportPresetBundle')}</b> (Export Preset Bundle).</li><li>{t('slicer.stepBundle2a')} <b>{t('slicer.printer')}</b> {t('slicer.stepBundle2b')} <b>{t('slicer.filament')}</b> (<code>.bbsflmt</code>).</li><li>{t('slicer.stepBundle3')}</li></ol>}
          {how === 'json' && <div className="text-sm space-y-1"><p>{t('slicer.bambuStudioStoresYourUser')}</p><ul className="list-disc pl-5 muted"><li>Windows: <code>%APPDATA%\BambuStudio\user\&lt;tu id&gt;\filament</code> (y <code>process</code>, <code>machine</code>)</li><li>macOS: <code>~/Library/Application Support/BambuStudio/user/&lt;tu id&gt;/…</code></li><li>Linux: <code>~/.config/BambuStudio/user/&lt;tu id&gt;/…</code></li></ul><p className="muted">{t('slicer.jsonMulti')} <code>OrcaSlicer/user/default/…</code>.</p></div>}
          <label className={cn('block rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors', busy ? 'border-[var(--accent)]' : 'border-[var(--line)] hover:border-slate-400')}>
            <input type="file" multiple accept=".3mf,.bbscfg,.bbsflmt,.zip,.json" className="sr-only" onChange={(e) => analyze(Array.from(e.target.files ?? []))} data-testid="import-files" />
            <span className="font-medium">{busy ? t('slicer.analyzing') : files.length ? files.map((f) => f.name).join(', ') : t('slicer.chooseFiles3mfBbscfgBbsflmt')}</span>
            <span className="block text-xs muted mt-1">{t('slicer.itIsReviewedBeforeSaving')}</span>
          </label>
          {prev && (prev.length === 0 ? <p className="text-sm muted">{t('slicer.noProfilesWereFoundIn')}</p> : <div className="rounded-2xl border border-[var(--line)] overflow-hidden">
            <table className="w-full text-sm" data-testid="import-preview"><thead><tr><th className="th w-8" /><th className="th">{t('slicer.profile2')}</th><th className="th">{t('slicer.basedOnFactory')}</th><th className="th text-right">{t('slicer.changes')}</th></tr></thead>
              <tbody>{prev.map((p) => <tr key={p.key}>
                <td className="td"><input type="checkbox" aria-label={t('slicer.importLabel', { name: p.name })} disabled={!p.ok} checked={sel.has(p.key)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(p.key); else n.delete(p.key); setSel(n); }} /></td>
                <td className="td"><span className="eyebrow !text-[10px] mr-2">{t(TYPE_ES[p.type])}</span><b>{p.name}</b>{p.exists && <span className={cn('badge ml-2', TONES.blue)}>{t('slicer.alreadyExistsNewVersion')}</span>}<div className="text-xs muted">{p.source}{p.note ? ` · ${p.note}` : ''}</div></td>
                <td className="td text-xs">{p.baseName ? pretty(p.baseName, t) : '—'}</td><td className="td text-right num">{p.keys === 0 ? <span className="muted">{t('slicer.sameAsFactory')}</span> : p.keys}</td></tr>)}</tbody></table>
          </div>)}
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button><button className="btn-primary" disabled={busy || !prev || sel.size === 0} onClick={save} data-testid="import-confirm">{t('slicer.importProfiles', { count: sel.size })}</button></div>
        </div>
      </Modal>
    </>
  );
}

/* ── Filamento personalizado ──────────────────────────────────────────────────────────────────── */
const TYPES = ['PLA', 'PLA Matte', 'PLA Silk', 'PLA-CF', 'PETG', 'PETG HF', 'PETG-CF', 'ABS', 'ASA', 'TPU', 'PA', 'PA-CF', 'PC', 'PCTG', 'PVA', 'HIPS', 'PP'];
const FIELDS: Array<{ key: string; label: MessageKey; unit: string; group: MessageKey }> = [
  { key: 'nozzle_temperature_initial_layer', label: 'slicer.field.nozzleFirstLayer', unit: '°C', group: 'slicer.field.groupTemperatures' }, { key: 'nozzle_temperature', label: 'slicer.field.nozzle', unit: '°C', group: 'slicer.field.groupTemperatures' },
  { key: 'textured_plate_temp', label: 'slicer.field.texturedPei', unit: '°C', group: 'slicer.field.groupTemperatures' }, { key: 'hot_plate_temp', label: 'slicer.field.smoothPei', unit: '°C', group: 'slicer.field.groupTemperatures' }, { key: 'cool_plate_temp', label: 'slicer.field.coolPlate', unit: '°C', group: 'slicer.field.groupTemperatures' },
  { key: 'filament_flow_ratio', label: 'slicer.field.flowRatio', unit: '', group: 'slicer.field.groupExtrusion' }, { key: 'filament_max_volumetric_speed', label: 'slicer.field.maxVolumetric', unit: 'mm³/s', group: 'slicer.field.groupExtrusion' }, { key: 'pressure_advance', label: 'slicer.field.pressureAdvance', unit: '', group: 'slicer.field.groupExtrusion' },
  { key: 'filament_density', label: 'slicer.field.density', unit: 'g/cm³', group: 'slicer.field.groupMaterial' }, { key: 'filament_cost', label: 'slicer.field.cost', unit: '$/kg', group: 'slicer.field.groupMaterial' }, { key: 'filament_diameter', label: 'slicer.field.diameter', unit: 'mm', group: 'slicer.field.groupMaterial' },
  { key: 'fan_min_speed', label: 'slicer.field.fanMin', unit: '%', group: 'slicer.field.groupCooling' }, { key: 'fan_max_speed', label: 'slicer.field.fanMax', unit: '%', group: 'slicer.field.groupCooling' }, { key: 'filament_retraction_length', label: 'slicer.field.retraction', unit: 'mm', group: 'slicer.field.groupCooling' },
];
export function CustomFilamentButton({ label: labelProp, materialId, type: type0, small, dark }: { label?: string; materialId?: string; type?: string; small?: boolean; dark?: boolean }) {
  const t = useT();
  const label = labelProp ?? t('slicer.customFilament');
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false); const [name, setName] = useState(''); const [brand, setBrand] = useState(''); const [type, setType] = useState(TYPES.includes(type0 ?? '') ? type0! : 'PLA');
  const [base, setBase] = useState(''); const [defs, setDefs] = useState<Record<string, string>>({}); const [vals, setVals] = useState<Record<string, string>>({});
  const [inv, setInv] = useState(!materialId); const [color, setColor] = useState(''); const [hex, setHex] = useState('#ff5b1f');
  useEffect(() => { if (!open) return; customFilamentDefaultsAction(type).then((r) => { if (r.ok) { setBase(r.data.baseName); setDefs(r.data.values); } }); }, [open, type]);
  const groups = [...new Set(FIELDS.map((f) => f.group))];
  return (
    <>
      <button className={small ? 'btn-ghost btn-sm' : dark ? 'btn-ghost !bg-transparent !text-white !border-white/25 hover:!bg-white/10' : 'btn-ghost'} onClick={() => setOpen(true)} data-testid="custom-filament">{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('slicer.customFilament2')} wide>
        <div className="space-y-4">
          <p className="text-sm muted">{t('slicer.startsFromTheValuesOf')}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block sm:col-span-1"><span className="label">{t('common.name')}</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('slicer.eGSunluBlackPetg')} data-testid="cf-name" /></label>
            <label className="block"><span className="label">{t('slicer.brand')}</span><input className="input" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder={t('slicer.eGSunlu')} data-testid="cf-brand" /></label>
            <label className="block"><span className="label">{t('common.typeLabel')}</span><select className="input" value={type} onChange={(e) => { setType(e.target.value); setVals({}); }} data-testid="cf-type">{TYPES.map((tt) => <option key={tt}>{tt}</option>)}</select></label>
          </div>
          <p className="text-xs muted">{t('slicer.base')} <b>{base ? pretty(base, t) : '…'}</b></p>
          {groups.map((g) => <fieldset key={g}><legend className="eyebrow mb-2">{t(g)}</legend><div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {FIELDS.filter((f) => f.group === g).map((f) => <label key={f.key} className="block"><span className="label">{t(f.label)}{f.unit ? ` (${f.unit})` : ''}</span><input className={cn('input num', vals[f.key] && 'ring-2 ring-brand-500/40')} inputMode="decimal" value={vals[f.key] ?? ''} placeholder={defs[f.key] ?? ''} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} data-testid={`cf-${f.key}`} /></label>)}
          </div></fieldset>)}
          {!materialId && <div className="rounded-2xl border border-[var(--line)] p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={inv} onChange={(e) => setInv(e.target.checked)} data-testid="cf-inventory" /> {t('slicer.alsoAddItToThe')}</label>
            {inv && <div className="grid gap-3 grid-cols-[1fr_auto]"><label className="block"><span className="label">{t('slicer.color')}</span><input className="input" value={color} onChange={(e) => setColor(e.target.value)} placeholder={t('slicer.eGBlack')} data-testid="cf-color" /></label><label className="block"><span className="label">{t('slicer.shade')}</span><input type="color" className="input !p-1 !w-16" value={hex} onChange={(e) => setHex(e.target.value)} aria-label={t('slicer.colorShade')} /></label></div>}
          </div>}
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
            <button className="btn-primary" disabled={pending || !name.trim()} data-testid="cf-save" onClick={() => run(() => createCustomFilamentAction({ name, brand, type, baseName: base, values: vals, materialId: materialId ?? null, addToInventory: !materialId && inv ? { colorName: color, hex, costPerKg: Number((vals.filament_cost || defs.filament_cost || '0').replace(',', '.')) || 0 } : null }), { ok: materialId ? t('slicer.filamentCreatedAndAssigned2') : inv ? t('slicer.filamentCreatedAndAddedTo2') : t('slicer.filamentCreated2'), onOk: () => { setOpen(false); setName(''); setVals({}); } })}>{t('slicer.createFilament')}</button></div>
        </div>
      </Modal>
    </>
  );
}
