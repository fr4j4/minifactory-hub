// Genera promo-en y promo-es (HyperFrames) a partir de las mismas escenas.
// Uso: node build.mjs [en|es]   — requiere ffmpeg + `npx hyperframes tts` (Kokoro local).
import { execSync } from 'node:child_process';
import { mkdirSync, copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(here, '..', 'docs', 'reporte', 'media', 'screens');

// img: captura real de la app; pos: punto de enfoque (% x,y) para el push-in
const scenes = [
  { id: 'hook', kind: 'text', img: null,
    en: { kicker: 'SOUND FAMILIAR?', h: 'Your print shop runs on <em>WhatsApp</em>, spreadsheets… and <em>luck.</em>', say: 'Your print shop runs on WhatsApp, spreadsheets, and luck.' },
    es: { kicker: '¿TE SUENA?', h: 'Tu taller 3D funciona con <em>WhatsApp</em>, planillas… y <em>suerte.</em>', say: 'Tu taller de impresión tres de, funciona con WhatsApp, planillas, y suerte.' } },
  { id: 'title', kind: 'title', img: '91-diseno-inicio',
    en: { kicker: 'MEET', h: 'MiniFactory <em>Hub</em>', sub: 'The whole 3D print shop. One place.', say: 'Meet MiniFactory Hub. Your whole print shop, in one place.' },
    es: { kicker: 'CONOCE', h: 'MiniFactory <em>Hub</em>', sub: 'Todo tu taller 3D. En un solo lugar.', say: 'Conoce MiniFactory Hub. Todo tu taller de impresión, en un solo lugar.' } },
  { id: 'quote', kind: 'shot', img: '33-presupuesto-precio-final', pos: [78, 90],
    en: { kicker: '01 · QUOTES', h: 'Quote any job in <em>seconds.</em>', chips: ['Multi-model', 'Real margins', 'One click to order'], say: 'Quote any job in seconds. Many models, real margins, and one click to turn it into an order.' },
    es: { kicker: '01 · PRESUPUESTOS', h: 'Cotiza cualquier trabajo en <em>segundos.</em>', chips: ['Varios modelos', 'Márgenes reales', 'Un clic a pedido'], say: 'Cotiza cualquier trabajo en segundos. Varios modelos, márgenes reales, y un clic para convertirlo en pedido.' } },
  { id: 'slice', kind: 'shot', img: '21-laminar-resultado', pos: [62, 68],
    en: { kicker: '02 · 3D + SLICER', h: 'See it. Slice it. <em>Price it.</em>', chips: ['3D viewer', 'Real OrcaSlicer', 'Time · grams · cost'], say: 'See the model in three D. Slice it on your own server. Know the time, the grams, and the price, before you press print.' },
    es: { kicker: '02 · 3D + LAMINADOR', h: 'Míralo. Lámina. <em>Cotízalo.</em>', chips: ['Visor 3D', 'OrcaSlicer real', 'Tiempo · gramos · costo'], say: 'Mira el modelo en tres de. Lamínalo en tu propio servidor. Conoce el tiempo, los gramos y el precio, antes de imprimir.' } },
  { id: 'queue', kind: 'shot', img: '44-cola-tablero', pos: [50, 30], tall: true,
    en: { kicker: '03 · PRODUCTION', h: 'Every order, <em>one queue.</em>', chips: ['Kanban + Gantt', 'Per machine', 'Nothing forgotten'], say: 'Every order lands in one production queue. By machine, by deadline, and nothing gets forgotten.' },
    es: { kicker: '03 · PRODUCCIÓN', h: 'Todos los pedidos, <em>una cola.</em>', chips: ['Kanban + Gantt', 'Por máquina', 'Nada se olvida'], say: 'Cada pedido cae en una sola cola de producción. Por máquina, por fecha de entrega, y nada se olvida.' } },
  { id: 'stock', kind: 'shot', img: '65-bobinas', pos: [40, 50],
    en: { kicker: '04 · STOCK + SALES', h: 'Every spool, <em>to the gram.</em>', chips: ['QR labels', 'Auto deduction', 'Quick sales'], say: 'Track every spool to the gram. Stock drops by itself after each print, and quick sales take two taps.' },
    es: { kicker: '04 · STOCK + VENTAS', h: 'Cada bobina, <em>al gramo.</em>', chips: ['Etiquetas QR', 'Descuento automático', 'Venta rápida'], say: 'Controla cada bobina al gramo. El stock baja solo después de cada impresión, y la venta rápida toma dos toques.' } },
  { id: 'bambu', kind: 'shot', img: 'B06-camara-en-vivo', pos: [28, 52],
    en: { kicker: '05 · BAMBU LAB', h: 'Watch your printers <em>live.</em>', chips: ['Camera', 'Layers + AMS', 'Send to print'], say: 'And watch your Bambu Lab printers live. Camera, layers, A M S. You can even send the job from the browser.' },
    es: { kicker: '05 · BAMBU LAB', h: 'Mira tus impresoras <em>en vivo.</em>', chips: ['Cámara', 'Capas + AMS', 'Enviar a imprimir'], say: 'Y mira tus impresoras Bambu Lab en vivo. Cámara, capas, A M S. Incluso puedes enviar el trabajo desde el navegador.' } },
  { id: 'cta', kind: 'cta', img: '97-diseno-inicio-oscuro',
    en: { kicker: 'SELF-HOSTED · YOUR DATA · YOUR HARDWARE', h: 'Print more. <em>Chase less.</em>', sub: 'MiniFactory Hub', say: 'Runs on your own hardware, on your phone, in dark mode. MiniFactory Hub. Print more. Chase less.' },
    es: { kicker: 'AUTOALOJADO · TUS DATOS · TU HARDWARE', h: 'Imprime más. <em>Persigue menos.</em>', sub: 'MiniFactory Hub', say: 'Corre en tu propio hardware, en tu teléfono, en modo oscuro. MiniFactory Hub. Imprime más. Persigue menos.' } },
];

const LANGS = { en: { voice: 'am_michael', lang: 'en-us', speed: 1.0, html: 'en' },
                es: { voice: 'ef_dora', lang: 'es', speed: 1.0, html: 'es' } };
const only = process.argv[2];
const sh = (c) => execSync(c, { stdio: 'pipe', maxBuffer: 1 << 26 }).toString();

for (const [code, cfg] of Object.entries(LANGS)) {
  if (only && only !== code) continue;
  const dir = join(here, `promo-${code}`);
  if (!existsSync(dir)) execSync(`npx -y hyperframes init promo-${code} --non-interactive --example=blank`, { cwd: here, stdio: 'ignore' });
  mkdirSync(join(dir, 'assets/audio'), { recursive: true });
  mkdirSync(join(dir, 'assets/img'), { recursive: true });

  // 1) voz por escena + duración real
  let t = 0; const timed = [];
  for (const s of scenes) {
    const wav = join(dir, `assets/audio/${s.id}.wav`);
    if (!existsSync(wav)) {
      const txt = join(dir, `assets/audio/${s.id}.txt`);
      writeFileSync(txt, s[code].say);
      sh(`npx -y hyperframes tts ${JSON.stringify(txt)} --voice ${cfg.voice} --lang ${cfg.lang} --speed ${cfg.speed} -o ${JSON.stringify(wav)}`);
    }
    const dur = parseFloat(sh(`ffprobe -v error -show_entries format=duration -of csv=p=0 ${JSON.stringify(wav)}`));
    const lead = s.id === 'hook' ? 0.5 : 0.35, tail = s.id === 'cta' ? 1.6 : 0.5;
    const total = Math.round((lead + dur + tail) * 100) / 100;
    timed.push({ ...s, start: Math.round(t * 100) / 100, lead, dur, total });
    t += total;
  }
  const TOTAL = Math.round(t * 100) / 100;

  // 2) cama musical sintética (sin dependencias): acordes lentos + pulso suave
  const bed = join(dir, 'assets/audio/bed.wav');
  if (!existsSync(bed)) {
    sh(`ffmpeg -y -f lavfi -i "aevalsrc='0.35*sin(2*PI*55*t)+0.22*sin(2*PI*82.4*t)+0.16*sin(2*PI*110*t)*(0.6+0.4*sin(2*PI*0.25*t))+0.10*sin(2*PI*164.8*t)*(0.5+0.5*sin(2*PI*0.5*t))':s=44100:d=${TOTAL + 1}" -af "lowpass=f=900,afade=t=in:d=1.5,afade=t=out:st=${TOTAL - 1.5}:d=2.5,volume=0.5" ${JSON.stringify(bed)}`);
  }

  copyFileSync(join(here, 'gsap.min.js'), join(dir, 'assets/gsap.min.js'));
  // 3) imágenes
  for (const s of timed) if (s.img) copyFileSync(join(SHOTS, `${s.img}.png`), join(dir, `assets/img/${s.img}.png`));

  // 4) HTML
  const clips = timed.map((s, i) => {
    const c = s[code];
    const img = s.img ? `<img class="shot" src="assets/img/${s.img}.png" alt="" />` : '';
    const chips = (c.chips || []).map((x) => `<span class="chip">${x}</span>`).join('');
    const body = {
      text: `<div class="center"><div class="kicker">${c.kicker}</div><h1 class="big">${c.h}</h1></div>`,
      title: `<div class="bgshot">${img}</div><div class="center"><div class="kicker">${c.kicker}</div><h1 class="huge">${c.h}</h1><p class="sub">${c.sub}</p></div>`,
      shot: `<div class="left"><div class="kicker">${c.kicker}</div><h2>${c.h}</h2><div class="chips">${chips}</div></div><div class="card ${s.tall ? 'tall' : ''}">${img}</div>`,
      cta: `<div class="bgshot dim">${img}</div><div class="center"><div class="kicker">${c.kicker}</div><h1 class="big">${c.h}</h1><div class="brand"><i></i>${c.sub}</div></div>`,
    }[s.kind];
    return `<section id="s-${s.id}" class="clip scene ${s.kind}" data-start="${s.start}" data-duration="${s.total}" data-track-index="1">${body}</section>
    <audio id="a-${s.id}" src="assets/audio/${s.id}.wav" data-start="${(s.start + s.lead).toFixed(2)}" data-duration="${s.dur.toFixed(2)}" data-track-index="2" data-volume="1"></audio>`;
  }).join('\n    ');

  const tl = timed.map((s) => {
    const q = (x) => `#s-${s.id} ${x}`;
    const T = s.start, E = (s.start + s.total).toFixed(2);
    const lines = [];
    if (s.kind === 'text') {
      lines.push(`tl.fromTo("${q('.kicker')}",{y:20,opacity:0},{y:0,opacity:1,duration:.5,ease:"power3.out"},${T + 0.1});`);
      lines.push(`tl.fromTo("${q('.big')}",{scale:1.25,opacity:0},{scale:1,opacity:1,duration:.7,ease:"expo.out"},${T + 0.2});`);
      lines.push(`tl.fromTo("${q('em')}",{color:"#fff"},{color:"#ff5b1f",duration:.4,stagger:.35},${T + 1.2});`);
      lines.push(`tl.to("${q('.big')}",{scale:1.06,duration:${s.total - 1},ease:"none"},${T + 0.9});`);
    } else if (s.kind === 'title') {
      lines.push(`tl.fromTo("${q('.bgshot img')}",{scale:1.25,opacity:0},{scale:1.05,opacity:1,duration:${s.total},ease:"power2.out"},${T});`);
      lines.push(`tl.fromTo("${q('.kicker')}",{scale:1.6,opacity:0},{scale:1,opacity:1,duration:.9,ease:"power3.out"},${T + 0.15});`);
      lines.push(`tl.fromTo("${q('.huge')}",{y:60,opacity:0,scale:.9},{y:0,opacity:1,scale:1,duration:.9,ease:"back.out(1.6)"},${T + 0.35});`);
      lines.push(`tl.fromTo("${q('.sub')}",{y:20,opacity:0},{y:0,opacity:1,duration:.6,ease:"power2.out"},${T + 1.1});`);
    } else if (s.kind === 'shot') {
      const [px, py] = s.pos;
      lines.push(`tl.fromTo("${q('.kicker')}",{x:-40,opacity:0},{x:0,opacity:1,duration:.5,ease:"power3.out"},${T + 0.1});`);
      lines.push(`tl.fromTo("${q('h2')}",{y:50,opacity:0},{y:0,opacity:1,duration:.7,ease:"expo.out"},${T + 0.2});`);
      lines.push(`tl.fromTo("${q('.chip')}",{y:24,opacity:0,scale:.85},{y:0,opacity:1,scale:1,duration:.45,stagger:.35,ease:"back.out(2)"},${T + 0.9});`);
      lines.push(`tl.fromTo("${q('.card')}",{x:260,rotateY:-24,opacity:0},{x:0,rotateY:-9,opacity:1,duration:.9,ease:"expo.out"},${T + 0.1});`);
      lines.push(`tl.fromTo("${q('.card img')}",{scale:1,transformOrigin:"${px}% ${py}%"},{scale:1.9,transformOrigin:"${px}% ${py}%",duration:${s.total - 0.6},ease:"power1.inOut"},${T + 0.9});`);
      lines.push(`tl.to("${q('.card')}",{rotateY:-3,y:-14,duration:${s.total - 1},ease:"sine.inOut"},${T + 1.0});`);
    } else {
      lines.push(`tl.fromTo("${q('.bgshot img')}",{scale:1.0,opacity:0},{scale:1.12,opacity:1,duration:${s.total},ease:"none"},${T});`);
      lines.push(`tl.fromTo("${q('.kicker')}",{opacity:0,y:20},{opacity:1,y:0,duration:.6},${T + 0.2});`);
      lines.push(`tl.fromTo("${q('.big')}",{y:60,opacity:0},{y:0,opacity:1,duration:.9,ease:"expo.out"},${T + (s.dur - 1.6 > 1 ? s.dur - 1.6 : 1)});`);
      lines.push(`tl.fromTo("${q('.brand')}",{scale:.7,opacity:0},{scale:1,opacity:1,duration:.7,ease:"back.out(2)"},${T + s.total - 1.6});`);
    }
    // salida suave de cada escena (excepto la última)
    if (s !== timed[timed.length - 1]) lines.push(`tl.to("#s-${s.id} > *",{opacity:0,duration:.25,ease:"power1.in"},${(s.start + s.total - 0.25).toFixed(2)});`);
    return lines.join('\n      ');
  }).join('\n      ');

  const html = `<!doctype html>
<html lang="${cfg.html}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>MiniFactory Hub — ${code === 'en' ? 'Promo' : 'Promo ES'}</title>
    <script src="assets/gsap.min.js"></script>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      html,body{width:1920px;height:1080px;overflow:hidden;background:#141413}
      #root{position:relative;width:100%;height:100%;overflow:hidden;color:#f3f1ec;font-family:system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;background:
        radial-gradient(1200px 700px at 85% -10%,rgba(255,91,31,.22),transparent 60%),
        radial-gradient(900px 600px at 0% 110%,rgba(255,91,31,.10),transparent 60%),#141413}
      #root::before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.5;
        background-image:repeating-linear-gradient(0deg,rgba(255,255,255,.035) 0 2px,transparent 2px 14px)}
      .scene{position:absolute;inset:0;display:flex;align-items:center}
      .kicker{font-size:26px;font-weight:700;letter-spacing:.4em;color:#ff5b1f;margin-bottom:28px;font-family:ui-monospace,Menlo,Consolas,monospace}
      em{font-style:normal;color:#ff5b1f}
      .center{position:relative;width:100%;padding:0 140px;text-align:center;z-index:2}
      h1.big{font-size:128px;line-height:1.04;font-weight:800;letter-spacing:-.035em}
      h1.huge{font-size:220px;line-height:1;font-weight:800;letter-spacing:-.05em}
      .sub{font-size:44px;color:#cfcabf;margin-top:26px}
      .left{width:820px;padding-left:130px;z-index:2}
      h2{font-size:104px;line-height:1.05;font-weight:800;letter-spacing:-.035em}
      .chips{display:flex;flex-wrap:wrap;gap:16px;margin-top:44px}
      .chip{font-size:30px;font-weight:600;padding:14px 26px;border-radius:999px;border:2px solid rgba(255,91,31,.7);background:rgba(255,91,31,.12);color:#ffd9c4}
      .card{position:absolute;right:90px;top:150px;width:1000px;height:780px;border-radius:22px;overflow:hidden;
        box-shadow:0 50px 120px rgba(0,0,0,.7),0 0 0 2px rgba(255,255,255,.12),0 0 90px rgba(255,91,31,.25);background:#f3f1ec;transform:perspective(1800px) rotateY(-9deg)}
      .card img{width:100%;height:100%;object-fit:cover;object-position:top left;display:block}
      .card.tall img{object-position:top center}
      .bgshot{position:absolute;inset:0;overflow:hidden}
      .bgshot img{width:100%;height:100%;object-fit:cover;opacity:.0}
      .title .bgshot::after,.cta .bgshot::after{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(20,20,19,.72),rgba(20,20,19,.95))}
      .cta .bgshot img{filter:saturate(.8)}
      .brand{display:inline-flex;align-items:center;gap:20px;margin-top:50px;font-size:56px;font-weight:800;padding:22px 44px;border-radius:24px;background:#ff5b1f;color:#141413}
      .brand i{width:30px;height:30px;border-radius:8px;background:#141413;display:block;box-shadow:inset 0 0 0 6px #ff5b1f,0 0 0 4px #141413}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="${TOTAL}">
    ${clips}
    <audio id="a-bed" src="assets/audio/bed.wav" data-start="0" data-duration="${TOTAL}" data-track-index="3" data-volume="0.16"></audio>
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      ${tl}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
  writeFileSync(join(dir, 'index.html'), html);
  console.log(`[${code}] ${TOTAL}s listo →`, join(dir, 'index.html'));
}
