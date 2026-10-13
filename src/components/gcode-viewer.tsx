'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { cn } from '@/lib/format';

const TYPE_LABEL = ['Perímetros', 'Relleno', 'Superficies', 'Soportes', 'Otro'];
const TYPE_COLOR = [0x2f6df6, 0x9aa7b8, 0x22b573, 0xf08a24, 0x8b8f99];

interface Parsed { bbox: { min: number[]; max: number[] }; layers: Array<{ z: number; t: Array<[number, number, number]> }>; types: string[]; total: number; sampled: boolean; seg: Float32Array }
function parse(buf: ArrayBuffer): Parsed {
  const dv = new DataView(buf); const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'MFG1') throw new Error('Vista previa de G-code inválida');
  const hl = dv.getUint32(4, true); const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl)));
  const off = 8 + hl; const seg = new Float32Array(buf.slice(off));
  return { ...head, seg };
}

/** Vista previa por capas: deslizador de capa, colores por tipo de línea y animación del recorrido. */
export function GcodeViewer({ src, className }: { src: string; className?: string }) {
  const host = useRef<HTMLDivElement>(null); const S = useRef<any>({});
  const [data, setData] = useState<Parsed | null>(null); const [err, setErr] = useState(''); const [layer, setLayer] = useState(0);
  const [show, setShow] = useState<boolean[]>([true, true, true, true, true]); const [playing, setPlaying] = useState(false); const [onlyCurrent, setOnlyCurrent] = useState(false);

  useEffect(() => {
    const el = host.current!; const dark = window.matchMedia('(prefers-color-scheme: dark)').matches; let disposed = false;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement); renderer.domElement.setAttribute('data-testid', 'gcode-canvas');
    const scene = new THREE.Scene(); scene.background = new THREE.Color(dark ? 0x0e1527 : 0xeef1f7);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000); camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
    const root = new THREE.Group(); scene.add(root);
    Object.assign(S.current, { renderer, scene, camera, controls, root, cur: null });
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    let raf = 0; const loop = () => { raf = requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); }; loop();
    (async () => {
      try {
        const r = await fetch(src); if (!r.ok) throw new Error('La vista previa de capas no está disponible para este archivo');
        const d = parse(await r.arrayBuffer()); if (disposed) return;
        const mn = d.bbox.min, mx = d.bbox.max; const cx = (mn[0] + mx[0]) / 2, cy = (mn[1] + mx[1]) / 2;
        // una geometría por tipo, ordenada por capa (para recortar con drawRange)
        const per: number[][] = [[], [], [], [], []]; const idx: number[][] = [[], [], [], [], []];
        d.layers.forEach((l, li) => { for (const [ti, off, cnt] of l.t) { idx[ti][li] = per[ti].length / 6; for (let k = 0; k < cnt; k++) { const o = (off + k) * 4; per[ti].push(d.seg[o] - cx, d.seg[o + 1] - cy, l.z, d.seg[o + 2] - cx, d.seg[o + 3] - cy, l.z); } } });
        const lines: THREE.LineSegments[] = []; const ends: number[][] = [[], [], [], [], []];
        for (let ti = 0; ti < 5; ti++) {
          const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(per[ti]), 3));
          const ls = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: TYPE_COLOR[ti], transparent: true, opacity: 0.85 })); ls.frustumCulled = false; root.add(ls); lines.push(ls);
          // fin (en segmentos) de cada capa para ese tipo
          let acc = 0; d.layers.forEach((l, li) => { const t = l.t.find((x) => x[0] === ti); if (t) acc = idx[ti][li] + t[2]; ends[ti][li] = acc; });
        }
        const bed = new THREE.GridHelper(Math.max(mx[0] - mn[0], mx[1] - mn[1]) * 1.4, 14, dark ? 0x3a4a70 : 0xb7c0d6, dark ? 0x263356 : 0xc9d1e3); bed.rotation.x = Math.PI / 2; root.add(bed);
        Object.assign(S.current, { lines, ends, d, center: [cx, cy] });
        const R = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2]) ; camera.position.set(R * 0.8, -R * 1.0, R * 0.9 + mx[2] / 2); controls.target.set(0, 0, mx[2] / 3); controls.update();
        setData(d); setLayer(d.layers.length - 1);
      } catch (e) { setErr((e as Error).message); }
    })();
    return () => { disposed = true; cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose(); renderer.domElement.remove(); };
  }, [src]);

  useEffect(() => {
    const st = S.current; if (!st.lines) return;
    for (let ti = 0; ti < 5; ti++) { const e = st.ends[ti]; let end = 0; for (let l = layer; l >= 0; l--) if (e[l] != null) { end = e[l]; break; } st.lines[ti].geometry.setDrawRange(0, end * 2); st.lines[ti].visible = show[ti]; st.lines[ti].material.opacity = onlyCurrent ? 0.15 : 0.85; }
    // capa actual resaltada
    if (st.cur) { st.root.remove(st.cur); st.cur.geometry.dispose(); st.cur = null; }
    const L = st.d.layers[layer]; if (L) {
      const pos: number[] = []; for (const [ti, off, cnt] of L.t) { if (!show[ti]) continue; for (let k = 0; k < cnt; k++) { const o = (off + k) * 4; pos.push(st.d.seg[o] - st.center[0], st.d.seg[o + 1] - st.center[1], L.z + 0.02, st.d.seg[o + 2] - st.center[0], st.d.seg[o + 3] - st.center[1], L.z + 0.02); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      st.cur = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xff3b6b })); st.cur.frustumCulled = false; st.root.add(st.cur); st.curCount = pos.length / 6;
    }
  }, [layer, show, data, onlyCurrent]);

  useEffect(() => {
    if (!playing || !data) return; const t = setInterval(() => setLayer((l) => { if (l >= data.layers.length - 1) { setPlaying(false); return l; } return l + 1; }), 60); return () => clearInterval(t);
  }, [playing, data]);

  const n = data?.layers.length ?? 0;
  return (
    <div className={cn('card overflow-hidden', className)}>
      <div className="relative bg-slate-100 dark:bg-[#0e1527]" style={{ height: 'min(62vh, 520px)', minHeight: 320 }}>
        <div ref={host} className="absolute inset-0" />
        {!data && !err && <div className="absolute inset-0 grid place-items-center text-sm muted" role="status">Cargando trayectorias…</div>}
        {err && <div className="absolute inset-0 grid place-items-center text-sm text-red-600 p-6 text-center" role="alert">{err}</div>}
        {data && <div className="absolute left-2 top-2 rounded bg-slate-900/80 text-white text-xs px-2.5 py-1.5" data-testid="gcode-layer-readout">Capa {layer + 1} / {n} · Z {data.layers[layer]?.z.toFixed(2)} mm</div>}
        {data?.sampled && <div className="absolute right-2 bottom-2 rounded bg-amber-500 text-black text-[11px] px-2 py-1">Relleno muestreado para el visor</div>}
      </div>
      {data && (
        <div className="p-3 border-t border-slate-200 dark:border-slate-700 space-y-3">
          <div className="flex items-center gap-3">
            <button className="btn-ghost btn-sm" onClick={() => { if (layer >= n - 1) setLayer(0); setPlaying((p) => !p); }} aria-label={playing ? 'Pausar animación' : 'Reproducir animación'} data-testid="gcode-play">{playing ? '❚❚ Pausar' : '▶ Reproducir'}</button>
            <input type="range" min={0} max={n - 1} value={layer} onChange={(e) => { setPlaying(false); setLayer(+e.target.value); }} className="flex-1" aria-label="Capa" data-testid="gcode-layer-slider" />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
            {TYPE_LABEL.map((l, i) => <label key={l} className="flex items-center gap-1.5"><input type="checkbox" checked={show[i]} onChange={(e) => setShow((s) => s.map((v, k) => (k === i ? e.target.checked : v)))} /><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: '#' + TYPE_COLOR[i].toString(16).padStart(6, '0') }} />{l}</label>)}
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={onlyCurrent} onChange={(e) => setOnlyCurrent(e.target.checked)} /> Resaltar solo la capa actual</label>
          </div>
        </div>
      )}
    </div>
  );
}
