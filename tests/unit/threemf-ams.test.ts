import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { parseAms } from '@/lib/mesh/threemf-ams';
import { parse3MF } from '@/lib/mesh/parse';

const tri = (x: number) => `<object id="@@" type="model"><mesh><vertices><vertex x="${x}" y="0" z="0"/><vertex x="${x + 10}" y="0" z="0"/><vertex x="${x}" y="10" z="0"/><vertex x="${x}" y="0" z="10"/></vertices><triangles><triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="1" v3="3"/><triangle v1="1" v2="2" v3="3"/><triangle v1="2" v2="0" v3="3"/></triangles></mesh></object>`;
function build(opts: { extruders: number[]; colours: string[]; types?: string[] }) {
  const objs = opts.extruders.map((_, i) => tri(i * 20).replace('@@', String(i + 1))).join('');
  const items = opts.extruders.map((_, i) => `<item objectid="${i + 1}"/>`).join('');
  const cfg = opts.extruders.map((e, i) => `<object id="${i + 1}"><metadata key="name" value="pieza${i + 1}"/><metadata key="extruder" value="${e}"/></object>`).join('');
  return zipSync({
    '3D/3dmodel.model': strToU8(`<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>${objs}</resources><build>${items}</build></model>`),
    'Metadata/model_settings.config': strToU8(`<config>${cfg}</config>`),
    'Metadata/project_settings.config': strToU8(JSON.stringify({ filament_colour: opts.colours, filament_type: opts.types ?? opts.colours.map(() => 'PLA') })),
  });
}

describe('3MF multicolor / AMS (N1b)', () => {
  it('detecta ranuras, tipos y el extrusor de cada objeto', () => {
    const a = parseAms(build({ extruders: [1, 2, 2], colours: ['#FF0000', '#00FF00', '#0000FF'], types: ['PLA', 'PETG', 'TPU'] }))!;
    expect(a.multicolor).toBe(true);
    expect(a.filaments).toEqual([{ index: 1, color: '#ff0000', type: 'PLA', used: true }, { index: 2, color: '#00ff00', type: 'PETG', used: true }, { index: 3, color: '#0000ff', type: 'TPU', used: false }]);
    expect(a.objects.map((o) => o.extruder)).toEqual([1, 2, 2]);
  });
  it('un proyecto de un solo filamento no es multicolor', () => {
    expect(parseAms(build({ extruders: [1, 1], colours: ['#ff0000', '#00ff00'] }))!.multicolor).toBe(false);
    const sample = parseAms(new Uint8Array(fs.readFileSync('samples/llavero-a1.3mf')))!;
    expect(sample.multicolor).toBe(false); expect(sample.filaments[0]).toMatchObject({ color: '#f2754e', type: 'PLA' });
  });
  it('sin metadatos de Bambu/Orca devuelve null', () => {
    expect(parseAms(zipSync({ '3D/3dmodel.model': strToU8('<model/>') }))).toBeNull();
  });
  it('la malla sale coloreada por extrusor en el visor 3D (cada objeto con el color de su filamento)', () => {
    const m = parse3MF(build({ extruders: [1, 2], colours: ['#ff0000', '#00ff00'] }));
    expect(m.colors).toBeDefined();
    const c = m.colors!; const per = 4 * 9;
    expect([c[0], c[1], c[2]]).toEqual([1, 0, 0]); expect([c[per], c[per + 1], c[per + 2]]).toEqual([0, 1, 0]);
  });
});
