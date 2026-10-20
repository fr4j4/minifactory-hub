'use client';
import { useState } from 'react';
import { removePresetAction, savePresetAction } from '@/actions/presets';
import { Modal, useAction } from './client';
import { useT } from '@/i18n/client';
import { loopsForThickness, qualityTemplates, numStr, type PresetSpec } from '@/lib/slicer/nozzle';

export interface PresetRow extends PresetSpec { id: string; builtin: boolean; active: boolean }
const blank = { label: '', layerFactor: 0.5, wallMm: 0.8, wallNozzles: 2, topMm: 1, bottomMm: 0.6, infill: '15%' };

/** Lista y edición de las calidades por intención: sirven para cualquier boquilla (la capa es un porcentaje de ella). */
export function PresetsEditor({ rows }: { rows: PresetRow[] }) {
  const t = useT(); const { run, pending } = useAction();
  const [edit, setEdit] = useState<(typeof blank & { id?: string }) | null>(null);
  const open = (r?: PresetRow) => setEdit(r ? { id: r.id, label: r.label ?? t(`nozzle.tpl.${r.key}` as 'nozzle.tpl.borrador'), layerFactor: r.f, wallMm: r.wall, wallNozzles: r.wallNozzles ?? 2, topMm: r.top, bottomMm: r.bottom, infill: r.infill } : { ...blank });
  const preview = (n: number, r: PresetRow) => { const q = qualityTemplates(n, undefined, [r])[0]; return `${numStr(q.layer)} mm · ${q.changes.wall_loops} ${t('settings.presetLoops')} · ${q.changes.sparse_infill_density}`; };
  const f = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) => setEdit((v) => (v ? { ...v, [k]: e.target.type === 'number' ? +e.target.value : e.target.value } : v));
  return (
    <div data-testid="presets">
      <p className="muted text-sm mb-3">{t('settings.presetsHint')}</p>
      <ul className="divide-y divide-[var(--line)]">{rows.map((r) => (
        <li key={r.id} className="py-2.5 flex flex-wrap items-center justify-between gap-3 text-sm" data-testid="preset-row">
          <span><b>{r.label ?? t(`nozzle.tpl.${r.key}` as 'nozzle.tpl.borrador')}</b>{!r.active && <span className="muted"> · {t('common.inactive')}</span>}
            <span className="muted block text-xs">0,4 mm: {preview(0.4, r)} · 0,6 mm: {preview(0.6, r)}</span></span>
          <span className="flex gap-2"><button className="btn-ghost btn-sm" onClick={() => open(r)} data-testid="preset-edit">{t('common.edit')}</button>
            {(r.active || !r.builtin) && <button className="btn-ghost btn-sm text-danger" disabled={pending} onClick={() => run(() => removePresetAction(r.id), { ok: t('settings.presetRemoved') })}>{r.builtin ? t('settings.presetDisable') : t('remove.delete')}</button>}
            {!r.active && r.builtin && <button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => savePresetAction({ id: r.id, label: r.label, layerFactor: r.f, wallMm: r.wall, wallNozzles: r.wallNozzles ?? null, topMm: r.top, bottomMm: r.bottom, infill: r.infill, active: true }))}>{t('settings.presetEnable')}</button>}</span>
        </li>))}</ul>
      <button className="btn-primary btn-sm mt-3" onClick={() => open()} data-testid="preset-new">{t('settings.presetNew')}</button>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? t('settings.presetEditTitle') : t('settings.presetNew')}>
        {edit && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => savePresetAction({ id: edit.id, label: edit.label, layerFactor: edit.layerFactor, wallMm: edit.wallMm, wallNozzles: edit.wallNozzles, topMm: edit.topMm, bottomMm: edit.bottomMm, infill: edit.infill }), { ok: t('settings.presetSaved'), onOk: () => setEdit(null) }); }}>
          <label className="block"><span className="label">{t('settings.presetName')}</span><input className="input" required value={edit.label} onChange={f('label')} data-testid="preset-name" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="label">{t('settings.presetLayer')}</span><input type="number" step="0.05" min={0.15} max={0.85} className="input" value={edit.layerFactor} onChange={f('layerFactor')} data-testid="preset-layer" /><span className="muted text-xs">{t('settings.presetLayerHint')}</span></label>
            <label className="block"><span className="label">{t('settings.presetInfill')}</span><input className="input" value={edit.infill} onChange={f('infill')} placeholder="15%" data-testid="preset-infill" /></label>
            <label className="block"><span className="label">{t('settings.presetWall')}</span><input type="number" step="0.1" min={0.4} className="input" value={edit.wallMm} onChange={f('wallMm')} /></label>
            <label className="block"><span className="label">{t('settings.presetWallNozzles')}</span><input type="number" step="1" min={1} max={8} className="input" value={edit.wallNozzles} onChange={f('wallNozzles')} /></label>
            <label className="block"><span className="label">{t('settings.presetTop')}</span><input type="number" step="0.1" min={0.4} className="input" value={edit.topMm} onChange={f('topMm')} /></label>
            <label className="block"><span className="label">{t('settings.presetBottom')}</span><input type="number" step="0.1" min={0.4} className="input" value={edit.bottomMm} onChange={f('bottomMm')} /></label>
          </div>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setEdit(null)}>{t('common.cancel')}</button><button className="btn-primary" disabled={pending} data-testid="preset-save">{t('common.save')}</button></div>
        </form>}
      </Modal>
    </div>
  );
}
