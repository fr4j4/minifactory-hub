import type { MessageKey, Params } from '@/i18n/translate';

/**
 * Medidas ligadas a la boquilla (sin dependencias de Node: se usa también en el navegador).
 *
 * Regla de oro de la impresión FDM: casi todo se mide en múltiplos del diámetro de la boquilla.
 *  - Altura de capa: entre el 20 % y el 70 % del diámetro (Bambu/Orca declaran 0,04–0,14 para 0,2 y 0,16–0,56 para 0,8).
 *  - Ancho de línea: el diámetro + 0,02 mm (0,22 · 0,42 · 0,62 · 0,82, como los perfiles de fábrica).
 *  - Espesor de pared: n paredes × ancho de línea. Con boquilla 0,4: 0,8 · 1,2 · 1,6 · 2,0 mm = 2 · 3 · 4 · 5 paredes.
 */
export const NOZZLES = ['0.2', '0.25', '0.3', '0.4', '0.5', '0.6', '0.8', '1.0', '1.2'] as const;
/** Las que casi todos los talleres usan (el resto se agrega con «Otra…»). */
export const COMMON_NOZZLES = ['0.2', '0.4', '0.6', '0.8'] as const;

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
/** Número → texto sin ceros de más ("0.40" → "0.4"), como los guarda OrcaSlicer. */
export const numStr = (n: number) => String(r3(n));

/** Normaliza «0,4», «0.40», «0.4mm», «0.4 nozzle» → «0.4». Devuelve null si no es una boquilla válida (0,1–2 mm). */
export function normNozzle(v: unknown): string | null {
  const t = String(v ?? '').trim().toLowerCase().replace(',', '.').replace(/\s*(mm|nozzle|boquilla)\s*$/, '');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  if (!(n >= 0.1 && n <= 2)) return null;
  const out = numStr(n); return out.includes('.') ? out : `${out}.0`; // «1» → «1.0», como en los nombres de OrcaSlicer
}

/**
 * Lista de boquillas escrita a mano → lista normalizada y sin repetidos. Acepta coma decimal: «0,2 0,4» o «0.2, 0.4».
 * (Separar solo por comas rompía «0,4», que quedaba como «0» y «4».)
 */
export function parseNozzles(text: string): string[] {
  // «0,4» solo es una coma decimal; en «0.2,0.4» o «0.2, 0.4» las comas separan
  const parts = text.split(/[;\s/]+/).map((p) => p.replace(/^,+|,+$/g, '')).flatMap((p) => (p.includes('.') || !/^\d+,\d+$/.test(p) ? p.split(',') : [p]));
  const out: string[] = [];
  for (const p of parts) { const n = normNozzle(p); if (n && !out.includes(n)) out.push(n); }
  return out.sort((a, b) => Number(a) - Number(b));
}

/** Boquilla a partir del nombre de un perfil de fábrica: «… 0.2 nozzle», «… @MK4S 0.4», «… @Creality Ender3V3SE 0.6». */
export function nozzleFromName(name: string): string | null {
  const m = name.match(/(?:^|[\s@])(\d\.\d{1,2})(?:\s*nozzle)?\s*$/i);
  return m ? normNozzle(m[1]) : null;
}

/** Rango de alturas de capa razonable para una boquilla. Si la máquina declara min/max se usan esos. */
export function layerRange(nozzle: string | number, machine?: { min?: number; max?: number }) {
  const n = Number(nozzle);
  const min = machine?.min && machine.min > 0 ? machine.min : Math.max(0.04, r2(n * 0.2));
  const max = machine?.max && machine.max > 0 ? machine.max : r2(n * 0.7);
  return { min, max };
}

/** Altura de capa «estándar» de la boquilla: la mitad del diámetro (0,2 → 0,10 · 0,4 → 0,20 · 0,6 → 0,30 · 0,8 → 0,40). */
export const standardLayer = (nozzle: string | number) => r3(Number(nozzle) * 0.5);

export const lineWidth = (nozzle: string | number) => r2(Number(nozzle) + 0.02);
/** Pared interior y relleno: en boquilla 0,4 Bambu usa 0,45 (112 %); en el resto, el mismo ancho que el resto. */
export const innerLineWidth = (nozzle: string | number) => (Number(nozzle) > 0.3 && Number(nozzle) <= 0.5 ? r2(Number(nozzle) * 1.125) : lineWidth(nozzle));
/** Primera capa algo más ancha en boquillas finas (0,25 con 0,2 · 0,5 con 0,4), igual que de fábrica. */
export const firstLayerLineWidth = (nozzle: string | number) => (Number(nozzle) <= 0.4 ? r2(Number(nozzle) * 1.25) : lineWidth(nozzle));

/** Paredes necesarias para un espesor (mm): 1,2 mm con boquilla 0,4 → 3. */
export const loopsForThickness = (thickness: number, nozzle: string | number) => Math.max(1, Math.round(thickness / lineWidth(nozzle) + 1e-9));
/** Espesor real que dan n paredes, en mm. */
export const thicknessForLoops = (loops: number, nozzle: string | number) => r2(loops * lineWidth(nozzle));
/** Capas necesarias para cubrir un espesor (techo/piso). */
export const layersForThickness = (thickness: number, layer: number) => Math.max(1, Math.ceil(thickness / layer - 1e-9));

/** Espesores de pared sugeridos: 2 a 6 veces el diámetro (0,4 → 0,8 · 1,2 · 1,6 · 2,0 · 2,4), cada uno con sus paredes. */
export function wallThicknessOptions(nozzle: string | number) {
  const n = Number(nozzle);
  return [2, 3, 4, 5, 6].map((k) => { const t = r2(Math.max(k * n, 0.4)); return { mm: t, loops: loopsForThickness(t, n) }; })
    .filter((o, i, a) => a.findIndex((x) => x.loops === o.loops) === i);
}

export type TemplateKey = 'borrador' | 'estandar' | 'fino' | 'resistente' | 'funcional';
export interface QualityTemplate { key: TemplateKey; label: MessageKey; hint: MessageKey; layer: number; changes: Record<string, string> }

/**
 * Calidades «de la casa», calculadas para cualquier boquilla con las mismas proporciones que los perfiles de fábrica de Bambu
 * (Draft 60 % · Standard 50 % · Fine 30 % del diámetro). Se aplican sobre el perfil de fábrica más cercano de la impresora,
 * así que las velocidades y aceleraciones siguen siendo las de fábrica.
 */
export function qualityTemplates(nozzle: string | number, machine?: { min?: number; max?: number }): QualityTemplate[] {
  const n = Number(nozzle); const { min, max } = layerRange(n, machine);
  const clamp = (h: number) => r3(Math.min(max, Math.max(min, h)));
  const spec: Array<{ key: TemplateKey; f: number; wall: number; top: number; bottom: number; infill: string }> = [
    { key: 'borrador', f: 0.6, wall: Math.max(0.8, 2 * n), top: 0.8, bottom: 0.6, infill: '10%' },
    { key: 'estandar', f: 0.5, wall: Math.max(0.8, 2 * n), top: 1.0, bottom: 0.6, infill: '15%' },
    { key: 'fino', f: 0.3, wall: Math.max(0.8, 2 * n), top: 1.2, bottom: 0.8, infill: '15%' },
    { key: 'resistente', f: 0.5, wall: Math.max(1.6, 4 * n), top: 1.2, bottom: 1.0, infill: '30%' },
    { key: 'funcional', f: 0.5, wall: Math.max(1.2, 3 * n), top: 1.2, bottom: 1.0, infill: '20%' },
  ];
  const lw = String(lineWidth(n)); const inner = String(innerLineWidth(n)); const first = String(firstLayerLineWidth(n));
  return spec.map((t) => {
    const layer = clamp(n * t.f); const loops = loopsForThickness(t.wall, n);
    return {
      key: t.key, label: `nozzle.tpl.${t.key}` as MessageKey, hint: `nozzle.tpl.${t.key}Hint` as MessageKey, layer,
      changes: {
        layer_height: numStr(layer), initial_layer_print_height: numStr(clamp(n * 0.5)),
        line_width: lw, outer_wall_line_width: lw, inner_wall_line_width: inner, sparse_infill_line_width: inner, top_surface_line_width: lw, internal_solid_infill_line_width: lw, support_line_width: lw, initial_layer_line_width: first,
        wall_loops: String(loops), top_shell_layers: String(layersForThickness(t.top, layer)), bottom_shell_layers: String(layersForThickness(t.bottom, layer)),
        sparse_infill_density: t.infill,
      },
    };
  });
}

export interface NozzleWarning { key: MessageKey; params: Params }
/** Avisos sobre la combinación impresora + calidad (no bloquean: el laminador decide). El texto se traduce en la interfaz. */
export function processWarnings(o: { machineNozzle: string | null; processNozzle: string | null; layerHeight?: number | null; min?: number; max?: number }): NozzleWarning[] {
  const out: NozzleWarning[] = [];
  if (o.machineNozzle && o.processNozzle && Number(o.machineNozzle) !== Number(o.processNozzle)) out.push({ key: 'nozzle.warnOtherNozzle', params: { process: o.processNozzle, machine: o.machineNozzle } });
  const n = o.machineNozzle ?? o.processNozzle;
  if (n && o.layerHeight) {
    const { min, max } = layerRange(n, { min: o.min, max: o.max });
    if (o.layerHeight > max + 1e-9) out.push({ key: 'nozzle.warnLayerHigh', params: { layer: numStr(o.layerHeight), nozzle: n, max: numStr(max) } });
    else if (o.layerHeight < min - 1e-9) out.push({ key: 'nozzle.warnLayerLow', params: { layer: numStr(o.layerHeight), nozzle: n, min: numStr(min) } });
  }
  return out;
}

/** Alturas de capa habituales de una boquilla (25 %, 30 %, 40 %, 50 %, 60 %, 70 %), en pasos de 0,02 mm y dentro del rango permitido. */
export function layerChoices(nozzle: string | number, machine?: { min?: number; max?: number }) {
  const { min, max } = layerRange(nozzle, machine); const n = Number(nozzle);
  const out = [0.25, 0.3, 0.4, 0.5, 0.6, 0.7].map((f) => Math.round((n * f) / 0.02) * 0.02).map(r3).filter((h) => h >= min - 1e-9 && h <= max + 1e-9);
  return [...new Set(out)];
}

/** Separa las calidades que sirven para la boquilla de la máquina de las pensadas para otra. Las que no declaran boquilla sirven para todas. */
export function splitByNozzle<P extends { nozzle: string | null }>(profiles: P[], machineNozzle: string | null) {
  if (!machineNozzle) return { compatible: profiles, others: [] as P[] };
  const ok = (p: P) => !p.nozzle || Number(p.nozzle) === Number(machineNozzle);
  return { compatible: profiles.filter(ok), others: profiles.filter((p) => !ok(p)) };
}
