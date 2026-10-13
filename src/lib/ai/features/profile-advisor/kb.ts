import type { FailCode } from '@/lib/production/fail-causes';
import type { Goal } from './score';

/**
 * Base de conocimiento de dominio (FDM): síntoma/objetivo → qué parámetros mover y en qué dirección.
 * Se usa (1) como contexto del prompt y (2) sin IA, para mostrar «qué probar» en la ficha de desempeño.
 * Mantenerla pequeña, revisable y en datos: es la principal defensa contra respuestas genéricas.
 */
export interface Move { key: string; dir: 'up' | 'down' | 'set'; step?: string; value?: string; materials?: string[] }
export interface Rule { id: string; cause?: FailCode; goal?: Goal; moves: Move[]; why: string; avoid?: string }

export const KB: Rule[] = [
  { id: 'despegue', cause: 'despegue', moves: [{ key: 'hot_plate_temp', dir: 'up', step: '+5 °C' }, { key: 'brim_type', dir: 'set', value: 'outer_only' }, { key: 'fan_min_speed', dir: 'down', step: '-20 %' }, { key: 'initial_layer_print_height', dir: 'up', step: '+0,04 mm' }],
    why: 'La primera capa necesita más adherencia: cama más caliente, borde (brim) y menos enfriamiento al inicio.', avoid: 'Subir mucho la cama con PLA (sobre ~65 °C ablanda la base).' },
  { id: 'warping', cause: 'warping', moves: [{ key: 'hot_plate_temp', dir: 'up', step: '+5 °C' }, { key: 'brim_type', dir: 'set', value: 'outer_and_inner' }, { key: 'fan_min_speed', dir: 'down', step: '-20 %' }],
    why: 'Las esquinas se levantan por contracción al enfriarse: mantener la pieza caliente y más agarre en la base.', avoid: 'En ABS/ASA sin recinto cerrado ningún parámetro lo resuelve del todo.' },
  { id: 'hilos', cause: 'hilos', moves: [{ key: 'nozzle_temperature', dir: 'down', step: '-5 °C' }, { key: 'outer_wall_speed', dir: 'up', step: '+20 mm/s' }],
    why: 'El filamento se escurre por exceso de temperatura; menos temperatura y desplazamientos más rápidos reducen los hilos.', avoid: 'Primero seca el filamento: la humedad produce hilos aunque los parámetros sean correctos.' },
  { id: 'capas_separadas', cause: 'capas_separadas', moves: [{ key: 'nozzle_temperature', dir: 'up', step: '+5 °C' }, { key: 'fan_min_speed', dir: 'down', step: '-20 %' }, { key: 'filament_flow_ratio', dir: 'up', step: '+0,02' }],
    why: 'Falta de fusión entre capas: más temperatura, menos ventilador y flujo suficiente.', avoid: 'No subir temperatura sin revisar el rango del material.' },
  { id: 'atasco', cause: 'atasco', moves: [{ key: 'nozzle_temperature', dir: 'up', step: '+5 °C' }, { key: 'outer_wall_speed', dir: 'down', step: '-20 mm/s' }],
    why: 'Si el caudal pedido supera lo que la boquilla puede fundir, se sub-extruye o se atasca: más temperatura o menos velocidad.' },
  { id: 'soportes', cause: 'soportes', moves: [{ key: 'support_type', dir: 'set', value: 'tree(auto)' }],
    why: 'Los soportes de árbol suelen separarse mejor y usan menos material.' },
  { id: 'superficie', cause: 'superficie', moves: [{ key: 'outer_wall_speed', dir: 'down', step: '-30 mm/s' }, { key: 'default_acceleration', dir: 'down', step: '-30 %' }, { key: 'layer_height', dir: 'down', step: '-0,04 mm' }],
    why: 'Resonancias y mala superficie se reducen con paredes exteriores lentas, menos aceleración y capas más finas.' },
  { id: 'meta-rapido', goal: 'rapido', moves: [{ key: 'layer_height', dir: 'up', step: '+0,04 mm' }, { key: 'sparse_infill_density', dir: 'down', step: '-5 %' }, { key: 'wall_loops', dir: 'down', step: '-1' }, { key: 'sparse_infill_pattern', dir: 'set', value: 'lightning' }],
    why: 'El tiempo lo dominan la altura de capa y el relleno; velocidades más altas solo ayudan si el caudal volumétrico del material lo permite.', avoid: 'No subir velocidades por encima del caudal máximo del filamento.' },
  { id: 'meta-resistente', goal: 'resistente', moves: [{ key: 'wall_loops', dir: 'up', step: '+1 o +2' }, { key: 'sparse_infill_density', dir: 'up', step: '+10 %' }, { key: 'sparse_infill_pattern', dir: 'set', value: 'gyroid' }, { key: 'top_shell_layers', dir: 'up', step: '+1' }],
    why: 'La resistencia viene sobre todo de las paredes; el relleno aporta menos. Gyroid/cúbico reparten mejor la carga.', avoid: 'Más relleno sin más paredes casi no mejora la resistencia.' },
  { id: 'meta-estetico', goal: 'estetico', moves: [{ key: 'layer_height', dir: 'down', step: '-0,04 mm' }, { key: 'outer_wall_speed', dir: 'down', step: '-30 mm/s' }, { key: 'default_acceleration', dir: 'down', step: '-30 %' }],
    why: 'Capas finas, pared exterior lenta y poca aceleración dan mejor acabado, a costa de tiempo.' },
  { id: 'meta-ahorro', goal: 'ahorro', moves: [{ key: 'sparse_infill_density', dir: 'down', step: '-5 %' }, { key: 'sparse_infill_pattern', dir: 'set', value: 'lightning' }, { key: 'support_type', dir: 'set', value: 'tree(auto)' }, { key: 'wall_loops', dir: 'down', step: '-1' }],
    why: 'El material se va en relleno, paredes y soportes; el relleno lightning y los soportes de árbol gastan menos.' },
];

export const rulesForCause = (c: FailCode) => KB.filter((r) => r.cause === c);
export const rulesForGoal = (g: Goal) => KB.filter((r) => r.goal === g);

/** Reglas relevantes al pedido, para inyectar en el prompt (síntomas reconocidos en el texto + objetivo). */
export function relevantRules(o: { goal?: Goal | null; causes?: FailCode[] }): Rule[] {
  const out: Rule[] = [];
  if (o.goal && o.goal !== 'equilibrado') out.push(...rulesForGoal(o.goal));
  for (const c of o.causes ?? []) out.push(...rulesForCause(c));
  return out;
}
