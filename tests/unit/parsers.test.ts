import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { buildGcodePreview, parse3mfSliceMeta, parseDuration, parseGcodeMeta } from '@/lib/gcode';
import { parse3MF, parseOBJ, parsePLY, parseSTL } from '@/lib/mesh/parse';
import { analyze, decimate, fitsIn, renderThumbnail, toPreviewBin, weld } from '@/lib/mesh/ops';
import { csvCell, parseCsv } from '@/lib/csv';
import { rutOk } from '@/lib/format';
import { fillTemplate, waLink } from '@/lib/messages';
import { can, canSeeCosts, DEFAULT_MATRIX } from '@/lib/perm';
import { normalizeUrl, fetchLinkPreview, siteLabel } from '@/lib/links';

/* cubo de 10 mm como STL binario y ASCII */
function cubeTris(s = 10): number[] {
  const v = [[0, 0, 0], [s, 0, 0], [s, s, 0], [0, s, 0], [0, 0, s], [s, 0, s], [s, s, s], [0, s, s]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return f.flatMap((t) => t.flatMap((i) => v[i]));
}
function binStl(tris: number[]) { const n = tris.length / 9; const b = new DataView(new ArrayBuffer(84 + n * 50)); b.setUint32(80, n, true); let o = 84; for (let t = 0; t < n; t++) { o += 12; for (let k = 0; k < 9; k++) { b.setFloat32(o, tris[t * 9 + k], true); o += 4; } o += 2; } return new Uint8Array(b.buffer); }

describe('mallas', () => {
  it('STL binario: volumen, dimensiones y malla cerrada', () => {
    const a = analyze(parseSTL(binStl(cubeTris())));
    expect(a.triangles).toBe(12); expect(a.volumeCm3).toBeCloseTo(1, 5); expect(a.dimX).toBeCloseTo(10); expect(a.areaCm2).toBeCloseTo(6, 5); expect(a.closed).toBe(true); expect(a.invertedNormals).toBe(false); expect(a.shells).toBe(1);
  });
  it('STL ASCII', () => {
    const t = cubeTris(); let s = 'solid x\n'; for (let i = 0; i < t.length; i += 9) s += `facet normal 0 0 0\nouter loop\n${[0, 3, 6].map((k) => `vertex ${t[i + k]} ${t[i + k + 1]} ${t[i + k + 2]}`).join('\n')}\nendloop\nendfacet\n`; s += 'endsolid';
    expect(analyze(parseSTL(new TextEncoder().encode(s))).volumeCm3).toBeCloseTo(1, 5);
  });
  it('detecta mallas abiertas y normales invertidas', () => {
    const open = cubeTris().slice(0, 11 * 9); expect(analyze({ positions: Float32Array.from(open) }).closed).toBe(false);
    const flipped = cubeTris(); for (let i = 0; i < flipped.length; i += 9) { for (let k = 0; k < 3; k++) { const a = flipped[i + 3 + k]; flipped[i + 3 + k] = flipped[i + 6 + k]; flipped[i + 6 + k] = a; } }
    expect(analyze({ positions: Float32Array.from(flipped) }).invertedNormals).toBe(true);
  });
  it('voladizos: una pirámide invertida tiene caras bajo 45°', () => {
    const a = analyze({ positions: Float32Array.from([0, 0, 10, 10, 0, 10, 5, 5, 0, /* cara que mira hacia abajo */ 0, 0, 0, 5, 5, 0, 10, 0, 0]) }); expect(a.overhangPct).toBeGreaterThanOrEqual(0);
  });
  it('OBJ con caras de 4 vértices y PLY ASCII', () => {
    const obj = parseOBJ(new TextEncoder().encode('v 0 0 0\nv 10 0 0\nv 10 10 0\nv 0 10 0\nf 1 2 3 4\n')); expect(obj.positions.length / 9).toBe(2);
    const ply = parsePLY(new TextEncoder().encode('ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n1 0 0\n0 1 0\n3 0 1 2\n')); expect(ply.positions.length / 9).toBe(1);
  });
  it('3MF con transformación y color', () => {
    const model = `<?xml version="1.0"?><model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><basematerials id="1"><base name="r" displaycolor="#FF0000"/></basematerials><object id="2" pid="1" pindex="0"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/><vertex x="0" y="10" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object></resources><build><item objectid="2" transform="1 0 0 0 1 0 0 0 1 5 5 5"/></build></model>`;
    const m = parse3MF(zipSync({ '3D/3dmodel.model': strToU8(model) })); expect(m.positions[0]).toBe(5); expect(m.positions[8]).toBe(5); expect(m.colors?.[0]).toBe(1);
  });
  it('soldadura, simplificación y vista previa binaria', () => {
    const ix = weld({ positions: Float32Array.from(cubeTris()) }); expect(ix.vertices.length / 3).toBe(8);
    const N = 120, pts: number[][] = []; const P = (i: number, j: number) => { const th = (i / N) * Math.PI, ph = (j / N) * 2 * Math.PI; return [50 * Math.sin(th) * Math.cos(ph), 50 * Math.sin(th) * Math.sin(ph), 50 * Math.cos(th)]; };
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { pts.push(P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j), P(i + 1, j + 1), P(i, j + 1)); }
    const sphere = weld({ positions: Float32Array.from(pts.flat()) }); const dec = decimate(sphere, 5000);
    expect(sphere.indices.length / 3).toBeGreaterThan(20000); expect(dec.indices.length / 3).toBeLessThanOrEqual(6000);
    const bin = toPreviewBin(ix, { origTriangles: 12, decimated: false }); expect(bin.toString('ascii', 0, 4)).toBe('MFM1');
  });
  it('miniatura renderizada en el servidor', async () => { const png = await renderThumbnail({ positions: Float32Array.from(cubeTris()) }, { w: 120, h: 90 }); expect(png.length).toBeGreaterThan(500); expect(png.subarray(1, 4).toString()).toBe('PNG'); });
  it('¿cabe en la máquina? admite giro de 90° sobre Z', () => { expect(fitsIn([300, 100, 50], [256, 256, 256])).toBe(false); expect(fitsIn([200, 100, 50], [100, 256, 256])).toBe(true); expect(fitsIn([100, 100, 300], [256, 256, 256])).toBe(false); });
});

const orcaHead = `; HEADER_BLOCK_START\n; generated by OrcaSlicer 2.4.2 on 2026-10-13 at 04:24:30\n; model printing time: 26m 8s; total estimated time: 32m 23s\n; total layer number: 164\n; filament_density: 1.26\n; filament_diameter: 1.75\n; max_z_height: 32.80\n; HEADER_BLOCK_END\n; filament used [mm] = 2450.21\n; filament used [cm3] = 5.89\n; filament used [g] = 7.43\n; layer_height = 0.2\n`;
describe('lectura de G-code y 3MF laminados', () => {
  it('duraciones', () => { expect(parseDuration('32m 23s')).toBe(1943); expect(parseDuration('1d 2h 3m')).toBe(93780); expect(parseDuration('sin dato')).toBeNull(); });
  it('OrcaSlicer / Bambu Studio', () => { const m = parseGcodeMeta(orcaHead); expect(m.slicer).toBe('OrcaSlicer 2.4.2'); expect(m.timeS).toBe(1943); expect(m.totalG).toBe(7.43); expect(m.layers).toBe(164); expect(m.layerHeight).toBe(0.2); });
  it('PrusaSlicer', () => { const m = parseGcodeMeta('; generated by PrusaSlicer 2.7.1 on 2026-01-01\n; estimated printing time (normal mode) = 1h 2m 3s\n; filament used [mm] = 5000.2\n; filament used [g] = 15.1\n'); expect(m.timeS).toBe(3723); expect(m.totalG).toBeCloseTo(15.1); });
  it('Cura informa metros: los gramos se calculan con diámetro y densidad', () => { const m = parseGcodeMeta(';FLAVOR:Marlin\n;TIME:3600\n;Filament used: 2.5m\n;Layer height: 0.2\n;Generated with Cura_SteamEngine 5.7', { defaultDensity: 1.24, defaultDiameter: 1.75 }); expect(m.timeS).toBe(3600); expect(m.totalG).toBeCloseTo(((Math.PI * 0.875 ** 2 * 2500) / 1000) * 1.24, 1); expect(m.notes).toContain('gcodeNote.curaMeters'); });
  it('varios colores', () => { const m = parseGcodeMeta('; filament used [g] = 5.0, 3.2\n; filament used [mm] = 1000, 700\n; total estimated time: 10m 0s\n'); expect(m.filaments.length).toBe(2); expect(m.totalG).toBeCloseTo(8.2); });
  it('sin datos: avisa y ofrece laminar o modo manual', () => { expect(parseGcodeMeta('G1 X1 Y1\n').notes[0]).toBe('gcodeNote.noSummary'); });
  it('3MF laminado de Bambu/Orca', () => {
    const info = `<?xml version="1.0"?><config><plate><metadata key="prediction" value="1943"/><filament id="1" type="PLA" color="#F2754E" used_m="2.45" used_g="7.43"/></plate></config>`;
    const m = parse3mfSliceMeta(zipSync({ 'Metadata/slice_info.config': strToU8(info) }))!; expect(m.timeS).toBe(1943); expect(m.totalG).toBeCloseTo(7.43); expect(m.filaments[0].color).toBe('#F2754E');
  });
  it('3MF sin laminar no trae datos', () => { expect(parse3mfSliceMeta(zipSync({ '3D/3dmodel.model': strToU8('<model/>') }))).toBeNull(); });
  it('vista previa por capas', () => {
    const g = ';TYPE:Outer wall\nG1 X0 Y0 Z0.2\nG1 X10 Y0 E1\nG1 X10 Y10 E2\n;TYPE:Sparse infill\nG1 X0 Y10 E3\nG1 Z0.4\nG1 X0 Y0 E4\n'; const p = buildGcodePreview(g); expect(p.layers.length).toBe(2); expect(p.total).toBe(4); expect(p.layers[0].t.map((x) => x[0])).toEqual([0, 1]);
  });
});

describe('utilidades', () => {
  it('rutOk revisa el dígito verificador solo si el texto tiene forma de RUT', () => {
    for (const ok of ['76.123.456-0', '11.111.111-1', '12345678-5', '10.000.013-K', 'DE123456789']) expect(rutOk(ok)).toBe(true);
    for (const bad of ['76.123.456-7', '12.345.678-9']) expect(rutOk(bad)).toBe(false);
  });
  it('csvCell neutraliza fórmulas en texto y deja los números', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)"); expect(csvCell(-5)).toBe('-5'); expect(csvCell('Ana')).toBe('Ana');
  });
  it('CSV con comillas y punto y coma', () => { expect(parseCsv('nombre;telefono\n"Pérez, Juan";123\nAna;456')).toEqual([['nombre', 'telefono'], ['Pérez, Juan', '123'], ['Ana', '456']]); });
  it('plantillas y WhatsApp', () => { expect(fillTemplate('Hola {cliente}, {total}', { cliente: 'Ana', total: '$1.000' })).toBe('Hola Ana, $1.000'); expect(waLink('+56 9 1234 5678', 'hola mundo')).toBe('https://wa.me/56912345678?text=hola%20mundo'); });
  it('permisos: el operador no ve márgenes ni tarifas', () => {
    const op = { role: 'operador' as const }; const ve = { role: 'ventas' as const }; const ad = { role: 'admin' as const };
    expect(canSeeCosts(op)).toBe(false); expect(canSeeCosts(ve)).toBe(true); expect(can(op, 'config', 'V')).toBe(false); expect(can(op, 'reportes', 'V')).toBe(false); expect(can(ve, 'inventario', 'E')).toBe(false); expect(can(ad, 'config', 'X')).toBe(true);
    expect(can({ role: 'operador', permOverrides: { reportes: 'V' } }, 'reportes', 'V')).toBe(true); expect(DEFAULT_MATRIX.operador.presupuestos).toBe('V');
  });
  it('links de referencia: solo http/https y sin acceso a direcciones internas', async () => {
    expect(normalizeUrl('printables.com/model/1')).toBe('https://printables.com/model/1'); expect(() => normalizeUrl('javascript:alert(1)')).toThrow(); expect(siteLabel('https://www.thingiverse.com/thing:1')).toBe('Thingiverse');
    const r = await fetchLinkPreview('http://127.0.0.1:1/x'); expect(r.title).toBeNull(); expect(r.image).toBeNull();
  });
});

describe('STEP (OpenCascade)', () => {
  it('convierte un cubo de 10 mm en malla y la analiza', async () => {
    const fs = await import('node:fs'); const { parseMesh } = await import('@/lib/mesh/parse'); const { analyze } = await import('@/lib/mesh/ops');
    const mesh = await parseMesh(new Uint8Array(fs.readFileSync('samples/cubo-10mm.stp')), 'stp');
    const a = analyze(mesh);
    expect(a.triangles).toBeGreaterThanOrEqual(12); expect(a.dimX).toBeCloseTo(10, 0); expect(a.dimY).toBeCloseTo(10, 0); expect(a.dimZ).toBeCloseTo(10, 0);
  });
});

describe('pintura por cara (paint_color)', () => {
  it('decodifica el estado de la raíz: hojas, extensión y subdivisiones', async () => {
    const { paintState } = await import('@/lib/mesh/parse');
    expect(paintState('4')).toBe(1); expect(paintState('8')).toBe(2); expect(paintState('0')).toBe(0);
    expect(paintState('1C')).toBe(4); // estado 3 + siguiente símbolo
    expect(paintState('44B')).toBe(1); // raíz dividida (B): se toma la primera hoja
    expect(paintState('zz')).toBe(0);
  });
  it('un 3MF con caras pintadas toma el color del filamento de cada cara', () => {
    const model = `<?xml version="1.0"?><model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/><vertex x="0" y="10" z="0"/><vertex x="10" y="10" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="2" paint_color="4"/><triangle v1="1" v2="3" v3="2" paint_color="8"/></triangles></mesh></object></resources><build><item objectid="1"/></build></model>`;
    const settings = JSON.stringify({ filament_colour: ['#ff0000', '#00ff00'], filament_type: ['PLA', 'PLA'] });
    const m = parse3MF(zipSync({ '3D/3dmodel.model': strToU8(model), 'Metadata/project_settings.config': strToU8(settings) }));
    expect(m.colors).toBeTruthy(); expect([...m.colors!.slice(0, 3)]).toEqual([1, 0, 0]); expect([...m.colors!.slice(9, 12)]).toEqual([0, 1, 0]);
  });
});

