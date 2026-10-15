/** Genera STL sintéticos pesados para medir tiempos (esfera de muchos triángulos, torre alta, caja grande). */
import fs from 'node:fs';
function stl(name: string, tris: number[][][]) {
  const b = Buffer.alloc(84 + tris.length * 50); b.writeUInt32LE(tris.length, 80); let o = 84;
  for (const t of tris) { o += 12; for (const v of t) for (const c of v) { b.writeFloatLE(c, o); o += 4; } o += 2; }
  fs.writeFileSync(name, b);
}
function sphere(r: number, n: number, cx = 0, cy = 0, cz = 0) {
  const t: number[][][] = []; const P = (i: number, j: number) => { const th = (Math.PI * i) / n, ph = (2 * Math.PI * j) / (2 * n); return [cx + r * Math.sin(th) * Math.cos(ph), cy + r * Math.sin(th) * Math.sin(ph), cz + r * Math.cos(th)]; };
  for (let i = 0; i < n; i++) for (let j = 0; j < 2 * n; j++) { const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1); if (i > 0) t.push([a, b, d]); if (i < n - 1) t.push([d, b, c]); }
  return t;
}
function box(x: number, y: number, z: number, w: number, d: number, h: number) {
  const v = [[0,0,0],[w,0,0],[w,d,0],[0,d,0],[0,0,h],[w,0,h],[w,d,h],[0,d,h]].map((p) => [p[0] + x, p[1] + y, p[2] + z]);
  const f = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
  return f.map((q) => q.map((i) => v[i]));
}
const out = process.argv[2] ?? '/tmp/spike-models'; fs.mkdirSync(out, { recursive: true });
stl(`${out}/esfera-200k.stl`, sphere(60, 316, 0, 0, 60));       // ≈ 200 000 triángulos, Ø120 mm
stl(`${out}/esfera-50k.stl`, sphere(40, 160, 0, 0, 40));
stl(`${out}/torre-200mm.stl`, box(0, 0, 0, 30, 30, 200));         // pieza alta
stl(`${out}/placa-grande.stl`, box(0, 0, 0, 200, 200, 30));       // 200×200×30 (relleno grande)
// voladizo: hongo (mesa grande sobre columna) para forzar soportes
stl(`${out}/hongo.stl`, [...box(-15, -15, 0, 30, 30, 40), ...box(-50, -50, 40, 100, 100, 6)]);
console.log('ok', fs.readdirSync(out));
