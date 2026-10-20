'use client';
import { useT } from '@/i18n/client';
import { needsHardenedNozzle, tempRange } from '@/lib/catalog/map';
import type { LineSpecs } from '@/db/schema';

const SLICERS: Record<string, string> = { orcaslicer: 'OrcaSlicer', bambustudio: 'Bambu Studio', prusaslicer: 'PrusaSlicer', superslicer: 'SuperSlicer', crealityprint: 'Creality Print', elegooslicer: 'Elegoo Slicer', anycubicslicer: 'Anycubic Slicer', cura: 'Cura', kirimoto: 'Kiri:Moto' };
export const traitLabel = (t: ReturnType<typeof useT>, k: string) => { const key = `inventory.catTrait_${k}`; const v = (t as (k: string) => string)(key); return v && v !== key ? v : k.replace(/_/g, ' '); };

/** Datos del fabricante de una línea o color (temperaturas, secado, hoja técnica, perfiles y rasgos) con avisos de seguridad. Solo muestra lo que existe. */
export function CatalogInfo({ specs, traits }: { specs?: LineSpecs | null; traits?: string[] | null }) {
  const t = useT(); const all = [...new Set([...(specs?.traits ?? []), ...(traits ?? [])])];
  if (!specs && !all.length) return <p className="muted text-xs" data-testid="catalog-info-empty">{t('inventory.catNoMakerData')}</p>;
  const rows: Array<[string, string]> = [];
  const nozzle = tempRange(specs?.tempMin, specs?.tempMax); if (nozzle) rows.push([t('inventory.catNozzleLabel'), `${nozzle} °C`]);
  const bed = tempRange(specs?.bedMin, specs?.bedMax); if (bed) rows.push([t('inventory.catBedLabel'), `${bed} °C`]);
  if (specs?.dryMax != null) rows.push([t('inventory.catDryLabel'), `${specs.dryMax} °C`]);
  if (specs?.chamber != null) rows.push([t('inventory.catChamberLabel'), `${specs.chamber} °C`]);
  if (specs?.shoreA != null) rows.push([t('inventory.catShoreLabel'), `${specs.shoreA}A`]); else if (specs?.shoreD != null) rows.push([t('inventory.catShoreLabel'), `${specs.shoreD}D`]);
  const slicers = Object.entries(specs?.slicers ?? {}).filter(([, v]) => v);
  return (
    <div className="rounded-xl border border-[var(--line)] p-3 text-xs space-y-2" data-testid="catalog-info">
      <p className="font-medium text-sm">{t('inventory.catMakerData')}</p>
      {rows.length > 0 && <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1">{rows.map(([k, v]) => <div key={k}><dt className="muted">{k}</dt><dd className="tabular">{v}</dd></div>)}</dl>}
      {needsHardenedNozzle(all) && <p className="text-danger" role="alert" data-testid="catalog-warn-abrasive">{t('inventory.catWarnAbrasive')}</p>}
      {all.includes('filtration_recommended') && <p role="status">{t('inventory.catWarnFiltration')}</p>}
      {all.length > 0 && <ul className="flex flex-wrap gap-1.5">{all.map((k) => <li key={k} className="badge border-[var(--line)]">{traitLabel(t, k)}</li>)}</ul>}
      {slicers.length > 0 && <p><span className="muted">{t('inventory.catSlicerProfiles')}: </span>{slicers.map(([k, v]) => `${SLICERS[k] ?? k}: ${v}`).join(' · ')}</p>}
      {specs?.datasheetUrl && <p><a className="underline underline-offset-2" href={specs.datasheetUrl} target="_blank" rel="noopener noreferrer">{t('inventory.catDatasheet')}</a></p>}
      <p className="muted">{t('inventory.catMakerSource')}</p>
    </div>
  );
}
