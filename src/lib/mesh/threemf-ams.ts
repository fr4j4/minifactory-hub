import { strFromU8, unzipSync } from 'fflate';
import { XMLParser } from 'fast-xml-parser';

/** Un filamento (ranura de AMS) declarado en un proyecto de Bambu Studio / OrcaSlicer. */
export interface AmsFilament { index: number; color: string; type: string | null; used: boolean }
export interface AmsInfo {
  filaments: AmsFilament[];
  /** extrusor (1…n) asignado a cada objeto de la placa, por id de objeto del 3MF */
  objects: Array<{ id: string; name: string; extruder: number }>;
  /** true si algún triángulo lleva pintura por cara (`paint_color`): hay más colores de los que se pueden asignar por objeto */
  painted: boolean;
  multicolor: boolean;
}

const arr = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const hex = (c: unknown) => { const m = /^#?([0-9a-f]{6})/i.exec(String(c ?? '')); return m ? `#${m[1].toLowerCase()}` : '#888888'; };

/**
 * Lee de un 3MF de Bambu/Orca los colores y materiales por ranura (`filament_colour`, `filament_type` en project_settings.config)
 * y el extrusor de cada objeto (`extruder` en model_settings.config). Devuelve null si el archivo no trae esa información.
 */
export function parseAms(buf: Uint8Array): AmsInfo | null {
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(buf, { filter: (f) => /^(metadata\/(project_settings|model_settings)\.config|3d\/.*\.model)$/i.test(f.name) }); } catch { return null; }
  const get = (n: string) => { const k = Object.keys(files).find((x) => x.toLowerCase() === n.toLowerCase()); return k ? strFromU8(files[k]) : null; };
  const ps = get('Metadata/project_settings.config'); const ms = get('Metadata/model_settings.config');
  if (!ps && !ms) return null;
  let colours: string[] = []; let types: string[] = [];
  if (ps) { try { const j = JSON.parse(ps); colours = arr<string>(j.filament_colour).map(hex); types = arr<string>(j.filament_type).map(String); } catch { /* config ilegible */ } }
  const objects: AmsInfo['objects'] = [];
  if (ms) {
    const xp = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', isArray: (n) => ['object', 'metadata', 'part'].includes(n) });
    const cfg = xp.parse(ms)?.config;
    for (const o of arr<any>(cfg?.object)) {
      const md = (k: string) => arr<any>(o.metadata).find((m) => m['@_key'] === k)?.['@_value'];
      const ext = Number(md('extruder') ?? 1);
      objects.push({ id: String(o['@_id']), name: String(md('name') ?? ''), extruder: Number.isFinite(ext) && ext >= 1 ? Math.floor(ext) : 1 });
    }
  }
  if (!colours.length && !objects.length) return null;
  const usedSet = new Set(objects.map((o) => o.extruder));
  const painted = Object.entries(files).some(([n, d]) => /\.model$/i.test(n) && strFromU8(d).includes('paint_color='));
  const n = Math.max(colours.length, ...usedSet, 0);
  const filaments: AmsFilament[] = Array.from({ length: n }, (_, i) => ({ index: i + 1, color: colours[i] ?? '#888888', type: types[i] ?? null, used: usedSet.has(i + 1) }));
  return { filaments, objects, painted, multicolor: usedSet.size > 1 || painted };
}
