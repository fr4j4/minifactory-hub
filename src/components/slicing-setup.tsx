'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCustomFilamentAction, customFilamentDefaultsAction, previewImportAction, importSelectedAction, processesForAction, setupAllFilamentsAction, setupFilamentAction, setupMachineAction } from '@/actions/slicer';
import { cn } from '@/lib/format';
import { Modal, useAction, useToast } from './client';

export interface SetupData {
  machines: Array<{ id: string; name: string; brand: string | null; model: string | null; nozzle: string; simulated: boolean; machineProfile: { id: string; name: string; baseName: string } | null; suggestedMachine: string | null; defaultProcess: { id: string; name: string } | null; processes: string[] }>;
  materials: Array<{ id: string; label: string; type: string; hex: string; filamentProfile: { id: string; name: string } | null; profileType: string | null; mismatch: boolean; suggested: string | null }>;
  machineOptions: Array<{ name: string; vendor: string }>; filamentOptions: Array<{ name: string; group: string }>; filamentProfiles: Array<{ id: string; name: string }>;
  done: { machines: number; materials: number };
}
const pretty = (n: string) => n.replace(/ @System$/, '').replace(/ @BBL (.+)$/, ' (Bambu Lab $1)').replace(/ nozzle$/, ' (boquilla)');

function Step({ n, title, done, total, children, hint }: { n: number; title: string; done: number; total: number; children: React.ReactNode; hint: React.ReactNode }) {
  const ok = total > 0 && done === total;
  return (
    <section className="card overflow-hidden" data-testid={`setup-step-${n}`}>
      <header className="flex items-start gap-3 px-4 py-3.5 border-b border-[var(--line)]">
        <span className={cn('h-8 w-8 shrink-0 rounded-full grid place-items-center font-display font-semibold', ok ? 'bg-emerald-600 text-white' : 'bg-[var(--panel)] text-[var(--panel-ink)] dark:bg-slate-700')} aria-hidden>{ok ? '✓' : n}</span>
        <div className="min-w-0 flex-1"><h2 className="font-display text-lg font-semibold tracking-tight leading-tight">{title}</h2><p className="text-sm muted mt-0.5">{hint}</p></div>
        <span className={cn('num text-xs shrink-0 mt-1', ok ? 'text-emerald-700 dark:text-emerald-400' : 'muted')} data-testid={`setup-step-${n}-count`}>{done}/{total}</span>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function MachineRow({ m, options }: { m: SetupData['machines'][number]; options: SetupData['machineOptions'] }) {
  const { run, pending } = useAction();
  const [base, setBase] = useState(m.machineProfile?.baseName ?? m.suggestedMachine ?? ''); const [procs, setProcs] = useState<string[]>(m.processes); const [proc, setProc] = useState(m.processes[0] ?? '');
  const [q, setQ] = useState(''); const [pick, setPick] = useState(!m.machineProfile && !m.suggestedMachine);
  useEffect(() => { if (!base) return; if (base === (m.machineProfile?.baseName ?? m.suggestedMachine)) { setProcs(m.processes); setProc(m.processes[0] ?? ''); return; } processesForAction(base).then((r) => { if (r.ok) { setProcs(r.data); setProc(r.data[0] ?? ''); } }); }, [base]); // eslint-disable-line
  const ready = !!m.machineProfile && !!m.defaultProcess;
  const filtered = useMemo(() => { const t = q.toLowerCase(); return options.filter((o) => !t || o.name.toLowerCase().includes(t)).slice(0, 80); }, [q, options]);
  return (
    <li className="rounded-2xl border border-[var(--line)] p-3.5 space-y-3" data-testid="setup-machine">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0"><div className="font-medium">{m.name}</div><div className="text-xs muted">{[m.brand, m.model].filter(Boolean).join(' ') || 'Sin marca/modelo en la ficha'} · boquilla {m.nozzle} mm{m.simulated ? ' · simulada' : ''}</div></div>
        {ready ? <span className="badge badge-led text-emerald-800 bg-emerald-50 border-emerald-200 dark:text-emerald-200 dark:bg-emerald-950/50 dark:border-emerald-900">Lista: {pretty(m.machineProfile!.baseName)} · {m.defaultProcess!.name}</span> : <span className="badge badge-led text-amber-900 bg-amber-50 border-amber-200 dark:text-amber-200 dark:bg-amber-950/50 dark:border-amber-900">Falta configurar</span>}
      </div>
      <div className="grid gap-3 md:grid-cols-[1.3fr_1fr_auto] items-end">
        <div>
          <span className="label">¿Qué impresora es?</span>
          {!pick && base ? <div className="flex items-center gap-2"><div className="input flex items-center !bg-slate-50 dark:!bg-slate-800/40" data-testid="setup-machine-base">{pretty(base)}</div><button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => setPick(true)}>Cambiar</button></div>
            : <div className="space-y-1.5"><input className="input" placeholder="Busca: A1, P1S, Prusa MK4, Ender…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar impresora" /><select className="input" size={5} value={base} onChange={(e) => { setBase(e.target.value); setPick(false); }} aria-label="Impresora" data-testid="setup-machine-select">{filtered.map((o) => <option key={o.name} value={o.name}>{pretty(o.name)}{o.vendor !== 'BBL' ? ` · ${o.vendor}` : ''}</option>)}</select></div>}
        </div>
        <label className="block"><span className="label">Calidad por defecto</span><select className="input" value={proc} onChange={(e) => setProc(e.target.value)} disabled={!procs.length} data-testid="setup-process">{procs.map((p) => <option key={p} value={p}>{pretty(p)}</option>)}</select></label>
        <button className={ready ? 'btn-ghost' : 'btn-primary'} disabled={pending || !base || !proc} onClick={() => run(() => setupMachineAction(m.id, base, proc), { ok: `${m.name} lista para laminar` })} data-testid="setup-machine-save">{ready ? 'Actualizar' : 'Usar'}</button>
      </div>
      <p className="text-xs muted">Las calidades son los perfiles de fábrica de OrcaSlicer/Bambu Studio para esa impresora (0,20 mm Standard es el equilibrio habitual). Podrás ajustarlas después en Perfiles.</p>
    </li>
  );
}

function MaterialRow({ m, options, profiles }: { m: SetupData['materials'][number]; options: SetupData['filamentOptions']; profiles: SetupData['filamentProfiles'] }) {
  const { run, pending } = useAction();
  const [val, setVal] = useState(m.mismatch && m.suggested ? `b:${m.suggested}` : m.filamentProfile ? `p:${m.filamentProfile.id}` : m.suggested ? `b:${m.suggested}` : '');
  const groups = useMemo(() => [...new Set(options.map((o) => o.group))], [options]);
  return (
    <li className="py-2.5 flex flex-wrap items-center gap-3" data-testid="setup-material">
      <span className="h-5 w-5 rounded-full border border-black/15 shrink-0" style={{ background: m.hex }} aria-hidden />
      <div className="min-w-[160px] flex-1"><div className="text-sm font-medium" data-testid="setup-material-label">{m.label}</div><div className="text-xs muted">{m.filamentProfile ? <>Perfil: <b>{m.filamentProfile.name}</b></> : 'Sin perfil de filamento: no se puede laminar con este material'}</div>
        {m.mismatch && <div className="text-xs text-red-700 dark:text-red-400 mt-0.5" role="alert" data-testid="setup-material-mismatch">⚠ El perfil es de {m.profileType} y el material es {m.type}: el laminado usaría temperaturas y caudal equivocados.</div>}</div>
      <select className="input !w-auto min-w-[240px] max-w-full" value={val} onChange={(e) => setVal(e.target.value)} aria-label={`Perfil de filamento para ${m.label}`} data-testid="setup-material-select">
        <option value="">— Elegir perfil —</option>
        {profiles.length > 0 && <optgroup label="Mis perfiles">{profiles.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.name}</option>)}</optgroup>}
        {groups.map((g) => <optgroup key={g} label={`De fábrica · ${g}`}>{options.filter((o) => o.group === g).map((o) => <option key={o.name} value={`b:${o.name}`}>{pretty(o.name)}{o.name === m.suggested ? ' ★ sugerido' : ''}</option>)}</optgroup>)}
      </select>
      <button className="btn-ghost btn-sm" disabled={pending || !val || val === `p:${m.filamentProfile?.id}`} onClick={() => run(() => setupFilamentAction(m.id, val.startsWith('p:') ? { profileId: val.slice(2) } : { base: val.slice(2) }), { ok: 'Perfil asignado' })} data-testid="setup-material-save">Asignar</button>
      <CustomFilamentButton small materialId={m.id} type={m.type} label="Personalizado…" />
    </li>
  );
}

export function SlicingSetup({ data, canEdit }: { data: SetupData; canEdit: boolean }) {
  const { run, pending } = useAction();
  const missing = data.materials.filter((m) => (!m.filamentProfile || m.mismatch) && m.suggested);
  const ready = data.machines.length > 0 && data.done.machines === data.machines.length && data.done.materials === data.materials.length;
  return (
    <div className="space-y-5">
      <section className={cn('rounded-3xl p-5 md:p-6 ring-1', ready ? 'bg-emerald-50 ring-emerald-200 dark:bg-emerald-950/30 dark:ring-emerald-900' : 'bg-[var(--panel)] text-[var(--panel-ink)] ring-black/5 dark:ring-white/[.07]')} data-testid="setup-summary">
        <h2 className="font-display text-xl font-semibold tracking-tight">{ready ? 'Todo listo para laminar' : '¿Qué se necesita para laminar en el sitio?'}</h2>
        <p className={cn('text-sm mt-1.5 max-w-3xl', ready ? 'text-emerald-900 dark:text-emerald-200' : 'text-white/75')}>
          El laminador usa los mismos perfiles que Bambu Studio y OrcaSlicer. Solo hay que decir <b>qué impresora es cada máquina</b>, <b>qué calidad usar por defecto</b> y <b>qué filamento es cada material</b> de tu inventario. No hace falta tocar archivos JSON. Si ya tienes perfiles propios en Bambu Studio, impórtalos.</p>
        {canEdit && <div className="mt-4 flex flex-wrap gap-2"><ImportPresetsButton dark={!ready} /><CustomFilamentButton label="+ Filamento personalizado" dark={!ready} /></div>}
      </section>
      <Step n={1} title="Impresoras y calidad" done={data.done.machines} total={data.machines.length} hint="Elige el modelo de cada máquina (detectado por marca y modelo de su ficha) y la calidad por defecto.">
        {data.machines.length === 0 ? <p className="text-sm muted">No hay máquinas FDM. <Link className="underline" href="/maquinas/nueva">Agrega una</Link> o <Link className="underline" href="/maquinas/conectores">conecta tu Bambu Lab</Link>.</p>
          : <ul className="space-y-3">{data.machines.map((m) => <MachineRow key={m.id} m={m} options={data.machineOptions} />)}</ul>}
      </Step>
      <Step n={2} title="Filamentos de tu inventario" done={data.done.materials} total={data.materials.length} hint="Cada material necesita un perfil de filamento (temperaturas, flujo y densidad: de aquí salen los gramos). Te sugerimos uno por marca y tipo.">
        {missing.length > 1 && canEdit && <button className="btn-primary btn-sm mb-3" disabled={pending} onClick={() => run(() => setupAllFilamentsAction(missing.map((m) => ({ materialId: m.id, base: m.suggested! }))), { ok: `${missing.length} materiales configurados` })} data-testid="setup-all-filaments">Usar los sugeridos en los {missing.length} que faltan</button>}
        {data.materials.length === 0 ? <p className="text-sm muted">No hay materiales en el inventario. <Link className="underline" href="/inventario">Agrégalos</Link> o crea un filamento personalizado y márcalo para el inventario.</p>
          : <ul className="divide-y divide-[var(--line)]">{data.materials.map((m) => <MaterialRow key={m.id} m={m} options={data.filamentOptions} profiles={data.filamentProfiles} />)}</ul>}
      </Step>
      <Step n={3} title="Laminar" done={ready ? 1 : 0} total={1} hint="Con lo anterior listo, cualquier archivo se lamina desde Archivos 3D → «Laminar y cotizar» o desde un presupuesto.">
        <div className="flex flex-wrap gap-2"><Link className={ready ? 'btn-primary' : 'btn-ghost'} href="/archivos">Ir a Archivos 3D</Link><Link className="btn-ghost" href="/laminador">Ver y ajustar perfiles</Link></div>
      </Step>
    </div>
  );
}

/* ── Importar desde Bambu Studio / OrcaSlicer ─────────────────────────────────────────────────── */
type Prev = { key: string; type: 'machine' | 'process' | 'filament'; name: string; baseName: string | null; keys: number; source: string; note: string | null; ok: boolean; exists: boolean };
const TYPE_ES = { machine: 'Impresora', process: 'Proceso', filament: 'Filamento' } as const;
export function ImportPresetsButton({ dark }: { dark?: boolean }) {
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
    toast.push(`Importados: ${r.data.created} nuevos${r.data.updated ? `, ${r.data.updated} actualizados (versión nueva)` : ''}`); setOpen(false); setFiles([]); setPrev(null); router.refresh();
  };
  return (
    <>
      <button className={dark ? 'btn-ghost !bg-transparent !text-white !border-white/25 hover:!bg-white/10' : 'btn-ghost'} onClick={() => setOpen(true)} data-testid="import-presets">Importar desde Bambu Studio / OrcaSlicer</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Importar tus perfiles" wide>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1 rounded-xl border border-[var(--line)] p-1 w-fit" role="tablist">{([['3mf', 'Lo más fácil: un proyecto .3mf'], ['bundle', 'Paquete de perfiles'], ['json', 'Archivos .json']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={how === k} className={cn('px-3 min-h-[36px] rounded-lg text-sm', how === k ? 'bg-[var(--panel)] text-[var(--panel-ink)] dark:bg-slate-700' : 'muted hover:bg-slate-100 dark:hover:bg-slate-800')} onClick={() => setHow(k)}>{l}</button>)}</div>
          {how === '3mf' && <ol className="list-decimal pl-5 text-sm space-y-1"><li>En Bambu Studio abre (o crea) un proyecto y elige arriba a la izquierda <b>tu impresora</b>, <b>tus filamentos</b> y <b>tu proceso</b> (calidad).</li><li>Guárdalo: <b>Archivo → Guardar proyecto como…</b> (archivo <code>.3mf</code>). No hace falta laminarlo.</li><li>Súbelo aquí: importamos los tres perfiles, incluidos tus cambios respecto de los de fábrica.</li></ol>}
          {how === 'bundle' && <ol className="list-decimal pl-5 text-sm space-y-1"><li>En Bambu Studio: <b>Archivo → Exportar → Exportar paquete de preajustes…</b> (Export Preset Bundle).</li><li>Elige <b>Impresora</b> (crea un <code>.bbscfg</code> con la impresora y sus filamentos y procesos de usuario) o <b>Filamento</b> (<code>.bbsflmt</code>).</li><li>Sube el archivo (o la carpeta comprimida en .zip). OrcaSlicer exporta paquetes <code>.zip</code> parecidos.</li></ol>}
          {how === 'json' && <div className="text-sm space-y-1"><p>Bambu Studio guarda tus perfiles de usuario como archivos .json en:</p><ul className="list-disc pl-5 muted"><li>Windows: <code>%APPDATA%\BambuStudio\user\&lt;tu id&gt;\filament</code> (y <code>process</code>, <code>machine</code>)</li><li>macOS: <code>~/Library/Application Support/BambuStudio/user/&lt;tu id&gt;/…</code></li><li>Linux: <code>~/.config/BambuStudio/user/&lt;tu id&gt;/…</code></li></ul><p className="muted">Puedes subir varios a la vez. En OrcaSlicer la carpeta es <code>OrcaSlicer/user/default/…</code>.</p></div>}
          <label className={cn('block rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors', busy ? 'border-[var(--accent)]' : 'border-[var(--line)] hover:border-slate-400')}>
            <input type="file" multiple accept=".3mf,.bbscfg,.bbsflmt,.zip,.json" className="sr-only" onChange={(e) => analyze(Array.from(e.target.files ?? []))} data-testid="import-files" />
            <span className="font-medium">{busy ? 'Analizando…' : files.length ? files.map((f) => f.name).join(', ') : 'Elegir archivos (.3mf, .bbscfg, .bbsflmt, .zip, .json)'}</span>
            <span className="block text-xs muted mt-1">Se revisa antes de guardar: nada se importa hasta que confirmes.</span>
          </label>
          {prev && (prev.length === 0 ? <p className="text-sm muted">No se encontraron perfiles en los archivos.</p> : <div className="rounded-2xl border border-[var(--line)] overflow-hidden">
            <table className="w-full text-sm" data-testid="import-preview"><thead><tr><th className="th w-8" /><th className="th">Perfil</th><th className="th">Basado en (fábrica)</th><th className="th text-right">Cambios</th></tr></thead>
              <tbody>{prev.map((p) => <tr key={p.key}>
                <td className="td"><input type="checkbox" aria-label={`Importar ${p.name}`} disabled={!p.ok} checked={sel.has(p.key)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(p.key); else n.delete(p.key); setSel(n); }} /></td>
                <td className="td"><span className="eyebrow !text-[10px] mr-2">{TYPE_ES[p.type]}</span><b>{p.name}</b>{p.exists && <span className="badge ml-2 text-sky-800 bg-sky-50 border-sky-200 dark:text-sky-200 dark:bg-sky-950/50 dark:border-sky-900">ya existe: versión nueva</span>}<div className="text-xs muted">{p.source}{p.note ? ` · ${p.note}` : ''}</div></td>
                <td className="td text-xs">{p.baseName ? pretty(p.baseName) : '—'}</td><td className="td text-right num">{p.keys === 0 ? <span className="muted">igual al de fábrica</span> : p.keys}</td></tr>)}</tbody></table>
          </div>)}
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" disabled={busy || !prev || sel.size === 0} onClick={save} data-testid="import-confirm">Importar {sel.size || ''} perfil{sel.size === 1 ? '' : 'es'}</button></div>
        </div>
      </Modal>
    </>
  );
}

/* ── Filamento personalizado ──────────────────────────────────────────────────────────────────── */
const TYPES = ['PLA', 'PLA Matte', 'PLA Silk', 'PLA-CF', 'PETG', 'PETG HF', 'PETG-CF', 'ABS', 'ASA', 'TPU', 'PA', 'PA-CF', 'PC', 'PCTG', 'PVA', 'HIPS', 'PP'];
const FIELDS: Array<{ key: string; label: string; unit: string; group: string }> = [
  { key: 'nozzle_temperature_initial_layer', label: 'Boquilla 1ª capa', unit: '°C', group: 'Temperaturas' }, { key: 'nozzle_temperature', label: 'Boquilla', unit: '°C', group: 'Temperaturas' },
  { key: 'textured_plate_temp', label: 'Cama PEI texturizada', unit: '°C', group: 'Temperaturas' }, { key: 'hot_plate_temp', label: 'Cama PEI lisa / High Temp', unit: '°C', group: 'Temperaturas' }, { key: 'cool_plate_temp', label: 'Cama Cool Plate', unit: '°C', group: 'Temperaturas' },
  { key: 'filament_flow_ratio', label: 'Factor de flujo', unit: '', group: 'Extrusión' }, { key: 'filament_max_volumetric_speed', label: 'Caudal volumétrico máx.', unit: 'mm³/s', group: 'Extrusión' }, { key: 'pressure_advance', label: 'Pressure advance', unit: '', group: 'Extrusión' },
  { key: 'filament_density', label: 'Densidad', unit: 'g/cm³', group: 'Material' }, { key: 'filament_cost', label: 'Costo', unit: '$/kg', group: 'Material' }, { key: 'filament_diameter', label: 'Diámetro', unit: 'mm', group: 'Material' },
  { key: 'fan_min_speed', label: 'Ventilador mín.', unit: '%', group: 'Enfriamiento' }, { key: 'fan_max_speed', label: 'Ventilador máx.', unit: '%', group: 'Enfriamiento' }, { key: 'filament_retraction_length', label: 'Retracción', unit: 'mm', group: 'Enfriamiento' },
];
export function CustomFilamentButton({ label = '+ Filamento personalizado', materialId, type: type0, small, dark }: { label?: string; materialId?: string; type?: string; small?: boolean; dark?: boolean }) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false); const [name, setName] = useState(''); const [brand, setBrand] = useState(''); const [type, setType] = useState(TYPES.includes(type0 ?? '') ? type0! : 'PLA');
  const [base, setBase] = useState(''); const [defs, setDefs] = useState<Record<string, string>>({}); const [vals, setVals] = useState<Record<string, string>>({});
  const [inv, setInv] = useState(!materialId); const [color, setColor] = useState(''); const [hex, setHex] = useState('#ff5b1f');
  useEffect(() => { if (!open) return; customFilamentDefaultsAction(type).then((r) => { if (r.ok) { setBase(r.data.baseName); setDefs(r.data.values); } }); }, [open, type]);
  const groups = [...new Set(FIELDS.map((f) => f.group))];
  return (
    <>
      <button className={small ? 'btn-ghost btn-sm' : dark ? 'btn-ghost !bg-transparent !text-white !border-white/25 hover:!bg-white/10' : 'btn-ghost'} onClick={() => setOpen(true)} data-testid="custom-filament">{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Filamento personalizado" wide>
        <div className="space-y-4">
          <p className="text-sm muted">Parte de los valores de un filamento genérico del mismo tipo; cambia solo lo que tu marca indique (en la caja o en su ficha técnica). Lo que dejes en blanco usa el valor genérico.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block sm:col-span-1"><span className="label">Nombre</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Sunlu PETG negro" data-testid="cf-name" /></label>
            <label className="block"><span className="label">Marca</span><input className="input" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Ej. Sunlu" data-testid="cf-brand" /></label>
            <label className="block"><span className="label">Tipo</span><select className="input" value={type} onChange={(e) => { setType(e.target.value); setVals({}); }} data-testid="cf-type">{TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
          </div>
          <p className="text-xs muted">Base: <b>{base ? pretty(base) : '…'}</b></p>
          {groups.map((g) => <fieldset key={g}><legend className="eyebrow mb-2">{g}</legend><div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {FIELDS.filter((f) => f.group === g).map((f) => <label key={f.key} className="block"><span className="label">{f.label}{f.unit ? ` (${f.unit})` : ''}</span><input className={cn('input num', vals[f.key] && 'ring-2 ring-brand-500/40')} inputMode="decimal" value={vals[f.key] ?? ''} placeholder={defs[f.key] ?? ''} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} data-testid={`cf-${f.key}`} /></label>)}
          </div></fieldset>)}
          {!materialId && <div className="rounded-2xl border border-[var(--line)] p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={inv} onChange={(e) => setInv(e.target.checked)} data-testid="cf-inventory" /> Agregarlo también al inventario como material</label>
            {inv && <div className="grid gap-3 grid-cols-[1fr_auto]"><label className="block"><span className="label">Color</span><input className="input" value={color} onChange={(e) => setColor(e.target.value)} placeholder="Ej. Negro" data-testid="cf-color" /></label><label className="block"><span className="label">Tono</span><input type="color" className="input !p-1 !w-16" value={hex} onChange={(e) => setHex(e.target.value)} aria-label="Tono del color" /></label></div>}
          </div>}
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="btn-primary" disabled={pending || !name.trim()} data-testid="cf-save" onClick={() => run(() => createCustomFilamentAction({ name, brand, type, baseName: base, values: vals, materialId: materialId ?? null, addToInventory: !materialId && inv ? { colorName: color, hex, costPerKg: Number((vals.filament_cost || defs.filament_cost || '0').replace(',', '.')) || 0 } : null }), { ok: materialId ? 'Filamento creado y asignado' : inv ? 'Filamento creado y agregado al inventario' : 'Filamento creado', onOk: () => { setOpen(false); setName(''); setVals({}); } })}>Crear filamento</button></div>
        </div>
      </Modal>
    </>
  );
}
