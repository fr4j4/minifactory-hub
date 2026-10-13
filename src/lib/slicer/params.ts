import type { MessageKey } from '@/i18n/translate';

/** Copia liviana de los parámetros del editor simple (sin dependencias de Node), para el navegador. */
export const SIMPLE_PARAMS_CLIENT: Record<'machine' | 'process' | 'filament', Array<{ key: string; label: MessageKey; kind: 'number' | 'select' | 'text'; unit?: string; options?: string[] }>> = {
  machine: [
    { key: 'machine_max_acceleration_x', label: 'slicerParam.machine_max_acceleration_x', kind: 'number', unit: 'mm/s²' },
    { key: 'machine_max_speed_x', label: 'slicerParam.machine_max_speed_x', kind: 'number', unit: 'mm/s' },
    { key: 'printable_height', label: 'slicerParam.printable_height', kind: 'number', unit: 'mm' },
  ],
  process: [
    { key: 'layer_height', label: 'slicerParam.layer_height', kind: 'number', unit: 'mm' },
    { key: 'initial_layer_print_height', label: 'slicerParam.initial_layer_print_height', kind: 'number', unit: 'mm' },
    { key: 'wall_loops', label: 'slicerParam.wall_loops', kind: 'number' },
    { key: 'sparse_infill_density', label: 'slicerParam.sparse_infill_density', kind: 'text', unit: '%' },
    { key: 'sparse_infill_pattern', label: 'slicerParam.sparse_infill_pattern', kind: 'select', options: ['grid', 'gyroid', 'cubic', 'honeycomb', 'triangles', 'lightning', 'rectilinear', 'adaptivecubic', 'line', 'concentric'] },
    { key: 'top_shell_layers', label: 'slicerParam.top_shell_layers', kind: 'number' },
    { key: 'bottom_shell_layers', label: 'slicerParam.bottom_shell_layers', kind: 'number' },
    { key: 'enable_support', label: 'slicerParam.enable_support', kind: 'select', options: ['0', '1'] },
    { key: 'support_type', label: 'slicerParam.support_type', kind: 'select', options: ['normal(auto)', 'tree(auto)', 'normal(manual)', 'tree(manual)'] },
    { key: 'outer_wall_speed', label: 'slicerParam.outer_wall_speed', kind: 'number', unit: 'mm/s' },
    { key: 'inner_wall_speed', label: 'slicerParam.inner_wall_speed', kind: 'number', unit: 'mm/s' },
    { key: 'sparse_infill_speed', label: 'slicerParam.sparse_infill_speed', kind: 'number', unit: 'mm/s' },
    { key: 'default_acceleration', label: 'slicerParam.default_acceleration', kind: 'number', unit: 'mm/s²' },
    { key: 'brim_type', label: 'slicerParam.brim_type', kind: 'select', options: ['no_brim', 'auto_brim', 'outer_only', 'inner_only', 'outer_and_inner'] },
  ],
  filament: [
    { key: 'nozzle_temperature', label: 'slicerParam.nozzle_temperature', kind: 'number', unit: '°C' },
    { key: 'nozzle_temperature_initial_layer', label: 'slicerParam.nozzle_temperature_initial_layer', kind: 'number', unit: '°C' },
    { key: 'hot_plate_temp', label: 'slicerParam.hot_plate_temp', kind: 'number', unit: '°C' },
    { key: 'textured_plate_temp', label: 'slicerParam.textured_plate_temp', kind: 'number', unit: '°C' },
    { key: 'filament_flow_ratio', label: 'slicerParam.filament_flow_ratio', kind: 'number' },
    { key: 'filament_max_volumetric_speed', label: 'slicerParam.filament_max_volumetric_speed', kind: 'number', unit: 'mm³/s' },
    { key: 'filament_density', label: 'slicerParam.filament_density', kind: 'number', unit: 'g/cm³' },
    { key: 'fan_min_speed', label: 'slicerParam.fan_min_speed', kind: 'number', unit: '%' },
  ],
};

export const TYPE_LABEL: Record<'machine' | 'process' | 'filament', MessageKey> = { machine: 'slicer.typeMachine', process: 'slicer.typeProcess', filament: 'slicer.typeFilament' };
