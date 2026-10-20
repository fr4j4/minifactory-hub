'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveFilamentAction } from '@/actions/filament-library';
import { useAction } from './client';
import { useT } from '@/i18n/client';

export interface FilamentFormInit {
  brandId: string | null; brandName: string; brandWebsite: string; brandOrigin: string; material: string; name: string; density: string;
  diameterTolerance: string; tempMin: string; tempMax: string; bedMin: string; bedMax: string; dryMax: string; chamber: string; shoreA: string; shoreD: string;
  datasheetUrl: string; safetyUrl: string; discontinued: boolean; slicers: Record<string, string>;
}
export const EMPTY_FILAMENT: FilamentFormInit = { brandId: null, brandName: '', brandWebsite: '', brandOrigin: '', material: 'PLA', name: '', density: '1.24', diameterTolerance: '', tempMin: '', tempMax: '', bedMin: '', bedMax: '', dryMax: '', chamber: '', shoreA: '', shoreD: '', datasheetUrl: '', safetyUrl: '', discontinued: false, slicers: {} };
const SLICERS = [['orcaslicer', 'OrcaSlicer'], ['bambustudio', 'Bambu Studio'], ['prusaslicer', 'PrusaSlicer'], ['cura', 'Cura']] as const;
const num = (v: string) => { const x = v.trim().replace(',', '.'); return x === '' ? null : Number(x); };
const NEW = '__new';

/** Alta o edición de una línea de filamento del catálogo propio. Los campos vacíos se guardan como «sin dato». */
export function FilamentForm({ initial, existingKey, brands, materials }: { initial: FilamentFormInit; existingKey?: string; brands: Array<{ id: string; name: string }>; materials: string[] }) {
  const t = useT(); const router = useRouter(); const { run, pending } = useAction();
  const [f, setF] = useState<FilamentFormInit>(initial); const edit = !!existingKey;
  const [brandSel, setBrandSel] = useState(initial.brandId ?? (brands.length ? '' : NEW));
  const newBrand = brandSel === NEW; const set = <K extends keyof FilamentFormInit>(k: K, v: FilamentFormInit[K]) => setF((x) => ({ ...x, [k]: v }));
  const field = (k: keyof FilamentFormInit, label: string, o: { type?: string; step?: string; className?: string; required?: boolean; list?: string } = {}) => (
    <label className={`block ${o.className ?? ''}`}><span className="label">{label}</span>
      <input className="input" type={o.type ?? 'text'} step={o.step} required={o.required} list={o.list} inputMode={o.type === 'number' ? 'decimal' : undefined} value={String(f[k] ?? '')} onChange={(e) => set(k, e.target.value as never)} /></label>);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const brandId = edit ? initial.brandId : newBrand ? null : brandSel || null;
    const slicers = Object.fromEntries(SLICERS.map(([k]) => [k, (f.slicers[k] ?? '').trim()]));
    run(() => saveFilamentAction({
      brandId, brandName: brandId && !edit && !newBrand ? (brands.find((b) => b.id === brandId)?.name ?? f.brandName) : f.brandName, brandWebsite: edit || newBrand ? f.brandWebsite.trim() || null : undefined, brandOrigin: edit || newBrand ? f.brandOrigin.trim().toUpperCase() || null : undefined, // marca existente elegida al crear: no se toca
      material: f.material.trim(), name: f.name.trim(), density: Number(f.density.replace(',', '.')), diameterTolerance: num(f.diameterTolerance), tempMin: num(f.tempMin), tempMax: num(f.tempMax),
      bedMin: num(f.bedMin), bedMax: num(f.bedMax), dryMax: num(f.dryMax), chamber: num(f.chamber), shoreA: num(f.shoreA), shoreD: num(f.shoreD),
      datasheetUrl: f.datasheetUrl.trim() || null, safetyUrl: f.safetyUrl.trim() || null, discontinued: f.discontinued, slicers,
    }, existingKey ?? null), { ok: t('inventory.catEdSaved'), refresh: false, onOk: (d) => router.push(`/filamentos/${d.key.split('/').map(encodeURIComponent).join('/')}`) });
  };
  return (
    <form onSubmit={submit} className="space-y-4" data-testid="filament-form">
      <div className="card p-4 grid sm:grid-cols-3 gap-3">
        <label className="block"><span className="label">{t('inventory.catEdBrand')}</span>
          <select className="input" value={brandSel} disabled={edit} onChange={(e) => setBrandSel(e.target.value)} required data-testid="brand-select">
            {!edit && <option value="" disabled>—</option>}
            {edit && !brands.some((b) => b.id === initial.brandId) && <option value={initial.brandId ?? ''}>{initial.brandName}</option>}
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}{!edit && <option value={NEW}>{t('inventory.catEdBrandNew')}</option>}
          </select></label>
        {(newBrand || edit) && field('brandName', t('inventory.catEdBrandName'), { required: true })}
        {(newBrand || edit) && field('brandWebsite', t('inventory.catEdBrandWebsite'), { type: 'url' })}
        {(newBrand || edit) && field('brandOrigin', t('inventory.catEdBrandOrigin'))}
      </div>
      <div className="card p-4 grid sm:grid-cols-4 gap-3">
        <label className="block"><span className="label">{t('inventory.catEdMaterial')}</span><input className="input" required disabled={edit} list="mat-list" pattern="[A-Za-z0-9][A-Za-z0-9+\-]*" maxLength={20} value={f.material} onChange={(e) => set('material', e.target.value)} data-testid="material-input" /><datalist id="mat-list">{materials.map((m) => <option key={m} value={m} />)}</datalist></label>
        {field('name', t('inventory.catEdName'), { required: true, className: 'sm:col-span-2' })}
        {field('density', t('inventory.catEdDensity'), { type: 'number', step: '0.01', required: true })}
        {field('tempMin', t('inventory.catEdTempMin'), { type: 'number' })}{field('tempMax', t('inventory.catEdTempMax'), { type: 'number' })}
        {field('bedMin', t('inventory.catEdBedMin'), { type: 'number' })}{field('bedMax', t('inventory.catEdBedMax'), { type: 'number' })}
        {field('dryMax', t('inventory.catEdDry'), { type: 'number' })}{field('chamber', t('inventory.catEdChamber'), { type: 'number' })}
        {field('diameterTolerance', t('inventory.catEdTolerance'), { type: 'number', step: '0.01' })}{field('shoreA', t('inventory.catEdShoreA'), { type: 'number' })}{field('shoreD', t('inventory.catEdShoreD'), { type: 'number' })}
        {field('datasheetUrl', t('inventory.catEdDatasheet'), { type: 'url', className: 'sm:col-span-2' })}{field('safetyUrl', t('inventory.catEdSafety'), { type: 'url', className: 'sm:col-span-2' })}
        <label className="flex items-center gap-2 text-sm sm:col-span-4"><input type="checkbox" checked={f.discontinued} onChange={(e) => set('discontinued', e.target.checked)} />{t('inventory.catEdDiscontinued')}</label>
      </div>
      <fieldset className="card p-4"><legend className="label px-1">{t('inventory.catEdSlicers')}</legend>
        <div className="grid sm:grid-cols-4 gap-3">{SLICERS.map(([k, label]) => <label key={k} className="block"><span className="label">{label}</span><input className="input" maxLength={120} value={f.slicers[k] ?? ''} onChange={(e) => set('slicers', { ...f.slicers, [k]: e.target.value })} /></label>)}</div></fieldset>
      <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => router.back()}>{t('common.cancel')}</button><button className="btn-primary" disabled={pending} data-testid="filament-save">{t('inventory.catEdSave')}</button></div>
    </form>
  );
}
