import path from 'node:path';
import { orca, profiles, sliceArgs } from './lib';
const torre = '/tmp/spike-models/torre-200mm.stl';
async function main() {
  for (const ex of [['--rotate-x', '90'], ['--rotate', '45'], ['--scale', '0.5'], ['--repetitions', '3'], ['--rotate-x', '90', '--ensure-on-bed'], ['--scale', '0.5', '--ensure-on-bed']]) {
    const r = await orca((d) => sliceArgs(d, torre, profiles(), ['--arrange', '1', ...ex, '--debug', '3']));
    console.log('\n##', ex.join(' '), '→', r.code); console.log(r.log.split('\n').filter((l) => /error|fail|invalid|not|exit|return/i.test(l)).slice(0, 6).join('\n'));
  }
}
main();
