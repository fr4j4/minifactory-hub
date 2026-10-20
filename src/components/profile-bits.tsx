'use client';
import { TONES } from '@/components/badge';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createFromTemplatesAction, createProfileAction, deleteProfileAction, duplicateProfileAction, factoryListAction, factoryVendorsAction, profileBaseValuesAction, profileKeysAction, revertProfileAction, updateProfileAction } from '@/actions/slicer';
import { ConfirmButton, Modal, useAction } from './client';
import { useT } from '@/i18n/client';
import { Icon } from '@/components/shell';
import type { MessageKey } from '@/i18n/translate';
import { NozzlePicker } from './nozzle-picker';
import { SIMPLE_PARAMS, TYPE_EXPLAIN, TYPE_LABEL } from '@/lib/slicer/params';
import { COMMON_NOZZLES, layerChoices, layerRange, layersForThickness, lineWidth, numStr, processWarnings, qualityTemplates, thicknessForLoops, wallThicknessOptions, type TemplateKey } from '@/lib/slicer/nozzle';
import { cn } from '@/lib/format';

type PType = 'machine' | 'process' | 'filament';
export interface MachineOpt { id: string; name: string; baseName: string; nozzle: string | null }
const comma = (n: number | string) => String(n).replace('.', ',');

/* ── Guía: para qué sirve cada perfil ─────────────────────────────────────────────────────────── */
export function ProfilesGuide({ open }: { open?: boolean }) {
  const t = useT();
  return (
    <details className="card p-4" open={open} data-testid="profiles-guide">
      <summary className="cursor-pointer font-semibold text-sm">{t('nozzle.guideTitle')} <span className="muted font-normal">{t('nozzle.guideSubtitle')}</span></summary>
      <div className="mt-3 space-y-4 text-sm">
        <p className="max-w-3xl">{t('nozzle.guideIntro')}</p>
        <div className="grid gap-3 md:grid-cols-3">
          {(['machine', 'process', 'filament'] as const).map((k) => (
            <div key={k} className="rounded-2xl border border-[var(--line)] p-3.5 space-y-1.5">
              <h3 className="font-semibold">{t(TYPE_EXPLAIN[k].title)}</h3>
              <p>{t(TYPE_EXPLAIN[k].what)}</p>
              <p className="text-xs muted"><b>{t('nozzle.examples')}</b> {t(TYPE_EXPLAIN[k].example)}</p>
              <p className="text-xs muted">{t(TYPE_EXPLAIN[k].changes)}</p>
            </div>
          ))}
        </div>
        <div className="rounded-2xl on-panel bg-[var(--panel)] text-[var(--panel-ink)] p-4 space-y-1.5">
          <h3 className="font-semibold">{t('nozzle.guideExampleTitle')}</h3>
          <ul className="list-disc pl-5 text-white/85 space-y-0.5">
            <li>{t('nozzle.guideEx1')}</li>
            <li>{t('nozzle.guideEx2')}</li>
            <li>{t('nozzle.guideEx3')}</li>
          </ul>
        </div>
        <p className="text-xs muted max-w-3xl">{t('nozzle.guideMachinesVsPrinter')}</p>
      </div>
    </details>
  );
}

/* ── Nuevo perfil ─────────────────────────────────────────────────────────────────────────────── */
export function NewProfileButton({ type, machines }: { type: PType; machines: MachineOpt[] }) {
  const t = useT();
  const [open, setOpen] = useState(false); const { run, pending } = useAction(); const router = useRouter();
  const [mode, setMode] = useState<'plantilla' | 'fabrica'>(type === 'process' ? 'plantilla' : 'fabrica');
  // — comunes —
  const [machineId, setMachineId] = useState(machines[0]?.id ?? ''); const machine = machines.find((m) => m.id === machineId);
  const [nozzle, setNozzle] = useState<string[]>([machines[0]?.nozzle ?? '0.4']);
  // — plantillas —
  const [keys, setKeys] = useState<TemplateKey[]>(['borrador', 'estandar', 'fino']);
  // — fábrica —
  const [vendors, setVendors] = useState<string[]>([]); const [vendor, setVendor] = useState('BBL'); const [q, setQ] = useState(''); const [nz, setNz] = useState('');
  const [list, setList] = useState<Array<{ name: string; nozzle?: string }>>([]); const [base, setBase] = useState(''); const [name, setName] = useState(''); const [sim, setSim] = useState(false);
  useEffect(() => { if (open && !vendors.length) factoryVendorsAction().then((r) => { if (r.ok) { setVendors(r.data); if (!r.data.includes('BBL') && r.data[0]) setVendor(r.data[0]); } }); }, [open, vendors.length]);
  useEffect(() => {
    if (!open || mode !== 'fabrica') return;
    const tm = setTimeout(() => { factoryListAction(type, vendor, type === 'machine' ? undefined : machine?.baseName, q || undefined, type === 'filament' ? undefined : nz || undefined).then((r) => { if (r.ok) { setList(r.data); if (!r.data.find((x) => x.name === base)) setBase(r.data[0]?.name ?? ''); } }); }, 200);
    return () => clearTimeout(tm); /* eslint-disable-next-line */
  }, [open, mode, vendor, machineId, q, nz, type]);
  const n = nozzle[0] ?? '0.4';
  const tpls = useMemo(() => qualityTemplates(n), [n]);
  const pickMachine = (id: string) => { setMachineId(id); const m = machines.find((x) => x.id === id); if (m?.nozzle) setNozzle([m.nozzle]); };
  const title = t('files.newProfile', { toLowerCase: t(TYPE_LABEL[type]).toLowerCase() });
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)} data-testid={`new-profile-${type}`}>{t('files.newProfileFor')} {t(TYPE_LABEL[type]).toLowerCase()}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} wide>
        <div className="space-y-3">
          {type === 'process' && <div className="flex flex-wrap gap-1 rounded-xl border border-[var(--line)] p-1 w-fit" role="tablist">
            {([['plantilla', t('nozzle.tabTemplates')], ['fabrica', t('nozzle.tabFactory')]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={mode === k} className={cn('px-3 min-h-[36px] rounded-lg text-sm', mode === k ? 'bg-[var(--panel)] text-[var(--panel-ink)] dark:bg-slate-700' : 'muted hover:bg-slate-100 dark:hover:bg-slate-800')} onClick={() => setMode(k)} data-testid={`mode-${k}`}>{l}</button>)}
          </div>}

          {mode === 'plantilla' && type === 'process' && (
            <div className="space-y-3" data-testid="template-form">
              <p className="text-sm muted">{t('nozzle.templatesIntro')}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block"><span className="label">{t('nozzle.printer')}</span>
                  <select className="input" value={machineId} onChange={(e) => pickMachine(e.target.value)} data-testid="tpl-machine"><option value="">{t('nozzle.otherPrinter')}</option>{machines.map((m) => <option key={m.id} value={m.id}>{m.name}{m.nozzle ? ` · ${t('nozzle.mm', { n: comma(m.nozzle) })}` : ''}</option>)}</select></label>
                <NozzlePicker label={t('nozzle.colNozzle')} value={nozzle} onChange={setNozzle} testId="tpl-nozzle" />
              </div>
              <fieldset><legend className="label">{t('nozzle.qualitiesToCreate')}</legend>
                <ul className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)]">{tpls.map((q) => { const loops = Number(q.changes.wall_loops); return (
                  <li key={q.key}><label className="flex items-start gap-3 p-3 cursor-pointer"><input type="checkbox" className="mt-1" checked={keys.includes(q.key)} onChange={(e) => setKeys(e.target.checked ? [...keys, q.key] : keys.filter((x) => x !== q.key))} data-testid={`tpl-${q.key}`} />
                    <span className="min-w-0"><b>{t(q.label)}</b> <span className="num text-sm">{t('nozzle.tplSummary', { layer: comma(numStr(q.layer)), loops, thickness: comma(thicknessForLoops(loops, n)), infill: q.changes.sparse_infill_density })}</span><span className="block text-xs muted">{t(q.hint)}</span></span></label></li>); })}</ul>
              </fieldset>
              <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
                <button className="btn-primary" disabled={pending || !keys.length} data-testid="tpl-create" onClick={() => run(() => createFromTemplatesAction({ machineProfileId: machineId || null, nozzle: n, keys }), { ok: t('nozzle.qualitiesCreated', { count: keys.length, n: comma(n) }), onOk: () => setOpen(false) })}>{t('nozzle.createQualities', { count: keys.length })}</button></div>
            </div>
          )}

          {mode === 'fabrica' && (
            <div className="space-y-3">
              <p className="text-sm muted">{t('files.everyProfileStartsFromAn')}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block"><span className="label">{t('files.brandManufacturer')}</span><select className="input" value={vendor} onChange={(e) => setVendor(e.target.value)}>{vendors.map((v) => <option key={v}>{v}</option>)}</select></label>
                {type !== 'machine' && <label className="block"><span className="label">{t('files.compatibleWithMachineOptional')}</span><select className="input" value={machineId} onChange={(e) => { setMachineId(e.target.value); const m = machines.find((x) => x.id === e.target.value); if (m?.nozzle && type === 'process') setNz(m.nozzle); }}><option value="">{t('files.all')}</option>{machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}
              </div>
              {type !== 'filament' && <label className="block"><span className="label">{t('nozzle.colNozzle')}</span><select className="input sm:max-w-xs" value={nz} onChange={(e) => setNz(e.target.value)} data-testid="factory-nozzle"><option value="">{t('nozzle.anyNozzle')}</option>{COMMON_NOZZLES.map((x) => <option key={x} value={x}>{t('nozzle.mm', { n: comma(x) })}</option>)}</select></label>}
              <label className="block"><span className="label">{t('files.searchBaseProfile')}</span><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('files.eGA1StandardPetg')} /></label>
              <label className="block"><span className="label">{t('files.baseFactoryProfileCount', { n: list.length })}</span><select className="input" size={6} value={base} onChange={(e) => { setBase(e.target.value); if (!name) setName(e.target.value.replace(/ @.*$/, '')); }} data-testid="factory-list">{list.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}</select></label>
              <label className="block"><span className="label">{t('files.profileName')}</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('files.eGSlowPetgFor')} data-testid="profile-name" /></label>
              {type === 'machine' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sim} onChange={(e) => setSim(e.target.checked)} /> {t('files.simulatedMachineNoPhysicalDevice')}</label>}
              <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button><button className="btn-primary" disabled={pending || !base || !name} data-testid="profile-create" onClick={() => run(() => createProfileAction({ type, name, baseName: base, vendor, simulated: sim }), { ok: t('files.profileCreated2'), onOk: (id) => { setOpen(false); router.push(`/laminador/perfiles/${id}`); } })}>{t('files.createProfile')}</button></div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

/* ── Acciones por fila: copia personalizada y eliminar ────────────────────────────────────────── */
export function ProfileRowActions({ id, name, canDelete }: { id: string; name: string; canDelete?: boolean }) {
  const t = useT(); const { run, pending } = useAction(); const router = useRouter();
  const [open, setOpen] = useState(false); const [copy, setCopy] = useState(t('nozzle.copySuffix', { name }));
  return (
    <span className="inline-flex gap-1">
      <button className="btn-ghost btn-sm" onClick={() => { setCopy(t('nozzle.copySuffix', { name })); setOpen(true); }} data-testid="profile-duplicate" title={t('nozzle.duplicateHint')}>{t('files.duplicate')}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('nozzle.customCopy')}>
        <div className="space-y-3">
          <p className="text-sm muted">{t('nozzle.customCopyIntro', { name })}</p>
          <label className="block"><span className="label">{t('nozzle.copyName')}</span><input className="input" value={copy} onChange={(e) => setCopy(e.target.value)} data-testid="dup-name" /></label>
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
            <button className="btn-primary" disabled={pending || !copy.trim()} data-testid="dup-confirm" onClick={() => run(() => duplicateProfileAction(id, copy), { ok: t('nozzle.copyCreated'), onOk: () => setOpen(false) })}>{t('nozzle.createCopy')}</button>
            <button className="btn-ghost" disabled={pending || !copy.trim()} data-testid="dup-edit" onClick={() => run(() => duplicateProfileAction(id, copy), { ok: t('nozzle.copyCreated'), onOk: (nid) => { setOpen(false); router.push(`/laminador/perfiles/${nid}`); } })}>{t('nozzle.createAndEdit')}</button></div>
        </div>
      </Modal>
      {canDelete && <ConfirmButton disabled={pending} className="btn-ghost btn-sm text-danger" message={t('nozzle.deleteConfirm', { name })} onConfirm={() => run(() => deleteProfileAction(id), { ok: t('files.profileDeleted2') })}>{t('common.deleteLabel')}</ConfirmButton>}
    </span>
  );
}

/* ── Cambiar el perfil de fábrica base ───────────────────────────────────────────────────────── */
function ChangeBase({ p, nozzle, onPick }: { p: { type: PType; vendor?: string | null; baseName: string }; nozzle: string | null; onPick: (base: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false); const [q, setQ] = useState(''); const [list, setList] = useState<Array<{ name: string; nozzle?: string }>>([]); const [sel, setSel] = useState(p.baseName);
  useEffect(() => {
    if (!open) return; const tm = setTimeout(() => { factoryListAction(p.type, p.vendor ?? 'BBL', undefined, q || undefined, p.type === 'filament' ? undefined : nozzle || undefined).then((r) => r.ok && setList(r.data)); }, 200);
    return () => clearTimeout(tm);
  }, [open, q, p.type, p.vendor, nozzle]);
  return (<>
    <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => setOpen(true)} data-testid="change-base">{t('nozzle.changeBase')}</button>
    <Modal open={open} onClose={() => setOpen(false)} title={t('nozzle.changeBaseTitle')}>
      <div className="space-y-3">
        <p className="text-sm muted">{t('nozzle.changeBaseIntro')}{nozzle && p.type !== 'filament' ? ` ${t('nozzle.changeBaseShowing', { n: comma(nozzle) })}` : ''}</p>
        <input className="input" placeholder={t('nozzle.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('files.searchBaseProfile')} />
        <select className="input" size={8} value={sel} onChange={(e) => setSel(e.target.value)} aria-label={t('nozzle.baseProfile')} data-testid="base-list">{list.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}{!list.find((x) => x.name === p.baseName) && <option value={p.baseName}>{p.baseName} ({t('nozzle.currentLower')})</option>}</select>
        <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button><button className="btn-primary" disabled={sel === p.baseName} onClick={() => { setOpen(false); onPick(sel); }} data-testid="base-apply">{t('nozzle.useThisBase')}</button></div>
      </div>
    </Modal>
  </>);
}

/* ── Editor ───────────────────────────────────────────────────────────────────────────────────── */
export function ProfileEditor({ p, versions, canEdit, usedBy = [] }: { p: { id: string; type: PType; name: string; vendor?: string | null; baseName: string; nozzle: string | null; changes: Record<string, any>; version: number; simulated: boolean; notes: string | null }; versions: Array<{ version: number; note: string | null; createdAt: string; keys: number }>; canEdit: boolean; usedBy?: string[] }) {
  const t = useT(); const { run, pending } = useAction();
  const params = SIMPLE_PARAMS[p.type]; const groups = [...new Set(params.map((x) => x.group))];
  const [name, setName] = useState(p.name); const [sim, setSim] = useState(p.simulated); const [notes, setNotes] = useState(p.notes ?? '');
  const [nozzle, setNozzle] = useState<string[]>(p.nozzle ? [p.nozzle] : []);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(params.map((x) => [x.key, p.changes[x.key] != null ? String(Array.isArray(p.changes[x.key]) ? p.changes[x.key][0] : p.changes[x.key]) : ''])));
  // otros parámetros (cualquier clave de OrcaSlicer) como filas clave → valor, sin escribir JSON
  const toStr = (v: unknown) => (Array.isArray(v) ? String(v[0] ?? '') : String(v ?? ''));
  const [extra, setExtra] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(p.changes).filter(([k]) => !params.some((x) => x.key === k)).map(([k, v]) => [k, toStr(v)])));
  const [allKeys, setAllKeys] = useState<Array<{ key: string; value: string }>>([]); const [kq, setKq] = useState('');
  useEffect(() => { profileKeysAction(p.type, p.baseName).then((r) => r.ok && setAllKeys(r.data)); }, [p.type, p.baseName]);
  const [base, setBase] = useState<Record<string, any>>({}); const [note, setNote] = useState('');
  useEffect(() => { profileBaseValuesAction(p.type, p.baseName).then((r) => r.ok && setBase(r.data)); }, [p.type, p.baseName]);
  const changes = useMemo(() => {
    const out: Record<string, any> = {}; for (const [k, v] of Object.entries(vals)) if (v !== '') out[k] = v;
    for (const [k, v] of Object.entries(extra)) if (v !== '') out[k] = Array.isArray(p.changes[k]) && toStr(p.changes[k]) === v ? p.changes[k] : v;
    return out;
  }, [vals, extra]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (over?: { baseName?: string; note?: string }) => run(() => updateProfileAction(p.id, { name, changes, simulated: sim, notes, note: over?.note ?? note, nozzle: p.type === 'filament' ? undefined : nozzle[0] ?? null, ...(over?.baseName ? { baseName: over.baseName } : {}) }), { ok: t('files.savedANewVersionWas') });
  const nChanged = Object.keys(changes).length;
  const num = (k: string) => { const x = Number(String(vals[k] || base[k] || '').replace(',', '.')); return Number.isFinite(x) && x > 0 ? x : null; };
  const noz = nozzle[0] ?? null;
  const lh = num('layer_height'); const loops = num('wall_loops');
  const warns = p.type === 'process' ? processWarnings({ machineNozzle: noz, processNozzle: null, layerHeight: lh }) : [];
  const wallOpts = noz ? wallThicknessOptions(noz) : [];
  const set = (k: string, v: string) => setVals((cur) => ({ ...cur, [k]: v }));
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="xl:col-span-2 min-w-0 space-y-4">
        <div className="card p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block"><span className="label">{t('common.name')}</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} data-testid="profile-title" /></label>
            <div><span className="label">{t('files.baseFactoryProfile')}</span><div className="flex items-center gap-2"><div className="input !bg-slate-50 dark:!bg-slate-900 flex items-center flex-1 min-w-0 truncate" title={p.baseName}>{p.baseName}</div>{canEdit && <ChangeBase p={p} nozzle={noz} onPick={(b) => save({ baseName: b, note: t('nozzle.baseChangedTo', { b }) })} />}</div></div>
          </div>
          {p.type !== 'filament' && <NozzlePicker label={t(p.type === 'machine' ? 'nozzle.profileNozzleMachine' : 'nozzle.profileNozzleProcess')} value={nozzle} onChange={(v) => canEdit && setNozzle(v)} hint={t(p.type === 'process' ? 'nozzle.profileNozzleHintProcess' : 'nozzle.profileNozzleHintMachine')} testId="profile-nozzle" />}
          {p.type === 'machine' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sim} onChange={(e) => setSim(e.target.checked)} disabled={!canEdit} /> {t('nozzle.simulatedPrinter')}</label>}
          <label className="block"><span className="label">{t('common.notes')}</span><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEdit} placeholder={t('files.whatThisProfileIsUsed')} /></label>
          {usedBy.length > 0 && <p className="text-xs muted" data-testid="profile-used">{t('nozzle.inUseBy', { list: usedBy.join(', ') })}</p>}
        </div>

        {p.type === 'process' && noz && (
          <div className="card p-4 space-y-3" data-testid="nozzle-helper">
            <div><h2 className="font-semibold text-sm">{t('nozzle.measuresFor', { n: comma(noz) })}</h2><p className="text-xs muted">{t('nozzle.measuresIntro', { lw: comma(lineWidth(noz)), min: comma(numStr(layerRange(noz).min)), max: comma(numStr(layerRange(noz).max)) })}</p></div>
            <div><span className="label">{t('nozzle.usualLayer')}</span>
              <div className="flex flex-wrap gap-1.5">{layerChoices(noz).map((h) => <button key={h} type="button" disabled={!canEdit} onClick={() => { set('layer_height', numStr(h)); }} aria-pressed={lh === h} className={cn('num min-h-[36px] px-3 rounded-xl border text-sm', lh === h ? 'bg-[var(--panel)] text-[var(--panel-ink)] border-transparent dark:bg-slate-700' : 'border-[var(--line)] hover:bg-slate-100 dark:hover:bg-slate-800')}>{comma(numStr(h))}</button>)}</div></div>
            <div><span className="label">{t('nozzle.wallThickness')}</span>
              <div className="flex flex-wrap gap-1.5">{wallOpts.map((o) => <button key={o.mm} type="button" disabled={!canEdit} onClick={() => set('wall_loops', String(o.loops))} aria-pressed={loops === o.loops} className={cn('min-h-[36px] px-3 rounded-xl border text-sm', loops === o.loops ? 'bg-[var(--panel)] text-[var(--panel-ink)] border-transparent dark:bg-slate-700' : 'border-[var(--line)] hover:bg-slate-100 dark:hover:bg-slate-800')} data-testid={`wall-${o.mm}`}><span className="num">{comma(o.mm)} mm</span> <span className="text-xs opacity-70">· {t('nozzle.nWalls', { count: o.loops })}</span></button>)}</div>
              {loops && <p className="text-xs muted mt-1">{t('nozzle.nowWalls', { count: loops, mm: comma(thicknessForLoops(loops, noz)) })}{lh && num('top_shell_layers') ? ` ${t('nozzle.topThickness', { mm: comma(numStr(num('top_shell_layers')! * lh)), layers: num('top_shell_layers') })}` : ''}{lh && num('bottom_shell_layers') ? ` ${t('nozzle.bottomThickness', { mm: comma(numStr(num('bottom_shell_layers')! * lh)) })}` : ''}</p>}
              {lh && <p className="text-xs muted">{t('nozzle.layersForOneMm', { layers: layersForThickness(1, lh) })}</p>}</div>
            {nChanged > 0 && <details className="rounded-xl border border-[var(--line)] p-3 text-sm" data-testid="profile-diff"><summary className="cursor-pointer font-medium">{t('files.diffFromFactory', { count: nChanged, n: nChanged })}</summary>
              <table className="w-full mt-2 text-xs"><thead><tr><th className="th">{t('files.diffParam')}</th><th className="th text-right">{t('files.factory')}</th><th className="th text-right">{t('files.diffYours')}</th></tr></thead>
                <tbody>{Object.entries(changes).map(([k, v]) => <tr key={k}><td className="td font-mono">{k}</td><td className="td text-right tabular muted">{String(base[k] ?? '—')}</td><td className="td text-right tabular font-medium">{toStr(v)}</td></tr>)}</tbody></table></details>}
            {warns.length > 0 && <ul className="text-xs text-warn space-y-0.5" role="status" data-testid="profile-warnings">{warns.map((w) => <li key={w.key}><Icon name="alert" className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />{t(w.key, w.params)}</li>)}</ul>}
          </div>
        )}

        <div className="card p-4 space-y-4">
          <div><h2 className="font-semibold text-sm">{t('files.parametersThatDriveCost')}</h2>
            <p className="text-xs muted">{t('nozzle.paramsIntro')}</p></div>
          {groups.map((g) => (
            <fieldset key={g}><legend className="eyebrow mb-2">{t(g)}</legend>
              <div className="grid sm:grid-cols-2 gap-3">
                {params.filter((x) => x.group === g).map((x) => (
                  <label key={x.key} className="block"><span className="label">{t(x.label)}{x.unit ? ` (${x.unit})` : ''}</span>
                    {x.kind === 'select' ? <select className="input" value={vals[x.key]} disabled={!canEdit} onChange={(e) => set(x.key, e.target.value)} data-testid={`param-${x.key}`}><option value="">{t('files.factory')} {String(base[x.key] ?? '…')}</option>{x.options!.map((o) => <option key={o}>{o}</option>)}</select>
                      : <input className={cn('input', vals[x.key] !== '' && 'ring-2 ring-[var(--accent-line)]')} inputMode={x.kind === 'number' ? 'decimal' : undefined} value={vals[x.key]} disabled={!canEdit} placeholder={t('files.factoryValue', { value: String(base[x.key] ?? '…') })} onChange={(e) => set(x.key, e.target.value)} data-testid={`param-${x.key}`} />}
                    {x.help && <span className="text-xs muted">{t(x.help)}</span>}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <div className="card p-4 space-y-3" data-testid="extra-params">
          <div><h2 className="font-semibold text-sm">{t('files.otherParameters')}</h2><p className="text-xs muted">{t('files.anyOrcaslicerBambuStudioSetting')}</p></div>
          {Object.keys(extra).length > 0 && <ul className="divide-y divide-[var(--line)]">{Object.entries(extra).map(([k, v]) => { const b = allKeys.find((x) => x.key === k)?.value; return (
            <li key={k} className="py-2 flex flex-wrap items-center gap-2"><code className="text-xs flex-1 min-w-[180px] break-all">{k}</code><span className="text-xs muted">{t('files.factory2')} {b ?? '—'}</span>
              <input className="input !w-40 !min-h-[34px] num" value={v} disabled={!canEdit} onChange={(e) => setExtra({ ...extra, [k]: e.target.value })} aria-label={t('files.valueOf', { k })} />
              {canEdit && <button className="btn-ghost btn-sm" onClick={() => { const n = { ...extra }; delete n[k]; setExtra(n); }} aria-label={t('files.remove', { k })}><Icon name="x" className="h-4 w-4" /></button>}</li>); })}</ul>}
          {canEdit && <div className="space-y-1.5"><input className="input" placeholder={t('files.searchAmongParameters', { allKeys: allKeys.length })} value={kq} onChange={(e) => setKq(e.target.value)} data-testid="param-search" />
            {kq.length >= 2 && <ul className="max-h-56 overflow-y-auto rounded-xl border border-[var(--line)] divide-y divide-[var(--line)]">{allKeys.filter((x) => x.key.includes(kq.toLowerCase().replace(/\s+/g, '_')) && !(x.key in extra) && !params.some((pp) => pp.key === x.key)).slice(0, 40).map((x) =>
              <li key={x.key}><button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 flex justify-between gap-2" onClick={() => { setExtra({ ...extra, [x.key]: x.value }); setKq(''); }} data-testid="param-add"><code className="text-xs">{x.key}</code><span className="text-xs muted truncate">{t('files.factory2')} {x.value}</span></button></li>)}</ul>}</div>}
          <details><summary className="text-xs muted cursor-pointer">{t('files.viewTheChangesAsJson')}</summary><pre className="mt-2 text-xs bg-slate-50 dark:bg-slate-900 rounded-xl p-3 overflow-x-auto">{JSON.stringify(changes, null, 2)}</pre></details>
        </div>
        {canEdit && <div className="flex flex-wrap items-center gap-2 sticky bottom-20 md:bottom-4"><input className="input !w-auto flex-1 min-w-[180px]" placeholder={t('files.versionNoteOptional')} value={note} onChange={(e) => setNote(e.target.value)} /><button className="btn-primary" disabled={pending} onClick={() => save()} data-testid="profile-save">{t('files.saveChanges', { count: nChanged, version: p.version + 1 })}</button></div>}
      </div>
      <div className="card p-4 h-fit">
        <h2 className="font-semibold text-sm mb-2">{t('files.versions2')}</h2>
        <ul className="space-y-2 text-sm" data-testid="profile-versions">
          {versions.map((v) => (
            <li key={v.version} className="flex items-start justify-between gap-2"><div><b>v{v.version}</b> {v.version === p.version && <span className={cn('badge', TONES.green)}>{t('files.current')}</span>}<div className="text-xs muted">{v.createdAt} · {t('nozzle.nChanges', { count: v.keys })}{v.note ? ` · ${v.note}` : ''}</div></div>
              {canEdit && v.version !== p.version && <button className="btn-ghost btn-sm shrink-0" onClick={() => run(() => revertProfileAction(p.id, v.version), { ok: t('files.restoredV2', { version: v.version }) })}>{t('common.back')}</button>}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
