/**
 * Genera `data/orca-schema.json` (esquema ampliado de parámetros) desde el código fuente de OrcaSlicer de la versión instalada.
 * No se versiona (OrcaSlicer es AGPL-3.0). Se ejecuta al final de `npm run orca:install`; si no hay red, el esquema curado sigue funcionando.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/lib/config';
import { PARAMS } from '../src/lib/slicer/schema/params';
import { buildExtraParams, parsePresetLists, parsePrintConfig } from '../src/lib/slicer/schema/generate';

async function main() {
  const tag = process.env.ORCA_TAG || `v${process.env.ORCA_VERSION || '2.4.2'}`;
  const base = `https://raw.githubusercontent.com/SoftFever/OrcaSlicer/${tag}/src/libslic3r`;
  const get = async (f: string) => { const r = await fetch(`${base}/${f}`); if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`); return r.text(); };
  const [pc, pr] = await Promise.all([get('PrintConfig.cpp'), get('Preset.cpp')]);
  const extra = buildExtraParams(parsePrintConfig(pc), parsePresetLists(pr), new Set(PARAMS.map((p) => `${p.type}:${p.key}`)));
  fs.mkdirSync(config.dataDir, { recursive: true });
  const file = path.join(config.dataDir, 'orca-schema.json');
  fs.writeFileSync(file, JSON.stringify({ tag, generatedAt: new Date().toISOString(), params: extra }));
  console.log(`Esquema ampliado: ${extra.length} parámetros → ${file}`);
}
main().catch((e) => { console.warn(`No se pudo generar el esquema ampliado (${(e as Error).message}); se usa el curado.`); });
