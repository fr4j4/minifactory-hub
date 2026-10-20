import fs from 'node:fs';
import path from 'node:path';
import { orca, profiles, sliceArgs } from './lib';
async function main() {
  const r = await orca((d) => sliceArgs(d, '/tmp/spike-models/hongo.stl', profiles({}, { process: { enable_support: '1', support_type: 'normal(auto)', sparse_infill_density: '20%' } }), ['--arrange', '1']));
  const g = fs.readFileSync(path.join(r.dir, 'out', 'plate_1.gcode'), 'utf8'); fs.writeFileSync('/tmp/s5.gcode', g);
  const lines = g.split('\n'); console.log('líneas', lines.length, 'bytes', g.length);
  const count = (re: RegExp) => { const m = new Map<string, number>(); for (const l of lines) { const x = l.match(re); if (x) m.set(x[1], (m.get(x[1]) ?? 0) + 1); } return [...m.entries()]; };
  console.log('FEATURE:', count(/^; FEATURE: (.+)$/));
  console.log('TYPE:', count(/^;TYPE:(.+)$/));
  console.log('WIDTH únicos:', count(/^;WIDTH:(.+)$/).length, 'HEIGHT únicos:', count(/^;HEIGHT:(.+)$/).length);
  const sample = lines.filter((l) => /^;|^M73|^G1 F|^M204|^M106|^M104|^M140/.test(l)).slice(0, 5);
  // muestra de comentarios por capa y segmentos
  const idx = lines.findIndex((l) => /^; FEATURE: Outer wall/.test(l));
  console.log('--- muestra alrededor de una pared exterior ---\n' + lines.slice(idx - 6, idx + 14).join('\n'));
  const lay = lines.findIndex((l) => /^;LAYER_CHANGE/.test(l)); console.log('--- cambio de capa ---\n' + lines.slice(lay, lay + 8).join('\n'));
  console.log('M73 (progreso/tiempo restante) ejemplos:', lines.filter((l) => l.startsWith('M73')).slice(0, 3), 'total', lines.filter((l) => l.startsWith('M73')).length);
  console.log('cabecera de tiempos:', lines.filter((l) => /estimated|filament used|layer_height|max_z|total layer/.test(l)).slice(0, 8));
  console.log('bloque CONFIG_BLOCK existe:', g.includes('CONFIG_BLOCK_START'), '| HEADER_BLOCK:', g.includes('HEADER_BLOCK_START'));
  console.log('ranuras de tiempo por feature (;TIME_ELAPSED?):', lines.filter((l) => /TIME_ELAPSED|;TIME:/.test(l)).slice(0, 3));
}
main();
