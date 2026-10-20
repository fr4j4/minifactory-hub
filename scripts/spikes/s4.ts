/** Spike S4: 3MF construido por nosotros (varios objetos, transformaciones, ajustes y extrusor por objeto) laminado con el CLI. */
import fs from 'node:fs';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { parseMesh } from '../../src/lib/mesh/parse';
import { orca, profiles, wr } from './lib';

interface Obj { name: string; file: string; matrix: number[]; settings?: Record<string, string>; extruder?: number }
async function build3mf(objs: Obj[], out: string) {
  let res = '', items = '', cfg = '';
  let id = 1;
  for (const o of objs) {
    const buf = new Uint8Array(fs.readFileSync(o.file)); const mesh = await parseMesh(buf, path.extname(o.file).slice(1));
    const p = mesh.positions; const nt = p.length / 9; let v = '', t = ''; const idx = new Map<string, number>(); let nv = 0;
    for (let i = 0; i < nt; i++) { const ids: number[] = []; for (let k = 0; k < 3; k++) { const x = p[i * 9 + k * 3], y = p[i * 9 + k * 3 + 1], z = p[i * 9 + k * 3 + 2]; const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`; let n = idx.get(key); if (n === undefined) { n = nv++; idx.set(key, n); v += `<vertex x="${x}" y="${y}" z="${z}"/>`; } ids.push(n); } t += `<triangle v1="${ids[0]}" v2="${ids[1]}" v3="${ids[2]}"/>`; }
    res += `<object id="${id}" type="model"><mesh><vertices>${v}</vertices><triangles>${t}</triangles></mesh></object>`;
    items += `<item objectid="${id}" transform="${o.matrix.join(' ')}" printable="1"/>`;
    cfg += `<object id="${id}"><metadata key="name" value="${o.name}"/>${o.extruder ? `<metadata key="extruder" value="${o.extruder}"/>` : ''}${Object.entries(o.settings ?? {}).map(([k, val]) => `<metadata key="${k}" value="${val}"/>`).join('')}<part id="1" subtype="normal_part"><metadata key="name" value="${o.name}"/></part></object>`;
    id++;
  }
  const model = `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>${res}</resources><build>${items}</build></model>`;
  const z = zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'),
    '3D/3dmodel.model': strToU8(model), 'Metadata/model_settings.config': strToU8(`<?xml version="1.0" encoding="UTF-8"?><config>${cfg}</config>`),
  });
  fs.writeFileSync(out, z);
}
const R = (deg: number) => { const a = (deg * Math.PI) / 180; return [Math.cos(a), Math.sin(a), 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 1]; }; // fila mayor 3MF: 9 rot + 3 trans
const Rx = (deg: number) => { const a = (deg * Math.PI) / 180; return [1, 0, 0, 0, Math.cos(a), Math.sin(a), 0, -Math.sin(a), Math.cos(a)]; };
function gstat(dir: string) {
  const g = fs.readFileSync(path.join(dir, 'out', 'plate_1.gcode'), 'utf8');
  const xs = [...g.matchAll(/^G1 X([\d.]+) Y([\d.]+).*E/gm)]; const x = xs.map((m) => +m[1]), y = xs.map((m) => +m[2]);
  const f = (re: RegExp) => g.match(re)?.[1]; const feats = (n: string) => (g.match(new RegExp(`; FEATURE: ${n}`, 'g')) ?? []).length;
  return { layers: f(/total layer number:\s*(\d+)/), time: f(/total estimated time: ([^;\n]+)/), weightG: f(/total filament weight \[g\] : ([^\n]+)/), x: [Math.min(...x), Math.max(...x)].map((n) => Math.round(n)), y: [Math.min(...y), Math.max(...y)].map((n) => Math.round(n)), sparse: feats('Sparse infill'), outer: feats('Outer wall'), tools: [...new Set(g.match(/^T\d/gm) ?? [])].join(',') };
}
async function main() {
  const S = path.resolve('samples'); const dir = fs.mkdtempSync('/tmp/spike-s4-');
  const run = async (label: string, objs: Obj[], P = profiles({}, { process: { curr_bed_type: 'Textured PEI Plate' } }), extra: string[] = []) => {
    const f = path.join(dir, label.replace(/\W+/g, '_') + '.3mf'); await build3mf(objs, f);
    const r = await orca((d) => { const m = wr(d, 'm.json', P.machine), p = wr(d, 'p.json', P.proc), fl = wr(d, 'f.json', P.fil); const c = path.join(d, 'in.3mf'); fs.copyFileSync(f, c); return ['--slice', '0', '--load-settings', `${m};${p}`, '--load-filaments', fl, '--outputdir', path.join(d, 'out'), '--export-3mf', 's.3mf', ...extra, c]; });
    console.log(`\n## ${label} → ${r.code} ${r.ms} ms`); if (r.code === 0) console.log(JSON.stringify(gstat(r.dir))); else { console.log(r.log.slice(-200)); try { console.log(JSON.parse(fs.readFileSync(path.join(r.dir, 'out', 'result.json'), 'utf8')).error_string); } catch {} }
    return r;
  };
  const b = path.join(S, 'llavero.stl'), e = path.join(S, 'engranaje.stl');
  await run('A1 un objeto en (128,128)', [{ name: 'barco', file: b, matrix: [...R(0), 100, 128, 0] }]);
  await run('A2 dos objetos posiciones fijas', [{ name: 'barco', file: b, matrix: [...R(0), 70, 128, 0] }, { name: 'engr', file: e, matrix: [...R(0), 170, 128, 0] }]);
  await run('A3 barco rotado 90° en X (de costado)', [{ name: 'barco', file: b, matrix: [...Rx(90), 100, 128, 0] }]);
  await run('A4 barco rotado 45° en Z + escala 1.5', [{ name: 'barco', file: b, matrix: [...R(45).map((n) => n * 1.5), 128, 128, 0] }]);
  await run('B0 dos objetos, ajustes por defecto', [{ name: 'barco', file: b, matrix: [...R(0), 70, 128, 0] }, { name: 'engr', file: e, matrix: [...R(0), 170, 128, 0] }]);
  await run('B1 engranaje con relleno 60% y 5 paredes (por objeto)', [{ name: 'barco', file: b, matrix: [...R(0), 70, 128, 0] }, { name: 'engr', file: e, matrix: [...R(0), 170, 128, 0], settings: { sparse_infill_density: '60%', wall_loops: '5' } }]);
  await run('C1 extrusor 2 para el engranaje (2 filamentos PLA)', [{ name: 'barco', file: b, matrix: [...R(0), 70, 128, 0], extruder: 1 }, { name: 'engr', file: e, matrix: [...R(0), 170, 128, 0], extruder: 2 }]);
}
main();
