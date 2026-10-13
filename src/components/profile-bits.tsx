'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createProfileAction, deleteProfileAction, duplicateProfileAction, factoryListAction, factoryVendorsAction, profileBaseValuesAction, profileKeysAction, revertProfileAction, updateProfileAction } from '@/actions/slicer';
import { ConfirmButton, Modal, useAction, useToast } from './client';
import { SIMPLE_PARAMS_CLIENT, TYPE_LABEL } from '@/lib/slicer/params';
import { cn } from '@/lib/format';
import { useT } from '@/i18n/client';

type PType = 'machine' | 'process' | 'filament';

export function NewProfileButton({ type, machines }: { type: PType; machines: Array<{ name: string; baseName: string }> }) {
  const t = useT();
  const [open, setOpen] = useState(false); const { run, pending } = useAction(); const router = useRouter();
  const [vendors, setVendors] = useState<string[]>([]); const [vendor, setVendor] = useState('BBL'); const [machine, setMachine] = useState(''); const [q, setQ] = useState('');
  const [list, setList] = useState<Array<{ name: string }>>([]); const [base, setBase] = useState(''); const [name, setName] = useState(''); const [sim, setSim] = useState(false);
  useEffect(() => { if (open && !vendors.length) factoryVendorsAction().then((r) => r.ok && setVendors(r.data)); }, [open, vendors.length]);
  useEffect(() => { if (!open) return; const tt = setTimeout(() => { factoryListAction(type, vendor, type === 'machine' ? undefined : machine || undefined, q || undefined).then((r) => { if (r.ok) { setList(r.data); if (!r.data.find((x) => x.name === base)) setBase(r.data[0]?.name ?? ''); } }); }, 200); return () => clearTimeout(tt); /* eslint-disable-next-line */ }, [open, vendor, machine, q, type]);
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)} data-testid={`new-profile-${type}`}>{t('files.newProfileFor')} {t(TYPE_LABEL[type]).toLowerCase()}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('files.newProfile', { type: t(TYPE_LABEL[type]).toLowerCase() })}>
        <div className="space-y-3">
          <p className="text-sm muted">{t('files.everyProfileStartsFromAn')}</p>
          <label className="block"><span className="label">{t('files.brandManufacturer')}</span><select className="input" value={vendor} onChange={(e) => setVendor(e.target.value)}>{vendors.map((v) => <option key={v}>{v}</option>)}</select></label>
          {type !== 'machine' && <label className="block"><span className="label">{t('files.compatibleWithMachineOptional')}</span><select className="input" value={machine} onChange={(e) => setMachine(e.target.value)}><option value="">{t('files.all')}</option>{machines.map((m) => <option key={m.name} value={m.baseName}>{m.name}</option>)}</select></label>}
          <label className="block"><span className="label">{t('files.searchBaseProfile')}</span><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('files.eGA1StandardPetg')} /></label>
          <label className="block"><span className="label">{t('files.baseFactoryProfileCount', { n: list.length })}</span><select className="input" size={6} value={base} onChange={(e) => { setBase(e.target.value); if (!name) setName(e.target.value.replace(/ @.*$/, '')); }} data-testid="factory-list">{list.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}</select></label>
          <label className="block"><span className="label">{t('files.profileName')}</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('files.eGSlowPetgFor')} data-testid="profile-name" /></label>
          {type === 'machine' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sim} onChange={(e) => setSim(e.target.checked)} /> {t('files.simulatedMachineNoPhysicalDevice')}</label>}
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button><button className="btn-primary" disabled={pending || !base || !name} data-testid="profile-create" onClick={() => run(() => createProfileAction({ type, name, baseName: base, vendor, simulated: sim }), { ok: t('files.profileCreated2'), onOk: (id) => { setOpen(false); router.push(`/laminador/perfiles/${id}`); } })}>{t('files.createProfile')}</button></div>
        </div>
      </Modal>
    </>
  );
}

export function ProfileRowActions({ id, name }: { id: string; name: string }) {
  const t = useT();
  const { run } = useAction();
  return (
    <span className="inline-flex gap-1">
      <button className="btn-ghost btn-sm" onClick={() => run(() => duplicateProfileAction(id, `${name} (copia)`), { ok: t('files.profileDuplicated2') })}>{t('files.duplicate')}</button>
      <ConfirmButton className="btn-ghost btn-sm text-red-600 dark:text-red-400" message={t('files.deleteTheProfile', { name })} onConfirm={() => run(() => deleteProfileAction(id), { ok: t('files.profileDeleted2') })}>{t('common.deleteLabel')}</ConfirmButton>
    </span>
  );
}

export function ProfileEditor({ p, versions, canEdit }: { p: { id: string; type: PType; name: string; baseName: string; changes: Record<string, any>; version: number; simulated: boolean; notes: string | null }; versions: Array<{ version: number; note: string | null; createdAt: string; keys: number }>; canEdit: boolean }) {
  const t = useT();
  const { run, pending } = useAction(); const toast = useToast();
  const params = SIMPLE_PARAMS_CLIENT[p.type];
  const [name, setName] = useState(p.name); const [sim, setSim] = useState(p.simulated); const [notes, setNotes] = useState(p.notes ?? '');
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
  const save = () => {
    run(() => updateProfileAction(p.id, { name, changes, simulated: sim, notes, note }), { ok: t('files.savedANewVersionWas') });
  };
  const nChanged = Object.keys(changes).length;
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="xl:col-span-2 space-y-4">
        <div className="card p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block"><span className="label">{t('common.name')}</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} /></label>
            <div><span className="label">{t('files.baseFactoryProfile')}</span><div className="input !bg-slate-50 dark:!bg-slate-900 flex items-center">{p.baseName}</div></div>
          </div>
          {p.type === 'machine' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sim} onChange={(e) => setSim(e.target.checked)} disabled={!canEdit} /> {t('files.simulatedMachine')}</label>}
          <label className="block"><span className="label">{t('common.notes')}</span><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEdit} placeholder={t('files.whatThisProfileIsUsed')} /></label>
        </div>
        <div className="card p-4">
          <h2 className="font-semibold text-sm mb-1">{t('files.parametersThatDriveCost')}</h2>
          <p className="text-xs muted mb-3">{t('files.theFactoryValueAppearsAs')}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {params.map((x) => (
              <label key={x.key} className="block"><span className="label">{t(x.label)}{x.unit ? ` (${x.unit})` : ''}</span>
                {x.kind === 'select' ? <select className="input" value={vals[x.key]} disabled={!canEdit} onChange={(e) => setVals({ ...vals, [x.key]: e.target.value })} data-testid={`param-${x.key}`}><option value="">{t('files.factory')} {String(base[x.key] ?? '…')}</option>{x.options!.map((o) => <option key={o}>{o}</option>)}</select>
                  : <input className={cn('input', vals[x.key] !== '' && 'ring-2 ring-brand-500/40')} value={vals[x.key]} disabled={!canEdit} placeholder={t('files.factoryValue', { value: String(base[x.key] ?? '…') })} onChange={(e) => setVals({ ...vals, [x.key]: e.target.value })} data-testid={`param-${x.key}`} />}
              </label>
            ))}
          </div>
        </div>
        <div className="card p-4 space-y-3" data-testid="extra-params">
          <div><h2 className="font-semibold text-sm">{t('files.otherParameters')}</h2><p className="text-xs muted">{t('files.anyOrcaslicerBambuStudioSetting')}</p></div>
          {Object.keys(extra).length > 0 && <ul className="divide-y divide-[var(--line)]">{Object.entries(extra).map(([k, v]) => { const b = allKeys.find((x) => x.key === k)?.value; return (
            <li key={k} className="py-2 flex flex-wrap items-center gap-2"><code className="text-xs flex-1 min-w-[180px] break-all">{k}</code><span className="text-xs muted">{t('files.factory2')} {b ?? '—'}</span>
              <input className="input !w-40 !min-h-[34px] num" value={v} disabled={!canEdit} onChange={(e) => setExtra({ ...extra, [k]: e.target.value })} aria-label={t('files.valueOf', { k })} />
              {canEdit && <button className="btn-ghost btn-sm" onClick={() => { const n = { ...extra }; delete n[k]; setExtra(n); }} aria-label={t('files.remove', { k })}>✕</button>}</li>); })}</ul>}
          {canEdit && <div className="space-y-1.5"><input className="input" placeholder={t('files.searchAmongParameters', { allKeys: allKeys.length })} value={kq} onChange={(e) => setKq(e.target.value)} data-testid="param-search" />
            {kq.length >= 2 && <ul className="max-h-56 overflow-y-auto rounded-xl border border-[var(--line)] divide-y divide-[var(--line)]">{allKeys.filter((x) => x.key.includes(kq.toLowerCase().replace(/\s+/g, '_')) && !(x.key in extra) && !params.some((pp) => pp.key === x.key)).slice(0, 40).map((x) =>
              <li key={x.key}><button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 flex justify-between gap-2" onClick={() => { setExtra({ ...extra, [x.key]: x.value }); setKq(''); }} data-testid="param-add"><code className="text-xs">{x.key}</code><span className="text-xs muted truncate">{t('files.factory2')} {x.value}</span></button></li>)}</ul>}</div>}
          <details><summary className="text-xs muted cursor-pointer">{t('files.viewTheChangesAsJson')}</summary><pre className="mt-2 text-xs bg-slate-50 dark:bg-slate-900 rounded-xl p-3 overflow-x-auto">{JSON.stringify(changes, null, 2)}</pre></details>
        </div>
        {canEdit && <div className="flex flex-wrap items-center gap-2 sticky bottom-20 md:bottom-4"><input className="input !w-auto flex-1 min-w-[180px]" placeholder={t('files.versionNoteOptional')} value={note} onChange={(e) => setNote(e.target.value)} /><button className="btn-primary" disabled={pending} onClick={save} data-testid="profile-save">{t('files.saveChanges', { count: nChanged, version: p.version + 1 })}</button></div>}
      </div>
      <div className="card p-4 h-fit">
        <h2 className="font-semibold text-sm mb-2">{t('files.versions2')}</h2>
        <ul className="space-y-2 text-sm" data-testid="profile-versions">
          {versions.map((v) => (
            <li key={v.version} className="flex items-start justify-between gap-2"><div><b>v{v.version}</b> {v.version === p.version && <span className="badge bg-emerald-50 text-emerald-800 border-emerald-200">{t('files.current')}</span>}<div className="text-xs muted">{v.createdAt} · {v.keys} cambio{v.keys === 1 ? '' : 's'}{v.note ? ` · ${v.note}` : ''}</div></div>
              {canEdit && v.version !== p.version && <button className="btn-ghost btn-sm shrink-0" onClick={() => run(() => revertProfileAction(p.id, v.version), { ok: t('files.restoredV2', { version: v.version }) })}>{t('common.back')}</button>}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
