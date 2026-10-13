import type { MessageKey } from '@/i18n/translate';

/**
 * Parámetros que la IA puede proponer. Todo lo que no esté aquí se rechaza (nunca G-code personalizado,
 * scripts ni parámetros de máquina). `risk`: safe = se aplica tras confirmar; moderate = se avisa y se recomienda probar.
 */
export type Scope = 'process' | 'filament';
export type Risk = 'safe' | 'moderate';
interface Base { key: string; scope: Scope; risk: Risk; label: MessageKey }
export type ParamDef = Base & (
  | { type: 'int'; min: number; max: number; unit?: string }
  | { type: 'number'; min: number; max: number; unit?: string }
  | { type: 'percent'; min: number; max: number }
  | { type: 'enum'; options: string[] }
  | { type: 'bool' }
);

export const PARAM_REGISTRY: ParamDef[] = [
  { key: 'layer_height', scope: 'process', risk: 'moderate', label: 'slicerParam.layer_height', type: 'number', min: 0.04, max: 0.8, unit: 'mm' },
  { key: 'initial_layer_print_height', scope: 'process', risk: 'safe', label: 'slicerParam.initial_layer_print_height', type: 'number', min: 0.1, max: 0.6, unit: 'mm' },
  { key: 'wall_loops', scope: 'process', risk: 'safe', label: 'slicerParam.wall_loops', type: 'int', min: 1, max: 10 },
  { key: 'sparse_infill_density', scope: 'process', risk: 'safe', label: 'slicerParam.sparse_infill_density', type: 'percent', min: 0, max: 100 },
  { key: 'sparse_infill_pattern', scope: 'process', risk: 'safe', label: 'slicerParam.sparse_infill_pattern', type: 'enum', options: ['grid', 'gyroid', 'cubic', 'honeycomb', 'triangles', 'lightning', 'rectilinear', 'adaptivecubic', 'line', 'concentric'] },
  { key: 'top_shell_layers', scope: 'process', risk: 'safe', label: 'slicerParam.top_shell_layers', type: 'int', min: 0, max: 20 },
  { key: 'bottom_shell_layers', scope: 'process', risk: 'safe', label: 'slicerParam.bottom_shell_layers', type: 'int', min: 0, max: 20 },
  { key: 'enable_support', scope: 'process', risk: 'safe', label: 'slicerParam.enable_support', type: 'bool' },
  { key: 'support_type', scope: 'process', risk: 'safe', label: 'slicerParam.support_type', type: 'enum', options: ['normal(auto)', 'tree(auto)', 'normal(manual)', 'tree(manual)'] },
  { key: 'outer_wall_speed', scope: 'process', risk: 'moderate', label: 'slicerParam.outer_wall_speed', type: 'number', min: 10, max: 500, unit: 'mm/s' },
  { key: 'inner_wall_speed', scope: 'process', risk: 'moderate', label: 'slicerParam.inner_wall_speed', type: 'number', min: 10, max: 600, unit: 'mm/s' },
  { key: 'sparse_infill_speed', scope: 'process', risk: 'moderate', label: 'slicerParam.sparse_infill_speed', type: 'number', min: 10, max: 600, unit: 'mm/s' },
  { key: 'default_acceleration', scope: 'process', risk: 'moderate', label: 'slicerParam.default_acceleration', type: 'number', min: 100, max: 30000, unit: 'mm/s²' },
  { key: 'brim_type', scope: 'process', risk: 'safe', label: 'slicerParam.brim_type', type: 'enum', options: ['no_brim', 'auto_brim', 'outer_only', 'inner_only', 'outer_and_inner'] },
  { key: 'nozzle_temperature', scope: 'filament', risk: 'moderate', label: 'slicerParam.nozzle_temperature', type: 'int', min: 150, max: 320, unit: '°C' },
  { key: 'nozzle_temperature_initial_layer', scope: 'filament', risk: 'moderate', label: 'slicerParam.nozzle_temperature_initial_layer', type: 'int', min: 150, max: 320, unit: '°C' },
  { key: 'hot_plate_temp', scope: 'filament', risk: 'moderate', label: 'slicerParam.hot_plate_temp', type: 'int', min: 0, max: 120, unit: '°C' },
  { key: 'textured_plate_temp', scope: 'filament', risk: 'moderate', label: 'slicerParam.textured_plate_temp', type: 'int', min: 0, max: 120, unit: '°C' },
  { key: 'filament_flow_ratio', scope: 'filament', risk: 'moderate', label: 'slicerParam.filament_flow_ratio', type: 'number', min: 0.85, max: 1.1 },
  { key: 'fan_min_speed', scope: 'filament', risk: 'safe', label: 'slicerParam.fan_min_speed', type: 'int', min: 0, max: 100, unit: '%' },
];
export const PARAM_BY_KEY = new Map(PARAM_REGISTRY.map((p) => [p.key, p]));

/** Descripción compacta de un parámetro para el prompt del modelo. */
export function describeParam(p: ParamDef): string {
  const range = p.type === 'enum' ? `uno de: ${p.options.join(' | ')}` : p.type === 'bool' ? '0 o 1' : p.type === 'percent' ? `${p.min}%–${p.max}%` : `${p.min}–${p.max}${'unit' in p && p.unit ? ' ' + p.unit : ''}${p.type === 'int' ? ' (entero)' : ''}`;
  return `${p.key} [${p.scope}] ${range}`;
}

/** Primer valor de una clave de Orca (las claves de filamento vienen como listas). */
export const first = (v: unknown): string | number | undefined => (Array.isArray(v) ? v[0] : (v as any));
export const numOf = (v: unknown): number | null => { const x = first(v); const n = typeof x === 'number' ? x : parseFloat(String(x ?? '').replace('%', '')); return Number.isFinite(n) ? n : null; };
