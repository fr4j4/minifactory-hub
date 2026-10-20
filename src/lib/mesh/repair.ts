import type { Mesh } from './parse';
import { analyze, weld } from './ops';

export interface RepairReport {
  /** triángulos degenerados o repetidos que se descartaron */ removed: number;
  /** triángulos que se dieron vuelta para que toda la superficie quede orientada igual */ flipped: number;
  /** huecos cerrados con una tapa */ holesFilled: number;
  /** huecos que no se pudieron cerrar (demasiado grandes o irregulares) */ holesLeft: number;
  /** si el volumen salía negativo (normales hacia adentro), se invirtió toda la malla */ invertedAll: boolean;
  closedBefore: boolean; closedAfter: boolean; trianglesBefore: number; trianglesAfter: number;
}
const MAX_HOLE = 128; // aristas de un hueco que se tapa con un abanico

/**
 * Reparación básica: suelda vértices, quita triángulos degenerados y repetidos, orienta toda la superficie de forma consistente,
 * tapa huecos pequeños y deja las normales hacia afuera. No inventa geometría para huecos grandes ni separa mallas que se cruzan.
 */
export function repairMesh(mesh: Mesh): { mesh: Mesh; report: RepairReport } {
  const before = analyze(mesh);
  const ix = weld({ positions: mesh.positions }); const V = ix.vertices;
  // 1) triángulos válidos y sin repetir
  const seen = new Set<string>(); let tris: Array<[number, number, number]> = []; let removed = 0;
  for (let t = 0; t < ix.indices.length; t += 3) {
    const a = ix.indices[t], b = ix.indices[t + 1], c = ix.indices[t + 2];
    if (a === b || b === c || a === c) { removed++; continue; }
    const key = [a, b, c].sort((x, y) => x - y).join(',');
    if (seen.has(key)) { removed++; continue; }
    seen.add(key); tris.push([a, b, c]);
  }
  // 2) orientación consistente por componente (BFS sobre aristas compartidas)
  const edgeMap = new Map<string, number[]>(); const ek = (u: number, v: number) => (u < v ? `${u}_${v}` : `${v}_${u}`);
  tris.forEach(([a, b, c], i) => { for (const [u, v] of [[a, b], [b, c], [c, a]] as const) { const k = ek(u, v); (edgeMap.get(k) ?? edgeMap.set(k, []).get(k)!).push(i); } });
  const done = new Uint8Array(tris.length); let flipped = 0;
  const dirIn = (t: [number, number, number], u: number, v: number) => (t[0] === u && t[1] === v) || (t[1] === u && t[2] === v) || (t[2] === u && t[0] === v);
  for (let s0 = 0; s0 < tris.length; s0++) {
    if (done[s0]) continue; done[s0] = 1; const q = [s0];
    while (q.length) {
      const i = q.pop()!; const [a, b, c] = tris[i];
      for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
        for (const j of edgeMap.get(ek(u, v)) ?? []) {
          if (j === i || done[j]) continue;
          // dos triángulos vecinos bien orientados recorren la arista en sentidos opuestos
          if (dirIn(tris[j], u, v)) { const [x, y, z] = tris[j]; tris[j] = [x, z, y]; flipped++; }
          done[j] = 1; q.push(j);
        }
      }
    }
  }
  // 3) tapar huecos pequeños: aristas de borde → lazos
  const boundary = new Map<number, number>(); // desde → hasta (en el sentido de recorrido del triángulo vecino)
  const cnt = new Map<string, number>(); for (const [a, b, c] of tris) for (const [u, v] of [[a, b], [b, c], [c, a]] as const) cnt.set(ek(u, v), (cnt.get(ek(u, v)) ?? 0) + 1);
  const next = new Map<number, number[]>();
  for (const [a, b, c] of tris) for (const [u, v] of [[a, b], [b, c], [c, a]] as const) if (cnt.get(ek(u, v)) === 1) (next.get(v) ?? next.set(v, []).get(v)!).push(u); // el hueco se recorre al revés
  let holesFilled = 0, holesLeft = 0; const used = new Set<number>(); void boundary;
  for (const start of next.keys()) {
    if (used.has(start)) continue;
    const loop: number[] = [start]; used.add(start); let cur = start; let ok = true;
    for (;;) { const n = (next.get(cur) ?? []).find((x) => !used.has(x) || x === start); if (n === undefined) { ok = false; break; } if (n === start) break; if (loop.length > MAX_HOLE) { ok = false; break; } loop.push(n); used.add(n); cur = n; }
    if (!ok || loop.length < 3) { holesLeft++; continue; }
    for (let k = 1; k < loop.length - 1; k++) tris.push([loop[0], loop[k], loop[k + 1]]);
    holesFilled++;
  }
  // 4) normales hacia afuera
  let vol = 0; for (const [a, b, c] of tris) { const ax = V[a * 3], ay = V[a * 3 + 1], az = V[a * 3 + 2], bx = V[b * 3], by = V[b * 3 + 1], bz = V[b * 3 + 2], cx = V[c * 3], cy = V[c * 3 + 1], cz = V[c * 3 + 2]; vol += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx); }
  const invertedAll = vol < 0; if (invertedAll) tris = tris.map(([a, b, c]) => [a, c, b]);
  const positions = new Float32Array(tris.length * 9);
  tris.forEach(([a, b, c], i) => { for (const [k, v] of [a, b, c].entries()) { positions[i * 9 + k * 3] = V[v * 3]; positions[i * 9 + k * 3 + 1] = V[v * 3 + 1]; positions[i * 9 + k * 3 + 2] = V[v * 3 + 2]; } });
  const out: Mesh = { positions };
  const after = analyze(out);
  return { mesh: out, report: { removed, flipped, holesFilled, holesLeft, invertedAll, closedBefore: before.closed && !before.invertedNormals, closedAfter: after.closed && after.nonManifoldEdges === 0, trianglesBefore: before.triangles, trianglesAfter: after.triangles } };
}

/** STL binario de una malla. */
export function meshToStl(mesh: Mesh): Buffer {
  const n = mesh.positions.length / 9; const buf = Buffer.alloc(84 + n * 50); buf.write('MiniFactory repaired', 0, 'ascii'); buf.writeUInt32LE(n, 80);
  const P = mesh.positions;
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50; const a = i * 9;
    const ux = P[a + 3] - P[a], uy = P[a + 4] - P[a + 1], uz = P[a + 5] - P[a + 2], vx = P[a + 6] - P[a], vy = P[a + 7] - P[a + 1], vz = P[a + 8] - P[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    buf.writeFloatLE(nx, o); buf.writeFloatLE(ny, o + 4); buf.writeFloatLE(nz, o + 8);
    for (let k = 0; k < 9; k++) buf.writeFloatLE(P[a + k], o + 12 + k * 4);
  }
  return buf;
}
