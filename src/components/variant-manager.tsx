'use client';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { deleteVariantAction, saveVariantAction } from '@/actions/filament-library';
import { useAction } from './client';
import { Modal } from './client';
import { SpoolIcon } from './spool-icon';
import { traitLabel } from './catalog-info';
import { TRAITS } from '@/lib/catalog/traits';
import { useT } from '@/i18n/client';
import type { CatalogVariant } from '@/lib/catalog/ofd';

interface SizeForm { weight: string; diameter: string; gtin: string; articleNumber: string; emptySpoolWeight: string; refill: boolean; discontinued: boolean; links: Array<{ store: string; url: string }> }
interface VariantForm { name: string; hexes: string[]; traits: string[]; discontinued: boolean; sizes: SizeForm[] }
const num = (v: string) => { const x = v.trim().replace(',', '.'); return x === '' ? null : Number(x); };
const blankSize = (): SizeForm => ({ weight: '1000', diameter: '1.75', gtin: '', articleNumber: '', emptySpoolWeight: '', refill: false, discontinued: false, links: [] });
const fromVariant = (v: CatalogVariant): VariantForm => ({
  name: v.name, hexes: v.hexes.length ? v.hexes : [v.hex], traits: v.traits, discontinued: v.discontinued,
  sizes: v.sizes.map((s) => ({ weight: String(s.weight), diameter: s.diameter != null ? String(s.diameter) : '', gtin: s.gtin ?? '', articleNumber: s.articleNumber ?? '', emptySpoolWeight: s.emptySpoolWeight != null ? String(s.emptySpoolWeight) : '', refill: s.refill, discontinued: s.discontinued, links: s.links.map((l) => ({ store: l.store, url: l.url })) })),
});

/** Administra los colores de una línea: agregar, editar (nombre, colores, rasgos, tamaños con códigos y enlaces) y eliminar. */
export function VariantManager({ filamentKey, material, variants, canCreate, canEdit, canDelete }: { filamentKey: string; material: string; variants: CatalogVariant[]; canCreate: boolean; canEdit: boolean; canDelete: boolean }) {
  const t = useT(); const { run, pending } = useAction();
  const [dlg, setDlg] = useState<{ id: string | null; form: VariantForm } | null>(null);
  const remove = (v: CatalogVariant) => { if (window.confirm(t('inventory.catEdColorDeleteConfirm', { name: v.name }))) run(() => deleteVariantAction(filamentKey, v.id), { ok: t('inventory.catEdColorDeleted') }); };
  return (
    <section className="mt-6" aria-labelledby="manage-colors" data-testid="variant-manager">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 id="manage-colors" className="text-sm font-semibold">{t('inventory.catEdColors')}</h2>
        {canCreate && <button className="btn-ghost btn-sm" onClick={() => setDlg({ id: null, form: { name: '', hexes: ['#888888'], traits: [], discontinued: false, sizes: [blankSize()] } })} data-testid="add-color"><Plus className="h-4 w-4" aria-hidden />{t('inventory.catEdAddColor')}</button>}
      </div>
      {variants.length === 0 ? <p className="muted text-sm">{t('inventory.catEdNoColors')}</p> : (
        <ul className="card divide-y divide-[var(--line)]">
          {variants.map((v) => (
            <li key={v.id} className="p-2.5 flex items-center gap-3" data-testid="variant-row">
              <SpoolIcon hex={v.hex} label={material} size={34} />
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium truncate">{v.name}</span>
                <span className="block text-xs muted tabular truncate">{v.hexes.join(' · ')} · {v.sizes.length ? v.sizes.map((s) => `${s.weight} g${s.diameter ? ` ${s.diameter} mm` : ''}`).join(', ') : t('inventory.catEdNoSizes')}</span></span>
              {canEdit && <button className="btn-ghost btn-sm" onClick={() => setDlg({ id: v.id, form: fromVariant(v) })} data-testid="edit-color">{t('common.edit')}</button>}
              {canDelete && <button className="btn-ghost btn-sm !px-2" disabled={pending} onClick={() => remove(v)} aria-label={`${t('inventory.catEdDelete')} ${v.name}`}><Trash2 className="h-4 w-4" aria-hidden /></button>}
            </li>))}
        </ul>)}
      <Modal open={!!dlg} onClose={() => setDlg(null)} title={dlg?.id ? t('inventory.catEdEditColor') : t('inventory.catEdAddColor')} wide>
        {dlg && <VariantDialog key={dlg.id ?? 'new'} filamentKey={filamentKey} id={dlg.id} initial={dlg.form} onDone={() => setDlg(null)} />}
      </Modal>
    </section>
  );
}

function VariantDialog({ filamentKey, id, initial, onDone }: { filamentKey: string; id: string | null; initial: VariantForm; onDone: () => void }) {
  const t = useT(); const { run, pending } = useAction(); const [f, setF] = useState<VariantForm>(initial);
  const setSize = (i: number, p: Partial<SizeForm>) => setF((x) => ({ ...x, sizes: x.sizes.map((s, k) => (k === i ? { ...s, ...p } : s)) }));
  const toggleTrait = (k: string) => setF((x) => ({ ...x, traits: x.traits.includes(k) ? x.traits.filter((y) => y !== k) : [...x.traits, k] }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => saveVariantAction(filamentKey, id, {
      name: f.name.trim(), hexes: f.hexes, traits: f.traits, discontinued: f.discontinued,
      sizes: f.sizes.map((s) => ({ weight: Number(s.weight.replace(',', '.')), diameter: num(s.diameter), gtin: s.gtin.replace(/\D/g, ''), articleNumber: s.articleNumber.trim() || null, emptySpoolWeight: num(s.emptySpoolWeight), refill: s.refill, discontinued: s.discontinued, links: s.links.filter((l) => l.url.trim()).map((l) => ({ store: l.store.trim(), url: l.url.trim() })) })),
    }), { ok: t('inventory.catEdColorSaved'), onOk: onDone });
  };
  return (
    <form onSubmit={submit} className="space-y-4" data-testid="variant-form">
      <label className="block"><span className="label">{t('inventory.catEdColorName')}</span><input className="input" required maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="variant-name" autoFocus /></label>
      <div><span className="label">{t('inventory.catEdHex')}</span>
        <div className="flex flex-wrap gap-2">{f.hexes.map((h, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 card px-2 py-1">
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(h) ? h : '#888888'} onChange={(e) => setF({ ...f, hexes: f.hexes.map((x, k) => (k === i ? e.target.value : x)) })} className="h-7 w-9 bg-transparent" aria-label={t('inventory.catEdHex')} />
            <input className="input !w-24 !min-h-[32px] font-mono text-xs" value={h} maxLength={7} pattern="#[0-9a-fA-F]{6}" onChange={(e) => setF({ ...f, hexes: f.hexes.map((x, k) => (k === i ? e.target.value : x)) })} aria-label="hex" />
            {f.hexes.length > 1 && <button type="button" className="btn-ghost btn-sm !px-1.5" onClick={() => setF({ ...f, hexes: f.hexes.filter((_, k) => k !== i) })} aria-label={t('inventory.catEdRemove')}>×</button>}
          </span>))}
          {f.hexes.length < 4 && <button type="button" className="btn-ghost btn-sm" onClick={() => setF({ ...f, hexes: [...f.hexes, '#ffffff'] })}>{t('inventory.catEdAddHex')}</button>}
        </div></div>
      <details className="card p-3"><summary className="cursor-pointer text-sm font-medium">{t('inventory.catEdTraits')}{f.traits.length ? ` (${f.traits.length})` : ''}</summary>
        <ul className="mt-2 flex flex-wrap gap-1.5">{[...new Set([...TRAITS, ...f.traits])].map((k) => <li key={k}><label className={`badge cursor-pointer ${f.traits.includes(k) ? 'bg-[var(--accent-soft)] border-[var(--accent-line)]' : 'border-[var(--line)]'}`}><input type="checkbox" className="sr-only" checked={f.traits.includes(k)} onChange={() => toggleTrait(k)} />{traitLabel(t, k)}</label></li>)}</ul></details>
      <div className="space-y-3"><div className="flex items-center justify-between"><span className="label !mb-0">{t('inventory.catEdSizes')}</span><button type="button" className="btn-ghost btn-sm" onClick={() => setF({ ...f, sizes: [...f.sizes, blankSize()] })}>{t('inventory.catEdAddSize')}</button></div>
        {f.sizes.map((s, i) => (
          <div key={i} className="card p-3 grid sm:grid-cols-4 gap-2" data-testid="size-row">
            <label className="block"><span className="label">{t('inventory.catEdWeight')}</span><input className="input" type="number" min="1" step="any" required value={s.weight} onChange={(e) => setSize(i, { weight: e.target.value })} /></label>
            <label className="block"><span className="label">{t('inventory.catEdDiameter')}</span><input className="input" type="number" min="1" max="3.5" step="0.01" value={s.diameter} onChange={(e) => setSize(i, { diameter: e.target.value })} /></label>
            <label className="block"><span className="label">{t('inventory.catEdGtin')}</span><input className="input" inputMode="numeric" pattern="\d{8,14}" maxLength={14} value={s.gtin} onChange={(e) => setSize(i, { gtin: e.target.value })} data-testid="size-gtin" /></label>
            <label className="block"><span className="label">{t('inventory.catEdArticle')}</span><input className="input" maxLength={40} value={s.articleNumber} onChange={(e) => setSize(i, { articleNumber: e.target.value })} /></label>
            <label className="block"><span className="label">{t('inventory.catEdSpool')}</span><input className="input" type="number" min="0" step="any" value={s.emptySpoolWeight} onChange={(e) => setSize(i, { emptySpoolWeight: e.target.value })} /></label>
            <label className="flex items-center gap-2 text-sm self-end pb-2"><input type="checkbox" checked={s.refill} onChange={(e) => setSize(i, { refill: e.target.checked })} />{t('inventory.catEdRefill')}</label>
            <label className="flex items-center gap-2 text-sm self-end pb-2"><input type="checkbox" checked={s.discontinued} onChange={(e) => setSize(i, { discontinued: e.target.checked })} />{t('inventory.catEdDiscontinued')}</label>
            <span className="self-end pb-1 text-right"><button type="button" className="btn-ghost btn-sm" onClick={() => setF({ ...f, sizes: f.sizes.filter((_, k) => k !== i) })}>{t('inventory.catEdRemove')}</button></span>
            <div className="sm:col-span-4 space-y-1.5">
              {s.links.map((l, k) => (<div key={k} className="grid grid-cols-[8rem_1fr_auto] gap-2"><input className="input" placeholder={t('inventory.catEdStore')} maxLength={40} value={l.store} onChange={(e) => setSize(i, { links: s.links.map((x, j) => (j === k ? { ...x, store: e.target.value } : x)) })} /><input className="input" type="url" placeholder={t('inventory.catEdUrl')} value={l.url} onChange={(e) => setSize(i, { links: s.links.map((x, j) => (j === k ? { ...x, url: e.target.value } : x)) })} /><button type="button" className="btn-ghost btn-sm" onClick={() => setSize(i, { links: s.links.filter((_, j) => j !== k) })} aria-label={t('inventory.catEdRemove')}>×</button></div>))}
              {s.links.length < 5 && <button type="button" className="btn-ghost btn-sm" onClick={() => setSize(i, { links: [...s.links, { store: '', url: '' }] })}>{t('inventory.catEdAddLink')}</button>}
            </div>
          </div>))}
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.discontinued} onChange={(e) => setF({ ...f, discontinued: e.target.checked })} />{t('inventory.catEdDiscontinued')}</label>
      <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onDone}>{t('common.cancel')}</button><button className="btn-primary" disabled={pending} data-testid="variant-save">{t('inventory.catEdSave')}</button></div>
    </form>
  );
}
