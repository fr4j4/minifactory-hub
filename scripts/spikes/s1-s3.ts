import path from 'node:path';
import fs from 'node:fs';
import { orca, profiles, sliceArgs } from './lib';

const S = path.resolve('samples');
const stat = (r: Awaited<ReturnType<typeof orca>>) => `${r.code === 0 ? 'ok' : 'ERR' + r.code} ${r.ms} ms files=[${r.files.join(',')}]`;
async function main() {
  const rows: string[] = [];
  const P = profiles();
  // S3: tiempos por pieza y calidad
  const cases: Array<[string, string, ReturnType<typeof profiles>, string[]]> = [
    ['llavero (chica) 0.20', 'llavero.stl', P, []],
    ['engranaje 0.20', 'engranaje.stl', P, []],
    ['barquito 0.20', 'barquito.stl', P, []],
    ['barquito 0.12 Fine', 'barquito.stl', profiles({ process: '0.12mm Fine @BBL A1' }), []],
    ['barquito 0.28 Extra Draft', 'barquito.stl', profiles({ process: '0.28mm Extra Draft @BBL A1' }), []],
    ['barquito + soportes', 'barquito.stl', profiles({}, { process: { enable_support: '1', support_type: 'tree(auto)' } }), []],
    ['barquito x20 copias', 'barquito.stl', P, ['--clone-objects', '20']],
    ['engranaje relleno 100%', 'engranaje.stl', profiles({}, { process: { sparse_infill_density: '100%' } }), []],
  ];
  for (const [label, f, p, ex] of cases) {
    const r = await orca((d) => sliceArgs(d, path.join(S, f), p, ['--arrange', '1', ...ex]));
    rows.push(`${label.padEnd(28)} ${stat(r)}`); console.log(rows[rows.length - 1]);
  }
  // repetir para ver variación (barquito 0.20)
  for (let i = 0; i < 2; i++) { const r = await orca((d) => sliceArgs(d, path.join(S, 'barquito.stl'), P, ['--arrange', '1'])); console.log('repetición barquito', stat(r)); }
  // arranque en frío sin pieza (costo fijo del proceso)
  const info = await orca((d) => ['--info', path.join(S, 'llavero.stl')]);
  console.log('--info llavero', info.ms, 'ms\n', info.log.slice(0, 600));
  fs.writeFileSync('/tmp/s3.txt', rows.join('\n'));
}
main();
