'use client';
import { isDarkNow } from '@/lib/theme';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { cn } from '@/lib/format';
import { useT } from '@/i18n/client';

const TYPE_LABEL = ['viewer.perimeters', 'viewer.infill', 'viewer.surfaces', 'viewer.supports', 'viewer.other'] as const;
const TYPE_COLOR = [0xff5b1f, 0xb4ab9c, 0x2bb673, 0x3d8bfd, 0x8b8780];

interface Stats { byType: Array<{ timeS: number; mm: number }>; layerTimeS: number[]; speed: [number, number]; width: [number, number] }
interface Parsed { bbox: { min: number[]; max: number[] }; layers: Array<{ z: number; t: Array<[number, number, number]> }>; types: string[]; total: number; sampled: boolean; seg: Float32Array; speed?: Float32Array; width?: Float32Array; stats?: Stats }
type ColorMode = 'tipo' | 'velocidad' | 'ancho' | 'tiempoCapa' | 'flujo';
/** Escala azul → verde → amarillo → rojo para t en 0…1. */
const ramp = (t: number): [number, number, number] => { const x = Math.min(1, Math.max(0, t)); const c = new THREE.Color().setHSL((1 - x) * 0.66, 0.85, 0.5); return [c.r, c.g, c.b]; };
function parse(buf: ArrayBuffer): Parsed {
  const dv = new DataView(buf); const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'MFG1' && magic !== 'MFG2') throw new Error('Invalid G-code preview');
  const hl = dv.getUint32(4, true); const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl)));
  const off = 8 + hl;
  if (magic === 'MFG1') return { ...head, seg: new Float32Array(buf.slice(off)) };
  const n = head.segCount as number; // MFG2: n×4 posiciones, luego n velocidades y n anchos
  return { ...head, seg: new Float32Array(buf.slice(off, off + n * 16)), speed: new Float32Array(buf.slice(off + n * 16, off + n * 20)), width: new Float32Array(buf.slice(off + n * 20, off + n * 24)) };
}

/** Vista previa por capas: deslizador de capa, colores por tipo de línea y animación del recorrido. */
export function GcodeViewer({ src, className }: { src: string; className?: string }) {
  const t = useT();
  const host = useRef<HTMLDivElement>(null); const S = useRef<any>({});
  const [data, setData] = useState<Parsed | null>(null); const [err, setErr] = useState(''); const [layer, setLayer] = useState(0);
  const [flowR, setFlowR] = useState<[number, number]>([0, 0]); const [mode, setMode] = useState<ColorMode>('tipo'); const [show, setShow] = useState<boolean[]>([true, true, true, true, true]); const [playing, setPlaying] = useState(false); const [onlyCurrent, setOnlyCurrent] = useState(false);

  useEffect(() => {
    const el = host.current!; const dark = isDarkNow(); let disposed = false;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement); renderer.domElement.setAttribute('data-testid', 'gcode-canvas');
    const scene = new THREE.Scene(); scene.background = new THREE.Color(dark ? 0x161615 : 0xe8e5de);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000); camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
    const root = new THREE.Group(); scene.add(root);
    Object.assign(S.current, { renderer, scene, camera, controls, root, cur: null });
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    let raf = 0; const loop = () => { raf = requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); }; loop();
    (async () => {
      try {
        const r = await fetch(src); if (!r.ok) throw new Error(t('viewer.layerPreviewIsNotAvailable'));
        const d = parse(await r.arrayBuffer()); if (disposed) return;
        const mn = d.bbox.min, mx = d.bbox.max; const cx = (mn[0] + mx[0]) / 2, cy = (mn[1] + mx[1]) / 2;
        // una geometría por tipo, ordenada por capa (para recortar con drawRange)
        const per: number[][] = [[], [], [], [], []]; const idx: number[][] = [[], [], [], [], []]; const attr: Array<{ s: number[]; w: number[]; l: number[] }> = [0, 1, 2, 3, 4].map(() => ({ s: [], w: [], l: [] }));
        d.layers.forEach((l, li) => { for (const [ti, off, cnt] of l.t) { idx[ti][li] = per[ti].length / 6; for (let k = 0; k < cnt; k++) { const o = (off + k) * 4; per[ti].push(d.seg[o] - cx, d.seg[o + 1] - cy, l.z, d.seg[o + 2] - cx, d.seg[o + 3] - cy, l.z); attr[ti].s.push(d.speed?.[off + k] ?? 0); attr[ti].w.push(d.width?.[off + k] ?? 0); attr[ti].l.push(li); } } });
        const lines: THREE.LineSegments[] = []; const ends: number[][] = [[], [], [], [], []];
        for (let ti = 0; ti < 5; ti++) {
          const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(per[ti]), 3));
          const ls = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: TYPE_COLOR[ti], transparent: true, opacity: 0.85 })); ls.frustumCulled = false; root.add(ls); lines.push(ls);
          // fin (en segmentos) de cada capa para ese tipo
          let acc = 0; d.layers.forEach((l, li) => { const tt = l.t.find((x) => x[0] === ti); if (tt) acc = idx[ti][li] + tt[2]; ends[ti][li] = acc; });
        }
        const bed = new THREE.GridHelper(Math.max(mx[0] - mn[0], mx[1] - mn[1]) * 1.4, 14, dark ? 0x45433e : 0xbab4a7, dark ? 0x2c2b28 : 0xd2cdc2); bed.rotation.x = Math.PI / 2; root.add(bed);
        Object.assign(S.current, { lines, ends, d, center: [cx, cy], attr });
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

  // modos de color: tipo (colores fijos) o gradiente por velocidad, ancho de línea o tiempo de capa
  useEffect(() => {
    const st = S.current; if (!st.lines || !data) return;
    const stt = data.stats; const lt = stt?.layerTimeS ?? []; const ltMin = lt.length ? Math.min(...lt) : 0, ltMax = lt.length ? Math.max(...lt) : 1;
    // caudal volumétrico (mm³/s) = ancho × altura de capa × velocidad
    const layerH = (l: number) => Math.max(0.05, (data.layers[l]?.z ?? 0) - (l > 0 ? data.layers[l - 1].z : 0));
    const flowOf = (k: number, a: any) => a.w[k] * layerH(a.l[k]) * a.s[k];
    let flowRange: [number, number] = [0, 1];
    if (mode === 'flujo') { let lo = Infinity, hi = 0; for (let ti = 0; ti < 5; ti++) { const a = st.attr[ti]; for (let k = 0; k < a.l.length; k++) { const f = flowOf(k, a); if (f < lo) lo = f; if (f > hi) hi = f; } } flowRange = [Number.isFinite(lo) ? lo : 0, hi || 1]; setFlowR(flowRange); }
    for (let ti = 0; ti < 5; ti++) {
      const ls = st.lines[ti] as THREE.LineSegments; const m = ls.material as THREE.LineBasicMaterial; const a = st.attr[ti];
      if (mode === 'tipo' || !stt) { ls.geometry.deleteAttribute('color'); m.vertexColors = false; m.color.setHex(TYPE_COLOR[ti]); m.needsUpdate = true; continue; }
      const n = a.l.length; const col = new Float32Array(n * 6);
      for (let k = 0; k < n; k++) {
        const t = mode === 'flujo' ? (flowOf(k, a) - flowRange[0]) / Math.max(1e-6, flowRange[1] - flowRange[0]) : mode === 'velocidad' ? (a.s[k] - stt.speed[0]) / Math.max(1e-6, stt.speed[1] - stt.speed[0]) : mode === 'ancho' ? (a.w[k] - stt.width[0]) / Math.max(1e-6, stt.width[1] - stt.width[0]) : (lt[a.l[k]] - ltMin) / Math.max(1e-6, ltMax - ltMin);
        const c = ramp(mode === 'tiempoCapa' ? 1 - t : t); col.set([...c, ...c], k * 6);
      }
      ls.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3)); m.vertexColors = true; m.color.setHex(0xffffff); m.needsUpdate = true;
    }
  }, [mode, data]);

  useEffect(() => {
    if (!playing || !data) return; const tt = setInterval(() => setLayer((l) => { if (l >= data.layers.length - 1) { setPlaying(false); return l; } return l + 1; }), 60); return () => clearInterval(tt);
  }, [playing, data]);

  const n = data?.layers.length ?? 0;
  return (
    <div className={cn('card overflow-hidden', className)}>
      <div className="relative bg-slate-100 dark:bg-[#161615]" style={{ height: 'min(62vh, 520px)', minHeight: 320 }}>
        <div ref={host} className="absolute inset-0" />
        {!data && !err && <div className="absolute inset-0 grid place-items-center text-sm muted" role="status">{t('viewer.loadingToolpaths')}</div>}
        {err && <div className="absolute inset-0 grid place-items-center text-sm text-red-600 dark:text-red-400 p-6 text-center" role="alert">{err}</div>}
        {data && <div className="absolute left-2 top-2 rounded bg-slate-900/80 text-white text-xs px-2.5 py-1.5" data-testid="gcode-layer-readout">{t('viewer.layer')} {layer + 1} / {n} · Z {data.layers[layer]?.z.toFixed(2)} mm</div>}
        {data?.sampled && <div className="absolute right-2 bottom-2 rounded bg-amber-500 text-black text-[11px] px-2 py-1">{t('viewer.infillSampledForTheViewer')}</div>}
      </div>
      {data && (
        <div className="p-3 border-t border-slate-200 dark:border-slate-700 space-y-3">
          <div className="flex items-center gap-3">
            <button className="btn-ghost btn-sm" onClick={() => { if (layer >= n - 1) setLayer(0); setPlaying((p) => !p); }} aria-label={playing ? t('viewer.pauseAnimation') : t('viewer.playAnimation')} data-testid="gcode-play">{playing ? t('viewer.pauseShort') : t('viewer.playShort')}</button>
            <input type="range" min={0} max={n - 1} value={layer} onChange={(e) => { setPlaying(false); setLayer(+e.target.value); }} className="flex-1" aria-label={t('viewer.layer')} data-testid="gcode-layer-slider" />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
            {TYPE_LABEL.map((lk, i) => <label key={lk} className="flex items-center gap-1.5"><input type="checkbox" checked={show[i]} onChange={(e) => setShow((s) => s.map((v, k) => (k === i ? e.target.checked : v)))} /><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: '#' + TYPE_COLOR[i].toString(16).padStart(6, '0') }} />{t(lk)}</label>)}
            {data.stats && <label className="flex items-center gap-1.5">{t('viewer.colorBy')}<select className="input !min-h-[32px] !py-0.5 !w-auto" value={mode} onChange={(e) => setMode(e.target.value as ColorMode)} data-testid="gcode-color-mode">{(['tipo', 'velocidad', 'ancho', 'tiempoCapa', 'flujo'] as const).map((m) => <option key={m} value={m}>{t(`viewer.mode_${m}` as 'viewer.mode_tipo')}</option>)}</select></label>}
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={onlyCurrent} onChange={(e) => setOnlyCurrent(e.target.checked)} /> {t('viewer.highlightOnlyTheCurrentLayer')}</label>
          </div>
          {data.stats && mode !== 'tipo' && <div className="flex items-center gap-2 text-xs muted" data-testid="gcode-legend"><span>{mode === 'flujo' ? `${(flowR[0]).toFixed(1)} mm³/s` : mode === 'velocidad' ? `${data.stats.speed[0].toFixed(0)} mm/s` : mode === 'ancho' ? `${data.stats.width[0].toFixed(2)} mm` : t('viewer.slowLayers')}</span><span className="h-2 flex-1 max-w-48 rounded" style={{ background: 'linear-gradient(90deg, hsl(240 85% 50%), hsl(120 85% 50%), hsl(60 85% 50%), hsl(0 85% 50%))' }} /><span>{mode === 'flujo' ? `${(flowR[1]).toFixed(1)} mm³/s` : mode === 'velocidad' ? `${data.stats.speed[1].toFixed(0)} mm/s` : mode === 'ancho' ? `${data.stats.width[1].toFixed(2)} mm` : t('viewer.fastLayers')}</span></div>}
          {data.stats && mode === 'tipo' && (() => { const tot = data.stats.byType.reduce((a, x) => a + x.timeS, 0) || 1; return <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs muted" data-testid="gcode-time-by-type">{data.stats.byType.map((x, i) => x.timeS > 0 && <li key={i}>{t(TYPE_LABEL[i])}: <b>{Math.round((x.timeS / tot) * 100)}%</b></li>)}</ul>; })()}
        </div>
      )}
    </div>
  );
}
