'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createProfileAction, deleteProfileAction, duplicateProfileAction, factoryListAction, factoryVendorsAction, importProfileAction, profileBaseValuesAction, revertProfileAction, updateProfileAction } from '@/actions/slicer';
import { ConfirmButton, Modal, useAction, useToast } from './client';
import { SIMPLE_PARAMS_CLIENT } from '@/lib/slicer/params';
import { cn } from '@/lib/format';

type PType = 'machine' | 'process' | 'filament';
export const TYPE_LABEL: Record<PType, string> = { machine: 'Máquina', process: 'Proceso', filament: 'Filamento' };

export function NewProfileButton({ type, machines }: { type: PType; machines: Array<{ name: string; baseName: string }> }) {
  const [open, setOpen] = useState(false); const { run, pending } = useAction(); const router = useRouter();
  const [vendors, setVendors] = useState<string[]>([]); const [vendor, setVendor] = useState('BBL'); const [machine, setMachine] = useState(''); const [q, setQ] = useState('');
  const [list, setList] = useState<Array<{ name: string }>>([]); const [base, setBase] = useState(''); const [name, setName] = useState(''); const [sim, setSim] = useState(false);
  useEffect(() => { if (open && !vendors.length) factoryVendorsAction().then((r) => r.ok && setVendors(r.data)); }, [open, vendors.length]);
  useEffect(() => { if (!open) return; const t = setTimeout(() => { factoryListAction(type, vendor, type === 'machine' ? undefined : machine || undefined, q || undefined).then((r) => { if (r.ok) { setList(r.data); if (!r.data.find((x) => x.name === base)) setBase(r.data[0]?.name ?? ''); } }); }, 200); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [open, vendor, machine, q, type]);
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)} data-testid={`new-profile-${type}`}>+ Nuevo perfil de {TYPE_LABEL[type].toLowerCase()}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Nuevo perfil de ${TYPE_LABEL[type].toLowerCase()}`}>
        <div className="space-y-3">
          <p className="text-sm muted">Todo perfil parte de un perfil de fábrica de OrcaSlicer y guarda solo tus cambios; así se puede volver atrás en cualquier momento.</p>
          <label className="block"><span className="label">Marca / fabricante</span><select className="input" value={vendor} onChange={(e) => setVendor(e.target.value)}>{vendors.map((v) => <option key={v}>{v}</option>)}</select></label>
          {type !== 'machine' && <label className="block"><span className="label">Compatible con la máquina (opcional)</span><select className="input" value={machine} onChange={(e) => setMachine(e.target.value)}><option value="">— Todas —</option>{machines.map((m) => <option key={m.name} value={m.baseName}>{m.name}</option>)}</select></label>}
          <label className="block"><span className="label">Buscar perfil base</span><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ej. A1, Standard, PETG…" /></label>
          <label className="block"><span className="label">Perfil de fábrica base ({list.length})</span><select className="input" size={6} value={base} onChange={(e) => { setBase(e.target.value); if (!name) setName(e.target.value.replace(/ @.*$/, '')); }} data-testid="factory-list">{list.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}</select></label>
          <label className="block"><span className="label">Nombre del perfil</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. PETG lento para piezas técnicas" data-testid="profile-name" /></label>
          {type === 'machine' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sim} onChange={(e) => setSim(e.target.checked)} /> Máquina simulada (sin equipo físico, para evaluar una compra)</label>}
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" disabled={pending || !base || !name} data-testid="profile-create" onClick={() => run(() => createProfileAction({ type, name, baseName: base, vendor, simulated: sim }), { ok: 'Perfil creado', onOk: (id) => { setOpen(false); router.push(`/laminador/perfiles/${id}`); } })}>Crear perfil</button></div>
        </div>
      </Modal>
    </>
  );
}

export function ImportProfileButton() {
  const [open, setOpen] = useState(false); const { run, pending } = useAction(); const [type, setType] = useState<PType>('process'); const [json, setJson] = useState(''); const toast = useToast();
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}>Importar de OrcaSlicer / Bambu Studio</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Importar perfil exportado">
        <div className="space-y-3">
          <p className="text-sm muted">En OrcaSlicer o Bambu Studio exporta el perfil (JSON) y pégalo o elige el archivo. Se guarda como “perfil de fábrica + cambios”, idéntico a lo que ya usas en tu PC.</p>
          <label className="block"><span className="label">Tipo</span><select className="input" value={type} onChange={(e) => setType(e.target.value as PType)}>{(['machine', 'process', 'filament'] as PType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select></label>
          <input type="file" accept=".json,application/json" aria-label="Archivo JSON del perfil" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setJson(await f.text()); }} />
          <textarea className="input font-mono text-xs h-40" value={json} onChange={(e) => setJson(e.target.value)} placeholder='{"name": "...", "inherits": "0.20mm Standard @BBL A1", ...}' aria-label="JSON del perfil" />
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" disabled={pending || !json.trim()} onClick={() => run(() => importProfileAction({ type, json }), { onOk: (d) => { toast.push(`Importado: ${d.keys} ajustes sobre “${d.baseName}”`); setOpen(false); } })}>Importar</button></div>
        </div>
      </Modal>
    </>
  );
}

export function ProfileRowActions({ id, name }: { id: string; name: string }) {
  const { run } = useAction();
  return (
    <span className="inline-flex gap-1">
      <button className="btn-ghost btn-sm" onClick={() => run(() => duplicateProfileAction(id, `${name} (copia)`), { ok: 'Perfil duplicado' })}>Duplicar</button>
      <ConfirmButton className="btn-ghost btn-sm text-red-600" message={`¿Eliminar el perfil “${name}”?`} onConfirm={() => run(() => deleteProfileAction(id), { ok: 'Perfil eliminado' })}>Eliminar</ConfirmButton>
    </span>
  );
}

export function ProfileEditor({ p, versions, canEdit }: { p: { id: string; type: PType; name: string; baseName: string; changes: Record<string, any>; version: number; simulated: boolean; notes: string | null }; versions: Array<{ version: number; note: string | null; createdAt: string; keys: number }>; canEdit: boolean }) {
  const { run, pending } = useAction(); const toast = useToast();
  const params = SIMPLE_PARAMS_CLIENT[p.type];
  const [name, setName] = useState(p.name); const [sim, setSim] = useState(p.simulated); const [notes, setNotes] = useState(p.notes ?? '');
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(params.map((x) => [x.key, p.changes[x.key] != null ? String(Array.isArray(p.changes[x.key]) ? p.changes[x.key][0] : p.changes[x.key]) : ''])));
  const [adv, setAdv] = useState(() => JSON.stringify(Object.fromEntries(Object.entries(p.changes).filter(([k]) => !params.some((x) => x.key === k))), null, 2));
  const [base, setBase] = useState<Record<string, any>>({}); const [note, setNote] = useState('');
  useEffect(() => { profileBaseValuesAction(p.type, p.baseName).then((r) => r.ok && setBase(r.data)); }, [p.type, p.baseName]);
  const changes = useMemo(() => {
    const out: Record<string, any> = {}; for (const [k, v] of Object.entries(vals)) if (v !== '') out[k] = v;
    try { Object.assign(out, JSON.parse(adv || '{}')); } catch { /* inválido: se avisa al guardar */ } return out;
  }, [vals, adv]);
  const save = () => {
    try { JSON.parse(adv || '{}'); } catch { toast.push('El JSON avanzado no es válido', 'err'); return; }
    run(() => updateProfileAction(p.id, { name, changes, simulated: sim, notes, note }), { ok: 'Guardado: se creó una versión nueva' });
  };
  const nChanged = Object.keys(changes).length;
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="xl:col-span-2 space-y-4">
        <div className="card p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block"><span className="label">Nombre</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} /></label>
            <div><span className="label">Perfil de fábrica base</span><div className="input !bg-slate-50 dark:!bg-slate-900 flex items-center">{p.baseName}</div></div>
          </div>
          {p.type === 'machine' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sim} onChange={(e) => setSim(e.target.checked)} disabled={!canEdit} /> Máquina simulada</label>}
          <label className="block"><span className="label">Notas</span><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEdit} placeholder="Para qué se usa este perfil" /></label>
        </div>
        <div className="card p-4">
          <h2 className="font-semibold text-sm mb-1">Parámetros que mueven el costo</h2>
          <p className="text-xs muted mb-3">El valor de fábrica aparece como sugerencia; si lo dejas vacío se usa el de fábrica. Solo se guardan los que cambies.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {params.map((x) => (
              <label key={x.key} className="block"><span className="label">{x.label}{x.unit ? ` (${x.unit})` : ''}</span>
                {x.kind === 'select' ? <select className="input" value={vals[x.key]} disabled={!canEdit} onChange={(e) => setVals({ ...vals, [x.key]: e.target.value })} data-testid={`param-${x.key}`}><option value="">Fábrica: {String(base[x.key] ?? '…')}</option>{x.options!.map((o) => <option key={o}>{o}</option>)}</select>
                  : <input className={cn('input', vals[x.key] !== '' && 'ring-2 ring-brand-500/40')} value={vals[x.key]} disabled={!canEdit} placeholder={`Fábrica: ${String(base[x.key] ?? '…')}`} onChange={(e) => setVals({ ...vals, [x.key]: e.target.value })} data-testid={`param-${x.key}`} />}
              </label>
            ))}
          </div>
        </div>
        <details className="card p-4"><summary className="font-semibold text-sm cursor-pointer">Modo avanzado: todas las claves (JSON)</summary>
          <p className="text-xs muted my-2">Cualquier clave de OrcaSlicer, por ejemplo <code>{'{"sparse_infill_density":"40%"}'}</code>. Los valores se ajustan al tipo del perfil base.</p>
          <textarea className="input font-mono text-xs h-48" value={adv} onChange={(e) => setAdv(e.target.value)} disabled={!canEdit} aria-label="Cambios avanzados en JSON" />
        </details>
        {canEdit && <div className="flex flex-wrap items-center gap-2 sticky bottom-20 md:bottom-4"><input className="input !w-auto flex-1 min-w-[180px]" placeholder="Nota de la versión (opcional)" value={note} onChange={(e) => setNote(e.target.value)} /><button className="btn-primary" disabled={pending} onClick={save} data-testid="profile-save">Guardar ({nChanged} cambio{nChanged === 1 ? '' : 's'}) → v{p.version + 1}</button></div>}
      </div>
      <div className="card p-4 h-fit">
        <h2 className="font-semibold text-sm mb-2">Versiones</h2>
        <ul className="space-y-2 text-sm" data-testid="profile-versions">
          {versions.map((v) => (
            <li key={v.version} className="flex items-start justify-between gap-2"><div><b>v{v.version}</b> {v.version === p.version && <span className="badge bg-emerald-50 text-emerald-800 border-emerald-200">Actual</span>}<div className="text-xs muted">{v.createdAt} · {v.keys} cambio{v.keys === 1 ? '' : 's'}{v.note ? ` · ${v.note}` : ''}</div></div>
              {canEdit && v.version !== p.version && <button className="btn-ghost btn-sm shrink-0" onClick={() => run(() => revertProfileAction(p.id, v.version), { ok: `Se volvió a la v${v.version}` })}>Volver</button>}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
