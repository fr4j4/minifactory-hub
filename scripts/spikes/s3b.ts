import path from 'node:path';
import { orca, profiles, sliceArgs } from './lib';
const M = '/tmp/spike-models';
async function main() {
  const sup = { enable_support: '1', support_type: 'tree(auto)' };
  const cases: Array<[string, string, ReturnType<typeof profiles>]> = [
    ['esfera 50k tri, 0.20', 'esfera-50k.stl', profiles()],
    ['esfera 200k tri, 0.20', 'esfera-200k.stl', profiles()],
    ['esfera 200k tri, 0.12', 'esfera-200k.stl', profiles({ process: '0.12mm Fine @BBL A1' })],
    ['torre 200 mm, 0.20', 'torre-200mm.stl', profiles()],
    ['torre 200 mm, 0.12', 'torre-200mm.stl', profiles({ process: '0.12mm Fine @BBL A1' })],
    ['placa 200x200x30, 0.20', 'placa-grande.stl', profiles()],
    ['placa 200x200x30, 0.12 + 100%', 'placa-grande.stl', profiles({ process: '0.12mm Fine @BBL A1' }, { process: { sparse_infill_density: '100%' } })],
    ['hongo sin soportes', 'hongo.stl', profiles()],
    ['hongo con soportes árbol', 'hongo.stl', profiles({}, { process: sup })],
    ['hongo con soportes normales 0.12', 'hongo.stl', profiles({ process: '0.12mm Fine @BBL A1' }, { process: { enable_support: '1', support_type: 'normal(auto)' } })],
  ];
  for (const [label, f, p] of cases) {
    const r = await orca((d) => sliceArgs(d, path.join(M, f), p, ['--arrange', '1']));
    console.log(label.padEnd(34), r.code === 0 ? 'ok ' : 'ERR' + r.code, String(r.ms).padStart(6), 'ms');
  }
}
main();
