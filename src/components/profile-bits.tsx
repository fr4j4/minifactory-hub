'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createFromTemplatesAction, createProfileAction, deleteProfileAction, duplicateProfileAction, factoryListAction, factoryVendorsAction, profileBaseValuesAction, profileKeysAction, revertProfileAction, updateProfileAction } from '@/actions/slicer';
import { ConfirmButton, Modal, useAction } from './client';
import { NozzlePicker } from './nozzle-picker';
import { SIMPLE_PARAMS, TYPE_EXPLAIN, TYPE_LABEL } from '@/lib/slicer/params';
import { COMMON_NOZZLES, layerChoices, layerRange, layersForThickness, lineWidth, numStr, processWarnings, qualityTemplates, thicknessForLoops, wallThicknessOptions, type TemplateKey } from '@/lib/slicer/nozzle';
import { cn } from '@/lib/format';

type PType = 'machine' | 'process' | 'filament';
export interface MachineOpt { id: string; name: string; baseName: string; nozzle: string | null }
const comma = (n: number | string) => String(n).replace('.', ',');

/* ── Guía: para qué sirve cada perfil ─────────────────────────────────────────────────────────── */
export function ProfilesGuide({ open }: { open?: boolean }) {
  return (
    <details className="card p-4" open={open} data-testid="profiles-guide">
      <summary className="cursor-pointer font-semibold text-sm">¿Para qué sirve cada perfil? <span className="muted font-normal">· y qué relación tiene con las fichas de Máquinas</span></summary>
      <div className="mt-3 space-y-4 text-sm">
        <p className="max-w-3xl">Para laminar una pieza el sitio combina <b>tres perfiles</b>: <b>impresora</b> (en qué equipo y con qué boquilla), <b>calidad</b> (cómo imprimirla) y <b>filamento</b> (con qué material). Cada uno parte de un perfil de fábrica de OrcaSlicer/Bambu Studio y guarda solo tus cambios.</p>
        <div className="grid gap-3 md:grid-cols-3">
          {(['machine', 'process', 'filament'] as const).map((t) => (
            <div key={t} className="rounded-2xl border border-[var(--line)] p-3.5 space-y-1.5">
              <h3 className="font-semibold">{TYPE_EXPLAIN[t].title}</h3>
              <p>{TYPE_EXPLAIN[t].what}</p>
              <p className="text-xs muted"><b>Ejemplos:</b> {TYPE_EXPLAIN[t].example}</p>
              <p className="text-xs muted">{TYPE_EXPLAIN[t].changes}</p>
            </div>
          ))}
        </div>
        <div className="rounded-2xl bg-[var(--panel)] text-[var(--panel-ink)] p-4 space-y-1.5">
          <h3 className="font-semibold">Ejemplo: la misma pieza con boquilla 0,4 y con boquilla 0,2</h3>
          <ul className="list-disc pl-5 text-white/85 space-y-0.5">
            <li>Con la 0,4 laminas con <b>impresora «A1 · 0,4»</b> + calidad <b>Estándar 0,20 mm</b> + <b>PLA Basic</b>.</li>
            <li>Cambias la boquilla en la impresora → en la ficha de la máquina eliges «Boquilla puesta: 0,2». Pasan a usarse la impresora <b>«A1 · 0,2»</b> y la calidad <b>Estándar 0,10 mm</b>; el filamento no cambia.</li>
            <li>Una calidad pensada para 0,4 no sirve con 0,2 (la capa de 0,20 mm sería igual al diámetro de la boquilla): por eso cada calidad lleva su boquilla y el sitio te avisa si no coinciden.</li>
          </ul>
        </div>
        <p className="text-xs muted max-w-3xl"><b>Máquinas ≠ perfil de impresora.</b> La ficha de <b>Máquinas</b> es tu equipo real (costos por hora, mantenimiento, estado, conexión). El <b>perfil de impresora</b> es el «tipo de máquina» para el laminador. La ficha apunta a un perfil de impresora por cada boquilla que uses.</p>
      </div>
    </details>
  );
}

/* ── Nuevo perfil ─────────────────────────────────────────────────────────────────────────────── */
export function NewProfileButton({ type, machines }: { type: PType; machines: MachineOpt[] }) {
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
    const t = setTimeout(() => { factoryListAction(type, vendor, type === 'machine' ? undefined : machine?.baseName, q || undefined, type === 'filament' ? undefined : nz || undefined).then((r) => { if (r.ok) { setList(r.data); if (!r.data.find((x) => x.name === base)) setBase(r.data[0]?.name ?? ''); } }); }, 200);
    return () => clearTimeout(t); /* eslint-disable-next-line */
  }, [open, mode, vendor, machineId, q, nz, type]);
  const n = nozzle[0] ?? '0.4';
  const tpls = useMemo(() => qualityTemplates(n), [n]);
  const pickMachine = (id: string) => { setMachineId(id); const m = machines.find((x) => x.id === id); if (m?.nozzle) setNozzle([m.nozzle]); };
  const title = `Nuevo perfil de ${TYPE_LABEL[type].toLowerCase()}`;
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)} data-testid={`new-profile-${type}`}>+ {title}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} wide>
        <div className="space-y-3">
          {type === 'process' && <div className="flex flex-wrap gap-1 rounded-xl border border-[var(--line)] p-1 w-fit" role="tablist">
            {([['plantilla', 'Plantillas por boquilla'], ['fabrica', 'Desde un perfil de fábrica']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={mode === k} className={cn('px-3 min-h-[36px] rounded-lg text-sm', mode === k ? 'bg-[var(--panel)] text-[var(--panel-ink)] dark:bg-slate-700' : 'muted hover:bg-slate-100 dark:hover:bg-slate-800')} onClick={() => setMode(k)} data-testid={`mode-${k}`}>{l}</button>)}
          </div>}

          {mode === 'plantilla' && type === 'process' && (
            <div className="space-y-3" data-testid="template-form">
              <p className="text-sm muted">Calidades calculadas para la boquilla: la altura de capa es una fracción del diámetro (Borrador 60 % · Estándar 50 % · Fino 30 %) y las paredes un múltiplo del ancho de línea (1,2 mm = 3 líneas con boquilla 0,4). Sirven con cualquier impresora; lo demás (velocidades, aceleraciones) viene del perfil de fábrica de la impresora.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block"><span className="label">Impresora</span>
                  <select className="input" value={machineId} onChange={(e) => pickMachine(e.target.value)} data-testid="tpl-machine"><option value="">— Otra / genérica —</option>{machines.map((m) => <option key={m.id} value={m.id}>{m.name}{m.nozzle ? ` · ${comma(m.nozzle)} mm` : ''}</option>)}</select></label>
                <NozzlePicker label="Boquilla" value={nozzle} onChange={setNozzle} testId="tpl-nozzle" />
              </div>
              <fieldset><legend className="label">Calidades a crear</legend>
                <ul className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)]">{tpls.map((t) => { const loops = Number(t.changes.wall_loops); return (
                  <li key={t.key}><label className="flex items-start gap-3 p-3 cursor-pointer"><input type="checkbox" className="mt-1" checked={keys.includes(t.key)} onChange={(e) => setKeys(e.target.checked ? [...keys, t.key] : keys.filter((x) => x !== t.key))} data-testid={`tpl-${t.key}`} />
                    <span className="min-w-0"><b>{t.label}</b> <span className="num text-sm">· capa {comma(numStr(t.layer))} mm · {loops} paredes ({comma(thicknessForLoops(loops, n))} mm) · relleno {t.changes.sparse_infill_density}</span><span className="block text-xs muted">{t.hint}</span></span></label></li>); })}</ul>
              </fieldset>
              <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
                <button className="btn-primary" disabled={pending || !keys.length} data-testid="tpl-create" onClick={() => run(() => createFromTemplatesAction({ machineProfileId: machineId || null, nozzle: n, keys }), { ok: `${keys.length} calidad${keys.length === 1 ? '' : 'es'} creada${keys.length === 1 ? '' : 's'} para boquilla ${comma(n)}`, onOk: () => setOpen(false) })}>Crear {keys.length} calidad{keys.length === 1 ? '' : 'es'}</button></div>
            </div>
          )}

          {mode === 'fabrica' && (
            <div className="space-y-3">
              <p className="text-sm muted">Todo perfil parte de un perfil de fábrica de OrcaSlicer y guarda solo tus cambios; así se puede volver atrás en cualquier momento.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block"><span className="label">Marca / fabricante</span><select className="input" value={vendor} onChange={(e) => setVendor(e.target.value)}>{vendors.map((v) => <option key={v}>{v}</option>)}</select></label>
                {type !== 'machine' && <label className="block"><span className="label">Compatible con la impresora (opcional)</span><select className="input" value={machineId} onChange={(e) => { setMachineId(e.target.value); const m = machines.find((x) => x.id === e.target.value); if (m?.nozzle && type === 'process') setNz(m.nozzle); }}><option value="">— Todas —</option>{machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}
              </div>
              {type !== 'filament' && <label className="block"><span className="label">Boquilla</span><select className="input sm:max-w-xs" value={nz} onChange={(e) => setNz(e.target.value)} data-testid="factory-nozzle"><option value="">Cualquiera</option>{COMMON_NOZZLES.map((x) => <option key={x} value={x}>{comma(x)} mm</option>)}</select></label>}
              <label className="block"><span className="label">Buscar perfil base</span><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ej. A1, Standard, PETG…" /></label>
              <label className="block"><span className="label">Perfil de fábrica base ({list.length})</span><select className="input" size={6} value={base} onChange={(e) => { setBase(e.target.value); if (!name) setName(e.target.value.replace(/ @.*$/, '')); }} data-testid="factory-list">{list.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}</select></label>
              <label className="block"><span className="label">Nombre del perfil</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. PETG lento para piezas técnicas" data-testid="profile-name" /></label>
              {type === 'machine' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sim} onChange={(e) => setSim(e.target.checked)} /> Impresora simulada (sin equipo físico, para evaluar una compra)</label>}
              <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" disabled={pending || !base || !name} data-testid="profile-create" onClick={() => run(() => createProfileAction({ type, name, baseName: base, vendor, simulated: sim }), { ok: 'Perfil creado', onOk: (id) => { setOpen(false); router.push(`/laminador/perfiles/${id}`); } })}>Crear perfil</button></div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

/* ── Acciones por fila: copia personalizada y eliminar ────────────────────────────────────────── */
export function ProfileRowActions({ id, name, canDelete }: { id: string; name: string; canDelete?: boolean }) {
  const { run, pending } = useAction(); const router = useRouter();
  const [open, setOpen] = useState(false); const [copy, setCopy] = useState(`${name} (copia)`);
  return (
    <span className="inline-flex gap-1">
      <button className="btn-ghost btn-sm" onClick={() => { setCopy(`${name} (copia)`); setOpen(true); }} data-testid="profile-duplicate" title="Crea una copia que puedes modificar sin tocar el original">Duplicar</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Copia personalizada">
        <div className="space-y-3">
          <p className="text-sm muted">Se crea una copia exacta de «{name}» (mismo perfil de fábrica y mismos cambios). Después la editas sin tocar el original.</p>
          <label className="block"><span className="label">Nombre de la copia</span><input className="input" value={copy} onChange={(e) => setCopy(e.target.value)} data-testid="dup-name" /></label>
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="btn-primary" disabled={pending || !copy.trim()} data-testid="dup-confirm" onClick={() => run(() => duplicateProfileAction(id, copy), { ok: 'Copia creada', onOk: () => setOpen(false) })}>Crear copia</button>
            <button className="btn-ghost" disabled={pending || !copy.trim()} data-testid="dup-edit" onClick={() => run(() => duplicateProfileAction(id, copy), { ok: 'Copia creada', onOk: (nid) => { setOpen(false); router.push(`/laminador/perfiles/${nid}`); } })}>Crear y editar</button></div>
        </div>
      </Modal>
      {canDelete && <ConfirmButton className="btn-ghost btn-sm text-red-600 dark:text-red-400" message={`¿Eliminar el perfil “${name}”? Si alguna máquina, material o producto lo usa, te avisamos cuál.`} onConfirm={() => run(() => deleteProfileAction(id), { ok: 'Perfil eliminado' })}>Eliminar</ConfirmButton>}
    </span>
  );
}

/* ── Cambiar el perfil de fábrica base ───────────────────────────────────────────────────────── */
function ChangeBase({ p, nozzle, onPick }: { p: { type: PType; vendor?: string | null; baseName: string }; nozzle: string | null; onPick: (base: string) => void }) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(''); const [list, setList] = useState<Array<{ name: string; nozzle?: string }>>([]); const [sel, setSel] = useState(p.baseName);
  useEffect(() => {
    if (!open) return; const t = setTimeout(() => { factoryListAction(p.type, p.vendor ?? 'BBL', undefined, q || undefined, p.type === 'filament' ? undefined : nozzle || undefined).then((r) => r.ok && setList(r.data)); }, 200);
    return () => clearTimeout(t);
  }, [open, q, p.type, p.vendor, nozzle]);
  return (<>
    <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => setOpen(true)} data-testid="change-base">Cambiar base</button>
    <Modal open={open} onClose={() => setOpen(false)} title="Cambiar el perfil de fábrica base">
      <div className="space-y-3">
        <p className="text-sm muted">Tus cambios se conservan y se aplican sobre la nueva base. Útil para pasar un perfil de otra boquilla o de otra impresora de la misma marca{nozzle && p.type !== 'filament' ? ` (se muestran las de boquilla ${comma(nozzle)} mm)` : ''}.</p>
        <input className="input" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar perfil base" />
        <select className="input" size={8} value={sel} onChange={(e) => setSel(e.target.value)} aria-label="Perfil base" data-testid="base-list">{list.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}{!list.find((x) => x.name === p.baseName) && <option value={p.baseName}>{p.baseName} (actual)</option>}</select>
        <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" disabled={sel === p.baseName} onClick={() => { setOpen(false); onPick(sel); }} data-testid="base-apply">Usar esta base</button></div>
      </div>
    </Modal>
  </>);
}

/* ── Editor ───────────────────────────────────────────────────────────────────────────────────── */
export function ProfileEditor({ p, versions, canEdit, usedBy = [] }: { p: { id: string; type: PType; name: string; vendor?: string | null; baseName: string; nozzle: string | null; changes: Record<string, any>; version: number; simulated: boolean; notes: string | null }; versions: Array<{ version: number; note: string | null; createdAt: string; keys: number }>; canEdit: boolean; usedBy?: string[] }) {
  const { run, pending } = useAction();
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
  const save = (over?: { baseName?: string; note?: string }) => run(() => updateProfileAction(p.id, { name, changes, simulated: sim, notes, note: over?.note ?? note, nozzle: p.type === 'filament' ? undefined : nozzle[0] ?? null, ...(over?.baseName ? { baseName: over.baseName } : {}) }), { ok: 'Guardado: se creó una versión nueva' });
  const nChanged = Object.keys(changes).length;
  const num = (k: string) => { const x = Number(String(vals[k] || base[k] || '').replace(',', '.')); return Number.isFinite(x) && x > 0 ? x : null; };
  const noz = nozzle[0] ?? null;
  const lh = num('layer_height'); const loops = num('wall_loops');
  const warns = p.type === 'process' ? processWarnings({ machineNozzle: noz, processNozzle: null, layerHeight: lh }) : [];
  const wallOpts = noz ? wallThicknessOptions(noz) : [];
  const set = (k: string, v: string) => setVals((cur) => ({ ...cur, [k]: v }));
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="xl:col-span-2 space-y-4">
        <div className="card p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block"><span className="label">Nombre</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} data-testid="profile-title" /></label>
            <div><span className="label">Perfil de fábrica base</span><div className="flex items-center gap-2"><div className="input !bg-slate-50 dark:!bg-slate-900 flex items-center flex-1 min-w-0 truncate" title={p.baseName}>{p.baseName}</div>{canEdit && <ChangeBase p={p} nozzle={noz} onPick={(b) => save({ baseName: b, note: `Base cambiada a ${b}` })} />}</div></div>
          </div>
          {p.type !== 'filament' && <NozzlePicker label={p.type === 'machine' ? 'Boquilla de esta impresora' : 'Boquilla para la que está pensada esta calidad'} value={nozzle} onChange={(v) => canEdit && setNozzle(v)} hint={p.type === 'process' ? 'Se usa para avisarte si la combinas con una máquina que tiene otra boquilla y para ordenar la lista.' : 'Para pasar a otra boquilla de fábrica usa «Cambiar base»; aquí solo se anota cuál es.'} testId="profile-nozzle" />}
          {p.type === 'machine' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sim} onChange={(e) => setSim(e.target.checked)} disabled={!canEdit} /> Impresora simulada</label>}
          <label className="block"><span className="label">Notas</span><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEdit} placeholder="Para qué se usa este perfil" /></label>
          {usedBy.length > 0 && <p className="text-xs muted" data-testid="profile-used">En uso por: {usedBy.join(', ')}</p>}
        </div>

        {p.type === 'process' && noz && (
          <div className="card p-4 space-y-3" data-testid="nozzle-helper">
            <div><h2 className="font-semibold text-sm">Medidas para boquilla {comma(noz)} mm</h2><p className="text-xs muted">Ancho de línea {comma(lineWidth(noz))} mm · altura de capa recomendada {comma(numStr(layerRange(noz).min))}–{comma(numStr(layerRange(noz).max))} mm. Las paredes y capas se piden en múltiplos de la boquilla.</p></div>
            <div><span className="label">Altura de capa habitual</span>
              <div className="flex flex-wrap gap-1.5">{layerChoices(noz).map((h) => <button key={h} type="button" disabled={!canEdit} onClick={() => { set('layer_height', numStr(h)); }} aria-pressed={lh === h} className={cn('num min-h-[36px] px-3 rounded-xl border text-sm', lh === h ? 'bg-[var(--panel)] text-[var(--panel-ink)] border-transparent dark:bg-slate-700' : 'border-[var(--line)] hover:bg-slate-100 dark:hover:bg-slate-800')}>{comma(numStr(h))}</button>)}</div></div>
            <div><span className="label">Espesor de pared</span>
              <div className="flex flex-wrap gap-1.5">{wallOpts.map((o) => <button key={o.mm} type="button" disabled={!canEdit} onClick={() => set('wall_loops', String(o.loops))} aria-pressed={loops === o.loops} className={cn('min-h-[36px] px-3 rounded-xl border text-sm', loops === o.loops ? 'bg-[var(--panel)] text-[var(--panel-ink)] border-transparent dark:bg-slate-700' : 'border-[var(--line)] hover:bg-slate-100 dark:hover:bg-slate-800')} data-testid={`wall-${o.mm}`}><span className="num">{comma(o.mm)} mm</span> <span className="text-xs opacity-70">· {o.loops} paredes</span></button>)}</div>
              {loops && <p className="text-xs muted mt-1">Ahora: <b>{loops} paredes</b> = {comma(thicknessForLoops(loops, noz))} mm de pared.{lh && num('top_shell_layers') ? ` Techo: ${comma(numStr(num('top_shell_layers')! * lh))} mm (${num('top_shell_layers')} capas).` : ''}{lh && num('bottom_shell_layers') ? ` Piso: ${comma(numStr(num('bottom_shell_layers')! * lh))} mm.` : ''}</p>}
              {lh && <p className="text-xs muted">Para techo/piso de 1,0 mm con esta capa necesitas {layersForThickness(1, lh)} capas.</p>}</div>
            {warns.length > 0 && <ul className="text-xs text-amber-800 dark:text-amber-300 space-y-0.5" role="status" data-testid="profile-warnings">{warns.map((w) => <li key={w}>⚠ {w}</li>)}</ul>}
          </div>
        )}

        <div className="card p-4 space-y-4">
          <div><h2 className="font-semibold text-sm">Parámetros que mueven el costo</h2>
            <p className="text-xs muted">El valor de fábrica aparece como sugerencia; si lo dejas vacío se usa el de fábrica. Solo se guardan los que cambies. Puedes escribir coma o punto decimal.</p></div>
          {groups.map((g) => (
            <fieldset key={g}><legend className="eyebrow mb-2">{g}</legend>
              <div className="grid sm:grid-cols-2 gap-3">
                {params.filter((x) => x.group === g).map((x) => (
                  <label key={x.key} className="block"><span className="label">{x.label}{x.unit ? ` (${x.unit})` : ''}</span>
                    {x.kind === 'select' ? <select className="input" value={vals[x.key]} disabled={!canEdit} onChange={(e) => set(x.key, e.target.value)} data-testid={`param-${x.key}`}><option value="">Fábrica: {String(base[x.key] ?? '…')}</option>{x.options!.map((o) => <option key={o}>{o}</option>)}</select>
                      : <input className={cn('input', vals[x.key] !== '' && 'ring-2 ring-brand-500/40')} inputMode={x.kind === 'number' ? 'decimal' : undefined} value={vals[x.key]} disabled={!canEdit} placeholder={`Fábrica: ${String(base[x.key] ?? '…')}`} onChange={(e) => set(x.key, e.target.value)} data-testid={`param-${x.key}`} />}
                    {x.help && <span className="text-xs muted">{x.help}</span>}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <div className="card p-4 space-y-3" data-testid="extra-params">
          <div><h2 className="font-semibold text-sm">Otros parámetros</h2><p className="text-xs muted">Cualquier ajuste de OrcaSlicer/Bambu Studio. Busca por nombre (en inglés, como en el programa), por ejemplo «retraction», «brim», «ironing», «seam».</p></div>
          {Object.keys(extra).length > 0 && <ul className="divide-y divide-[var(--line)]">{Object.entries(extra).map(([k, v]) => { const b = allKeys.find((x) => x.key === k)?.value; return (
            <li key={k} className="py-2 flex flex-wrap items-center gap-2"><code className="text-xs flex-1 min-w-[180px] break-all">{k}</code><span className="text-xs muted">fábrica: {b ?? '—'}</span>
              <input className="input !w-40 !min-h-[34px] num" value={v} disabled={!canEdit} onChange={(e) => setExtra({ ...extra, [k]: e.target.value })} aria-label={`Valor de ${k}`} />
              {canEdit && <button className="btn-ghost btn-sm" onClick={() => { const n = { ...extra }; delete n[k]; setExtra(n); }} aria-label={`Quitar ${k}`}>✕</button>}</li>); })}</ul>}
          {canEdit && <div className="space-y-1.5"><input className="input" placeholder={`Buscar entre ${allKeys.length} parámetros…`} value={kq} onChange={(e) => setKq(e.target.value)} data-testid="param-search" />
            {kq.length >= 2 && <ul className="max-h-56 overflow-y-auto rounded-xl border border-[var(--line)] divide-y divide-[var(--line)]">{allKeys.filter((x) => x.key.includes(kq.toLowerCase().replace(/\s+/g, '_')) && !(x.key in extra) && !params.some((pp) => pp.key === x.key)).slice(0, 40).map((x) =>
              <li key={x.key}><button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 flex justify-between gap-2" onClick={() => { setExtra({ ...extra, [x.key]: x.value }); setKq(''); }} data-testid="param-add"><code className="text-xs">{x.key}</code><span className="text-xs muted truncate">fábrica: {x.value}</span></button></li>)}</ul>}</div>}
          <details><summary className="text-xs muted cursor-pointer">Ver los cambios como JSON (solo lectura, para expertos)</summary><pre className="mt-2 text-xs bg-slate-50 dark:bg-slate-900 rounded-xl p-3 overflow-x-auto">{JSON.stringify(changes, null, 2)}</pre></details>
        </div>
        {canEdit && <div className="flex flex-wrap items-center gap-2 sticky bottom-20 md:bottom-4"><input className="input !w-auto flex-1 min-w-[180px]" placeholder="Nota de la versión (opcional)" value={note} onChange={(e) => setNote(e.target.value)} /><button className="btn-primary" disabled={pending} onClick={() => save()} data-testid="profile-save">Guardar ({nChanged} cambio{nChanged === 1 ? '' : 's'}) → v{p.version + 1}</button></div>}
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
