import { SIMPLE_PARAMS, type ProfileKind } from './params';
import { LocalizedError } from '@/i18n/errors';

const INTEGER_KEYS = new Set(['wall_loops', 'top_shell_layers', 'bottom_shell_layers']);
const scalar = (v: unknown) => (Array.isArray(v) ? v[0] : v);

/**
 * Limpia los cambios que llegan del editor antes de guardarlos:
 *  - quita vacíos,
 *  - acepta coma decimal («0,2» → «0.2») en los campos numéricos,
 *  - rechaza texto en los campos que deben ser números,
 *  - el relleno siempre con «%».
 * Los valores que ya vienen como lista (importados) se respetan tal cual.
 */
export function cleanChanges(type: ProfileKind, changes: Record<string, any>): Record<string, any> {
  const spec = new Map(SIMPLE_PARAMS[type].map((p) => [p.key, p]));
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(changes ?? {})) {
    if (v === '' || v === null || v === undefined) continue;
    const p = spec.get(k);
    if (!p || Array.isArray(v) || typeof v === 'object') { out[k] = v; continue; }
    const t = String(v).trim();
    if (p.kind === 'number') {
      const n = t.replace(',', '.');
      if (!/^-?\d+(\.\d+)?$/.test(n)) throw new LocalizedError('nozzle.valNumber', { field: p.label, value: t });
      if (Number(n) < 0) throw new LocalizedError('nozzle.valNegative', { field: p.label });
      if (INTEGER_KEYS.has(k) && !/^\d+$/.test(n)) throw new LocalizedError('nozzle.valInteger', { field: p.label });
      out[k] = n;
    } else if (k === 'sparse_infill_density') {
      const n = t.replace(',', '.').replace(/%$/, '');
      if (!/^\d+(\.\d+)?$/.test(n) || Number(n) > 100) throw new LocalizedError('nozzle.valPercent');
      out[k] = `${n}%`;
    } else if (p.kind === 'select' && p.options && !p.options.includes(t)) {
      throw new LocalizedError('nozzle.valOption', { field: p.label, value: t });
    } else out[k] = t;
  }
  return out;
}

/** Valor numérico de una clave (si viene en lista, el primero). */
export function numOf(v: unknown): number | null { const x = Number(String(scalar(v) ?? '').replace(',', '.')); return Number.isFinite(x) && String(scalar(v) ?? '') !== '' ? x : null; }
