/** Copia liviana de los parámetros del editor simple (sin dependencias de Node), para el navegador. */
export const SIMPLE_PARAMS_CLIENT: Record<'machine' | 'process' | 'filament', Array<{ key: string; label: string; kind: 'number' | 'select' | 'text'; unit?: string; options?: string[] }>> = {
  machine: [
    { key: 'machine_max_acceleration_x', label: 'Aceleración máx. X', kind: 'number', unit: 'mm/s²' },
    { key: 'machine_max_speed_x', label: 'Velocidad máx. X', kind: 'number', unit: 'mm/s' },
    { key: 'printable_height', label: 'Altura imprimible', kind: 'number', unit: 'mm' },
  ],
  process: [
    { key: 'layer_height', label: 'Altura de capa', kind: 'number', unit: 'mm' },
    { key: 'initial_layer_print_height', label: 'Altura primera capa', kind: 'number', unit: 'mm' },
    { key: 'wall_loops', label: 'Perímetros (paredes)', kind: 'number' },
    { key: 'sparse_infill_density', label: 'Relleno', kind: 'text', unit: '%' },
    { key: 'sparse_infill_pattern', label: 'Patrón de relleno', kind: 'select', options: ['grid', 'gyroid', 'cubic', 'honeycomb', 'triangles', 'lightning', 'rectilinear', 'adaptivecubic', 'line', 'concentric'] },
    { key: 'top_shell_layers', label: 'Capas superiores', kind: 'number' },
    { key: 'bottom_shell_layers', label: 'Capas inferiores', kind: 'number' },
    { key: 'enable_support', label: 'Soportes (0/1)', kind: 'select', options: ['0', '1'] },
    { key: 'support_type', label: 'Tipo de soporte', kind: 'select', options: ['normal(auto)', 'tree(auto)', 'normal(manual)', 'tree(manual)'] },
    { key: 'outer_wall_speed', label: 'Velocidad pared exterior', kind: 'number', unit: 'mm/s' },
    { key: 'inner_wall_speed', label: 'Velocidad pared interior', kind: 'number', unit: 'mm/s' },
    { key: 'sparse_infill_speed', label: 'Velocidad relleno', kind: 'number', unit: 'mm/s' },
    { key: 'default_acceleration', label: 'Aceleración por defecto', kind: 'number', unit: 'mm/s²' },
    { key: 'brim_type', label: 'Borde (brim)', kind: 'select', options: ['no_brim', 'auto_brim', 'outer_only', 'inner_only', 'outer_and_inner'] },
  ],
  filament: [
    { key: 'nozzle_temperature', label: 'Temp. boquilla', kind: 'number', unit: '°C' },
    { key: 'nozzle_temperature_initial_layer', label: 'Temp. boquilla 1ª capa', kind: 'number', unit: '°C' },
    { key: 'hot_plate_temp', label: 'Temp. cama (PEI liso)', kind: 'number', unit: '°C' },
    { key: 'textured_plate_temp', label: 'Temp. cama (PEI texturizado)', kind: 'number', unit: '°C' },
    { key: 'filament_flow_ratio', label: 'Factor de flujo', kind: 'number' },
    { key: 'filament_max_volumetric_speed', label: 'Caudal volumétrico máx.', kind: 'number', unit: 'mm³/s' },
    { key: 'filament_density', label: 'Densidad', kind: 'number', unit: 'g/cm³' },
    { key: 'fan_min_speed', label: 'Ventilador mín.', kind: 'number', unit: '%' },
  ],
};

export const TYPE_LABEL: Record<'machine' | 'process' | 'filament', string> = { machine: 'Máquina', process: 'Proceso', filament: 'Filamento' };
