/**
 * Catálogo inicial de marcas y líneas de filamento para el alta masiva (N4). Son datos de partida, editables por el taller;
 * las marcas de Chile (Cicla 3D, GST3D, PopBit…) están por confirmar con cada proveedor (ver docs/mejoras/11-datos-iniciales-proveedores.md).
 */
export interface BrandLine { line: string; type: string; density?: number }
export interface Brand { id: string; name: string; origin: 'CL' | 'INT'; verified: boolean; lines: BrandLine[] }

/** Densidad típica por tipo (g/cm³). */
export const DENSITY: Record<string, number> = { PLA: 1.24, 'PLA+': 1.24, PETG: 1.27, ABS: 1.04, ASA: 1.07, TPU: 1.21, PA: 1.14, PC: 1.2, PVA: 1.23, HIPS: 1.04 };
export const densityOf = (type: string) => DENSITY[type.toUpperCase().trim()] ?? 1.24;

const std = (extra: BrandLine[] = []): BrandLine[] => [{ line: 'PLA', type: 'PLA' }, { line: 'PLA+', type: 'PLA' }, { line: 'PETG', type: 'PETG' }, { line: 'TPU 95A', type: 'TPU' }, ...extra];
export const BRANDS: Brand[] = [
  { id: 'bambu', name: 'Bambu Lab', origin: 'INT', verified: false, lines: [{ line: 'PLA Basic', type: 'PLA' }, { line: 'PLA Matte', type: 'PLA' }, { line: 'PLA Lite', type: 'PLA' }, { line: 'PLA Silk', type: 'PLA', density: 1.31 }, { line: 'PETG Basic', type: 'PETG' }, { line: 'PETG HF', type: 'PETG' }, { line: 'ABS', type: 'ABS' }, { line: 'ASA', type: 'ASA' }, { line: 'TPU 95A HF', type: 'TPU' }] },
  { id: 'sunlu', name: 'SUNLU', origin: 'INT', verified: false, lines: std([{ line: 'PLA Meta', type: 'PLA' }, { line: 'Silk PLA', type: 'PLA', density: 1.26 }]) },
  { id: 'esun', name: 'eSUN', origin: 'INT', verified: false, lines: std([{ line: 'PLA-Silk', type: 'PLA', density: 1.26 }, { line: 'ABS+', type: 'ABS' }]) },
  { id: 'elegoo', name: 'Elegoo', origin: 'INT', verified: false, lines: std([{ line: 'RAPID PLA+', type: 'PLA' }]) },
  { id: 'creality', name: 'Creality', origin: 'INT', verified: false, lines: [{ line: 'Hyper PLA', type: 'PLA' }, { line: 'CR-PLA', type: 'PLA' }, { line: 'CR-PETG', type: 'PETG' }, { line: 'CR-TPU', type: 'TPU' }] },
  { id: 'polymaker', name: 'Polymaker', origin: 'INT', verified: false, lines: [{ line: 'PolyLite PLA', type: 'PLA' }, { line: 'PolyTerra PLA', type: 'PLA' }, { line: 'PolyLite PETG', type: 'PETG' }, { line: 'PolyLite ASA', type: 'ASA' }] },
  { id: 'grilon3', name: 'Grilon3', origin: 'INT', verified: false, lines: [{ line: 'PLA', type: 'PLA' }, { line: 'PETG', type: 'PETG' }, { line: 'ABS', type: 'ABS' }, { line: 'TPU', type: 'TPU' }] },
  { id: 'cicla3d', name: 'Cicla 3D', origin: 'CL', verified: false, lines: [{ line: 'PLA reciclado', type: 'PLA' }, { line: 'Cicla NANO (antimicrobiano)', type: 'PLA' }] },
  { id: 'gst3d', name: 'GST3D', origin: 'INT', verified: false, lines: std() },
  { id: 'flashforge', name: 'Flashforge', origin: 'INT', verified: false, lines: [{ line: 'PLA', type: 'PLA' }, { line: 'PETG', type: 'PETG' }, { line: 'ABS', type: 'ABS' }] },
  { id: 'popbit', name: 'PopBit', origin: 'INT', verified: false, lines: std() },
  { id: 'hello3d', name: 'Hello3D', origin: 'INT', verified: false, lines: std() },
  { id: 'plastar', name: 'Plast Ar', origin: 'INT', verified: false, lines: [{ line: 'PLA', type: 'PLA' }, { line: 'PETG', type: 'PETG' }] },
  { id: 'macrotec', name: 'Macrotec', origin: 'INT', verified: false, lines: [{ line: 'PLA', type: 'PLA' }, { line: 'PETG', type: 'PETG' }] },
  { id: 'hatchbox', name: 'Hatchbox', origin: 'INT', verified: false, lines: [{ line: 'PLA', type: 'PLA' }, { line: 'PETG', type: 'PETG' }, { line: 'ABS', type: 'ABS' }] },
  { id: 'safeandsound', name: 'Safe and Sound', origin: 'CL', verified: false, lines: [{ line: 'PLA', type: 'PLA' }] },
  { id: 'generico', name: 'Genérico', origin: 'INT', verified: true, lines: [{ line: 'PLA', type: 'PLA' }, { line: 'PLA+', type: 'PLA' }, { line: 'PETG', type: 'PETG' }, { line: 'ABS', type: 'ABS' }, { line: 'ASA', type: 'ASA' }, { line: 'TPU', type: 'TPU' }] },
];
/** Colores que casi toda marca ofrece: punto de partida de la tabla. */
export const BASIC_COLORS = ['Negro', 'Blanco', 'Gris', 'Rojo', 'Azul', 'Verde', 'Amarillo', 'Naranja'];
