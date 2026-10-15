import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { unzipSync, strFromU8 } from 'fflate';
import { orca, profiles, sliceArgs, wr } from './lib';
import { config } from '../../src/lib/config';

const S = path.resolve('samples'), M = '/tmp/spike-models';
function gstat(dir: string, plate = 'plate_1.gcode') {
  const g = fs.readFileSync(path.join(dir, 'out', plate), 'utf8');
  const z = [...g.matchAll(/^G1 Z([\d.]+)/gm)].map((m) => +m[1]); const xs = [...g.matchAll(/^G1 X([\d.]+) Y([\d.]+).*E/gm)];
  const x = xs.map((m) => +m[1]), y = xs.map((m) => +m[2]);
  const layers = g.match(/total layer number:\s*(\d+)/)?.[1]; const time = g.match(/total estimated time: ([^;\n]+)/)?.[1];
  const fil = g.match(/total filament weight \[g\] : ([^\n]+)/)?.[1]; const supp = (g.match(/;TYPE:Support/g) ?? []).length;
  return { layers, time, fil, maxZ: Math.max(...z).toFixed(1), bboxX: [Math.min(...x), Math.max(...x)].map((n) => +n.toFixed(0)), bboxY: [Math.min(...y), Math.max(...y)].map((n) => +n.toFixed(0)), supportLines: supp };
}
async function t(label: string, model: string, extra: string[], p = profiles()) {
  const r = await orca((d) => sliceArgs(d, model, p, extra));
  console.log(`\n## ${label}  → code ${r.code}, ${r.ms} ms`);
  if (r.code === 0) console.log(JSON.stringify(gstat(r.dir))); else console.log(r.log.slice(-400));
  return r;
}
async function main() {
  const torre = path.join(M, 'torre-200mm.stl'), hongo = path.join(M, 'hongo.stl'), barco = path.join(S, 'barquito.stl');
  await t('torre base', torre, ['--arrange', '1']);
  await t('torre --rotate-x 90 (tumbar)', torre, ['--arrange', '1', '--rotate-x', '90']);
  await t('torre --rotate 45 (Z)', torre, ['--arrange', '1', '--rotate', '45']);
  await t('torre --scale 0.5', torre, ['--arrange', '1', '--scale', '0.5']);
  await t('hongo sin soportes ni orient (soporte activo)', hongo, ['--arrange', '1'], profiles({}, { process: { enable_support: '1', support_type: 'normal(auto)' } }));
  await t('hongo --orient 1 (soporte activo)', hongo, ['--arrange', '1', '--orient', '1'], profiles({}, { process: { enable_support: '1', support_type: 'normal(auto)' } }));
  await t('barquito --arrange 0', barco, ['--arrange', '0']);
  await t('barquito --repetitions 3', barco, ['--arrange', '1', '--repetitions', '3']);
  await t('barquito --clone-objects 4', barco, ['--arrange', '1', '--clone-objects', '4']);
  // estructura del 3MF de salida
  const r = await orca((d) => sliceArgs(d, barco, profiles(), ['--arrange', '1']));
  const z = unzipSync(fs.readFileSync(path.join(r.dir, 'out', 'sliced.3mf')));
  console.log('\n## entradas del 3MF de salida:', Object.keys(z).join(' | '));
  fs.writeFileSync('/tmp/s1-out3mf-modelsettings.xml', z['Metadata/model_settings.config'] ? strFromU8(z['Metadata/model_settings.config']) : 'n/a');
  fs.writeFileSync('/tmp/s1-out-result.json', fs.readFileSync(path.join(r.dir, 'out', 'result.json')));
  // --info
  const inf = spawnSync(config.orcaBin, ['--info', barco], { encoding: 'utf8' }); console.log('\n## --info:\n', inf.stdout.slice(0, 300));
  // --pipe: progreso
  const dir = fs.mkdtempSync('/tmp/spike-pipe-'); const pipe = path.join(dir, 'p'); spawnSync('mkfifo', [pipe]);
  const msgs: string[] = []; const rd = spawn('cat', [pipe]); rd.stdout.on('data', (d) => msgs.push(String(d)));
  const rr = await orca((d) => sliceArgs(d, path.join(M, 'esfera-50k.stl'), profiles(), ['--arrange', '1', '--pipe', pipe]));
  rd.kill();
  console.log('\n## --pipe: code', rr.code, 'mensajes:', msgs.join('').split('\n').filter(Boolean).slice(0, 12), '… total bytes', msgs.join('').length);
}
main();
