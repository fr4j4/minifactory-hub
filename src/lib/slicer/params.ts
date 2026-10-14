import type { MessageKey } from '@/i18n/translate';

/**
 * Parámetros del editor simple (los que mueven el costo). Única fuente: la usan el servidor (catalog.ts) y el navegador,
 * por eso no depende de nada de Node.
 */
export type ProfileKind = 'machine' | 'process' | 'filament';
export interface SimpleParam { key: string; label: MessageKey; kind: 'number' | 'select' | 'text'; unit?: string; options?: string[]; help?: MessageKey; group: MessageKey }

export const SIMPLE_PARAMS: Record<ProfileKind, SimpleParam[]> = {
  machine: [
    { key: 'nozzle_diameter', label: 'nozzle.param.nozzle_diameter', kind: 'number', unit: 'mm', group: 'nozzle.groupNozzle', help: 'nozzle.helpNozzleDiameter' },
    { key: 'min_layer_height', label: 'nozzle.param.min_layer_height', kind: 'number', unit: 'mm', group: 'nozzle.groupNozzle' },
    { key: 'max_layer_height', label: 'nozzle.param.max_layer_height', kind: 'number', unit: 'mm', group: 'nozzle.groupNozzle' },
    { key: 'printable_height', label: 'slicerParam.printable_height', kind: 'number', unit: 'mm', group: 'nozzle.groupMotion' },
    { key: 'machine_max_acceleration_x', label: 'slicerParam.machine_max_acceleration_x', kind: 'number', unit: 'mm/s²', group: 'nozzle.groupMotion' },
    { key: 'machine_max_speed_x', label: 'slicerParam.machine_max_speed_x', kind: 'number', unit: 'mm/s', group: 'nozzle.groupMotion' },
    { key: 'retraction_length', label: 'nozzle.param.retraction_length', kind: 'number', unit: 'mm', group: 'nozzle.groupExtrusion' },
  ],
  process: [
    { key: 'layer_height', label: 'slicerParam.layer_height', kind: 'number', unit: 'mm', group: 'nozzle.groupLayersWalls', help: 'nozzle.helpLayerHeight' },
    { key: 'initial_layer_print_height', label: 'slicerParam.initial_layer_print_height', kind: 'number', unit: 'mm', group: 'nozzle.groupLayersWalls' },
    { key: 'wall_loops', label: 'slicerParam.wall_loops', kind: 'number', group: 'nozzle.groupLayersWalls' },
    { key: 'top_shell_layers', label: 'slicerParam.top_shell_layers', kind: 'number', group: 'nozzle.groupLayersWalls' },
    { key: 'bottom_shell_layers', label: 'slicerParam.bottom_shell_layers', kind: 'number', group: 'nozzle.groupLayersWalls' },
    { key: 'sparse_infill_density', label: 'slicerParam.sparse_infill_density', kind: 'text', unit: '%', help: 'slicerParam.infillHelp', group: 'nozzle.groupInfillSupports' },
    { key: 'sparse_infill_pattern', label: 'slicerParam.sparse_infill_pattern', kind: 'select', options: ['grid', 'gyroid', 'cubic', 'honeycomb', 'triangles', 'lightning', 'rectilinear', 'adaptivecubic', 'line', 'concentric'], group: 'nozzle.groupInfillSupports' },
    { key: 'enable_support', label: 'slicerParam.enable_support', kind: 'select', options: ['0', '1'], group: 'nozzle.groupInfillSupports' },
    { key: 'support_type', label: 'slicerParam.support_type', kind: 'select', options: ['normal(auto)', 'tree(auto)', 'normal(manual)', 'tree(manual)'], group: 'nozzle.groupInfillSupports' },
    { key: 'brim_type', label: 'slicerParam.brim_type', kind: 'select', options: ['no_brim', 'auto_brim', 'outer_only', 'inner_only', 'outer_and_inner'], group: 'nozzle.groupInfillSupports' },
    { key: 'outer_wall_speed', label: 'slicerParam.outer_wall_speed', kind: 'number', unit: 'mm/s', group: 'nozzle.groupSpeed' },
    { key: 'inner_wall_speed', label: 'slicerParam.inner_wall_speed', kind: 'number', unit: 'mm/s', group: 'nozzle.groupSpeed' },
    { key: 'sparse_infill_speed', label: 'slicerParam.sparse_infill_speed', kind: 'number', unit: 'mm/s', group: 'nozzle.groupSpeed' },
    { key: 'default_acceleration', label: 'slicerParam.default_acceleration', kind: 'number', unit: 'mm/s²', group: 'nozzle.groupSpeed' },
  ],
  filament: [
    { key: 'nozzle_temperature', label: 'slicerParam.nozzle_temperature', kind: 'number', unit: '°C', group: 'nozzle.groupTemps' },
    { key: 'nozzle_temperature_initial_layer', label: 'slicerParam.nozzle_temperature_initial_layer', kind: 'number', unit: '°C', group: 'nozzle.groupTemps' },
    { key: 'hot_plate_temp', label: 'slicerParam.hot_plate_temp', kind: 'number', unit: '°C', group: 'nozzle.groupTemps' },
    { key: 'textured_plate_temp', label: 'slicerParam.textured_plate_temp', kind: 'number', unit: '°C', group: 'nozzle.groupTemps' },
    { key: 'filament_flow_ratio', label: 'slicerParam.filament_flow_ratio', kind: 'number', group: 'nozzle.groupExtrusion' },
    { key: 'filament_max_volumetric_speed', label: 'slicerParam.filament_max_volumetric_speed', kind: 'number', unit: 'mm³/s', group: 'nozzle.groupExtrusion' },
    { key: 'fan_min_speed', label: 'slicerParam.fan_min_speed', kind: 'number', unit: '%', group: 'nozzle.groupExtrusion' },
    { key: 'filament_density', label: 'slicerParam.filament_density', kind: 'number', unit: 'g/cm³', group: 'nozzle.groupMaterial' },
    { key: 'filament_cost', label: 'slicerParam.filament_cost', kind: 'number', unit: '$/kg', group: 'nozzle.groupMaterial' },
  ],
};
/** Nombre histórico que usa el navegador. */
export const SIMPLE_PARAMS_CLIENT = SIMPLE_PARAMS;

export const TYPE_LABEL: Record<ProfileKind, MessageKey> = { machine: 'slicer.typeMachine', process: 'slicer.typeProcess', filament: 'slicer.typeFilament' };
/** Textos para explicar cada tipo de perfil con palabras de taller (claves de traducción). */
export const TYPE_EXPLAIN: Record<ProfileKind, { title: MessageKey; what: MessageKey; example: MessageKey; changes: MessageKey }> = {
  machine: { title: 'nozzle.explainMachineTitle', what: 'nozzle.explainMachineWhat', example: 'nozzle.explainMachineExample', changes: 'nozzle.explainMachineChanges' },
  process: { title: 'nozzle.explainProcessTitle', what: 'nozzle.explainProcessWhat', example: 'nozzle.explainProcessExample', changes: 'nozzle.explainProcessChanges' },
  filament: { title: 'nozzle.explainFilamentTitle', what: 'nozzle.explainFilamentWhat', example: 'nozzle.explainFilamentExample', changes: 'nozzle.explainFilamentChanges' },
};
