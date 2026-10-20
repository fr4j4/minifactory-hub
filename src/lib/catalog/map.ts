/** Del catálogo de filamentos a los datos del taller (funciones puras, sin acceso a disco). */
import type { LineSpecs } from '@/db/schema';
import type { CatalogFilament, CatalogSize, CatalogVariant } from './ofd';

/** Nombre de línea al estilo del taller: «Basic» de PLA → «PLA Basic»; «PETG HF» se queda igual. */
export function lineNameOf(material: string, name: string): string {
  const n = name.trim(); const m = material.trim();
  return n.toUpperCase().startsWith(m.toUpperCase()) ? n : `${m} ${n}`.trim();
}

/** «190–220» (como en la semilla), «220» si solo hay un extremo, o '' si no hay dato. */
export function tempRange(min: number | null | undefined, max: number | null | undefined): string {
  if (min != null && max != null) return min === max ? String(min) : `${min}–${max}`;
  const one = max ?? min; return one != null ? String(one) : '';
}

export function specsOf(f: CatalogFilament, source = 'open-filament-database'): LineSpecs {
  return { tempMin: f.tempMin, tempMax: f.tempMax, bedMin: f.bedMin, bedMax: f.bedMax, dryMax: f.dryMax, chamber: f.chamber, shoreA: f.shoreA, shoreD: f.shoreD, datasheetUrl: f.datasheetUrl, slicers: f.slicers, traits: f.traits, source };
}

/** El tamaño que corresponde a lo que se está comprando: mismo peso neto y diámetro; si no, el primero. */
export function pickSize(sizes: CatalogSize[], netG: number, diameter: number): CatalogSize | null {
  const live = sizes.filter((s) => !s.discontinued && !s.refill); const pool = live.length ? live : sizes;
  return pool.find((s) => s.weight === netG && (s.diameter == null || Math.abs(s.diameter - diameter) < 0.01)) ?? pool.find((s) => s.weight === netG) ?? pool[0] ?? null;
}

/** Peso neto, diámetro y tara más frecuentes de una línea (para precargar el formulario). */
export function commonSizeOf(variants: CatalogVariant[]): { netG: number | null; diameter: number | null; tareG: number | null } {
  const mode = (xs: number[]) => { const c = new Map<number, number>(); for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1); return [...c].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null; };
  const sizes = variants.flatMap((v) => v.sizes).filter((s) => !s.refill && !s.discontinued);
  return { netG: mode(sizes.map((s) => s.weight)), diameter: mode(sizes.filter((s) => s.diameter != null).map((s) => s.diameter!)), tareG: mode(sizes.filter((s) => s.emptySpoolWeight != null).map((s) => s.emptySpoolWeight!)) };
}

export const variantKey = (filamentKey: string, variantId: string) => `${filamentKey}/${variantId}`;
export function splitVariantKey(k: string): { filament: string; variant: string } | null { const p = k.split('/'); return p.length === 4 ? { filament: p.slice(0, 3).join('/'), variant: p[3] } : null; }

/** Rasgos que merecen un aviso al trabajar el material. */
export const WARN_TRAITS = { abrasive: 'abrasive', carbonFiber: 'contains_carbon_fiber', glassFiber: 'contains_glass_fiber', filtration: 'filtration_recommended', hygroscopic: 'hygroscopic' } as const;
export const needsHardenedNozzle = (traits: readonly string[] | null | undefined) => !!traits?.some((t) => t === 'abrasive' || t === 'contains_carbon_fiber' || t === 'contains_glass_fiber' || t === 'contains_carbon' || t === 'contains_ceramic');
