/**
 * Simulador de impresoras Bambu Lab para desarrollo y pruebas (no reemplaza probar con una impresora real).
 * Implementa la misma superficie LAN que usa el conector:
 *  - SSDP: anuncios NOTIFY con las cabeceras de Bambu (USN, Location, DevModel, DevName…)
 *  - MQTT sobre TLS: usuario `bblp` + código de acceso, `device/<serie>/report` y `/request`,
 *    pushall, pause/resume/stop, print_speed, ledctrl, gcode_line, project_file, get_version;
 *    informes «delta» cada segundo como la familia P1/A1
 *  - Cámara P1/A1: TLS con el paquete de autenticación de 80 bytes y cuadros JPEG con cabecera de 16 bytes
 *  - FTPS implícito: USER/PASS, PBSZ/PROT, EPSV/PASV, STOR, LIST/MLSD
 *
 * Uso: npx tsx scripts/bambu-sim.ts   (variables: BAMBU_SIM_SSDP_TARGETS=127.0.0.1:2021)
 */
import tls from 'node:tls';
import net from 'node:net';
import dgram from 'node:dgram';
import { createHash } from 'node:crypto';
import selfsigned from 'selfsigned';
import sharp from 'sharp';

export interface SimTray { type: string; color: string; brand: string; remain: number }
export interface SimOpts {
  serial: string; name: string; model: string; accessCode: string; ip?: string;
  mqttPort: number; cameraPort?: number; ftpPort?: number;
  trays?: Array<SimTray | null>; external?: SimTray | null;
  printing?: { file: string; totalLayers: number; minutes: number; progress?: number } | null;
  hms?: Array<{ attr: number; code: number }>; ssdpTargets?: string[]; speedFactor?: number; loop?: boolean;
}
export interface SimHandle { opts: SimOpts; files: Map<string, Buffer>; commands: any[]; state: Record<string, any>; stop: () => Promise<void>; onReport: (cb: (payload: Record<string, any>) => void) => void; request: (m: any) => void }

const pad = (s: string) => s.padEnd(8, 'F');

export async function startSim(o: SimOpts): Promise<SimHandle> {
  const pems = await Promise.resolve(selfsigned.generate([{ name: 'commonName', value: o.serial }], { keySize: 2048 } as any) as any);
  const tlsOpts = { key: pems.private as string, cert: pems.cert as string };
  const files = new Map<string, Buffer>(); const commands: any[] = [];
  const speedF = o.speedFactor ?? 1;

  // ── estado ─────────────────────────────────────────────────────────────
  const trays = o.trays ?? [];
  const p: Record<string, any> = {
    gcode_state: o.printing ? 'RUNNING' : 'IDLE', mc_percent: o.printing?.progress ?? 0, mc_remaining_time: o.printing ? Math.round(o.printing.minutes * (1 - (o.printing.progress ?? 0) / 100)) : 0,
    layer_num: o.printing ? Math.round(((o.printing.progress ?? 0) / 100) * o.printing.totalLayers) : 0, total_layer_num: o.printing?.totalLayers ?? 0,
    gcode_file: o.printing?.file ?? '', subtask_name: o.printing?.file.replace(/\.3mf$/, '') ?? '', stg_cur: o.printing ? 0 : 255,
    nozzle_temper: o.printing ? 219.5 : 26, nozzle_target_temper: o.printing ? 220 : 0, bed_temper: o.printing ? 54.8 : 25, bed_target_temper: o.printing ? 55 : 0, chamber_temper: 29,
    cooling_fan_speed: o.printing ? '15' : '0', big_fan1_speed: o.printing ? '10' : '0', big_fan2_speed: o.printing ? '6' : '0', heatbreak_fan_speed: '15',
    spd_lvl: 2, print_error: 0, wifi_signal: '-48dBm', nozzle_diameter: '0.4', hms: o.hms ?? [],
    lights_report: [{ node: 'chamber_light', mode: 'on' }],
    ams: trays.length ? { ams: [{ id: '0', humidity: '4', temp: '27.6', tray: trays.map((t, i) => t ? { id: String(i), tray_type: t.type, tray_sub_brands: t.brand, tray_color: pad(t.color.replace('#', '').toUpperCase()), remain: t.remain, nozzle_temp_min: '190', nozzle_temp_max: '240', tray_uuid: createHash('md5').update(o.serial + i).digest('hex').toUpperCase() } : { id: String(i) }) }], tray_now: o.printing ? '0' : '255', tray_exist_bits: 'f' } : { ams: [], tray_now: o.printing && o.external ? '254' : '255' },
    vt_tray: o.external ? { id: '254', tray_type: o.external.type, tray_sub_brands: o.external.brand, tray_color: pad(o.external.color.replace('#', '').toUpperCase()), remain: o.external.remain } : { id: '254', tray_type: '', tray_color: '00000000', remain: -1 },
  };
  const totalMin = () => Math.max(1, o.printing?.minutes ?? 60);

  // ── MQTT (broker aedes sobre TLS) ─────────────────────────────────────
  const { Aedes } = await import('aedes');
  const broker = await Aedes.createBroker();
  broker.authenticate = (_c, user, pass, done) => { const ok = user === 'bblp' && pass?.toString() === o.accessCode; done(ok ? null : Object.assign(new Error('Not authorized'), { returnCode: 5 }) as any, ok); };
  broker.authorizeSubscribe = (_c, sub, done) => done(sub.topic === `device/${o.serial}/report` ? null : new Error('denegado'), sub);
  const reportHooks: Array<(p: Record<string, any>) => void> = [];
  const report = (payload: Record<string, any>) => { for (const h of reportHooks) h(payload); publishLan(payload); };
  const publishLan = (payload: Record<string, any>) => broker.publish({ topic: `device/${o.serial}/report`, payload: Buffer.from(JSON.stringify(payload)), qos: 0, retain: false, cmd: 'publish', dup: false } as any, () => {});
  const full = () => report({ print: { command: 'push_status', msg: 0, sequence_id: '0', ...p } });
  broker.on('publish', (pkt, client) => {
    if (!client || pkt.topic !== `device/${o.serial}/request`) return;
    let m: any; try { m = JSON.parse(pkt.payload.toString()); } catch { return; }
    handle(m);
  });
  const handle = (m: any) => {
    commands.push(m);
    const cmd = m.print?.command ?? m.pushing?.command ?? m.system?.command ?? m.info?.command;
    if (cmd === 'pushall') full();
    else if (cmd === 'get_version') report({ info: { command: 'get_version', sequence_id: m.info.sequence_id, module: [{ name: 'ota', sw_ver: '01.08.02.00', hw_ver: 'OTA' }, { name: 'mc', sw_ver: '00.00.30.65' }] } });
    else if (cmd === 'pause' && p.gcode_state === 'RUNNING') { p.gcode_state = 'PAUSE'; p.stg_cur = 16; report({ print: { gcode_state: 'PAUSE', stg_cur: 16 } }); }
    else if (cmd === 'resume' && p.gcode_state === 'PAUSE') { p.gcode_state = 'RUNNING'; p.stg_cur = 0; report({ print: { gcode_state: 'RUNNING', stg_cur: 0 } }); }
    else if (cmd === 'stop' && ['RUNNING', 'PAUSE', 'PREPARE'].includes(p.gcode_state)) { Object.assign(p, { gcode_state: 'FAILED', print_error: 0x0300400c, nozzle_target_temper: 0, bed_target_temper: 0, stg_cur: 255 }); report({ print: { gcode_state: 'FAILED', print_error: p.print_error, nozzle_target_temper: 0, bed_target_temper: 0 } }); }
    else if (cmd === 'print_speed') { p.spd_lvl = Number(m.print.param); report({ print: { spd_lvl: p.spd_lvl } }); }
    else if (cmd === 'ledctrl') { p.lights_report = [{ node: 'chamber_light', mode: m.system.led_mode }]; report({ system: { command: 'ledctrl', result: 'success', sequence_id: m.system.sequence_id }, print: { lights_report: p.lights_report } } as any); }
    else if (cmd === 'project_file') {
      const name = String(m.print.url).split('/').pop()!;
      if (!files.has(name)) { report({ print: { command: 'project_file', result: 'FAIL', reason: 'file not found' } }); return; }
      o.printing = { file: name, totalLayers: 120, minutes: 30 };
      Object.assign(p, { gcode_state: 'PREPARE', stg_cur: 2, mc_percent: 0, layer_num: 0, total_layer_num: 120, mc_remaining_time: 30, gcode_file: name, subtask_name: m.print.subtask_name, nozzle_target_temper: 220, bed_target_temper: 55, print_error: 0 });
      if (p.ams.ams?.length) p.ams.tray_now = String(m.print.ams_mapping?.[0] ?? 0);
      full();
      setTimeout(() => { if (p.gcode_state === 'PREPARE') { p.gcode_state = 'RUNNING'; p.stg_cur = 0; report({ print: { gcode_state: 'RUNNING', stg_cur: 0 } }); } }, 2500 / speedF);
    }
  };
  const mqttSrv = tls.createServer(tlsOpts, (s) => broker.handle(s as any));
  await new Promise<void>((r) => mqttSrv.listen(o.mqttPort, '0.0.0.0', () => r()));

  // simulación: avanza la impresión y manda solo lo que cambia
  const tick = setInterval(() => {
    const d: Record<string, any> = {};
    if (p.gcode_state === 'RUNNING') {
      p.mc_percent = Math.min(100, p.mc_percent + (100 / (totalMin() * 60)) * speedF); // avance real por segundo, acelerado por speedFactor
      p.layer_num = Math.min(p.total_layer_num, Math.round((p.mc_percent / 100) * p.total_layer_num));
      p.mc_remaining_time = Math.max(0, Math.round(totalMin() * (1 - p.mc_percent / 100)));
      p.nozzle_temper = +(220 + (Math.random() - 0.5)).toFixed(1); p.bed_temper = +(55 + (Math.random() - 0.5) * 0.4).toFixed(1);
      const t = p.ams.tray_now; const tr = p.ams.ams?.[0]?.tray?.[Number(t)]; if (tr && tr.remain > 0 && Math.random() < 0.08) { tr.remain -= 1; d.ams = p.ams; }
      if (p.mc_percent >= 100 && o.loop) setTimeout(() => { if (p.gcode_state !== 'FINISH') return; Object.assign(p, { gcode_state: 'RUNNING', mc_percent: 0, layer_num: 0, mc_remaining_time: totalMin(), nozzle_target_temper: 220, bed_target_temper: 55, cooling_fan_speed: '15', print_error: 0 }); full(); }, 10_000);
      if (p.mc_percent >= 100) { Object.assign(p, { gcode_state: 'FINISH', mc_percent: 100, mc_remaining_time: 0, nozzle_target_temper: 0, bed_target_temper: 0, cooling_fan_speed: '0' }); Object.assign(d, { gcode_state: 'FINISH', nozzle_target_temper: 0, bed_target_temper: 0, cooling_fan_speed: '0' }); }
      Object.assign(d, { mc_percent: Math.floor(p.mc_percent), layer_num: p.layer_num, mc_remaining_time: p.mc_remaining_time, nozzle_temper: p.nozzle_temper, bed_temper: p.bed_temper });
    } else if (p.gcode_state === 'PREPARE') {
      p.nozzle_temper = Math.min(220, p.nozzle_temper + 40); p.bed_temper = Math.min(55, p.bed_temper + 10); Object.assign(d, { nozzle_temper: p.nozzle_temper, bed_temper: p.bed_temper });
    } else {
      p.nozzle_temper = Math.max(26, +(p.nozzle_temper - 3).toFixed(1)); p.bed_temper = Math.max(25, +(p.bed_temper - 1).toFixed(1)); Object.assign(d, { nozzle_temper: p.nozzle_temper, bed_temper: p.bed_temper });
    }
    report({ print: { command: 'push_status', msg: 1, sequence_id: '0', ...d } });
  }, 1000);

  // ── cámara P1/A1 (TLS + JPEG) ──────────────────────────────────────────
  let camSrv: tls.Server | null = null;
  if (o.cameraPort) {
    camSrv = tls.createServer(tlsOpts, (s) => {
      let auth = Buffer.alloc(0); let timer: NodeJS.Timeout | null = null;
      s.on('data', (d) => {
        if (timer) return; auth = Buffer.concat([auth, d as Buffer]); if (auth.length < 80) return;
        const user = auth.subarray(16, 48).toString('ascii').replace(/\0+$/, ''); const code = auth.subarray(48, 80).toString('ascii').replace(/\0+$/, '');
        if (auth.readUInt32LE(0) !== 0x40 || user !== 'bblp' || code !== o.accessCode) { s.destroy(); return; }
        const send = async () => { try { const jpg = await frame(o, p); const h = Buffer.alloc(16); h.writeUInt32LE(jpg.length, 0); s.write(Buffer.concat([h, jpg])); } catch { /* cliente se fue */ } };
        send(); timer = setInterval(send, 1000);
      });
      s.on('close', () => { if (timer) clearInterval(timer); }); s.on('error', () => {});
    });
    await new Promise<void>((r) => camSrv!.listen(o.cameraPort, '0.0.0.0', () => r()));
  }

  // ── FTPS implícito ─────────────────────────────────────────────────────
  let ftpSrv: tls.Server | null = null;
  if (o.ftpPort) {
    ftpSrv = tls.createServer(tlsOpts, (ctl) => {
      let user = ''; let authed = false; let data: tls.Server | null = null; let pendingSock: Promise<tls.TLSSocket> | null = null;
      const say = (l: string) => ctl.write(l + '\r\n');
      say('220 Bambu FTP simulado');
      const openPassive = async () => {
        data?.close(); let resolveSock!: (s: tls.TLSSocket) => void; pendingSock = new Promise((r) => { resolveSock = r; });
        data = tls.createServer(tlsOpts, (ds) => resolveSock(ds)); await new Promise<void>((r) => data!.listen(0, '127.0.0.1', () => r()));
        return (data.address() as net.AddressInfo).port;
      };
      let buf = '';
      ctl.on('data', async (d) => {
        buf += d.toString('utf8'); let i;
        while ((i = buf.indexOf('\r\n')) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 2); const [cmd, ...rest] = line.split(' '); const arg = rest.join(' '); const C = cmd.toUpperCase();
          if (C === 'USER') { user = arg; say('331 Password required'); }
          else if (C === 'PASS') { authed = user === 'bblp' && arg === o.accessCode; say(authed ? '230 Logged in' : '530 Login incorrect'); }
          else if (!authed) say('530 Not logged in');
          else if (C === 'FEAT') { ctl.write('211-Features:\r\n PBSZ\r\n PROT\r\n EPSV\r\n UTF8\r\n211 End\r\n'); }
          else if (['TYPE', 'STRU', 'OPTS', 'PBSZ', 'PROT', 'MODE'].includes(C)) say('200 OK');
          else if (C === 'PWD') say('257 "/"');
          else if (C === 'CWD') say('250 OK');
          else if (C === 'EPSV') { const port = await openPassive(); say(`229 Entering Extended Passive Mode (|||${port}|)`); }
          else if (C === 'PASV') { const port = await openPassive(); say(`227 Entering Passive Mode (127,0,0,1,${port >> 8},${port & 255})`); }
          else if (C === 'STOR') {
            say('150 Opening data connection'); const ds = await pendingSock!; const parts: Buffer[] = [];
            ds.on('data', (c: Buffer) => parts.push(c)); ds.on('end', () => { files.set(arg.replace(/^\/+/, ''), Buffer.concat(parts)); say('226 Transfer complete'); data?.close(); }); ds.on('error', () => {});
          } else if (C === 'LIST' || C === 'MLSD') {
            say('150 Here comes the listing'); const ds = await pendingSock!;
            const rows = [...files.entries()].map(([n, b]) => C === 'MLSD' ? `type=file;size=${b.length};modify=20261013120000; ${n}` : `-rw-r--r-- 1 bblp bblp ${b.length} Oct 13 12:00 ${n}`);
            ds.end(rows.join('\r\n') + (rows.length ? '\r\n' : ''), () => { say('226 Done'); data?.close(); });
          } else if (C === 'SIZE') { const f = files.get(arg.replace(/^\/+/, '')); say(f ? `213 ${f.length}` : '550 Not found'); }
          else if (C === 'QUIT') { say('221 Bye'); ctl.end(); }
          else say('502 Not implemented');
        }
      });
      ctl.on('error', () => {}); ctl.on('close', () => data?.close());
    });
    await new Promise<void>((r) => ftpSrv!.listen(o.ftpPort, '0.0.0.0', () => r()));
  }

  // ── SSDP ───────────────────────────────────────────────────────────────
  const udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  await new Promise<void>((r) => udp.bind(0, () => { try { udp.setBroadcast(true); } catch { /* */ } r(); }));
  const targets = o.ssdpTargets ?? (process.env.BAMBU_SIM_SSDP_TARGETS ?? '127.0.0.1:2021').split(',');
  const notify = Buffer.from([
    'NOTIFY * HTTP/1.1', 'HOST: 239.255.255.250:1990', 'Server: UPnP/1.0', `Location: ${o.ip ?? '127.0.0.1'}`, 'NT: urn:bambulab-com:device:3dprinter:1',
    `USN: ${o.serial}`, 'Cache-Control: max-age=1800', `DevModel.bambu.com: ${o.model}`, `DevName.bambu.com: ${o.name}`, `DevSignal.bambu.com: -48`,
    'DevConnect.bambu.com: lan', 'DevBind.bambu.com: free', 'Devseclink.bambu.com: secure', 'DevVersion.bambu.com: 01.08.02.00', '', '',
  ].join('\r\n'));
  const announce = () => { for (const t of targets) { const [h, port] = t.split(':'); udp.send(notify, Number(port || 2021), h, () => {}); } };
  announce(); const ann = setInterval(announce, 1500);

  return {
    opts: o, files, commands, state: p, onReport: (cb) => { reportHooks.push(cb); }, request: (m) => handle(m),
    stop: async () => {
      clearInterval(tick); clearInterval(ann); udp.close();
      await Promise.all([mqttSrv, camSrv, ftpSrv].filter(Boolean).map((s) => new Promise<void>((r) => { (s as tls.Server).close(() => r()); setTimeout(r, 300); })));
      await new Promise<void>((r) => broker.close(() => r()));
    },
  };
}

/** Cuadro de cámara sintético: cama de impresión vista desde arriba con la pieza creciendo según el avance. */
async function frame(o: SimOpts, p: Record<string, any>) {
  const W = 640, H = 480; const prog = Math.max(0, Math.min(100, p.mc_percent ?? 0)) / 100; const rows = Math.round(prog * 26);
  const color = (p.ams?.ams?.[0]?.tray?.[Number(p.ams?.tray_now ?? 0)]?.tray_color ?? p.vt_tray?.tray_color ?? 'FF5B1FFF').slice(0, 6);
  const layers = Array.from({ length: rows }, (_, i) => { const w = 150 + 70 * Math.sin((i / 26) * Math.PI * 1.1 + 0.3); return `<rect x="${320 - w / 2}" y="${372 - i * 7}" width="${w}" height="6" rx="2" fill="#${color}" opacity="${0.75 + (i % 3) * 0.08}"/>`; }).join('');
  const t = new Date().toLocaleTimeString('es-CL', { hour12: false });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><radialGradient id="g" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="#3a3632"/><stop offset="1" stop-color="#0d0c0b"/></radialGradient><pattern id="pei" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1" fill="#6b6255"/></pattern></defs>
<rect width="${W}" height="${H}" fill="url(#g)"/><polygon points="90,470 550,470 500,380 140,380" fill="#2a2724"/><polygon points="90,470 550,470 500,380 140,380" fill="url(#pei)" opacity=".55"/>
${layers}<rect x="${292}" y="${Math.max(60, 340 - rows * 7)}" width="56" height="34" rx="4" fill="#d8d3c8"/><rect x="314" y="${Math.max(94, 374 - rows * 7)}" width="12" height="8" fill="#9e968a"/>
<rect x="0" y="0" width="${W}" height="30" fill="#000" opacity=".45"/><text x="12" y="20" font-family="monospace" font-size="14" fill="#e9e5dc">${o.name} · ${p.gcode_state} · ${Math.floor((p.mc_percent ?? 0))}%</text><text x="${W - 12}" y="20" text-anchor="end" font-family="monospace" font-size="14" fill="#e9e5dc">${t}</text>
<text x="12" y="${H - 12}" font-family="monospace" font-size="12" fill="#a29c90">CÁMARA SIMULADA</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 70 }).toBuffer();
}

/** Taller de ejemplo: una P1S imprimiendo con AMS, una A1 libre con bobina externa y aviso HMS, y una X1C solo detectable. */
export function demoPrinters(base = Number(process.env.BAMBU_SIM_BASE_PORT || 18000)): SimOpts[] {
  return [
    { serial: '01P00A391800123', name: 'P1S Taller', model: 'C12', accessCode: '12345678', mqttPort: base + 883, cameraPort: base + 600, ftpPort: base + 990,
      trays: [{ type: 'PLA', color: '#E8432E', brand: 'PLA Basic', remain: 62 }, { type: 'PLA', color: '#161616', brand: 'PLA Matte', remain: 88 }, { type: 'PETG', color: '#F2F2F2', brand: 'PETG HF', remain: 14 }, null],
      printing: { file: 'Barquito_decorativo_x4.3mf', totalLayers: 164, minutes: 128, progress: 37 }, speedFactor: 10, loop: true },
    { serial: '03900A3B2200456', name: 'A1 Mesa', model: 'N2S', accessCode: '87654321', mqttPort: base + 1883, cameraPort: base + 1600, ftpPort: base + 1990,
      external: { type: 'PLA', color: '#2E7DDB', brand: 'PLA Basic', remain: -1 }, hms: [{ attr: 0x07002000, code: 0x00020001 }], speedFactor: 10 },
    { serial: '00M09C470300789', name: 'X1C Oficina', model: 'BL-P001', accessCode: '24681357', mqttPort: base + 2883, ftpPort: base + 2990,
      trays: [{ type: 'PLA', color: '#F5C518', brand: 'PLA Basic', remain: 100 }, null, null, null] },
  ];
}

/** Impresora que solo está en la cuenta de la nube (no se anuncia en la red local). */
export function cloudOnlyPrinter(base = Number(process.env.BAMBU_SIM_BASE_PORT || 18000)): SimOpts {
  return { serial: '01S00C123400999', name: 'P1P Bodega', model: 'C11', accessCode: '13572468', mqttPort: base + 3883, ftpPort: base + 3990, ssdpTargets: [],
    external: { type: 'PETG', color: '#1E9E6A', brand: 'PETG Basic', remain: -1 }, printing: { file: 'Soporte_camara_x2.3mf', totalLayers: 210, minutes: 190, progress: 12 }, speedFactor: 10, loop: true };
}

if (process.argv[1]?.endsWith('bambu-sim.ts')) {
  (async () => {
    const base = Number(process.env.BAMBU_SIM_BASE_PORT || 18000);
    const sims = await Promise.all([...demoPrinters(base), cloudOnlyPrinter(base)].map((p) => startSim(p)));
    for (const s of sims) console.log(`${s.opts.name} (${s.opts.serial}) · código ${s.opts.accessCode} · MQTT ${s.opts.mqttPort}${s.opts.cameraPort ? ` · cámara ${s.opts.cameraPort}` : ''}${s.opts.ftpPort ? ` · FTPS ${s.opts.ftpPort}` : ''}`);
    let cloud: { stop: () => Promise<void> } | null = null;
    if (process.env.BAMBU_SIM_CLOUD_API_PORT) {
      const { startCloudSim } = await import('./bambu-cloud-sim');
      const c = await startCloudSim({ apiPort: Number(process.env.BAMBU_SIM_CLOUD_API_PORT), mqttPort: Number(process.env.BAMBU_SIM_CLOUD_MQTT_PORT || base + 884), caFile: process.env.BAMBU_SIM_CLOUD_CA_FILE || 'data/bambu-cloud-ca.pem',
        users: [{ email: 'taller@minifactory.cl', password: 'bambu1234', uid: '1840000123', name: 'Taller MiniFactory', mode: 'code', code: '246810', jwt: true, devices: sims.map((sim) => ({ sim })) }] });
      cloud = c;
      console.log(`Nube simulada: API ${c.apiBase} · MQTT ${c.mqtt} · CA ${c.caFile} · cuenta taller@minifactory.cl / bambu1234 · código 246810`);
    }
    console.log('Simulador listo. Ctrl+C para salir.');
    const bye = async () => { await cloud?.stop(); await Promise.all(sims.map((s) => s.stop())); process.exit(0); };
    process.on('SIGINT', bye); process.on('SIGTERM', bye);
  })();
}
