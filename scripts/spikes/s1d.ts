import fs from 'node:fs';
import path from 'node:path';
import { orca, profiles, wr } from './lib';
const S = path.resolve('samples');
function head(g: string) { const k = (re: RegExp) => g.match(re)?.[1]; return { filaments: k(/total filament weight \[g\] : ([^\n]+)/), colours: k(/filament_colour = ([^\n]+)/), types: k(/^; filament_type = ([^\n]+)/m), changes: (g.match(/^T\d/gm) ?? []).join(','), layers: k(/total layer number:\s*(\d+)/), time: k(/total estimated time: ([^;\n]+)/) }; }
async function main() {
  const A = profiles({}, { process: { curr_bed_type: 'Textured PEI Plate', wipe_tower_x: ['200'], wipe_tower_y: ['200'] } }), B = profiles({ filament: 'Bambu PETG Basic @BBL A1' }, { filament: { default_filament_colour: ['#2a6fdb'] } });
  const run = async (label: string, extra: (d: string) => string[], files: string[]) => {
    const r = await orca((d) => {
      const m = wr(d, 'm.json', A.machine), p = wr(d, 'p.json', A.proc), f1 = wr(d, 'f1.json', { ...A.fil, filament_colour: ['#e8b923'] }), f2 = wr(d, 'f2.json', { ...B.fil, filament_colour: ['#2a6fdb'] });
      const cp = files.map((f, i) => { const c = path.join(d, `o${i}${path.extname(f)}`); fs.copyFileSync(f, c); return c; });
      return ['--slice', '0', '--load-settings', `${m};${p}`, '--load-filaments', `${f1};${f2}`, '--outputdir', path.join(d, 'out'), '--export-3mf', 'sliced.3mf', ...extra(d), ...cp];
    });
    console.log(`\n## ${label} → ${r.code} ${r.ms} ms`);
    if (r.code === 0 && r.files.includes('plate_1.gcode')) console.log(JSON.stringify(head(fs.readFileSync(path.join(r.dir, 'out', 'plate_1.gcode'), 'utf8')))); else { console.log(r.log.slice(-300)); try { console.log(fs.readFileSync(path.join(r.dir, 'out', 'result.json'), 'utf8')); } catch {} }
    return r;
  };
  const F = [path.join(S, 'barquito.stl'), path.join(S, 'engranaje.stl')];
  await run('ids 1,2 + torre de purga en (200,200)', () => ['--arrange', '1', '--allow-mix-temp', '--load-filament-ids', '1,2'], F);
  await run('ids 1,2 + torre (200,200), arrange 0', () => ['--arrange', '0', '--allow-mix-temp', '--load-filament-ids', '1,2'], F);
}
main();
