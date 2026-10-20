import { strFromU8, unzipSync } from 'fflate';
import { findVendorOf, getIndex, type ProfileType } from './catalog';
import { tDefault } from '@/i18n/errors';
import type { TFn } from '@/i18n/translate';
import { LocalizedError } from '@/i18n/errors';

/**
 * Importación de perfiles desde Bambu Studio / OrcaSlicer sin pedir JSON a mano. Acepta:
 *  - Proyecto .3mf: trae los tres perfiles en Metadata/project_settings.config. Si el perfil es del
 *    usuario, `inherits_group` dice de qué perfil de fábrica deriva y `different_settings_to_system`
 *    qué claves cambió (orden: proceso, filamentos…, impresora).
 *  - Paquete .bbscfg (impresora) / .bbsflmt (filamento) / .zip: ZIP con perfiles .json (y a veces ZIP anidados).
 *  - Perfil .json exportado o copiado de la carpeta de usuario.
 * Todo termina como «perfil de fábrica de OrcaSlicer + cambios», igual que los perfiles creados en el sitio.
 */
export interface Candidate {
  key: string; type: ProfileType; name: string; baseName: string | null; changes: Record<string, any>;
  source: string; note: string | null; ok: boolean;
}

const META = new Set(['inherits', 'name', 'from', 'version', 'is_custom_defined', 'setting_id', 'instantiation', 'type', 'print_settings_id', 'printer_settings_id', 'filament_settings_id',
  'compatible_printers', 'compatible_printers_condition', 'compatible_prints', 'compatible_prints_condition', 'filament_id', 'base_id', 'user_id', 'updated_time', 'inherits_group', 'different_settings_to_system', 'print_compatible_printers', 'upward_compatible_machine']);
const typeOf = (d: any, hint?: string): ProfileType | null => {
  if (d?.type === 'machine' || d?.type === 'process' || d?.type === 'filament') return d.type;
  if (d?.type === 'printer') return 'machine';
  if (d?.printer_settings_id != null || d?.printer_model != null && d?.printable_area != null) return 'machine';
  if (d?.print_settings_id != null || d?.layer_height != null && d?.wall_loops != null) return 'process';
  if (d?.filament_settings_id != null || d?.filament_type != null || d?.nozzle_temperature != null) return 'filament';
  if (hint) { if (/machine|printer/i.test(hint)) return 'machine'; if (/process|print/i.test(hint)) return 'process'; if (/filament/i.test(hint)) return 'filament'; }
  return null;
};
const isFactory = (type: ProfileType, name?: string | null) => !!name && !!findVendorOf(type, name);
function commonBase(type: ProfileType) { return getIndex().all.find((e) => e.type === type && /^fdm_.*common$/.test(e.name))?.name ?? null; }

/** Une perfiles de usuario que heredan de otros del mismo paquete hasta llegar a uno de fábrica. */
function resolveChains(list: Array<{ type: ProfileType; name: string; inherits: string | null; changes: Record<string, any>; source: string }>, t: TFn): Candidate[] {
  return list.map((p, i) => {
    let base = p.inherits; let changes = { ...p.changes }; let guard = 0; const via: string[] = [];
    while (base && !isFactory(p.type, base) && guard++ < 8) {
      const parent = list.find((x) => x.type === p.type && x.name === base); if (!parent) break;
      via.push(parent.name); changes = { ...parent.changes, ...changes }; base = parent.inherits;
    }
    let note: string | null = via.length ? t('slicer.inheritsFrom', { chain: via.join(' → ') }) : null; let ok = true;
    if (!base || !isFactory(p.type, base)) {
      const fb = commonBase(p.type);
      note = base ? t('slicer.baseMissing', { base }) : t('slicer.noBase');
      if (!fb) ok = false; base = fb;
    }
    return { key: `${p.type}:${p.name}:${i}`, type: p.type, name: p.name, baseName: base, changes, source: p.source, note, ok };
  });
}

function fromJson(d: any, source: string, hint?: string) {
  const type = typeOf(d, hint); if (!type) return null;
  const changes: Record<string, any> = {}; for (const [k, v] of Object.entries(d)) if (!META.has(k)) changes[k] = v;
  return { type, name: String(d.name ?? source.replace(/\.json$/i, '').split('/').pop()), inherits: d.inherits ? String(d.inherits) : null, changes, source };
}

function from3mf(buf: Uint8Array, source: string) {
  const files = unzipSync(buf, { filter: (f) => f.name === 'Metadata/project_settings.config' });
  const raw = files['Metadata/project_settings.config']; if (!raw) throw new LocalizedError('slicer.import3mfNoConfig', { source });
  const c = JSON.parse(strFromU8(raw)) as Record<string, any>;
  const filIds: string[] = Array.isArray(c.filament_settings_id) ? c.filament_settings_id : c.filament_settings_id ? [c.filament_settings_id] : [];
  const groups: string[] = Array.isArray(c.inherits_group) ? c.inherits_group : [];
  const diffs: string[] = Array.isArray(c.different_settings_to_system) ? c.different_settings_to_system : [];
  const out: Array<{ type: ProfileType; name: string; inherits: string | null; changes: Record<string, any>; source: string }> = [];
  const pick = (keys: string[], slot?: number) => Object.fromEntries(keys.filter((k) => k && c[k] !== undefined && !META.has(k)).map((k) => [k, slot != null && Array.isArray(c[k]) ? [c[k][slot] ?? c[k][0]] : c[k]]));
  const add = (type: ProfileType, id: string | undefined, gi: number, slot?: number) => {
    if (!id) return;
    const parent = groups[gi] || null; const keys = (diffs[gi] ?? '').split(';').filter(Boolean);
    // perfil de fábrica tal cual (parent vacío) o perfil del usuario derivado de `parent` con esas claves cambiadas
    out.push({ type, name: id, inherits: parent || id, changes: parent ? pick(keys, slot) : {}, source: `${source} (${type === 'machine' ? 'impresora' : type === 'process' ? 'proceso' : `filamento ${(slot ?? 0) + 1}`})` });
  };
  add('process', c.print_settings_id, 0);
  filIds.forEach((id, k) => { if (!filIds.slice(0, k).includes(id)) add('filament', id, 1 + k, k); });
  add('machine', c.printer_settings_id, 1 + filIds.length);
  return out;
}

function walkZip(buf: Uint8Array, source: string, depth = 0): Array<ReturnType<typeof fromJson>> {
  const files = unzipSync(buf); const out: Array<ReturnType<typeof fromJson>> = [];
  for (const [name, data] of Object.entries(files)) {
    if (/\.json$/i.test(name) && !/bundle_structure\.json$/i.test(name)) { try { out.push(fromJson(JSON.parse(strFromU8(data)), `${source} › ${name}`, name)); } catch { /* JSON inválido: se omite */ } }
    else if (/\.(zip|bbscfg|bbsflmt)$/i.test(name) && depth < 2) out.push(...walkZip(data, `${source} › ${name}`, depth + 1));
  }
  return out;
}

export function parsePresetFiles(files: Array<{ name: string; data: Uint8Array }>, t: TFn = tDefault): Candidate[] {
  const list: Array<{ type: ProfileType; name: string; inherits: string | null; changes: Record<string, any>; source: string }> = [];
  for (const f of files) {
    const ext = f.name.toLowerCase().split('.').pop();
    if (ext === '3mf') list.push(...from3mf(f.data, f.name));
    else if (ext === 'json') { let d: any; try { d = JSON.parse(strFromU8(f.data)); } catch { throw new LocalizedError('slicer.importBadJson', { file: f.name }); } const p = fromJson(d, f.name); if (p) list.push(p); else throw new LocalizedError('slicer.importNotProfile', { file: f.name }); }
    else if (['zip', 'bbscfg', 'bbsflmt'].includes(ext ?? '')) { const ps = walkZip(f.data, f.name).filter(Boolean) as NonNullable<ReturnType<typeof fromJson>>[]; if (!ps.length) throw new LocalizedError('slicer.importEmptyBundle', { file: f.name }); list.push(...ps); }
    else throw new LocalizedError('slicer.importUnsupported', { file: f.name });
  }
  // sin duplicados (mismo tipo y nombre): gana el último
  const seen = new Map<string, number>(); list.forEach((p, i) => seen.set(`${p.type}|${p.name}`, i));
  return resolveChains(list.filter((p, i) => seen.get(`${p.type}|${p.name}`) === i), t);
}
