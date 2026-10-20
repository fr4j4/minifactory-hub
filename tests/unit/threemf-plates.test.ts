import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { listPlates } from '@/lib/mesh/threemf-plates';
import { parse3MF, plateBedCenter, projectBed } from '@/lib/mesh/parse';

/** Tetraedro de 4 caras con el origen en (x0, y0): una pieza pequeña. */
const solid = (id: number, x0: number, y0: number) => `<object id="${id}" type="model"><mesh><vertices>` +
  `<vertex x="${x0}" y="${y0}" z="0"/><vertex x="${x0 + 10}" y="${y0}" z="0"/><vertex x="${x0}" y="${y0 + 10}" z="0"/><vertex x="${x0}" y="${y0}" z="10"/>` +
  `</vertices><triangles><triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="1" v3="3"/><triangle v1="1" v2="2" v3="3"/><triangle v1="2" v2="0" v3="3"/></triangles></mesh></object>`;
const item = (id: number, x: number, y: number) => `<item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 ${x} ${y} 0"/>`;
const cfg = (plates: string) => `<config><object id="1"><metadata key="name" value="a"/></object><object id="2"><metadata key="name" value="b"/></object>${plates}</config>`;
const plate = (id: number, name: string, inst: Array<[number, number]>) => `<plate><metadata key="plater_id" value="${id}"/><metadata key="plater_name" value="${name}"/>` +
  inst.map(([o, i]) => `<model_instance><metadata key="object_id" value="${o}"/><metadata key="instance_id" value="${i}"/></model_instance>`).join('') + '</plate>';

/** Proyecto de dos placas: placa 1 con la pieza 1; placa 2 con la pieza 2 y una segunda copia de la pieza 1. Las placas están desplazadas en el proyecto (x=100 y x=400). */
function project(withPlates = true) {
  const model = `<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>${solid(1, 0, 0)}${solid(2, 0, 0)}</resources>` +
    `<build>${item(1, 100, 100)}${item(2, 400, 100)}${item(1, 450, 100)}</build></model>`;
  const files: Record<string, Uint8Array> = { '3D/3dmodel.model': strToU8(model) };
  if (withPlates) files['Metadata/model_settings.config'] = strToU8(cfg(plate(1, 'Base', [[1, 0]]) + plate(2, 'Tapa', [[2, 0], [1, 1]])));
  return zipSync(files);
}

const xs = (m: { positions: Float32Array }, from = 0, to = m.positions.length) => { const v: number[] = []; for (let i = from; i < to; i += 3) v.push(m.positions[i]); return v; };

describe('3MF multiplaca', () => {
  it('lee las placas y qué instancia lleva cada una', () => {
    const plates = listPlates(project());
    expect(plates.map((p) => [p.index, p.name])).toEqual([[1, 'Base'], [2, 'Tapa']]);
    expect(plates[1].instances).toEqual([{ objectId: '2', instanceId: 0 }, { objectId: '1', instanceId: 1 }]);
  });

  it('sin placas declaradas no hay lista', () => {
    expect(listPlates(project(false))).toEqual([]);
  });

  it('sin parámetro devuelve todo el proyecto tal como está en la cama', () => {
    const all = parse3MF(project());
    expect(all.positions.length / 9).toBe(12); // 3 piezas × 4 caras
    expect(Math.min(...xs(all))).toBeGreaterThan(90);
  });

  it('una placa solo trae sus piezas y queda centrada en el origen', () => {
    const p1 = parse3MF(project(), { plate: 1 });
    expect(p1.positions.length / 9).toBe(4);
    const x1 = xs(p1);
    expect((Math.min(...x1) + Math.max(...x1)) / 2).toBeCloseTo(0, 3);
    const p2 = parse3MF(project(), { plate: 2 });
    expect(p2.positions.length / 9).toBe(8);
    const x2 = xs(p2);
    expect((Math.min(...x2) + Math.max(...x2)) / 2).toBeCloseTo(0, 3);
  });

  it('una placa inexistente falla con un error claro', () => {
    expect(() => parse3MF(project(), { plate: 5 })).toThrow();
  });

  it('recupera dónde están las piezas dentro de su cama según la grilla de Bambu Studio', () => {
    const bed = { w: 256, h: 256 };
    // 11 placas → 4 columnas; la placa 6 (fila 1, columna 1) tiene su origen en (307.2, -307.2): cama de 256 con 20 % de separación
    const pos = [307.2 + 100, -307.2 + 50, 0, 307.2 + 140, -307.2 + 90, 5];
    const c = plateBedCenter(pos, 6, 11, bed)!;
    expect(c.x).toBeCloseTo(120, 3); expect(c.y).toBeCloseTo(70, 3);
    // la placa 1 está en el origen; con 2 placas son 2 columnas
    expect(plateBedCenter([10, 20, 0, 30, 40, 0], 1, 2, bed)).toEqual({ x: 20, y: 30 });
    expect(plateBedCenter([256 * 1.2 + 10, 0, 0, 256 * 1.2 + 30, 20, 0], 2, 2, bed)).toEqual({ x: expect.closeTo(20, 3), y: 10 });
    // sin tamaño de cama no se inventa nada
    expect(plateBedCenter(pos, 6, 11, null)).toBeUndefined();
  });

  it('lee el tamaño de la cama del proyecto', () => {
    const cfg = (area: unknown) => ({ 'Metadata/project_settings.config': strToU8(JSON.stringify({ printable_area: area })) });
    expect(projectBed(cfg(['0x0', '256x0', '256x256', '0x256']))).toEqual({ w: 256, h: 256 });
    expect(projectBed(cfg(['-10x-10', '340x-10', '340x350', '-10x350']))).toEqual({ w: 350, h: 360 });
    expect(projectBed(cfg('no es una lista'))).toBeNull(); expect(projectBed({})).toBeNull();
  });

  it('una placa de un proyecto con cama declarada informa dónde están sus piezas', () => {
    const files: Record<string, Uint8Array> = { '3D/3dmodel.model': strToU8(`<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>${solid(1, 0, 0)}${solid(2, 0, 0)}</resources><build>${item(1, 100, 100)}${item(2, 256 * 1.2 + 50, 80)}</build></model>`),
      'Metadata/model_settings.config': strToU8(cfg(plate(1, 'A', [[1, 0]]) + plate(2, 'B', [[2, 0]]))),
      'Metadata/project_settings.config': strToU8(JSON.stringify({ printable_area: ['0x0', '256x0', '256x256', '0x256'] })) };
    const buf = zipSync(files);
    const c1 = parse3MF(buf, { plate: 1 }).bedCenter!, c2 = parse3MF(buf, { plate: 2 }).bedCenter!;
    expect(c1.x).toBeCloseTo(105, 3); expect(c1.y).toBeCloseTo(105, 3); // pieza de 10 mm en (100,100)
    expect(c2.x).toBeCloseTo(55, 3); expect(c2.y).toBeCloseTo(85, 3);
    expect(parse3MF(project(), { plate: 1 }).bedCenter).toBeUndefined(); // sin tamaño de cama
  });
});
