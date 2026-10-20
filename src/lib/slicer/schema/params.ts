/**
 * Esquema curado de parámetros del Estudio de laminado (≈ 60 claves de OrcaSlicer 2.4.x, las que se usan en la práctica).
 * Textos propios en español e inglés (no se copian los de OrcaSlicer, que es AGPL). Las claves se verificaron contra PrintConfig.cpp (v2.4.2).
 * Cualquier otra clave sigue siendo editable como «clave cruda» (ver ParamPanel).
 */
export type ParamType = 'process' | 'filament' | 'machine';
export type ParamKind = 'number' | 'int' | 'percent' | 'select' | 'bool';
export type ParamMode = 'simple' | 'advanced' | 'expert';
export interface ParamDef {
  key: string; type: ParamType; page: string; group: string; kind: ParamKind; mode: ParamMode; unit?: string; min?: number; max?: number; options?: string[];
  es: { label: string; tip: string }; en: { label: string; tip: string };
}
type Extra = Partial<Pick<ParamDef, 'unit' | 'min' | 'max' | 'options'>>;
const D: ParamDef[] = [];
const p = (type: ParamType, page: string, group: string, key: string, kind: ParamKind, mode: ParamMode, es: [string, string], en: [string, string], x: Extra = {}) =>
  D.push({ key, type, page, group, kind, mode, ...x, es: { label: es[0], tip: es[1] }, en: { label: en[0], tip: en[1] } });

/* ── Proceso: Calidad ── */
p('process', 'quality', 'layers', 'layer_height', 'number', 'simple', ['Altura de capa', 'Grosor de cada capa. Menos altura = más detalle y más tiempo.'], ['Layer height', 'Thickness of each layer. Lower = more detail and more time.'], { unit: 'mm', min: 0.04, max: 1 });
p('process', 'quality', 'layers', 'initial_layer_print_height', 'number', 'advanced', ['Altura de la primera capa', 'Una primera capa algo más gruesa pega mejor.'], ['First layer height', 'A slightly thicker first layer sticks better.'], { unit: 'mm', min: 0.04, max: 1 });
p('process', 'quality', 'lines', 'line_width', 'number', 'advanced', ['Ancho de línea', 'Ancho de la línea extruida; normalmente el diámetro de la boquilla + 0,02 mm.'], ['Line width', 'Width of the extruded line; usually nozzle diameter + 0.02 mm.'], { unit: 'mm', min: 0.1, max: 2 });
p('process', 'quality', 'lines', 'outer_wall_line_width', 'number', 'expert', ['Ancho de la pared exterior', 'Ancho de línea solo para la pared visible.'], ['Outer wall line width', 'Line width for the visible wall only.'], { unit: 'mm', min: 0.1, max: 2 });
p('process', 'quality', 'seam', 'seam_position', 'select', 'simple', ['Posición de la costura', 'Dónde empieza cada capa. «Atrás» la esconde en la cara posterior.'], ['Seam position', 'Where each layer starts. “Back” hides it on the rear face.'], { options: ['nearest', 'aligned', 'aligned_back', 'back', 'random'] });
p('process', 'quality', 'seam', 'ironing_type', 'select', 'advanced', ['Planchado', 'Pasa la boquilla caliente por la superficie superior para alisarla.'], ['Ironing', 'Passes the hot nozzle over the top surface to smooth it.'], { options: ['no ironing', 'top', 'topmost', 'solid'] });
p('process', 'quality', 'precision', 'elefant_foot_compensation', 'number', 'advanced', ['Compensación de pata de elefante', 'Reduce el ensanchamiento de la primera capa.'], ['Elephant foot compensation', 'Reduces first layer flaring.'], { unit: 'mm', min: 0, max: 2 });
p('process', 'quality', 'precision', 'resolution', 'number', 'expert', ['Resolución', 'Tolerancia de simplificación del G-code; valores altos = archivo más liviano.'], ['Resolution', 'G-code simplification tolerance; higher = lighter file.'], { unit: 'mm', min: 0, max: 1 });
p('process', 'quality', 'precision', 'wall_generator', 'select', 'advanced', ['Generador de paredes', '«Arachne» adapta el ancho de línea en zonas finas.'], ['Wall generator', '“Arachne” adapts line width in thin areas.'], { options: ['classic', 'arachne'] });
p('process', 'quality', 'precision', 'detect_thin_wall', 'bool', 'advanced', ['Detectar paredes finas', 'Imprime paredes más finas que dos líneas.'], ['Detect thin walls', 'Prints walls thinner than two lines.']);
p('process', 'quality', 'bridges', 'bridge_flow', 'number', 'expert', ['Flujo en puentes', 'Multiplicador de flujo en puentes; menos de 1 los tensa.'], ['Bridge flow', 'Flow multiplier on bridges; below 1 tightens them.'], { min: 0.5, max: 1.5 });
/* ── Proceso: Resistencia ── */
p('process', 'strength', 'walls', 'wall_loops', 'int', 'simple', ['Paredes', 'Cantidad de perímetros. Más paredes = pieza más fuerte.'], ['Walls', 'Number of perimeters. More walls = stronger part.'], { min: 1, max: 20 });
p('process', 'strength', 'walls', 'top_shell_layers', 'int', 'simple', ['Capas superiores', 'Capas sólidas en el techo.'], ['Top layers', 'Solid layers on the roof.'], { min: 0, max: 50 });
p('process', 'strength', 'walls', 'bottom_shell_layers', 'int', 'simple', ['Capas inferiores', 'Capas sólidas en el piso.'], ['Bottom layers', 'Solid layers on the floor.'], { min: 0, max: 50 });
p('process', 'strength', 'walls', 'top_shell_thickness', 'number', 'advanced', ['Espesor mínimo del techo', 'Si las capas no alcanzan este espesor, se agregan más.'], ['Minimum top thickness', 'If the layers fall short of this, more are added.'], { unit: 'mm', min: 0, max: 10 });
p('process', 'strength', 'walls', 'bottom_shell_thickness', 'number', 'advanced', ['Espesor mínimo del piso', 'Si las capas no alcanzan este espesor, se agregan más.'], ['Minimum bottom thickness', 'If the layers fall short of this, more are added.'], { unit: 'mm', min: 0, max: 10 });
p('process', 'strength', 'infill', 'sparse_infill_density', 'percent', 'simple', ['Relleno', 'Porcentaje del interior que se llena. Es lo que más mueve el peso y el tiempo.'], ['Infill', 'Percentage of the interior that is filled. The biggest lever on weight and time.'], { unit: '%', min: 0, max: 100 });
p('process', 'strength', 'infill', 'sparse_infill_pattern', 'select', 'simple', ['Patrón de relleno', '«Gyroid» es resistente en todas direcciones; «grid» es rápido; «lightning» ahorra material.'], ['Infill pattern', '“Gyroid” is strong in every direction; “grid” is fast; “lightning” saves material.'], { options: ['grid', 'gyroid', 'cubic', 'adaptivecubic', 'honeycomb', 'triangles', 'lightning', 'rectilinear', 'concentric', 'crosshatch'] });
p('process', 'strength', 'infill', 'infill_wall_overlap', 'percent', 'expert', ['Traslape relleno-pared', 'Cuánto se mete el relleno en la pared para que peguen.'], ['Infill/wall overlap', 'How far infill enters the wall so they bond.'], { unit: '%', min: 0, max: 100 });
p('process', 'strength', 'orientation', 'ensure_vertical_shell_thickness', 'bool', 'expert', ['Asegurar espesor vertical', 'Agrega sólido donde la pared quedaría muy fina.'], ['Ensure vertical shell thickness', 'Adds solid where the wall would be too thin.']);
/* ── Proceso: Velocidad ── */
p('process', 'speed', 'print', 'outer_wall_speed', 'number', 'simple', ['Velocidad de pared exterior', 'Más lenta = mejor acabado.'], ['Outer wall speed', 'Slower = better finish.'], { unit: 'mm/s', min: 1, max: 1000 });
p('process', 'speed', 'print', 'inner_wall_speed', 'number', 'simple', ['Velocidad de pared interior', 'Puede ser más rápida que la exterior.'], ['Inner wall speed', 'Can be faster than the outer wall.'], { unit: 'mm/s', min: 1, max: 1000 });
p('process', 'speed', 'print', 'sparse_infill_speed', 'number', 'simple', ['Velocidad de relleno', 'Es la que más acorta el tiempo.'], ['Infill speed', 'The one that cuts time the most.'], { unit: 'mm/s', min: 1, max: 1000 });
p('process', 'speed', 'print', 'internal_solid_infill_speed', 'number', 'advanced', ['Velocidad del relleno sólido', 'Capas sólidas internas.'], ['Solid infill speed', 'Internal solid layers.'], { unit: 'mm/s', min: 1, max: 1000 });
p('process', 'speed', 'print', 'top_surface_speed', 'number', 'advanced', ['Velocidad de superficie superior', 'Más lenta deja el techo más liso.'], ['Top surface speed', 'Slower leaves a smoother roof.'], { unit: 'mm/s', min: 1, max: 1000 });
p('process', 'speed', 'print', 'bridge_speed', 'number', 'advanced', ['Velocidad en puentes', 'Los puentes salen mejor despacio.'], ['Bridge speed', 'Bridges look better slow.'], { unit: 'mm/s', min: 1, max: 500 });
p('process', 'speed', 'print', 'initial_layer_speed', 'number', 'advanced', ['Velocidad de primera capa', 'Despacio para que pegue.'], ['First layer speed', 'Slow so it sticks.'], { unit: 'mm/s', min: 1, max: 300 });
p('process', 'speed', 'travel', 'travel_speed', 'number', 'advanced', ['Velocidad de viaje', 'Movimientos sin extruir.'], ['Travel speed', 'Moves without extruding.'], { unit: 'mm/s', min: 1, max: 1500 });
p('process', 'speed', 'accel', 'default_acceleration', 'number', 'advanced', ['Aceleración', 'Más alta = más rápido pero más ringing.'], ['Acceleration', 'Higher = faster but more ringing.'], { unit: 'mm/s²', min: 100, max: 50000 });
p('process', 'speed', 'accel', 'outer_wall_acceleration', 'number', 'expert', ['Aceleración de pared exterior', 'Una menor mejora el acabado.'], ['Outer wall acceleration', 'Lower improves finish.'], { unit: 'mm/s²', min: 100, max: 50000 });
p('process', 'speed', 'accel', 'initial_layer_acceleration', 'number', 'expert', ['Aceleración de primera capa', 'Suave para que pegue.'], ['First layer acceleration', 'Gentle so it sticks.'], { unit: 'mm/s²', min: 100, max: 50000 });
/* ── Proceso: Soportes y base ── */
p('process', 'support', 'support', 'enable_support', 'bool', 'simple', ['Soportes', 'Genera soportes bajo los voladizos.'], ['Supports', 'Generates supports under overhangs.']);
p('process', 'support', 'support', 'support_type', 'select', 'simple', ['Tipo de soporte', '«Árbol» usa menos material y se quita más fácil, pero tarda más en laminar.'], ['Support type', '“Tree” uses less material and removes easily, but slices slower.'], { options: ['normal(auto)', 'tree(auto)', 'normal(manual)', 'tree(manual)'] });
p('process', 'support', 'support', 'support_threshold_angle', 'int', 'advanced', ['Ángulo de voladizo', 'Desde qué inclinación se pone soporte.'], ['Overhang angle', 'Slope beyond which support is added.'], { unit: '°', min: 0, max: 90 });
p('process', 'support', 'support', 'support_on_build_plate_only', 'bool', 'advanced', ['Solo desde la cama', 'No apoya soportes sobre la propia pieza.'], ['Build plate only', 'Does not rest supports on the part itself.']);
p('process', 'support', 'support', 'support_speed', 'number', 'expert', ['Velocidad de soporte', 'Más rápida ahorra tiempo.'], ['Support speed', 'Faster saves time.'], { unit: 'mm/s', min: 1, max: 500 });
p('process', 'support', 'adhesion', 'brim_type', 'select', 'simple', ['Borde (brim)', 'Aro alrededor de la base para evitar que se despegue.'], ['Brim', 'A ring around the base to prevent lifting.'], { options: ['no_brim', 'auto_brim', 'outer_only', 'inner_only', 'outer_and_inner'] });
p('process', 'support', 'adhesion', 'brim_width', 'number', 'advanced', ['Ancho del borde', 'Qué tan ancho es el aro.'], ['Brim width', 'How wide the ring is.'], { unit: 'mm', min: 0, max: 50 });
p('process', 'support', 'adhesion', 'skirt_loops', 'int', 'advanced', ['Vueltas de falda', 'Líneas de limpieza alrededor de la pieza antes de empezar.'], ['Skirt loops', 'Purge lines around the part before starting.'], { min: 0, max: 20 });
p('process', 'support', 'adhesion', 'spiral_mode', 'bool', 'advanced', ['Modo jarrón (espiral)', 'Una sola pared continua, sin costura; para piezas huecas.'], ['Vase mode (spiral)', 'One continuous wall, no seam; for hollow parts.']);
p('process', 'support', 'other', 'print_sequence', 'select', 'expert', ['Secuencia de impresión', 'Por capa (todas a la vez) o por objeto (una tras otra).'], ['Print sequence', 'By layer (all together) or by object (one after another).'], { options: ['by layer', 'by object'] });
/* ── Filamento ── */
p('filament', 'temps', 'nozzle', 'nozzle_temperature', 'int', 'simple', ['Temperatura de boquilla', 'Según el fabricante; sube si hay mala unión entre capas.'], ['Nozzle temperature', 'As per the maker; raise it for weak layer bonding.'], { unit: '°C', min: 150, max: 400 });
p('filament', 'temps', 'nozzle', 'nozzle_temperature_initial_layer', 'int', 'advanced', ['Boquilla en primera capa', 'Algo más alta ayuda a pegar.'], ['First layer nozzle temp', 'A bit higher helps adhesion.'], { unit: '°C', min: 150, max: 400 });
p('filament', 'temps', 'bed', 'hot_plate_temp', 'int', 'simple', ['Cama (placa lisa)', 'Temperatura de la cama con placa lisa.'], ['Bed (smooth plate)', 'Bed temperature on a smooth plate.'], { unit: '°C', min: 0, max: 130 });
p('filament', 'temps', 'bed', 'textured_plate_temp', 'int', 'simple', ['Cama (placa texturada)', 'Temperatura de la cama con placa texturada.'], ['Bed (textured plate)', 'Bed temperature on a textured plate.'], { unit: '°C', min: 0, max: 130 });
p('filament', 'temps', 'bed', 'cool_plate_temp', 'int', 'advanced', ['Cama (placa fría)', 'Temperatura con placa fría.'], ['Bed (cool plate)', 'Temperature on a cool plate.'], { unit: '°C', min: 0, max: 130 });
p('filament', 'flow', 'flow', 'filament_flow_ratio', 'number', 'simple', ['Ratio de flujo', 'Corrige sobre/subextrusión; calíbralo por material.'], ['Flow ratio', 'Corrects over/under-extrusion; calibrate per material.'], { min: 0.5, max: 1.5 });
p('filament', 'flow', 'flow', 'filament_max_volumetric_speed', 'number', 'simple', ['Caudal máximo', 'Tope de material por segundo; limita la velocidad en capas gruesas.'], ['Max volumetric speed', 'Cap on material per second; limits speed on thick layers.'], { unit: 'mm³/s', min: 1, max: 100 });
p('filament', 'flow', 'pa', 'enable_pressure_advance', 'bool', 'advanced', ['Avance de presión', 'Compensa la presión en la boquilla en esquinas.'], ['Pressure advance', 'Compensates nozzle pressure in corners.']);
p('filament', 'flow', 'pa', 'pressure_advance', 'number', 'expert', ['Valor de avance de presión', 'Calibrado por material.'], ['Pressure advance value', 'Calibrated per material.'], { min: 0, max: 2 });
p('filament', 'cooling', 'fan', 'fan_min_speed', 'percent', 'simple', ['Ventilador mínimo', 'Enfriamiento base de la pieza.'], ['Minimum fan', 'Base part cooling.'], { unit: '%', min: 0, max: 100 });
p('filament', 'cooling', 'fan', 'fan_max_speed', 'percent', 'advanced', ['Ventilador máximo', 'Enfriamiento en capas rápidas.'], ['Maximum fan', 'Cooling on fast layers.'], { unit: '%', min: 0, max: 100 });
p('filament', 'cooling', 'fan', 'overhang_fan_speed', 'percent', 'advanced', ['Ventilador en voladizos', 'Más aire mejora los voladizos.'], ['Overhang fan', 'More air improves overhangs.'], { unit: '%', min: 0, max: 100 });
p('filament', 'cooling', 'fan', 'close_fan_the_first_x_layers', 'int', 'advanced', ['Sin ventilador las primeras capas', 'Mejora la adhesión.'], ['No fan first layers', 'Improves adhesion.'], { min: 0, max: 20 });
p('filament', 'cooling', 'fan', 'slow_down_layer_time', 'int', 'advanced', ['Tiempo mínimo de capa', 'Bajo este tiempo, desacelera para enfriar.'], ['Minimum layer time', 'Below this, slows down to cool.'], { unit: 's', min: 0, max: 60 });
p('filament', 'material', 'info', 'filament_density', 'number', 'simple', ['Densidad', 'Define los gramos del cálculo.'], ['Density', 'Drives the grams estimate.'], { unit: 'g/cm³', min: 0.5, max: 5 });
p('filament', 'material', 'info', 'filament_cost', 'number', 'simple', ['Costo por kg', 'Referencia de costo en el laminador.'], ['Cost per kg', 'Cost reference inside the slicer.'], { unit: '$/kg', min: 0 });
/* ── Máquina ── */
p('machine', 'motion', 'retraction', 'retraction_length', 'number', 'simple', ['Retracción', 'Cuánto retrae el filamento al viajar.'], ['Retraction', 'How far the filament is pulled back on travel.'], { unit: 'mm', min: 0, max: 20 });
p('machine', 'motion', 'retraction', 'retraction_speed', 'number', 'advanced', ['Velocidad de retracción', 'Qué tan rápido retrae.'], ['Retraction speed', 'How fast it retracts.'], { unit: 'mm/s', min: 1, max: 200 });
p('machine', 'motion', 'retraction', 'z_hop', 'number', 'advanced', ['Salto en Z', 'Levanta la boquilla al viajar.'], ['Z hop', 'Lifts the nozzle on travel.'], { unit: 'mm', min: 0, max: 5 });
p('machine', 'limits', 'nozzle', 'min_layer_height', 'number', 'advanced', ['Capa mínima', 'Límite inferior de la impresora.'], ['Minimum layer height', 'Printer lower limit.'], { unit: 'mm', min: 0.01, max: 1 });
p('machine', 'limits', 'nozzle', 'max_layer_height', 'number', 'advanced', ['Capa máxima', 'Límite superior de la impresora.'], ['Maximum layer height', 'Printer upper limit.'], { unit: 'mm', min: 0.05, max: 2 });
p('machine', 'limits', 'volume', 'printable_height', 'number', 'advanced', ['Altura imprimible', 'Altura máxima de la pieza.'], ['Printable height', 'Maximum part height.'], { unit: 'mm', min: 10, max: 2000 });

export const PARAMS: readonly ParamDef[] = D;
export const PARAM_BY_KEY: ReadonlyMap<string, ParamDef> = new Map(D.map((x) => [`${x.type}:${x.key}`, x]));
export const PAGES: Record<ParamType, Array<{ id: string; es: string; en: string }>> = {
  process: [{ id: 'quality', es: 'Calidad', en: 'Quality' }, { id: 'strength', es: 'Resistencia', en: 'Strength' }, { id: 'speed', es: 'Velocidad', en: 'Speed' }, { id: 'support', es: 'Soportes y base', en: 'Support & base' }],
  filament: [{ id: 'temps', es: 'Temperaturas', en: 'Temperatures' }, { id: 'flow', es: 'Flujo', en: 'Flow' }, { id: 'cooling', es: 'Enfriamiento', en: 'Cooling' }, { id: 'material', es: 'Material', en: 'Material' }],
  machine: [{ id: 'motion', es: 'Movimiento', en: 'Motion' }, { id: 'limits', es: 'Límites', en: 'Limits' }],
};
