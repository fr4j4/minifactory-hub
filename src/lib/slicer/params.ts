/**
 * Parámetros del editor simple (los que mueven el costo). Única fuente: la usan el servidor (catalog.ts) y el navegador,
 * por eso no depende de nada de Node.
 */
export type ProfileKind = 'machine' | 'process' | 'filament';
export interface SimpleParam { key: string; label: string; kind: 'number' | 'select' | 'text'; unit?: string; options?: string[]; help?: string; group: string }

export const SIMPLE_PARAMS: Record<ProfileKind, SimpleParam[]> = {
  machine: [
    { key: 'nozzle_diameter', label: 'Diámetro de boquilla', kind: 'number', unit: 'mm', group: 'Boquilla', help: 'Cambiarlo aquí no cambia las calidades de fábrica: mejor elige otra impresora base (0,2 · 0,4 · 0,6…).' },
    { key: 'min_layer_height', label: 'Altura de capa mínima', kind: 'number', unit: 'mm', group: 'Boquilla' },
    { key: 'max_layer_height', label: 'Altura de capa máxima', kind: 'number', unit: 'mm', group: 'Boquilla' },
    { key: 'printable_height', label: 'Altura imprimible', kind: 'number', unit: 'mm', group: 'Movimiento' },
    { key: 'machine_max_acceleration_x', label: 'Aceleración máx. X', kind: 'number', unit: 'mm/s²', group: 'Movimiento' },
    { key: 'machine_max_speed_x', label: 'Velocidad máx. X', kind: 'number', unit: 'mm/s', group: 'Movimiento' },
    { key: 'retraction_length', label: 'Retracción', kind: 'number', unit: 'mm', group: 'Extrusión' },
  ],
  process: [
    { key: 'layer_height', label: 'Altura de capa', kind: 'number', unit: 'mm', group: 'Capas y paredes', help: 'Entre 20 % y 70 % del diámetro de la boquilla.' },
    { key: 'initial_layer_print_height', label: 'Altura primera capa', kind: 'number', unit: 'mm', group: 'Capas y paredes' },
    { key: 'wall_loops', label: 'Perímetros (paredes)', kind: 'number', group: 'Capas y paredes' },
    { key: 'top_shell_layers', label: 'Capas superiores', kind: 'number', group: 'Capas y paredes' },
    { key: 'bottom_shell_layers', label: 'Capas inferiores', kind: 'number', group: 'Capas y paredes' },
    { key: 'sparse_infill_density', label: 'Relleno', kind: 'text', unit: '%', help: 'Ej. 15%', group: 'Relleno y soportes' },
    { key: 'sparse_infill_pattern', label: 'Patrón de relleno', kind: 'select', options: ['grid', 'gyroid', 'cubic', 'honeycomb', 'triangles', 'lightning', 'rectilinear', 'adaptivecubic', 'line', 'concentric'], group: 'Relleno y soportes' },
    { key: 'enable_support', label: 'Soportes (0/1)', kind: 'select', options: ['0', '1'], group: 'Relleno y soportes' },
    { key: 'support_type', label: 'Tipo de soporte', kind: 'select', options: ['normal(auto)', 'tree(auto)', 'normal(manual)', 'tree(manual)'], group: 'Relleno y soportes' },
    { key: 'brim_type', label: 'Borde (brim)', kind: 'select', options: ['no_brim', 'auto_brim', 'outer_only', 'inner_only', 'outer_and_inner'], group: 'Relleno y soportes' },
    { key: 'outer_wall_speed', label: 'Velocidad pared exterior', kind: 'number', unit: 'mm/s', group: 'Velocidad' },
    { key: 'inner_wall_speed', label: 'Velocidad pared interior', kind: 'number', unit: 'mm/s', group: 'Velocidad' },
    { key: 'sparse_infill_speed', label: 'Velocidad relleno', kind: 'number', unit: 'mm/s', group: 'Velocidad' },
    { key: 'default_acceleration', label: 'Aceleración por defecto', kind: 'number', unit: 'mm/s²', group: 'Velocidad' },
  ],
  filament: [
    { key: 'nozzle_temperature', label: 'Temp. boquilla', kind: 'number', unit: '°C', group: 'Temperaturas' },
    { key: 'nozzle_temperature_initial_layer', label: 'Temp. boquilla 1ª capa', kind: 'number', unit: '°C', group: 'Temperaturas' },
    { key: 'hot_plate_temp', label: 'Temp. cama (PEI liso)', kind: 'number', unit: '°C', group: 'Temperaturas' },
    { key: 'textured_plate_temp', label: 'Temp. cama (PEI texturizado)', kind: 'number', unit: '°C', group: 'Temperaturas' },
    { key: 'filament_flow_ratio', label: 'Factor de flujo', kind: 'number', group: 'Extrusión' },
    { key: 'filament_max_volumetric_speed', label: 'Caudal volumétrico máx.', kind: 'number', unit: 'mm³/s', group: 'Extrusión' },
    { key: 'fan_min_speed', label: 'Ventilador mín.', kind: 'number', unit: '%', group: 'Extrusión' },
    { key: 'filament_density', label: 'Densidad', kind: 'number', unit: 'g/cm³', group: 'Material' },
    { key: 'filament_cost', label: 'Costo', kind: 'number', unit: '$/kg', group: 'Material' },
  ],
};
/** Nombre histórico que usa el navegador. */
export const SIMPLE_PARAMS_CLIENT = SIMPLE_PARAMS;

export const TYPE_LABEL: Record<ProfileKind, string> = { machine: 'Impresora', process: 'Calidad (proceso)', filament: 'Filamento' };
/** Textos cortos para explicar cada tipo de perfil con palabras de taller. */
export const TYPE_EXPLAIN: Record<ProfileKind, { title: string; what: string; example: string; changes: string }> = {
  machine: {
    title: 'Perfil de impresora (tipo de máquina)',
    what: 'Describe el modelo de impresora y su boquilla: tamaño de cama, aceleraciones, retracción, G-code de inicio y rango de altura de capa. Es «el hardware», no tu equipo concreto.',
    example: 'Bambu Lab A1 con boquilla 0,4 · Bambu Lab A1 con boquilla 0,2 · Ender-3 V3 SE',
    changes: 'Hay uno por modelo + boquilla. Lo normal es no tocarlo; cámbialo solo si modificaste el equipo.',
  },
  process: {
    title: 'Perfil de calidad (proceso)',
    what: 'Cómo imprimir la pieza: altura de capa, paredes, relleno, soportes y velocidades. Es lo que eliges trabajo a trabajo.',
    example: 'Borrador 0,24 mm · Estándar 0,20 mm · Fino 0,12 mm · Resistente (4 paredes, 30 % relleno)',
    changes: 'Mueve directamente el tiempo, los gramos y el precio. Crea aquí tus variantes y compáralas en el Comparador.',
  },
  filament: {
    title: 'Perfil de filamento',
    what: 'Cómo se comporta el material: temperaturas, flujo, ventilador y densidad. De aquí salen los gramos y el cuidado del material.',
    example: 'PLA Basic · PETG HF · TPU 95A · tu marca local',
    changes: 'Uno por tipo de material (o por marca si se porta distinto). Se asigna a cada material del inventario.',
  },
};
