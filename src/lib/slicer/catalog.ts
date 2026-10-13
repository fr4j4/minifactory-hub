import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';

export type ProfileType = 'machine' | 'process' | 'filament';
export interface FactoryEntry {
  vendor: string; type: ProfileType; name: string; file: string; inherits?: string; instantiation: boolean;
  compatiblePrinters: string[]; printerModel?: string; nozzle?: string;
}

/** Índice de perfiles de fábrica de OrcaSlicer (Bambu Lab, Prusa, Creality, Elegoo, Anycubic…). */
const g = globalThis as unknown as { __orcaIdx?: Index };
interface Index {
  all: FactoryEntry[];
  byKey: Map<string, FactoryEntry>;          // type|vendor|name
  byName: Map<string, FactoryEntry[]>;       // type|name
  vendors: string[];
}

export function orcaAvailable() {
  return fs.existsSync(config.orcaBin) && fs.existsSync(config.orcaProfilesDir);
}

function readJson(p: string): any | null { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }

export function getIndex(): Index {
  if (g.__orcaIdx) return g.__orcaIdx;
  const all: FactoryEntry[] = [];
  const cacheFile = path.join(config.dataDir, 'orca-index.json');
  try {
    const st = fs.statSync(config.orcaProfilesDir);
    if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).mtimeMs > st.mtimeMs) {
      const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as FactoryEntry[];
      return (g.__orcaIdx = build(c));
    }
  } catch { /* sin caché */ }
  if (fs.existsSync(config.orcaProfilesDir)) {
    for (const vendor of fs.readdirSync(config.orcaProfilesDir, { withFileTypes: true })) {
      if (!vendor.isDirectory()) continue;
      for (const type of ['machine', 'process', 'filament'] as ProfileType[]) {
        const dir = path.join(config.orcaProfilesDir, vendor.name, type);
        if (!fs.existsSync(dir)) continue;
        for (const f of fs.readdirSync(dir)) {
          if (!f.endsWith('.json')) continue;
          const d = readJson(path.join(dir, f));
          if (!d || typeof d.name !== 'string') continue;
          const cp = Array.isArray(d.compatible_printers) ? d.compatible_printers : [];
          all.push({
            vendor: vendor.name, type, name: d.name, file: path.join(vendor.name, type, f), inherits: d.inherits || undefined,
            instantiation: String(d.instantiation) === 'true', compatiblePrinters: cp, printerModel: d.printer_model,
            nozzle: Array.isArray(d.nozzle_diameter) ? d.nozzle_diameter[0] : undefined,
          });
        }
      }
    }
    try { fs.mkdirSync(config.dataDir, { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify(all)); } catch { /* ok */ }
  }
  return (g.__orcaIdx = build(all));
}

function build(all: FactoryEntry[]): Index {
  const byKey = new Map<string, FactoryEntry>(); const byName = new Map<string, FactoryEntry[]>();
  for (const e of all) {
    byKey.set(`${e.type}|${e.vendor}|${e.name}`, e);
    const k = `${e.type}|${e.name}`; (byName.get(k) ?? byName.set(k, []).get(k)!).push(e);
  }
  return { all, byKey, byName, vendors: [...new Set(all.map((e) => e.vendor))].sort() };
}

export function listVendors() { return getIndex().vendors; }
export function listFactory(type: ProfileType, vendor: string, opts: { machine?: string; q?: string } = {}) {
  const idx = getIndex();
  let rows = idx.all.filter((e) => e.type === type && e.vendor === vendor && e.instantiation);
  if (type !== 'machine' && opts.machine) {
    const withList = rows.filter((e) => e.compatiblePrinters.includes(opts.machine!));
    if (withList.length) rows = withList;
  }
  if (type === 'filament' && !opts.machine) {
    const lib = idx.all.filter((e) => e.type === 'filament' && e.vendor === 'OrcaFilamentLibrary' && e.instantiation);
    if (vendor === 'OrcaFilamentLibrary') rows = lib;
  }
  if (opts.q) { const q = opts.q.toLowerCase(); rows = rows.filter((e) => e.name.toLowerCase().includes(q)); }
  return rows.slice(0, 400).map((e) => ({ name: e.name, vendor: e.vendor, nozzle: e.nozzle, printerModel: e.printerModel }));
}

function readFactory(e: FactoryEntry) { return readJson(path.join(config.orcaProfilesDir, e.file)) ?? {}; }

function findEntry(type: ProfileType, name: string, preferVendor?: string): FactoryEntry | undefined {
  const idx = getIndex();
  if (preferVendor) { const e = idx.byKey.get(`${type}|${preferVendor}|${name}`); if (e) return e; }
  const list = idx.byName.get(`${type}|${name}`);
  if (!list?.length) return undefined;
  return list.find((e) => e.vendor === 'OrcaFilamentLibrary') ?? list[0];
}

/** Perfil completo de fábrica: sigue la cadena `inherits` y la aplana. */
export function resolveFactory(type: ProfileType, name: string, vendor?: string): Record<string, any> {
  const chain: Array<Record<string, any>> = [];
  let cur = findEntry(type, name, vendor);
  if (!cur) throw new Error(`Perfil de fábrica no encontrado: ${type} "${name}"${vendor ? ` (${vendor})` : ''}`);
  const v = cur.vendor;
  let guard = 0;
  while (cur && guard++ < 12) {
    chain.push(readFactory(cur));
    cur = cur.inherits ? findEntry(type, cur.inherits, v) : undefined;
  }
  const out: Record<string, any> = {};
  for (const c of chain.reverse()) Object.assign(out, c);
  return out;
}

export function findVendorOf(type: ProfileType, name: string): string | undefined { return findEntry(type, name)?.vendor; }

/** Coerciona un valor del editor al tipo del valor base (las claves de Orca son cadenas o listas de cadenas). */
export function coerceLike(base: unknown, val: unknown): unknown {
  if (Array.isArray(base)) {
    if (Array.isArray(val)) return val.map(String);
    return base.map(() => String(val));
  }
  if (typeof base === 'string') return String(val);
  return val;
}

export function applyChanges(base: Record<string, any>, changes: Record<string, any>) {
  const out = { ...base };
  for (const [k, v] of Object.entries(changes)) out[k] = coerceLike(base[k], v);
  return out;
}

/** Perfil listo para el CLI: base + cambios, con compatibilidad declarada para la máquina elegida. */
export function buildCliProfile(type: ProfileType, o: { name: string; vendor?: string; baseName: string; changes: Record<string, any>; machineName?: string }) {
  const base = resolveFactory(type, o.baseName, o.vendor);
  const prof = applyChanges(base, o.changes);
  delete prof.inherits; delete prof.instantiation; delete prof.setting_id;
  prof.name = o.name; prof.type = type; prof.from = 'system';
  if (type === 'machine') prof.printer_settings_id = o.name;
  if (type === 'process') { prof.print_settings_id = o.name; if (o.machineName) { prof.compatible_printers = [o.machineName]; prof.compatible_printers_condition = ''; } }
  if (type === 'filament') { prof.filament_settings_id = [o.name]; if (o.machineName) { prof.compatible_printers = [o.machineName]; prof.compatible_printers_condition = ''; } }
  return prof;
}

/** Parámetros del editor simple (los que mueven el costo). */
export const SIMPLE_PARAMS: Record<ProfileType, Array<{ key: string; label: string; kind: 'number' | 'select' | 'text'; unit?: string; options?: string[]; help?: string }>> = {
  machine: [
    { key: 'machine_max_acceleration_x', label: 'Aceleración máx. X', kind: 'number', unit: 'mm/s²' },
    { key: 'machine_max_speed_x', label: 'Velocidad máx. X', kind: 'number', unit: 'mm/s' },
    { key: 'printable_area', label: 'Área imprimible (lista de puntos)', kind: 'text' },
    { key: 'printable_height', label: 'Altura imprimible', kind: 'number', unit: 'mm' },
  ],
  process: [
    { key: 'layer_height', label: 'Altura de capa', kind: 'number', unit: 'mm' },
    { key: 'initial_layer_print_height', label: 'Altura primera capa', kind: 'number', unit: 'mm' },
    { key: 'wall_loops', label: 'Perímetros (paredes)', kind: 'number' },
    { key: 'sparse_infill_density', label: 'Relleno', kind: 'text', unit: '%', help: 'Ej. 15%' },
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
    { key: 'filament_cost', label: 'Costo', kind: 'number', unit: '$/kg' },
    { key: 'fan_min_speed', label: 'Ventilador mín.', kind: 'number', unit: '%' },
  ],
};
