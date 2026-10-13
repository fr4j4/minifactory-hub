'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { cn } from '@/lib/format';
import { useT } from '@/i18n/client';

export interface ViewerMachine { id: string; name: string; volX: number; volY: number; volZ: number }
type Mode = 'solido' | 'alambrico' | 'rayosx' | 'normales';
type Tool = 'orbitar' | 'medir' | 'cara';

const f1 = (n: number, d = 1) => n.toFixed(d).replace('.', ',');
const fits = (d: [number, number, number], v: [number, number, number]) => (d[0] <= v[0] + 0.01 && d[1] <= v[1] + 0.01 && d[2] <= v[2] + 0.01) || (d[1] <= v[0] + 0.01 && d[0] <= v[1] + 0.01 && d[2] <= v[2] + 0.01);

function parseMesh(buf: ArrayBuffer) {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'MFM1') throw new Error('Unknown preview format');
  const nv = dv.getUint32(4, true), ni = dv.getUint32(8, true), flags = dv.getUint32(12, true), origTris = dv.getUint32(16, true);
  const verts = new Float32Array(buf, 20, nv * 3);
  const idx = new Uint32Array(buf, 20 + nv * 12, ni);
  let colors: Uint8Array | undefined;
  if (flags & 1) colors = new Uint8Array(buf, 20 + nv * 12 + ni * 4, nv * 3);
  return { verts, idx, colors, decimated: !!(flags & 2), origTris };
}

export function ModelViewer({ versionId, machines, defaultMachineId, color = '#ff6a2b', analysis, className, initialMode, onCapture }: {
  versionId: string; machines: ViewerMachine[]; defaultMachineId?: string | null; color?: string;
  analysis?: { dimX: number; dimY: number; dimZ: number; triangles: number } | null; className?: string; initialMode?: Mode;
  onCapture?: (dataUrl: string) => void;
}) {
  const t = useT();
  const host = useRef<HTMLDivElement>(null);
  const S = useRef<any>({}); // estado de three (no reactivo)
  const [status, setStatus] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [err, setErr] = useState('');
  const [mode, setMode] = useState<Mode>(initialMode ?? 'solido');
  const [tool, setTool] = useState<Tool>('orbitar');
  const [machineId, setMachineId] = useState<string>(defaultMachineId ?? machines[0]?.id ?? '');
  const [dims, setDims] = useState<[number, number, number] | null>(analysis ? [analysis.dimX, analysis.dimY, analysis.dimZ] : null);
  const [scale, setScale] = useState(100);
  const [section, setSection] = useState<{ on: boolean; axis: 'z' | 'x' | 'y'; pos: number }>({ on: false, axis: 'z', pos: 100 });
  const [overhang, setOverhang] = useState<{ on: boolean; deg: number }>({ on: false, deg: 45 });
  const [measure, setMeasure] = useState<{ mm: number | null; dx?: number; dy?: number; dz?: number } | null>(null);
  const [showDims, setShowDims] = useState(true);
  const [info, setInfo] = useState<{ tris: number; decimated: boolean; orig: number } | null>(null);
  const [panel, setPanel] = useState(true);
  const machine = machines.find((m) => m.id === machineId);

  /* ───────── escena ───────── */
  useEffect(() => {
    const el = host.current!; const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    let disposed = false;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.localClippingEnabled = true;
    el.appendChild(renderer.domElement); renderer.domElement.setAttribute('data-testid', 'viewer-canvas'); renderer.domElement.setAttribute('aria-label', t('viewer.n3dModelViewer')); renderer.domElement.setAttribute('role', 'img');
    const scene = new THREE.Scene(); scene.background = new THREE.Color(dark ? 0x161615 : 0xe8e5de);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000); camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = 0.12; controls.screenSpacePanning = true;
    scene.add(new THREE.HemisphereLight(0xffffff, dark ? 0x221d18 : 0xa89f90, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(150, -200, 300); scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(-200, 150, 100); scene.add(fill);
    const group = new THREE.Group(); scene.add(group);
    const overlay = new THREE.Group(); scene.add(overlay);
    const uniforms = { uOver: { value: 2 }, uSection: { value: 0 }, uBedZ: { value: 0 } };
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), flatShading: true, roughness: 0.55, metalness: 0.05, side: THREE.FrontSide, vertexColors: false });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWz;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWz = (modelMatrix * vec4(transformed, 1.0)).z;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWz;\nuniform float uOver; uniform float uSection; uniform float uBedZ;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 wn = inverseTransformDirection(normal, viewMatrix);
        if (uOver < 1.0 && vWz > uBedZ + 0.08 && wn.z < -uOver) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.1, 0.62), 0.9);
        if (uSection > 0.5 && !gl_FrontFacing) diffuseColor.rgb = vec3(0.07, 0.66, 0.72);`);
    };
    const clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1000);
    const st = S.current; Object.assign(st, { renderer, scene, camera, controls, group, overlay, mat, uniforms, clip, mesh: null as THREE.Mesh | null, wire: null, bedGroup: new THREE.Group(), raycaster: new THREE.Raycaster(), disposed: false });
    scene.add(st.bedGroup);
    const labels = el.querySelector('[data-dim-labels]') as HTMLElement | null; st.labels = labels;
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    let raf = 0;
    const loop = () => { raf = requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); updateLabels(); };
    const updateLabels = () => {
      const L = st.dimLabels as Array<{ el: HTMLElement; p: THREE.Vector3 }> | undefined; if (!L) return;
      const w = el.clientWidth, h = el.clientHeight;
      for (const l of L) { const v = l.p.clone().project(camera); l.el.style.transform = `translate(-50%,-50%) translate(${((v.x + 1) / 2) * w}px,${((1 - v.y) / 2) * h}px)`; l.el.style.display = v.z < 1 ? 'block' : 'none'; }
    };
    loop();
    (async () => {
      try {
        const res = await fetch(`/api/files/v/${versionId}/mesh`);
        if (res.status === 202 || !res.ok) throw new Error(res.status === 202 ? t('viewer.thePreviewIsStillBeing') : t('viewer.theModelCouldNotBe'));
        const m = parseMesh(await res.arrayBuffer()); if (disposed) return;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(m.verts, 3)); geo.setIndex(new THREE.BufferAttribute(m.idx, 1));
        if (m.colors) { geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(Array.from(m.colors, (x) => x / 255)), 3)); mat.vertexColors = true; mat.color.set(0xffffff); }
        geo.computeBoundingBox(); geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, mat); group.add(mesh); st.mesh = mesh;
        st.info = m; setInfo({ tris: m.idx.length / 3, decimated: m.decimated, orig: m.origTris });
        // base: bajar la pieza a la cama y centrarla
        const bb = geo.boundingBox!; st.base = { center: new THREE.Vector3((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, 0), minZ: bb.min.z };
        mesh.position.set(-st.base.center.x, -st.base.center.y, -bb.min.z);
        st.frame = () => frameCamera(st);
        placeOnBed(st); drawBed(st, st.machine ?? null); frameCamera(st); refreshDims(st, setDims);
        setStatus('listo');
      } catch (e) { setErr((e as Error).message); setStatus('error'); }
    })();
    return () => { disposed = true; st.disposed = true; cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose(); st.mesh?.geometry.dispose(); mat.dispose(); renderer.domElement.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionId]);

  /* ───────── efectos de estado → escena ───────── */
  useEffect(() => { S.current.machine = machine; if (S.current.mesh) { drawBed(S.current, machine ?? null); placeOnBed(S.current); } }, [machine, status]);
  useEffect(() => {
    const st = S.current; if (!st.mat) return; const m: THREE.MeshStandardMaterial = st.mat;
    m.wireframe = mode === 'alambrico'; m.transparent = mode === 'rayosx'; m.opacity = mode === 'rayosx' ? 0.35 : 1; m.depthWrite = mode !== 'rayosx';
    if (mode === 'normales' && st.mesh) { st.mesh.material = new THREE.MeshNormalMaterial({ flatShading: true }); } else if (st.mesh) { if (st.mesh.material !== m) st.mesh.material.dispose?.(); st.mesh.material = m; }
    m.needsUpdate = true;
  }, [mode, status]);
  useEffect(() => {
    const st = S.current; if (!st.mat) return;
    st.uniforms.uOver.value = overhang.on ? Math.cos((overhang.deg * Math.PI) / 180) : 2; st.mat.needsUpdate = true;
  }, [overhang, status]);
  useEffect(() => {
    const st = S.current; if (!st.mat || !st.mesh) return;
    const mat: THREE.MeshStandardMaterial = st.mat;
    if (section.on) {
      st.box = new THREE.Box3().setFromObject(st.mesh); const b: THREE.Box3 = st.box;
      const ax = section.axis; const lo = b.min[ax], hi = b.max[ax]; const v = lo + ((hi - lo) * section.pos) / 100;
      st.clip.normal.set(ax === 'x' ? 1 : 0, ax === 'y' ? 1 : 0, ax === 'z' ? 1 : 0).multiplyScalar(-1); st.clip.constant = v;
      mat.clippingPlanes = [st.clip]; mat.side = THREE.DoubleSide; st.uniforms.uSection.value = 1;
    } else { mat.clippingPlanes = []; mat.side = THREE.FrontSide; st.uniforms.uSection.value = 0; }
    mat.needsUpdate = true;
  }, [section, status]);
  useEffect(() => { const st = S.current; if (!st.group) return; st.group.scale.setScalar(scale / 100); placeOnBed(st); refreshDims(st, setDims); }, [scale]);
  useEffect(() => { const st = S.current; if (st.overlay) drawDimLabels(st, host.current!, showDims && dims ? dims : null); }, [showDims, dims, status]);

  /* ───────── herramientas de puntero ───────── */
  useEffect(() => {
    const st = S.current; const cv: HTMLCanvasElement | undefined = st.renderer?.domElement; if (!cv) return;
    let down: { x: number; y: number } | null = null;
    const pd = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const pu = (e: PointerEvent) => {
      if (!down || !st.mesh) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5; down = null; if (moved) return;
      const r = cv.getBoundingClientRect(); const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
      st.raycaster.setFromCamera(ndc, st.camera); const hit = st.raycaster.intersectObject(st.mesh, false)[0]; if (!hit) return;
      if (tool === 'medir') {
        st.pts = [...(st.pts ?? []), hit.point.clone()]; if (st.pts.length > 2) st.pts = [hit.point.clone()];
        drawMeasure(st); const p: THREE.Vector3[] = st.pts;
        setMeasure(p.length === 2 ? { mm: p[0].distanceTo(p[1]), dx: Math.abs(p[0].x - p[1].x), dy: Math.abs(p[0].y - p[1].y), dz: Math.abs(p[0].z - p[1].z) } : { mm: null });
      } else if (tool === 'cara' && hit.face) {
        const n = hit.face.normal.clone().transformDirection(st.mesh.matrixWorld);
        st.group.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(n, new THREE.Vector3(0, 0, -1)));
        st.group.updateMatrixWorld(true); placeOnBed(st); refreshDims(st, setDims); setTool('orbitar');
      }
    };
    cv.addEventListener('pointerdown', pd); cv.addEventListener('pointerup', pu);
    cv.style.cursor = tool === 'orbitar' ? 'grab' : 'crosshair';
    return () => { cv.removeEventListener('pointerdown', pd); cv.removeEventListener('pointerup', pu); };
  }, [tool, status]);

  const view = useCallback((name: 'frente' | 'arriba' | 'lado' | 'iso' | 'encuadrar') => {
    const st = S.current; if (!st.mesh) return;
    const box = new THREE.Box3().setFromObject(st.group); const c = box.getCenter(new THREE.Vector3()); const r = box.getSize(new THREE.Vector3()).length() * 0.9 + 20;
    const dir = { frente: [0, -1, 0.0001], arriba: [0, -0.0001, 1], lado: [1, 0, 0.0001], iso: [0.8, -1, 0.75], encuadrar: [0.8, -1, 0.75] }[name] as number[];
    const d = new THREE.Vector3(...dir).normalize(); st.camera.position.copy(c).addScaledVector(d, r * 1.6); st.controls.target.copy(c); st.controls.update();
  }, []);
  const rotate = (axis: 'x' | 'y' | 'z', deg: number) => {
    const st = S.current; if (!st.mesh) return;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0), (deg * Math.PI) / 180);
    st.group.quaternion.premultiply(q); st.group.updateMatrixWorld(true); placeOnBed(st); refreshDims(st, setDims);
  };
  const resetOrientation = () => { const st = S.current; st.group.quaternion.identity(); setScale(100); st.group.scale.setScalar(1); st.group.updateMatrixWorld(true); placeOnBed(st); refreshDims(st, setDims); };
  const capture = () => { const st = S.current; st.renderer.render(st.scene, st.camera); const url = st.renderer.domElement.toDataURL('image/png'); if (onCapture) onCapture(url); else { const a = document.createElement('a'); a.href = url; a.download = 'captura-visor.png'; a.click(); } };
  const clearMeasure = () => { S.current.pts = []; drawMeasure(S.current); setMeasure(null); };

  const fitInfo = useMemo(() => {
    if (!dims) return null;
    return machines.map((m) => ({ m, ok: fits(dims, [m.volX, m.volY, m.volZ]) }));
  }, [dims, machines]);
  const cur = fitInfo?.find((f) => f.m.id === machineId);
  const btn = (active: boolean) => cn('btn-sm rounded-md border px-2.5', active ? 'btn bg-[var(--panel)] border-[var(--panel)] text-[var(--panel-ink)] dark:bg-slate-700' : 'btn-ghost');

  return (
    <div className={cn('card overflow-hidden', className)}>
      <div className="relative bg-slate-100 dark:bg-[#161615]" style={{ height: 'min(70vh, 560px)', minHeight: 340 }}>
        <div ref={host} className="absolute inset-0" data-testid="viewer-host"><div data-dim-labels className="pointer-events-none absolute inset-0 overflow-hidden" /></div>
        {status === 'cargando' && <div className="absolute inset-0 grid place-items-center text-sm muted" role="status">{t('viewer.loadingModel')}</div>}
        {status === 'error' && <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-red-600 dark:text-red-400" role="alert">{err}</div>}
        {status === 'listo' && (
          <>
            <div className="absolute left-2 top-2 flex flex-wrap gap-1 max-w-[calc(100%-1rem)]" role="toolbar" aria-label={t('viewer.views')}>
              {(['frente', 'arriba', 'lado', 'iso'] as const).map((v) => <button key={v} className="btn-ghost btn-sm !bg-white/90 dark:!bg-slate-900/80" onClick={() => view(v)} data-testid={`view-${v}`}>{{ frente: t('viewer.front'), arriba: t('viewer.top'), lado: t('viewer.side'), iso: t('viewer.isometric') }[v]}</button>)}
              <button className="btn-ghost btn-sm !bg-white/90 dark:!bg-slate-900/80" onClick={() => view('encuadrar')} data-testid="view-fit">{t('viewer.fitToView')}</button>
            </div>
            {cur && <div className={cn('absolute right-2 top-2 rounded-lg px-3 py-1.5 text-xs font-medium shadow', cur.ok ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white')} role="status" data-testid="fit-badge">{cur.ok ? t('viewer.fitsIn', { m: cur.m.name }) : t('viewer.doesNotFitIn', { m: cur.m.name })}</div>}
            {measure && <div className="absolute left-2 bottom-2 rounded-lg bg-slate-900/85 text-white text-xs px-3 py-2" data-testid="measure-readout">{measure.mm == null ? t('viewer.chooseTheSecondPoint') : <>{t('viewer.distance')} <b>{f1(measure.mm, 2)} mm</b> <span className="opacity-70">(Δx {f1(measure.dx!)} · Δy {f1(measure.dy!)} · Δz {f1(measure.dz!)})</span></>}</div>}
            {info?.decimated && <div className="absolute right-2 bottom-2 rounded bg-amber-500 text-black text-[11px] px-2 py-1">{t('viewer.simplifiedMesh', { shown: (info.tris / 1000).toFixed(0), total: (info.orig / 1000).toFixed(0) })}</div>}
          </>
        )}
      </div>
      {status === 'listo' && (
        <div className="border-t border-slate-200 dark:border-slate-700">
          <button className="md:hidden w-full text-left px-3 py-2 text-sm font-medium" onClick={() => setPanel((p) => !p)} aria-expanded={panel}>{t('viewer.tools')} {panel ? '▾' : '▸'}</button>
          <div className={cn('p-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4 text-sm', !panel && 'hidden md:grid')}>
            <div>
              <div className="label">{t('viewer.displayMode')}</div>
              <div className="flex flex-wrap gap-1">{([['solido', t('viewer.solid')], ['alambrico', t('viewer.wireframe')], ['rayosx', t('viewer.xRay')], ['normales', t('viewer.normals')]] as const).map(([k, l]) => <button key={k} className={btn(mode === k)} onClick={() => setMode(k)} aria-pressed={mode === k} data-testid={`mode-${k}`}>{l}</button>)}</div>
            </div>
            <div>
              <div className="label">{t('viewer.tool')}</div>
              <div className="flex flex-wrap gap-1">
                <button className={btn(tool === 'orbitar')} onClick={() => setTool('orbitar')} aria-pressed={tool === 'orbitar'}>{t('viewer.orbit')}</button>
                <button className={btn(tool === 'medir')} onClick={() => { setTool('medir'); clearMeasure(); }} aria-pressed={tool === 'medir'} data-testid="tool-measure">{t('viewer.measure')}</button>
                <button className={btn(tool === 'cara')} onClick={() => setTool('cara')} aria-pressed={tool === 'cara'} data-testid="tool-face">{t('viewer.faceOnBed')}</button>
                {measure && <button className="btn-ghost btn-sm" onClick={clearMeasure}>{t('viewer.clearMeasurement')}</button>}
              </div>
              <p className="text-xs muted mt-1">{tool === 'medir' ? t('viewer.tapTwoPointsOnThe') : tool === 'cara' ? t('viewer.tapTheFaceYouWant') : t('viewer.dragToRotateTwoFingers')}</p>
            </div>
            <div>
              <div className="label">{t('viewer.machineBuildVolume')}</div>
              <select className="input" value={machineId} onChange={(e) => setMachineId(e.target.value)} aria-label={t('viewer.machineToCheckFit')} data-testid="machine-select">{machines.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.volX}×{m.volY}×{m.volZ}</option>)}</select>
              {fitInfo && <ul className="mt-1.5 flex flex-wrap gap-1.5 text-xs" aria-label={t('viewer.fitsIn2')}>{fitInfo.map((f) => <li key={f.m.id} className={cn('badge', f.ok ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800' : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-800')}>{f.ok ? '✓' : '✕'} {f.m.name}</li>)}</ul>}
            </div>
            <div>
              <div className="label">{t('viewer.dimensions')}</div>
              <div className="tabular font-medium" data-testid="dims">{dims ? `${f1(dims[0])} × ${f1(dims[1])} × ${f1(dims[2])} mm` : '—'}</div>
              <label className="flex items-center gap-2 text-xs mt-1"><input type="checkbox" checked={showDims} onChange={(e) => setShowDims(e.target.checked)} /> {t('viewer.showDimensionsInTheViewer')}</label>
            </div>
            <div>
              <label className="label" htmlFor="scale">{t('viewer.testScale', { scale })}</label>
              <input id="scale" type="range" min={10} max={300} value={scale} onChange={(e) => setScale(+e.target.value)} className="w-full" data-testid="scale-slider" />
              <div className="flex flex-wrap gap-1 mt-1.5">{(['x', 'y', 'z'] as const).map((a) => <button key={a} className="btn-ghost btn-sm" onClick={() => rotate(a, 90)} data-testid={`rot-${a}`}>{t('viewer.rotateAxis', { axis: a.toUpperCase() })}</button>)}<button className="btn-ghost btn-sm" onClick={resetOrientation}>{t('viewer.reset')}</button></div>
            </div>
            <div>
              <div className="label">{t('viewer.cuttingPlaneSection')}</div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={section.on} onChange={(e) => setSection((s) => ({ ...s, on: e.target.checked }))} data-testid="section-toggle" /> {t('viewer.enable')}</label>
              {section.on && <div className="mt-1.5 space-y-1.5"><div className="flex gap-1">{(['x', 'y', 'z'] as const).map((a) => <button key={a} className={btn(section.axis === a)} onClick={() => setSection((s) => ({ ...s, axis: a }))}>{a.toUpperCase()}</button>)}</div><input type="range" min={0} max={100} value={section.pos} onChange={(e) => setSection((s) => ({ ...s, pos: +e.target.value }))} className="w-full" aria-label={t('viewer.cuttingPlanePosition')} data-testid="section-slider" /></div>}
            </div>
            <div>
              <div className="label">{t('viewer.overhangAnalysis')}</div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={overhang.on} onChange={(e) => setOverhang((o) => ({ ...o, on: e.target.checked }))} data-testid="overhang-toggle" /> {t('viewer.highlightFacesInMagenta')}</label>
              {overhang.on && <div className="mt-1.5"><label className="text-xs muted" htmlFor="oh">{t('viewer.angle', { deg: overhang.deg })}</label><input id="oh" type="range" min={20} max={80} value={overhang.deg} onChange={(e) => setOverhang((o) => ({ ...o, deg: +e.target.value }))} className="w-full" data-testid="overhang-angle" /></div>}
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="label">{t('viewer.capture')}</div>
              <button className="btn-ghost btn-sm" onClick={capture} data-testid="capture">{t('viewer.captureViewerImage')}</button>
              <span className="text-xs muted">{t('viewer.itIsDownloadedAsA')}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────── utilidades de escena ───────── */
function placeOnBed(st: any) {
  if (!st.mesh) return;
  st.group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(st.mesh);
  const m: ViewerMachine | undefined = st.machine;
  const cx = m ? m.volX / 2 : 0, cy = m ? m.volY / 2 : 0;
  const c = box.getCenter(new THREE.Vector3());
  st.group.position.add(new THREE.Vector3(cx - c.x, cy - c.y, -box.min.z));
  st.group.updateMatrixWorld(true);
}
function refreshDims(st: any, set: (d: [number, number, number]) => void) {
  if (!st.mesh) return; st.group.updateMatrixWorld(true);
  const s = new THREE.Box3().setFromObject(st.mesh).getSize(new THREE.Vector3()); set([s.x, s.y, s.z]);
}
function frameCamera(st: any) {
  const box = new THREE.Box3().setFromObject(st.group); const c = box.getCenter(new THREE.Vector3()); const r = box.getSize(new THREE.Vector3()).length();
  const R = Math.max(r, 20) * 1.15;
  st.camera.position.set(c.x + R * 0.75, c.y - R * 0.95, c.z + R * 0.7); st.camera.near = Math.max(0.1, R / 200); st.camera.far = R * 40; st.camera.updateProjectionMatrix(); st.controls.target.copy(c); st.controls.update();
}
function drawBed(st: any, m: ViewerMachine | null) {
  const g: THREE.Group = st.bedGroup; while (g.children.length) { const o = g.children.pop()!; (o as any).geometry?.dispose(); }
  if (!m) return;
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const box = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(m.volX, m.volY, m.volZ));
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(m.volX, m.volY, m.volZ)), new THREE.LineBasicMaterial({ color: dark ? 0x77736b : 0x9a9284 })); e.position.set(m.volX / 2, m.volY / 2, m.volZ / 2); g.add(e);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(m.volX, m.volY), new THREE.MeshBasicMaterial({ color: dark ? 0x23221f : 0xdcd7cc, side: THREE.DoubleSide, transparent: true, opacity: 0.8, depthWrite: false })); plane.position.set(m.volX / 2, m.volY / 2, -0.05); g.add(plane);
  const grid = new THREE.GridHelper(Math.max(m.volX, m.volY), Math.round(Math.max(m.volX, m.volY) / 10), dark ? 0x45433e : 0xbab4a7, dark ? 0x2c2b28 : 0xd2cdc2); grid.rotation.x = Math.PI / 2; grid.position.set(m.volX / 2, m.volY / 2, 0.02); g.add(grid);
  void box;
}
function drawMeasure(st: any) {
  const o: THREE.Group = st.overlay; for (const c of [...o.children]) if ((c as any).userData.kind === 'measure') { o.remove(c); (c as any).geometry?.dispose(); }
  const pts: THREE.Vector3[] = st.pts ?? []; if (!pts.length) return;
  const r = Math.max(0.6, new THREE.Box3().setFromObject(st.group).getSize(new THREE.Vector3()).length() / 140);
  for (const p of pts) { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12), new THREE.MeshBasicMaterial({ color: 0x0ea5b7, depthTest: false })); s.position.copy(p); s.userData.kind = 'measure'; s.renderOrder = 10; o.add(s); }
  if (pts.length === 2) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x0ea5b7, depthTest: false })); l.userData.kind = 'measure'; l.renderOrder = 10; o.add(l); }
}
function drawDimLabels(st: any, host: HTMLElement, dims: [number, number, number] | null) {
  const o: THREE.Group = st.overlay; for (const c of [...o.children]) if ((c as any).userData.kind === 'dims') { o.remove(c); (c as any).geometry?.dispose(); }
  const holder = host.querySelector('[data-dim-labels]') as HTMLElement; holder.innerHTML = ''; st.dimLabels = [];
  if (!dims || !st.mesh) return;
  st.group.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(st.mesh); const mn = b.min, mx = b.max;
  const edges: Array<[THREE.Vector3, THREE.Vector3, string]> = [[new THREE.Vector3(mn.x, mn.y, mn.z), new THREE.Vector3(mx.x, mn.y, mn.z), `${f1(mx.x - mn.x)}`], [new THREE.Vector3(mx.x, mn.y, mn.z), new THREE.Vector3(mx.x, mx.y, mn.z), `${f1(mx.y - mn.y)}`], [new THREE.Vector3(mx.x, mx.y, mn.z), new THREE.Vector3(mx.x, mx.y, mx.z), `${f1(mx.z - mn.z)}`]];
  for (const [a, c, txt] of edges) {
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, c]), new THREE.LineBasicMaterial({ color: 0x151514, depthTest: false })); l.userData.kind = 'dims'; l.renderOrder = 5; o.add(l);
    const el = document.createElement('span'); el.textContent = `${txt} mm`; el.className = 'absolute left-0 top-0 num text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-[#151514] text-[#ece8df] ring-1 ring-white/10 whitespace-nowrap'; el.setAttribute('data-testid', 'dim-label'); holder.appendChild(el);
    st.dimLabels.push({ el, p: a.clone().add(c).multiplyScalar(0.5) });
  }
}
