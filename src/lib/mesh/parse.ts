import { unzipSync, strFromU8 } from 'fflate';
import { XMLParser } from 'fast-xml-parser';
import { getT } from '@/i18n/server';
import { LocalizedError } from '@/i18n/errors';
import { parseAms } from './threemf-ams';

/** Malla como "sopa de triángulos": 9 floats por triángulo. colors (opcional) = 9 floats RGB 0..1 por triángulo. */
export interface Mesh {
  positions: Float32Array;
  colors?: Float32Array;
}

export const SUPPORTED_MESH = ['stl', 'obj', '3mf', 'ply', 'glb', 'gltf', 'amf', 'step', 'stp'] as const;
export const GCODE_EXT = ['gcode', 'gco', 'nc', 'bgcode'] as const;
export const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'pdf', 'svg'] as const;

export function extOf(name: string) { return (name.split('.').pop() || '').toLowerCase(); }

/* ───────────────────────── STL ───────────────────────── */
export function parseSTL(buf: Uint8Array): Mesh {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.byteLength >= 84) {
    const n = dv.getUint32(80, true);
    if (84 + n * 50 === buf.byteLength || (n > 0 && 84 + n * 50 <= buf.byteLength && !looksAscii(buf))) {
      const pos = new Float32Array(n * 9);
      let o = 84;
      for (let i = 0; i < n; i++) {
        o += 12; // normal
        for (let k = 0; k < 9; k++) { pos[i * 9 + k] = dv.getFloat32(o, true); o += 4; }
        o += 2;
      }
      return { positions: pos };
    }
  }
  return parseAsciiSTL(new TextDecoder().decode(buf));
}
function looksAscii(buf: Uint8Array) {
  const head = new TextDecoder().decode(buf.subarray(0, Math.min(buf.length, 256))).trimStart().toLowerCase();
  return head.startsWith('solid') && /facet\s+normal/.test(new TextDecoder().decode(buf.subarray(0, Math.min(buf.length, 2048))).toLowerCase());
}
function parseAsciiSTL(txt: string): Mesh {
  const out: number[] = [];
  const re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(txt))) out.push(+m[1], +m[2], +m[3]);
  if (out.length % 9 !== 0) throw new LocalizedError('parse.stlAscii');
  return { positions: Float32Array.from(out) };
}

/* ───────────────────────── OBJ (+ MTL opcional) ───────────────────────── */
export function parseOBJ(buf: Uint8Array, mtl?: string): Mesh {
  const txt = new TextDecoder().decode(buf);
  const v: number[] = [];
  const out: number[] = [];
  const col: number[] = [];
  const mats: Record<string, [number, number, number]> = {};
  if (mtl) {
    let cur = '';
    for (const line of mtl.split(/\r?\n/)) {
      const p = line.trim().split(/\s+/);
      if (p[0] === 'newmtl') cur = p.slice(1).join(' ');
      else if (p[0] === 'Kd' && cur) mats[cur] = [+p[1], +p[2], +p[3]];
    }
  }
  let curMat: [number, number, number] | null = null;
  let anyColor = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('v ')) { const p = line.split(/\s+/); v.push(+p[1], +p[2], +p[3]); }
    else if (line.startsWith('usemtl ')) { curMat = mats[line.slice(7).trim()] ?? null; }
    else if (line.startsWith('f ')) {
      const idx = line.slice(2).trim().split(/\s+/).map((tt) => {
        let i = parseInt(tt.split('/')[0], 10);
        if (i < 0) i = v.length / 3 + i + 1;
        return i - 1;
      });
      for (let k = 1; k < idx.length - 1; k++) {
        for (const i of [idx[0], idx[k], idx[k + 1]]) out.push(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]);
        const c = curMat ?? [0.8, 0.8, 0.8];
        if (curMat) anyColor = true;
        for (let q = 0; q < 3; q++) col.push(c[0], c[1], c[2]);
      }
    }
  }
  if (!out.length) throw new LocalizedError('parse.objNoFaces');
  return { positions: Float32Array.from(out), colors: anyColor ? Float32Array.from(col) : undefined };
}

/* ───────────────────────── PLY ───────────────────────── */
export function parsePLY(buf: Uint8Array): Mesh {
  const headEnd = indexOfSeq(buf, new TextEncoder().encode('end_header'));
  if (headEnd < 0) throw new LocalizedError('parse.plyNoHeader');
  let bodyStart = headEnd + 'end_header'.length;
  while (buf[bodyStart] === 13 || buf[bodyStart] === 10) { bodyStart++; if (buf[bodyStart - 1] === 10) break; }
  const header = new TextDecoder().decode(buf.subarray(0, headEnd)).split(/\r?\n/);
  const format = header.find((l) => l.startsWith('format'))?.split(/\s+/)[1] ?? 'ascii';
  const elements: Array<{ name: string; count: number; props: Array<{ name: string; type: string; list?: [string, string] }> }> = [];
  for (const l of header) {
    const p = l.trim().split(/\s+/);
    if (p[0] === 'element') elements.push({ name: p[1], count: +p[2], props: [] });
    else if (p[0] === 'property' && elements.length) {
      const e = elements[elements.length - 1];
      if (p[1] === 'list') e.props.push({ name: p[4], type: p[3], list: [p[2], p[3]] });
      else e.props.push({ name: p[2], type: p[1] });
    }
  }
  const sizes: Record<string, number> = { char: 1, uchar: 1, int8: 1, uint8: 1, short: 2, ushort: 2, int16: 2, uint16: 2, int: 4, uint: 4, int32: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 };
  const verts: number[] = []; const vcols: number[] = []; const faces: number[][] = [];
  let hasColor = false;
  if (format === 'ascii') {
    const lines = new TextDecoder().decode(buf.subarray(bodyStart)).split(/\r?\n/);
    let li = 0;
    for (const e of elements) {
      for (let i = 0; i < e.count; i++) {
        const tt = lines[li++].trim().split(/\s+/).map(Number);
        if (e.name === 'vertex') {
          const px = e.props.findIndex((p) => p.name === 'x');
          verts.push(tt[px], tt[px + 1], tt[px + 2]);
          const r = e.props.findIndex((p) => p.name === 'red');
          if (r >= 0) { hasColor = true; vcols.push(tt[r] / 255, tt[r + 1] / 255, tt[r + 2] / 255); } else vcols.push(0.8, 0.8, 0.8);
        } else if (e.name === 'face') { const n = tt[0]; faces.push(tt.slice(1, 1 + n)); }
      }
    }
  } else {
    const le = format === 'binary_little_endian';
    const dv = new DataView(buf.buffer, buf.byteOffset + bodyStart, buf.byteLength - bodyStart);
    let o = 0;
    const rd = (type: string): number => {
      const sz = sizes[type];
      let val: number;
      switch (type) {
        case 'char': case 'int8': val = dv.getInt8(o); break;
        case 'uchar': case 'uint8': val = dv.getUint8(o); break;
        case 'short': case 'int16': val = dv.getInt16(o, le); break;
        case 'ushort': case 'uint16': val = dv.getUint16(o, le); break;
        case 'int': case 'int32': val = dv.getInt32(o, le); break;
        case 'uint': case 'uint32': val = dv.getUint32(o, le); break;
        case 'float': case 'float32': val = dv.getFloat32(o, le); break;
        default: val = dv.getFloat64(o, le);
      }
      o += sz; return val;
    };
    for (const e of elements) {
      for (let i = 0; i < e.count; i++) {
        const rec: Record<string, number | number[]> = {};
        for (const p of e.props) {
          if (p.list) { const n = rd(p.list[0]); const arr: number[] = []; for (let k = 0; k < n; k++) arr.push(rd(p.list[1])); rec[p.name] = arr; }
          else rec[p.name] = rd(p.type);
        }
        if (e.name === 'vertex') {
          verts.push(rec.x as number, rec.y as number, rec.z as number);
          if ('red' in rec) { hasColor = true; vcols.push((rec.red as number) / 255, (rec.green as number) / 255, (rec.blue as number) / 255); } else vcols.push(0.8, 0.8, 0.8);
        } else if (e.name === 'face') faces.push((rec.vertex_indices ?? rec.vertex_index) as number[]);
      }
    }
  }
  const out: number[] = []; const col: number[] = [];
  for (const f of faces) for (let k = 1; k < f.length - 1; k++) for (const i of [f[0], f[k], f[k + 1]]) {
    out.push(verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]); col.push(vcols[i * 3], vcols[i * 3 + 1], vcols[i * 3 + 2]);
  }
  return { positions: Float32Array.from(out), colors: hasColor ? Float32Array.from(col) : undefined };
}
function indexOfSeq(buf: Uint8Array, seq: Uint8Array) {
  outer: for (let i = 0; i <= Math.min(buf.length - seq.length, 1 << 20); i++) { for (let j = 0; j < seq.length; j++) if (buf[i + j] !== seq[j]) continue outer; return i; }
  return -1;
}

/* ───────────────────────── 3MF ───────────────────────── */
type Mat = number[]; // 4x4 column-major simplificado: usamos 12 valores de 3MF
const IDENT: Mat = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
function parseTransform(tt?: string): Mat {
  if (!tt) return IDENT;
  const a = tt.trim().split(/\s+/).map(Number);
  return a.length === 12 ? a : IDENT;
}
function mulMat(a: Mat, b: Mat): Mat { // aplica a y luego b (vectores fila, como define 3MF)
  const A = (r: number, c: number) => (r < 3 ? a[r * 3 + c] : a[9 + c]);
  const B = (r: number, c: number) => (r < 3 ? b[r * 3 + c] : b[9 + c]);
  const out: number[] = new Array(12).fill(0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
    let sum = 0;
    for (let k = 0; k < 3; k++) sum += A(r, k) * B(k, c);
    if (r === 3) sum += B(3, c);
    out[r < 3 ? r * 3 + c : 9 + c] = sum;
  }
  return out;
}
function applyMat(m: Mat, x: number, y: number, z: number): [number, number, number] {
  return [x * m[0] + y * m[3] + z * m[6] + m[9], x * m[1] + y * m[4] + z * m[7] + m[10], x * m[2] + y * m[5] + z * m[8] + m[11]];
}
const arr = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/**
 * Estado (extrusor) de una cara pintada en Bambu Studio / OrcaSlicer. `paint_color` guarda un árbol de subdivisiones en hexadecimal,
 * leído desde el final: el primer símbolo es la raíz. Una hoja es `estado << 2`; el estado 3 se amplía con el símbolo siguiente (+3).
 * Si la cara está subdividida (varios colores en un triángulo) se devuelve el de su primera hoja: es una aproximación.
 * 0 = sin pintura (usa el color del objeto); n ≥ 1 = extrusor n.
 */
export function paintState(code: string): number {
  const nib = (i: number) => parseInt(code[code.length - 1 - i], 16);
  let i = 0; const guard = code.length;
  while (i < guard) {
    const n = nib(i); if (!Number.isFinite(n)) return 0;
    if ((n & 3) === 0) { const st = n >> 2; if (st === 3) { const m = nib(i + 1); return Number.isFinite(m) ? m + 3 : 0; } return st; }
    i++; // nodo dividido: se baja a su primer hijo
  }
  return 0;
}

interface ObjDef { mesh?: { v: Float32Array; t: Uint32Array; tri: Array<{ pid?: string; p1?: number; paint?: string }> }; comps?: Array<{ id: string; path?: string; m: Mat }>; pid?: string; pindex?: number }

export function parse3MF(buf: Uint8Array): Mesh {
  const files = unzipSync(buf);
  const xp = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false, removeNSPrefix: true, isArray: (n) => ['object', 'vertex', 'triangle', 'component', 'item', 'base', 'basematerials', 'color', 'colorgroup'].includes(n) });
  const rootName = Object.keys(files).find((n) => n.toLowerCase() === '3d/3dmodel.model');
  if (!rootName) throw new LocalizedError('parse.mf3NoModel');
  const palettes: Record<string, Array<[number, number, number]>> = {};
  const loadModel = (name: string) => {
    const doc = xp.parse(strFromU8(files[name])).model;
    const objs: Record<string, ObjDef> = {};
    for (const bm of arr<any>(doc?.resources?.basematerials)) {
      palettes[bm['@_id']] = arr<any>(bm.base).map((b) => hexToRgb(b['@_displaycolor']));
    }
    for (const cg of arr<any>(doc?.resources?.colorgroup)) {
      palettes[cg['@_id']] = arr<any>(cg.color).map((b) => hexToRgb(b['@_color']));
    }
    for (const o of arr<any>(doc?.resources?.object)) {
      const def: ObjDef = { pid: o['@_pid'], pindex: o['@_pindex'] !== undefined ? +o['@_pindex'] : undefined };
      if (o.mesh) {
        const vs = arr<any>(o.mesh.vertices?.vertex), ts = arr<any>(o.mesh.triangles?.triangle);
        const v = new Float32Array(vs.length * 3), tt = new Uint32Array(ts.length * 3);
        vs.forEach((q, i) => { v[i * 3] = +q['@_x']; v[i * 3 + 1] = +q['@_y']; v[i * 3 + 2] = +q['@_z']; });
        const tri: Array<{ pid?: string; p1?: number; paint?: string }> = [];
        ts.forEach((q, i) => { tt[i * 3] = +q['@_v1']; tt[i * 3 + 1] = +q['@_v2']; tt[i * 3 + 2] = +q['@_v3']; tri.push({ pid: q['@_pid'], p1: q['@_p1'] !== undefined ? +q['@_p1'] : undefined, paint: q['@_paint_color'] ? String(q['@_paint_color']) : undefined }); });
        def.mesh = { v, t: tt, tri };
      }
      if (o.components) def.comps = arr<any>(o.components.component).map((c) => ({ id: c['@_objectid'], path: c['@_path'], m: parseTransform(c['@_transform']) }));
      objs[o['@_id']] = def;
    }
    const items = arr<any>(doc?.build?.item).map((i) => ({ id: i['@_objectid'], m: parseTransform(i['@_transform']) }));
    return { objs, items };
  };
  const root = loadModel(rootName);
  const cache: Record<string, ReturnType<typeof loadModel>> = { [rootName]: root };
  const pos: number[] = []; const col: number[] = [];
  let anyColor = false;
  // color por extrusor (Bambu/Orca): cada objeto de la placa toma el color de su filamento si el 3MF no trae paleta propia
  const ams = parseAms(buf); const extColor = new Map<string, [number, number, number]>();
  if (ams?.multicolor) for (const o of ams.objects) { const f = ams.filaments[o.extruder - 1]; if (f) extColor.set(o.id, hexToRgb(f.color)); }
  let rootColor: [number, number, number] | undefined;
  const emit = (od: ObjDef, m: Mat) => {
    if (!od.mesh) return;
    const { v, t: tt, tri } = od.mesh;
    for (let i = 0; i < tt.length / 3; i++) {
      for (let k = 0; k < 3; k++) { const vi = tt[i * 3 + k] * 3; const p = applyMat(m, v[vi], v[vi + 1], v[vi + 2]); pos.push(p[0], p[1], p[2]); }
      const pid = tri[i].pid ?? od.pid; const pi = tri[i].p1 ?? od.pindex;
      const c = pid !== undefined && pi !== undefined ? palettes[pid]?.[pi] : undefined;
      if (c) anyColor = true;
      if (!c && rootColor) anyColor = true;
      // pintura por cara de Bambu Studio/Orca: manda sobre el color del objeto
      const ps = tri[i].paint ? paintState(tri[i].paint!) : 0; const pf = ps > 0 && ams?.filaments[ps - 1] ? hexToRgb(ams.filaments[ps - 1].color) : undefined;
      if (pf) anyColor = true;
      const cc = pf ?? c ?? rootColor ?? [0.8, 0.8, 0.8];
      for (let k = 0; k < 3; k++) col.push(cc[0], cc[1], cc[2]);
    }
  };
  const walk = (src: ReturnType<typeof loadModel>, id: string, m: Mat, depth = 0) => {
    if (depth > 8) return;
    const od = src.objs[id]; if (!od) return;
    emit(od, m);
    for (const c of od.comps ?? []) {
      let target = src;
      if (c.path) {
        const key = Object.keys(files).find((n) => n.toLowerCase() === c.path!.replace(/^\//, '').toLowerCase());
        if (!key) continue;
        target = cache[key] ?? (cache[key] = loadModel(key));
      }
      walk(target, c.id, mulMat(c.m, m), depth + 1);
    }
  };
  if (root.items.length) for (const it of root.items) { rootColor = extColor.get(it.id); walk(root, it.id, it.m); }
  else for (const id of Object.keys(root.objs)) { rootColor = extColor.get(id); walk(root, id, IDENT); }
  if (!pos.length) throw new LocalizedError('parse.mf3NoGeometry');
  return { positions: Float32Array.from(pos), colors: anyColor ? Float32Array.from(col) : undefined };
}
function hexToRgb(h?: string): [number, number, number] {
  if (!h) return [0.8, 0.8, 0.8];
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255];
}

/* ───────────────────────── AMF ───────────────────────── */
export function parseAMF(buf: Uint8Array): Mesh {
  let xml: string;
  if (buf[0] === 0x50 && buf[1] === 0x4b) { const f = unzipSync(buf); const n = Object.keys(f).find((k) => k.toLowerCase().endsWith('.amf')); if (!n) throw new LocalizedError('parse.amfEmpty'); xml = strFromU8(f[n]); }
  else xml = new TextDecoder().decode(buf);
  const doc = new XMLParser({ ignoreAttributes: false, isArray: (n) => ['object', 'vertex', 'triangle', 'volume'].includes(n) }).parse(xml).amf;
  const out: number[] = [];
  for (const o of arr<any>(doc?.object)) {
    const vs = arr<any>(o.mesh?.vertices?.vertex).map((v) => [+v.coordinates.x, +v.coordinates.y, +v.coordinates.z]);
    for (const vol of arr<any>(o.mesh?.volume)) for (const tt of arr<any>(vol.triangle)) for (const k of [tt.v1, tt.v2, tt.v3]) out.push(...vs[+k]);
  }
  if (!out.length) throw new LocalizedError('parse.amfNoGeometry');
  return { positions: Float32Array.from(out) };
}

/* ───────────────────────── GLB / glTF (binario) ───────────────────────── */
export function parseGLB(buf: Uint8Array): Mesh {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new LocalizedError('parse.glbInvalid');
  let o = 12; let json: any; let bin: Uint8Array | undefined;
  while (o < buf.byteLength) {
    const len = dv.getUint32(o, true), type = dv.getUint32(o + 4, true); o += 8;
    const chunk = buf.subarray(o, o + len);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk)); else if (type === 0x004e4942) bin = chunk;
    o += len;
  }
  if (!json || !bin) throw new LocalizedError('parse.glbIncomplete');
  const acc = (i: number) => {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView];
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type as string] ?? 1;
    const off = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const dvb = new DataView(bin!.buffer, bin!.byteOffset + off);
    const out: number[] = []; const stride = bv.byteStride;
    const size = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType as number] ?? 4;
    for (let k = 0; k < a.count; k++) for (let c = 0; c < comps; c++) {
      const p = (stride ? k * stride : k * comps * size) + c * size;
      out.push(a.componentType === 5126 ? dvb.getFloat32(p, true) : a.componentType === 5125 ? dvb.getUint32(p, true) : a.componentType === 5123 ? dvb.getUint16(p, true) : dvb.getUint8(p));
    }
    return out;
  };
  const pos: number[] = [];
  const nodeMat = (n: any): number[] => {
    if (n.matrix) return n.matrix;
    const [tx, ty, tz] = n.translation ?? [0, 0, 0]; const [qx, qy, qz, qw] = n.rotation ?? [0, 0, 0, 1]; const [sx, sy, sz] = n.scale ?? [1, 1, 1];
    return [
      (1 - 2 * (qy * qy + qz * qz)) * sx, 2 * (qx * qy + qz * qw) * sx, 2 * (qx * qz - qy * qw) * sx, 0,
      2 * (qx * qy - qz * qw) * sy, (1 - 2 * (qx * qx + qz * qz)) * sy, 2 * (qy * qz + qx * qw) * sy, 0,
      2 * (qx * qz + qy * qw) * sz, 2 * (qy * qz - qx * qw) * sz, (1 - 2 * (qx * qx + qy * qy)) * sz, 0, tx, ty, tz, 1];
  };
  const mul = (a: number[], b: number[]) => { const r = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k]; return r; };
  const visit = (ni: number, parent: number[]) => {
    const n = json.nodes[ni]; const m = mul(parent, nodeMat(n));
    if (n.mesh !== undefined) for (const p of json.meshes[n.mesh].primitives) {
      if (p.mode !== undefined && p.mode !== 4) continue;
      const P = acc(p.attributes.POSITION); const idx = p.indices !== undefined ? acc(p.indices) : Array.from({ length: P.length / 3 }, (_, i) => i);
      for (const i of idx) { const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; pos.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]); }
    }
    for (const c of n.children ?? []) visit(c, m);
  };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const scene = json.scenes?.[json.scene ?? 0];
  for (const ni of scene?.nodes ?? json.nodes.map((_: any, i: number) => i)) visit(ni, I);
  if (!pos.length) throw new LocalizedError('parse.glbNoTriangles');
  // glTF es Y-arriba; el taller trabaja Z-arriba
  const p2 = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) { p2[i] = pos[i]; p2[i + 1] = -pos[i + 2]; p2[i + 2] = pos[i + 1]; }
  return { positions: p2 };
}

/* ───────────────────────── STEP (OpenCascade WASM) ───────────────────────── */
export async function parseSTEP(buf: Uint8Array): Promise<Mesh> {
  const t = await getT();
  let occt: any;
  try {
    const mod: any = await import(/* webpackIgnore: true */ 'occt-import-js' as string);
    occt = await (mod.default ?? mod)();
  } catch (e) { throw new Error(t('viewer.stepConversionIsNotAvailable') + (e as Error).message); }
  const res = occt.ReadStepFile(buf, { linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.001, angularDeflection: 0.5 });
  if (!res.success) throw new Error(t('viewer.theStepFileCouldNot'));
  const pos: number[] = [];
  for (const m of res.meshes) {
    const P = m.attributes.position.array as number[]; const I = m.index.array as number[];
    for (const i of I) pos.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
  }
  if (!pos.length) throw new Error(t('viewer.theStepFileHasNo'));
  return { positions: Float32Array.from(pos) };
}

export async function parseMesh(buf: Uint8Array, ext: string, extra?: { mtl?: string }): Promise<Mesh> {
  const t = await getT();
  switch (ext) {
    case 'stl': return parseSTL(buf);
    case 'obj': return parseOBJ(buf, extra?.mtl);
    case '3mf': return parse3MF(buf);
    case 'ply': return parsePLY(buf);
    case 'amf': return parseAMF(buf);
    case 'glb': return parseGLB(buf);
    case 'step': case 'stp': return parseSTEP(buf);
    default: throw new Error(t('viewer.unsupportedModelFormat', { ext }));
  }
}
