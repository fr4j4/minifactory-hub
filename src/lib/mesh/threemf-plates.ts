import { strFromU8, unzipSync } from 'fflate';
import { XMLParser } from 'fast-xml-parser';

/** Una placa de impresión de un proyecto Bambu Studio / OrcaSlicer: qué instancias de objeto contiene. */
export interface PlateInfo {
  /** número de placa, 1…n (`plater_id` en model_settings.config; si falta, su posición) */
  index: number;
  name: string;
  /** instancias del proyecto que van en esta placa: objeto y su instancia (0…n dentro del objeto) */
  instances: Array<{ objectId: string; instanceId: number }>;
}

const arr = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/**
 * Lee las placas de `Metadata/model_settings.config`. Devuelve [] si el archivo no declara placas (3MF sencillos,
 * PrusaSlicer, exportaciones sin proyecto): en ese caso todo el modelo es una única placa.
 */
export function listPlates(buf: Uint8Array): PlateInfo[] {
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(buf, { filter: (f) => /^metadata\/model_settings\.config$/i.test(f.name) }); } catch { return []; }
  const key = Object.keys(files)[0];
  if (!key) return [];
  const cfg = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', isArray: (n) => ['plate', 'model_instance', 'metadata'].includes(n) })
    .parse(strFromU8(files[key]))?.config;
  const plates: PlateInfo[] = [];
  arr<any>(cfg?.plate).forEach((p, pos) => {
    const md = (k: string) => arr<any>(p.metadata).find((m) => m['@_key'] === k)?.['@_value'];
    const id = Number(md('plater_id'));
    const perObject = new Map<string, number>(); // instancias contadas por objeto, para la numeración
    const instances = arr<any>(p.model_instance).map((mi) => {
      const meta = (k: string) => arr<any>(mi.metadata).find((m) => m['@_key'] === k)?.['@_value'];
      const objectId = String(meta('object_id'));
      const instanceId = Number(meta('instance_id') ?? perObject.get(objectId) ?? 0);
      perObject.set(objectId, (perObject.get(objectId) ?? 0) + 1);
      return { objectId, instanceId };
    });
    plates.push({ index: Number.isFinite(id) && id >= 1 ? id : pos + 1, name: String(md('plater_name') ?? ''), instances });
  });
  return plates;
}
