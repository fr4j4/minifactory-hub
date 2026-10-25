'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { addCatalogColorOwnedAction } from '@/actions/purchases';
import { COLOR_FAMILIES, FAMILY_HEX, filterMaterials, groupMaterials, pickerName, typesOf, type ColorFamily, type PickMaterial } from '@/lib/filament-pick';
import { variantKey } from '@/lib/catalog/map';
import type { CatalogFilament, CatalogVariant, Page } from '@/lib/catalog/ofd';
import { cn, grams, money } from '@/lib/format';
import { useT } from '@/i18n/client';
import { Modal, useAction } from './client';

type Mat = PickMaterial;
type Added = { id: string; name: string; hex: string; material?: Mat };
const RECENT_KEY = 'mf.recentFilaments';
const readRecents = (): string[] => { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 5) : []; } catch { return []; } };
const pushRecent = (id: string) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...readRecents().filter((x) => x !== id)].slice(0, 5))); } catch { /* sin almacenamiento: no pasa nada */ } };
const getJson = async <T,>(url: string): Promise<T> => { const r = await fetch(url, { credentials: 'same-origin' }); if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<T>; };
const enc = (k: string) => k.split('/').map(encodeURIComponent).join('/');

export interface FilamentPickerProps {
  materials: Mat[];
  /** id del material elegido; '' = ninguno (se muestra `emptyLabel`) */
  value: string;
  onChange: (id: string, m?: Mat) => void;
  /** tecnología que se ofrece (por defecto solo FDM; null = todas) */
  tech?: string | null;
  /** texto de la opción «ninguno» (p. ej. «igual al primero»); sin él no hay opción vacía */
  emptyLabel?: string;
  /** gramos que necesita la pieza: la lista avisa cuánto falta, sin bloquear */
  gramsNeeded?: number;
  /** tipo y tono de referencia (p. ej. los del 3MF): lo más parecido sale primero */
  hint?: { type?: string | null; hex?: string | null };
  showCost?: boolean;
  showProfile?: boolean;
  /** permite buscar en la Biblioteca y agregar el color a Mis filamentos */
  library?: boolean;
  disabled?: boolean;
  testId?: string;
  ariaLabel?: string;
  className?: string;
}

/** Selector de filamento: buscar, filtrar por tipo, color o stock, y agregar desde la Biblioteca indicando cuánto se tiene. */
export function FilamentPicker({ materials, value, onChange, tech = 'fdm', emptyLabel, gramsNeeded, hint, showCost = true, showProfile = true, library = true, disabled, testId, ariaLabel, className }: FilamentPickerProps) {
  const t = useT(); const [open, setOpen] = useState(false);
  const pool = useMemo(() => (tech ? materials.filter((m) => m.tech === tech) : materials), [materials, tech]);
  const current = pool.find((m) => m.id === value) ?? materials.find((m) => m.id === value);
  const [added, setAdded] = useState<{ id: string; name: string; hex: string } | null>(null); // recién agregado: la página aún no lo trae
  const shown = current ? { name: pickerName(current), hex: current.hex, tag: stockTagOf(current, t) } : added && added.id === value ? { name: added.name, hex: added.hex, tag: t('picker.noStock') } : null;
  const choose = (id: string, m?: Mat) => { if (id) pushRecent(id); onChange(id, m); setOpen(false); };
  return (
    <>
      <button type="button" disabled={disabled} className={cn('input w-full text-left flex items-center gap-2 min-w-0', className)} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={ariaLabel ? `${ariaLabel}: ${shown?.name ?? emptyLabel ?? t('picker.choose')}` : undefined} data-testid={testId}>
        {shown ? <><span className="h-4 w-4 rounded-full border border-black/20 shrink-0" style={{ background: shown.hex }} aria-hidden /><span className="flex-1 min-w-0 leading-tight py-0.5"><span className="block truncate">{shown.name}</span><span className="block truncate muted text-[11px]">{shown.tag}</span></span></> : <span className="truncate flex-1 muted">{emptyLabel ?? t('picker.choose')}</span>}
        <span aria-hidden className="muted shrink-0">▾</span>
      </button>
      {open && <PickerDialog pool={pool} value={value} emptyLabel={emptyLabel} gramsNeeded={gramsNeeded} hint={hint} showCost={showCost} showProfile={showProfile} library={library} testId={testId} onClose={() => setOpen(false)} onPick={choose} onAdded={(a) => { setAdded(a); choose(a.id, a.material); }} />}
    </>
  );
}

function stockTagOf(m: Mat, t: ReturnType<typeof useT>) { return m.generic ? t('picker.genericTag') : m.availableG > 0 ? t('picker.inStock', { g: grams(m.availableG) }) : t('picker.noStock'); }

function PickerDialog({ pool, value, emptyLabel, gramsNeeded, hint, showCost, showProfile, library, testId, onClose, onPick, onAdded }: { pool: Mat[]; value: string; emptyLabel?: string; gramsNeeded?: number; hint?: { type?: string | null; hex?: string | null }; showCost: boolean; showProfile: boolean; library: boolean; testId?: string; onClose: () => void; onPick: (id: string, m?: Mat) => void; onAdded: (a: Added) => void }) {
  const t = useT();
  const [q, setQ] = useState(''); const [type, setType] = useState<string | null>(null); const [family, setFamily] = useState<ColorFamily | null>(null); const [onlyStock, setOnlyStock] = useState(false);
  const [recents, setRecents] = useState<string[]>([]); useEffect(() => setRecents(readRecents()), []);
  const [lib, setLib] = useState<{ line: CatalogFilament; colors: CatalogVariant[]; next: number | null } | null>(null);
  const [adding, setAdding] = useState<{ line: CatalogFilament; color: CatalogVariant } | null>(null);
  const types = useMemo(() => typesOf(pool), [pool]);
  const list = useMemo(() => filterMaterials(pool, { q, type, family, onlyStock, hintHex: hint?.hex, hintType: hint?.type }), [pool, q, type, family, onlyStock, hint?.hex, hint?.type]);
  const groups = useMemo(() => groupMaterials(list, t('picker.genericGroup')), [list, t]);
  const byId = useMemo(() => new Map(pool.map((m) => [m.id, m])), [pool]);
  const filtering = !!(q || type || family || onlyStock);
  const recentMats = recents.map((id) => byId.get(id)).filter((m): m is Mat => !!m);
  const row = (m: Mat) => {
    const short = gramsNeeded && !m.generic && m.availableG < gramsNeeded ? gramsNeeded - Math.max(0, m.availableG) : 0;
    return (
      <button key={m.id} type="button" onClick={() => onPick(m.id, m)} aria-pressed={m.id === value} data-testid={testId ? `${testId}-opt` : undefined} data-material-id={m.id}
        className={cn('w-full text-left flex items-center gap-2 rounded-lg border px-2.5 py-1.5 min-h-[40px] hover:bg-slate-100 dark:hover:bg-slate-800', m.id === value ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--line)]')}>
        <span className="h-5 w-5 rounded-full border border-black/20 shrink-0" style={{ background: m.hex }} aria-hidden />
        <span className="flex-1 min-w-0"><span className="block truncate text-sm">{m.generic ? `${m.type} ${m.colorName}`.replace('Genérico', '').trim() || m.type : m.colorName}{m.generic ? <span className="muted"> · {t('picker.genericTag')}</span> : null}</span>
          <span className="block muted text-xs truncate">{m.type}{showCost ? ` · ${t('picker.perKg', { price: money(m.costPerKg) })}` : ''}{showProfile && m.tech === 'fdm' && !m.filamentProfileId ? ` · ${t('picker.noProfile')}` : ''}</span></span>
        <span className={cn('text-xs shrink-0 text-right', short ? 'text-warn' : m.availableG > 0 || m.generic ? 'muted' : 'text-warn')}>{short ? t('picker.short', { g: grams(short) }) : stockTagOf(m, t)}</span>
      </button>
    );
  };
  return (
    <Modal open onClose={onClose} title={adding ? t('picker.addTitle') : lib ? t('picker.libraryColors', { line: `${lib.line.brandName} ${lib.line.name}` }) : t('picker.choose')} wide>
      {adding ? <AddForm line={adding.line} color={adding.color} onBack={() => setAdding(null)} onAdded={onAdded} />
        : lib ? <LibraryColors state={lib} setState={setLib} owned={pool} onBack={() => setLib(null)} onOwned={(m) => onPick(m.id, m)} onAdd={(color) => setAdding({ line: lib.line, color })} />
        : (
          <div className="space-y-3" data-testid={testId ? `${testId}-panel` : undefined}>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('picker.searchPlaceholder')} aria-label={t('picker.searchLabel')} data-testid="picker-search" />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('picker.typeFilter')}>
              {[null, ...types].map((x) => <button key={x ?? 'all'} type="button" aria-pressed={type === x} className={cn('min-h-[32px] px-2.5 rounded-lg border text-xs', type === x ? 'bg-[var(--panel)] text-[var(--panel-ink)] border-transparent' : 'border-[var(--line)] hover:bg-slate-100 dark:hover:bg-slate-800')} onClick={() => setType(x)}>{x ?? t('picker.allTypes')}</button>)}
            </div>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('picker.colorFilter')}>
              {COLOR_FAMILIES.map((f) => <button key={f} type="button" aria-pressed={family === f} aria-label={f} title={f} onClick={() => setFamily(family === f ? null : f)} className={cn('h-7 w-7 rounded-full border-2', family === f ? 'border-[var(--accent)] ring-2 ring-[var(--accent-line)]' : 'border-black/20')} style={{ background: FAMILY_HEX[f] }} />)}
              <label className="ml-auto flex items-center gap-1.5 text-xs"><input type="checkbox" checked={onlyStock} onChange={(e) => setOnlyStock(e.target.checked)} />{t('picker.onlyStock')}</label>
            </div>
            <div className="max-h-[48vh] overflow-auto space-y-3 pr-1" tabIndex={0}>
              {emptyLabel !== undefined && !filtering && <button type="button" className={cn('w-full text-left rounded-lg border px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800', value === '' ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--line)]')} onClick={() => onPick('')} data-testid="picker-empty">{emptyLabel}</button>}
              {!filtering && recentMats.length > 0 && <section><h3 className="eyebrow mb-1">{t('picker.recents')}</h3><div className="grid gap-1">{recentMats.map(row)}</div></section>}
              {groups.map((g) => <section key={g.key}><h3 className="eyebrow mb-1">{g.title}</h3><div className="grid gap-1">{g.items.map(row)}</div></section>)}
              {list.length === 0 && <p className="muted text-sm">{t('picker.noResults')} {library && !q ? t('picker.noResultsLibrary') : ''}</p>}
              {library && <LibrarySearch q={q} onLine={async (line) => { const r = await getJson<Page<CatalogVariant>>(`/api/catalog/filaments/${enc(line.key)}/variants?page=1&pageSize=100`); setLib({ line, colors: r.items, next: r.nextPage }); }} />}
            </div>
          </div>)}
    </Modal>
  );
}

function LibrarySearch({ q, onLine }: { q: string; onLine: (l: CatalogFilament) => Promise<void> }) {
  const t = useT(); const term = q.trim(); const [res, setRes] = useState<CatalogFilament[] | null>(null); const [busy, setBusy] = useState(false); const seq = useRef(0);
  useEffect(() => {
    if (term.length < 2) { setRes(null); return; }
    const id = ++seq.current; setBusy(true);
    const h = setTimeout(() => { getJson<Page<CatalogFilament>>(`/api/catalog/filaments?q=${encodeURIComponent(term)}&pageSize=6&sort=colors`).then((r) => { if (id === seq.current) setRes(r.items); }).catch(() => { if (id === seq.current) setRes([]); }).finally(() => { if (id === seq.current) setBusy(false); }); }, 300);
    return () => clearTimeout(h);
  }, [term]);
  return (
    <section data-testid="picker-library"><h3 className="eyebrow mb-1">{t('picker.libraryTitle')}</h3>
      {term.length < 2 ? <p className="muted text-xs">{t('picker.libraryHint')}</p>
        : busy && !res ? <p className="muted text-xs">{t('picker.librarySearching')}</p>
        : res && res.length === 0 ? <p className="muted text-xs">{t('picker.libraryNone')}</p>
        : <div className="grid gap-1">{(res ?? []).map((f) => <button key={f.key} type="button" className="w-full text-left rounded-lg border border-[var(--line)] px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => void onLine(f)} data-testid="picker-library-line"><span className="font-medium text-sm">{f.brandName}</span> · {f.name} <span className="muted text-xs">({f.material}) · {t('picker.libraryLine', { colors: f.colorCount })}</span></button>)}</div>}
    </section>
  );
}

function LibraryColors({ state, setState, owned, onBack, onOwned, onAdd }: { state: { line: CatalogFilament; colors: CatalogVariant[]; next: number | null }; setState: (s: { line: CatalogFilament; colors: CatalogVariant[]; next: number | null }) => void; owned: Mat[]; onBack: () => void; onOwned: (m: Mat) => void; onAdd: (c: CatalogVariant) => void }) {
  const t = useT(); const [busy, setBusy] = useState(false); const [q, setQ] = useState('');
  const mine = useMemo(() => new Map(owned.filter((m) => m.variantId).map((m) => [m.variantId!, m])), [owned]);
  const colors = state.colors.filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="space-y-3">
      <div className="flex gap-2"><button type="button" className="btn-ghost btn-sm" onClick={onBack}>← {t('picker.back')}</button><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('picker.colorFilter')} aria-label={t('picker.colorFilter')} /></div>
      <ul className="grid sm:grid-cols-2 gap-1 max-h-[48vh] overflow-auto" tabIndex={0}>{colors.map((c) => {
        const own = mine.get(variantKey(state.line.key, c.id));
        return <li key={c.id}><button type="button" className="w-full text-left flex items-center gap-2 rounded-lg border border-[var(--line)] px-2.5 py-1.5 min-h-[40px] hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => (own ? onOwned(own) : onAdd(c))} data-testid="picker-library-color">
          <span className="h-5 w-5 rounded-full border border-black/20 shrink-0" style={{ background: c.hexes.length > 1 ? `linear-gradient(90deg, ${c.hexes.join(', ')})` : c.hex }} aria-hidden /><span className="flex-1 truncate text-sm">{c.name}</span>{own && <span className="muted text-xs shrink-0">{t('picker.libraryOwned')}</span>}</button></li>;
      })}</ul>
      {state.next && <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={async () => { setBusy(true); try { const r = await getJson<Page<CatalogVariant>>(`/api/catalog/filaments/${enc(state.line.key)}/variants?page=${state.next}&pageSize=100`); setState({ ...state, colors: [...state.colors, ...r.items], next: r.nextPage }); } finally { setBusy(false); } }}>{t('picker.libraryMore')}</button>}
    </div>
  );
}

/** Paso de confirmación: cuánto se tiene de este color. Por defecto nada, para que el sistema avise que falta. */
function AddForm({ line, color, onBack, onAdded }: { line: CatalogFilament; color: CatalogVariant; onBack: () => void; onAdded: (a: Added) => void }) {
  const t = useT(); const { run, pending } = useAction();
  const [have, setHave] = useState(false); const [closed, setClosed] = useState('1'); const [openG, setOpenG] = useState(''); const [cost, setCost] = useState(''); const [minOne, setMinOne] = useState(true);
  const n = (v: string) => { const x = Number(v.replace(',', '.')); return Number.isFinite(x) && x > 0 ? x : 0; };
  const submit = () => run(() => addCatalogColorOwnedAction(line.key, color.id, { fullSpools: have ? Math.floor(n(closed)) : 0, openG: have ? n(openG) || undefined : undefined, costPerKg: n(cost) || undefined, stockMinG: minOne ? undefined : 0 }), {
    ok: t('picker.added'), onOk: (d) => {
      const g = have ? Math.floor(n(closed)) * 1000 + n(openG) : 0;
      // la página todavía no trae el material nuevo: se entrega lo que se sabe de él para que quien elige (p. ej. el color pedido de la línea) no se quede con el anterior
      const material: Mat = { id: d.materialId, label: `${line.brandName} ${line.name} · ${color.name}`, type: line.material, colorName: color.name, hex: color.hex, costPerKg: n(cost), generic: false, stockG: g, availableG: g, manufacturer: line.brandName, line: line.name, variantId: variantKey(line.key, color.id), tech: 'fdm', filamentProfileId: null };
      onAdded({ id: d.materialId, name: material.label, hex: color.hex, material });
    },
  });
  return (
    <div className="space-y-4" data-testid="picker-add">
      <div className="flex items-center gap-2"><span className="h-6 w-6 rounded-full border border-black/20" style={{ background: color.hexes.length > 1 ? `linear-gradient(90deg, ${color.hexes.join(', ')})` : color.hex }} aria-hidden /><div><div className="font-medium">{line.brandName} {line.name} · {color.name}</div><div className="muted text-xs">{line.material}</div></div></div>
      <p className="muted text-sm">{t('picker.addIntro')}</p>
      <fieldset className="space-y-2"><legend className="label">{t('picker.haveLabel')}</legend>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="have" checked={!have} onChange={() => setHave(false)} data-testid="picker-have-none" />{t('picker.haveNone')}</label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="have" checked={have} onChange={() => setHave(true)} data-testid="picker-have-some" />{t('picker.haveSome')}</label>
        {have && <div className="grid grid-cols-2 gap-3 pl-6">
          <label className="block"><span className="label">{t('picker.closedSpools')}</span><input className="input num" inputMode="numeric" value={closed} onChange={(e) => setClosed(e.target.value)} data-testid="picker-closed" /></label>
          <label className="block"><span className="label">{t('picker.openSpool')}</span><input className="input num" inputMode="decimal" value={openG} onChange={(e) => setOpenG(e.target.value)} placeholder="0" data-testid="picker-open-g" /></label>
        </div>}
      </fieldset>
      <label className="block max-w-xs"><span className="label">{t('picker.costKg')}</span><input className="input num" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} data-testid="picker-cost" /><span className="muted text-xs">{t('picker.costHint')}</span></label>
      <fieldset className="space-y-1"><legend className="label">{t('picker.minLabel')}</legend>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="min" checked={minOne} onChange={() => setMinOne(true)} />{t('picker.minOne')}</label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="min" checked={!minOne} onChange={() => setMinOne(false)} />{t('picker.minNone')}</label>
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="muted text-xs">{t('picker.boughtHint')} <Link className="underline" href="/inventario/compras/nueva">{t('picker.registerPurchase')}</Link></span>
        <span className="flex gap-2"><button type="button" className="btn-ghost" onClick={onBack}>{t('picker.back')}</button><button type="button" className="btn-primary" disabled={pending} onClick={submit} data-testid="picker-add-go">{pending ? t('picker.adding') : t('picker.addAndUse')}</button></span>
      </div>
    </div>
  );
}
