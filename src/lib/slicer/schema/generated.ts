import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config';
import type { ParamDef } from './params';

let cache: { mtime: number; params: ParamDef[] } | null = null;
/** Parámetros ampliados generados al instalar OrcaSlicer (`scripts/gen-orca-schema.ts`). Vacío si no se generó. */
export function loadGeneratedParams(): ParamDef[] {
  const file = path.join(config.dataDir, 'orca-schema.json');
  try {
    const st = fs.statSync(file); if (cache?.mtime === st.mtimeMs) return cache.params;
    const j = JSON.parse(fs.readFileSync(file, 'utf8')); const params = Array.isArray(j.params) ? (j.params as ParamDef[]) : [];
    cache = { mtime: st.mtimeMs, params }; return params;
  } catch { return []; }
}
