import sharp from 'sharp';
import type { Mesh } from './parse';

export interface Indexed { vertices: Float32Array; indices: Uint32Array; colors?: Float32Array /* por vértice */ }

export interface MeshAnalysis {
  triangles: number; vertices: number;
  dimX: number; dimY: number; dimZ: number;
  min: [number, number, number]; max: [number, number, number];
  volumeCm3: number; areaCm2: number;
  closed: boolean; openEdges: number; nonManifoldEdges: number; invertedNormals: boolean;
  overhangPct: number; degenerate: number; shells: number;
}

const Q = 1e4; // soldadura a 0,0001 mm
function hashKey(x: number, y: number, z: number): number {
  const ix = Math.round(x * Q), iy = Math.round(y * Q), iz = Math.round(z * Q);
  const h1 = (Math.imul(ix, 0x9e3779b1) ^ Math.imul(iy, 0x85ebca77) ^ Math.imul(iz, 0xc2b2ae3d)) >>> 0;
  const h2 = (Math.imul(ix ^ 0x5bd1e995, 0x27d4eb2f) + Math.imul(iy, 0x165667b1) + Math.imul(iz ^ 0x1b873593, 0x9e3779b1)) >>> 0;
  return h1 * 2097152 + (h2 >>> 11); // 53 bits
}

/** Suelda vértices coincidentes; con colores, también separa por color. */
export function weld(mesh: Mesh): Indexed {
  const P = mesh.positions; const n = P.length / 3;
  const map = new Map<number, number>();
  const idx = new Uint32Array(n);
  const verts: number[] = []; const cols: number[] = [];
  for (let i = 0; i < n; i++) {
    let key = hashKey(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    if (mesh.colors) key = key * 31 + hashKey(mesh.colors[i * 3] * 10, mesh.colors[i * 3 + 1] * 10, mesh.colors[i * 3 + 2] * 10) % 1000003;
    let j = map.get(key);
    if (j === undefined) {
      j = verts.length / 3; map.set(key, j);
      verts.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      if (mesh.colors) cols.push(mesh.colors[i * 3], mesh.colors[i * 3 + 1], mesh.colors[i * 3 + 2]);
    }
    idx[i] = j;
  }
  return { vertices: Float32Array.from(verts), indices: idx, colors: mesh.colors ? Float32Array.from(cols) : undefined };
}

export function analyze(mesh: Mesh, overhangDeg = 45): MeshAnalysis {
  const P = mesh.positions; const T = P.length / 9;
  let minx = Infinity, miny = Infinity, minz = Infinity, maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], y = P[i + 1], z = P[i + 2];
    if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; if (z < minz) minz = z; if (z > maxz) maxz = z;
  }
  let vol = 0, area = 0, overArea = 0, degenerate = 0;
  const cosLim = Math.cos((overhangDeg * Math.PI) / 180);
  for (let t = 0; t < T; t++) {
    const o = t * 9;
    const ax = P[o], ay = P[o + 1], az = P[o + 2], bx = P[o + 3], by = P[o + 4], bz = P[o + 5], cx = P[o + 6], cy = P[o + 7], cz = P[o + 8];
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    const a = len / 2; area += a;
    if (a < 1e-9) { degenerate++; continue; }
    const onBed = az < minz + 0.01 && bz < minz + 0.01 && cz < minz + 0.01;
    if (!onBed && nz / len < -cosLim) overArea += a;
  }
  // topología: aristas compartidas
  const ix = weld({ positions: P });
  const I = ix.indices;
  const edges = new Map<number, number>(); // clave de arista → conteo con signo de orientación
  const cnt = new Map<number, number>();
  const nV = ix.vertices.length / 3;
  let open = 0, nonMan = 0, orientationBad = 0;
  for (let t = 0; t < T; t++) {
    const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
    if (a === b || b === c || a === c) continue;
    for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
      const lo = Math.min(u, v), hi = Math.max(u, v);
      const key = lo * nV + hi;
      cnt.set(key, (cnt.get(key) ?? 0) + 1);
      edges.set(key, (edges.get(key) ?? 0) + (u < v ? 1 : -1));
    }
  }
  for (const [k, c] of cnt) { if (c === 1) open++; else if (c > 2) nonMan++; else if (c === 2 && edges.get(k) !== 0) orientationBad++; }
  // componentes conexas (shells) con union-find sobre vértices
  const parent = new Int32Array(nV).map((_, i) => i);
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let t = 0; t < T; t++) { const a = find(I[t * 3]), b = find(I[t * 3 + 1]), c = find(I[t * 3 + 2]); parent[b] = a; parent[find(c)] = find(a); }
  const roots = new Set<number>(); for (let t = 0; t < T; t++) roots.add(find(I[t * 3]));
  const closed = open === 0 && nonMan === 0;
  return {
    triangles: T, vertices: nV,
    dimX: maxx - minx, dimY: maxy - miny, dimZ: maxz - minz,
    min: [minx, miny, minz], max: [maxx, maxy, maxz],
    volumeCm3: Math.abs(vol) / 1000, areaCm2: area / 100,
    closed, openEdges: open, nonManifoldEdges: nonMan + orientationBad, invertedNormals: vol < 0,
    overhangPct: area > 0 ? (overArea / area) * 100 : 0, degenerate, shells: roots.size,
  };
}

/** Simplificación por agrupamiento de vértices en una grilla, para mallas muy pesadas (> maxTris). */
export function decimate(ix: Indexed, maxTris: number): Indexed {
  const T = ix.indices.length / 3;
  if (T <= maxTris) return ix;
  let minx = Infinity, miny = Infinity, minz = Infinity, maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
  const V = ix.vertices;
  for (let i = 0; i < V.length; i += 3) { minx = Math.min(minx, V[i]); maxx = Math.max(maxx, V[i]); miny = Math.min(miny, V[i + 1]); maxy = Math.max(maxy, V[i + 1]); minz = Math.min(minz, V[i + 2]); maxz = Math.max(maxz, V[i + 2]); }
  const ext = Math.max(maxx - minx, maxy - miny, maxz - minz) || 1;
  let cells = Math.round(Math.cbrt(maxTris) * 6);
  for (let attempt = 0; attempt < 8; attempt++) {
    const cell = ext / cells;
    const cmap = new Map<number, number>(); const nv: number[] = []; const sum: number[] = []; const num: number[] = [];
    const remap = new Uint32Array(V.length / 3);
    for (let i = 0; i < remap.length; i++) {
      const k = Math.floor((V[i * 3] - minx) / cell) * 1e12 + Math.floor((V[i * 3 + 1] - miny) / cell) * 1e6 + Math.floor((V[i * 3 + 2] - minz) / cell);
      let j = cmap.get(k);
      if (j === undefined) { j = num.length; cmap.set(k, j); sum.push(0, 0, 0); num.push(0); }
      sum[j * 3] += V[i * 3]; sum[j * 3 + 1] += V[i * 3 + 1]; sum[j * 3 + 2] += V[i * 3 + 2]; num[j]++;
      remap[i] = j;
    }
    for (let j = 0; j < num.length; j++) nv.push(sum[j * 3] / num[j], sum[j * 3 + 1] / num[j], sum[j * 3 + 2] / num[j]);
    const out: number[] = [];
    for (let t = 0; t < T; t++) {
      const a = remap[ix.indices[t * 3]], b = remap[ix.indices[t * 3 + 1]], c = remap[ix.indices[t * 3 + 2]];
      if (a !== b && b !== c && a !== c) out.push(a, b, c);
    }
    if (out.length / 3 <= maxTris * 1.15 || attempt === 7) return { vertices: Float32Array.from(nv), indices: Uint32Array.from(out) };
    cells = Math.floor(cells * 0.8);
  }
  return ix;
}

/** Formato binario de vista previa: 'MFM1' | nVerts u32 | nIdx u32 | flags u32 | vértices f32 | índices u32 | [colores u8] */
export function toPreviewBin(ix: Indexed, info: { origTriangles: number; decimated: boolean }): Buffer {
  const nv = ix.vertices.length / 3, ni = ix.indices.length;
  const hasCol = !!ix.colors;
  const head = Buffer.alloc(20);
  head.write('MFM1', 0, 'ascii'); head.writeUInt32LE(nv, 4); head.writeUInt32LE(ni, 8);
  head.writeUInt32LE((hasCol ? 1 : 0) | (info.decimated ? 2 : 0), 12); head.writeUInt32LE(info.origTriangles, 16);
  const parts = [head, Buffer.from(ix.vertices.buffer, ix.vertices.byteOffset, ix.vertices.byteLength), Buffer.from(ix.indices.buffer, ix.indices.byteOffset, ix.indices.byteLength)];
  if (hasCol) { const c = Buffer.alloc(nv * 3); for (let i = 0; i < nv * 3; i++) c[i] = Math.round(Math.max(0, Math.min(1, ix.colors![i])) * 255); parts.push(c); }
  return Buffer.concat(parts);
}

/* ───────────────────────── Miniatura (rasterizador por software) ───────────────────────── */
export async function renderThumbnail(mesh: Mesh, o: { w?: number; h?: number; color?: [number, number, number]; format?: 'png' | 'webp'; az?: number; el?: number } = {}): Promise<Buffer> {
  const W = o.w ?? 480, H = o.h ?? 360;
  const [cr, cg, cb] = o.color ?? [0.25, 0.5, 0.95];
  const az = ((o.az ?? -35) * Math.PI) / 180, el = ((o.el ?? 28) * Math.PI) / 180;
  const P = mesh.positions; const T = P.length / 9;
  // z-arriba → cámara en (az, el)
  const ca = Math.cos(az), sa = Math.sin(az), ce = Math.cos(el), se = Math.sin(el);
  // rotar alrededor de Z (az) y luego inclinar (el): x' = x ca - y sa ; y' = x sa + y ca ; pantalla: sx = x', sy = z ce + y' se ; depth = y' ce - z se
  const sxA = new Float32Array(P.length / 3), syA = new Float32Array(P.length / 3), dA = new Float32Array(P.length / 3);
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (let i = 0; i < sxA.length; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const xr = x * ca - y * sa, yr = x * sa + y * ca;
    const sx = xr, sy = z * ce + yr * se, d = yr * ce - z * se;
    sxA[i] = sx; syA[i] = sy; dA[i] = d;
    if (sx < minx) minx = sx; if (sx > maxx) maxx = sx; if (sy < miny) miny = sy; if (sy > maxy) maxy = sy;
  }
  const pad = 0.1;
  const scale = Math.min((W * (1 - 2 * pad)) / (maxx - minx || 1), (H * (1 - 2 * pad)) / (maxy - miny || 1));
  const ox = W / 2 - ((minx + maxx) / 2) * scale, oy = H / 2 + ((miny + maxy) / 2) * scale;
  const zbuf = new Float32Array(W * H).fill(-Infinity);
  const img = new Uint8ClampedArray(W * H * 4);
  // fondo degradado suave
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = (y * W + x) * 4; const g = 244 - (y / H) * 18; img[k] = g; img[k + 1] = g + 2; img[k + 2] = g + 6; img[k + 3] = 255; }
  // luz fija relativa a cámara
  const L = norm3([-0.4, -0.5, 0.75]);
  const L2 = norm3([0.6, 0.2, 0.3]);
  for (let t = 0; t < T; t++) {
    const o3 = t * 9;
    const a = [P[o3], P[o3 + 1], P[o3 + 2]], b = [P[o3 + 3], P[o3 + 4], P[o3 + 5]], c = [P[o3 + 6], P[o3 + 7], P[o3 + 8]];
    // normal en espacio mundo → espacio cámara
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const ln = Math.hypot(n[0], n[1], n[2]); if (ln < 1e-12) continue; n = [n[0] / ln, n[1] / ln, n[2] / ln];
    const nxr = n[0] * ca - n[1] * sa, nyr = n[0] * sa + n[1] * ca;
    const nc = [nxr, n[2] * ce + nyr * se, nyr * ce - n[2] * se]; // (x, y pantalla, profundidad)
    const lam = Math.max(0, nc[0] * L[0] + nc[1] * L[1] + nc[2] * L[2]) * 0.75 + Math.max(0, nc[0] * L2[0] + nc[1] * L2[1] + nc[2] * L2[2]) * 0.2 + 0.2;
    let tr = cr, tg = cg, tb = cb;
    if (mesh.colors) { tr = mesh.colors[o3]; tg = mesh.colors[o3 + 1]; tb = mesh.colors[o3 + 2]; }
    const R = Math.min(255, tr * lam * 255), G = Math.min(255, tg * lam * 255), B = Math.min(255, tb * lam * 255);
    const i0 = t * 3;
    const x0 = sxA[i0] * scale + ox, y0 = -syA[i0] * scale + oy, z0 = dA[i0];
    const x1 = sxA[i0 + 1] * scale + ox, y1 = -syA[i0 + 1] * scale + oy, z1 = dA[i0 + 1];
    const x2 = sxA[i0 + 2] * scale + ox, y2 = -syA[i0 + 2] * scale + oy, z2 = dA[i0 + 2];
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 1e-9) continue;
    const bx0 = Math.max(0, Math.floor(Math.min(x0, x1, x2))), bx1 = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    const by0 = Math.max(0, Math.floor(Math.min(y0, y1, y2))), by1 = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) / area;
      const w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
      const z = w0 * z0 + w1 * z1 + w2 * z2;
      const zi = y * W + x;
      if (z > zbuf[zi]) { zbuf[zi] = z; const k = zi * 4; img[k] = R; img[k + 1] = G; img[k + 2] = B; }
    }
  }
  const s = sharp(Buffer.from(img.buffer), { raw: { width: W, height: H, channels: 4 } });
  return o.format === 'webp' ? s.webp({ quality: 82 }).toBuffer() : s.png().toBuffer();
}
const norm3 = (v: number[]) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };

/** Dónde caben: ¿la pieza entra en el volumen de impresión (con rotación sobre Z libre en 90°)? */
export function fitsIn(dim: [number, number, number], vol: [number, number, number]) {
  const [x, y, z] = dim; const [vx, vy, vz] = vol;
  const eps = 0.01;
  return (x <= vx + eps && y <= vy + eps && z <= vz + eps) || (y <= vx + eps && x <= vy + eps && z <= vz + eps);
}
