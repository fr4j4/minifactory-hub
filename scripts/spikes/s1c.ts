import { orca, profiles, sliceArgs } from './lib';
async function main() {
  for (const [lab, ex] of [['rotate-x 90 (sin arrange)', ['--arrange', '0', '--rotate-x', '90']], ['rotate-y 90', ['--arrange', '1', '--rotate-y', '90']], ['rotate 45 con --ensure-on-bed', ['--arrange', '1', '--rotate', '45', '--ensure-on-bed']], ['scale 2', ['--arrange', '1', '--scale', '2', '--ensure-on-bed']]] as const) {
    for (const m of ['/tmp/spike-models/torre-200mm.stl', 'samples/barquito.stl']) {
      const r = await orca((d) => sliceArgs(d, m.startsWith('/') ? m : require('node:path').resolve(m), profiles(), [...ex]));
      console.log('##', lab, m.split('/').pop(), '→', r.code, r.ms, 'ms', 'log:', JSON.stringify(r.log.slice(-160)));
    }
  }
}
main();
