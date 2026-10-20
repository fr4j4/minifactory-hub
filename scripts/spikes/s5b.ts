import fs from 'node:fs';
import path from 'node:path';
import { orca, profiles, sliceArgs } from './lib';
function kinds(g: string) { const m = new Map<string, number>(); for (const l of g.split('\n')) if (l.startsWith(';')) { const k = l.replace(/[-\d.]+/g, '#').slice(0, 44); m.set(k, (m.get(k) ?? 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22); }
async function main() {
  for (const [lab, ch] of [['por defecto', {}], ['gcode_comments=1', { gcode_comments: '1' }]] as const) {
    const r = await orca((d) => sliceArgs(d, '/tmp/spike-models/hongo.stl', profiles({}, { process: { enable_support: '1', support_type: 'normal(auto)', ...ch } }), ['--arrange', '1']));
    const g = fs.readFileSync(path.join(r.dir, 'out', 'plate_1.gcode'), 'utf8');
    console.log('\n##', lab, g.length, 'bytes\n', kinds(g).map(([k, n]) => `${n}\t${k}`).join('\n'));
    const idx = g.split('\n').findIndex((l) => /^; layer num/.test(l) || /^;LAYER/.test(l) || /^; CHANGE_LAYER/.test(l)); console.log('capa marcador idx', idx);
    console.log(g.split('\n').slice(idx, idx + 8).join('\n'));
  }
}
main();
