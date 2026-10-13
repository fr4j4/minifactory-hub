/**
 * Nube de Bambu Lab simulada para desarrollo y pruebas. Reproduce lo que documenta la comunidad:
 *  - API HTTP: login con contraseña → token | verifyCode (código por correo) | tfa (tfaKey); sendemail/code;
 *    /api/csrf + /api/sign-in/tfa (token en cookie); preference (uid); user/bind (impresoras, con código LAN);
 *    my/tasks (trabajos con miniatura de la placa)
 *  - Broker MQTT con TLS (certificado con SAN 127.0.0.1/localhost; su CA se escribe en `caFile` para que el
 *    cliente verifique igual que con el certificado público real); usuario u_<uid> + token
 *  - Control de autorización: solo `pushall` y `get_version` llegan a la impresora; el resto se rechaza
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import tls from 'node:tls';
import crypto from 'node:crypto';
import selfsigned from 'selfsigned';
import sharp from 'sharp';
import type { SimHandle } from './bambu-sim';

export interface CloudUser { email: string; password: string; uid: string; name: string; mode: 'plain' | 'code' | 'tfa'; code?: string; tfa?: string; jwt?: boolean; devices: Array<{ sim: SimHandle; online?: boolean }> }
export interface CloudSim { apiBase: string; mqtt: string; caFile: string; rejected: any[]; expireAll: () => void; setOnline: (serial: string, v: boolean) => void; stop: () => Promise<void> }

const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

export async function startCloudSim(o: { apiPort: number; mqttPort: number; caFile: string; users: CloudUser[] }): Promise<CloudSim> {
  const pems = await Promise.resolve(selfsigned.generate([{ name: 'commonName', value: 'localhost' }], { keySize: 2048, extensions: [{ name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }] }] } as any) as any);
  fs.mkdirSync(path.dirname(o.caFile), { recursive: true }); fs.writeFileSync(o.caFile, pems.cert);
  const tokens = new Map<string, CloudUser>(); const tfaKeys = new Map<string, CloudUser>(); const csrf = new Set<string>(); const rejected: any[] = [];
  const online = new Map<string, boolean>(); for (const u of o.users) for (const d of u.devices) online.set(d.sim.opts.serial, d.online ?? online.get(d.sim.opts.serial) ?? true);
  const apiBase = `http://127.0.0.1:${o.apiPort}`;
  const issue = (u: CloudUser) => {
    const t = u.jwt ? `${b64u({ alg: 'RS256', typ: 'JWT' })}.${b64u({ username: `u_${u.uid}`, nickname: u.name, exp: Math.floor(Date.now() / 1000) + 7776000 })}.${crypto.randomBytes(16).toString('base64url')}` : `AAD${crypto.randomBytes(24).toString('hex')}`;
    tokens.set(t, u); return t;
  };
  const userOf = (req: http.IncomingMessage) => tokens.get(String(req.headers.authorization ?? '').replace(/^Bearer /, ''));

  const api = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', apiBase); let body: any = {};
    if (req.method === 'POST') { const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer); try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { /* */ } }
    const json = (status: number, j: unknown, headers: Record<string, string | string[]> = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(j)); };
    const p = url.pathname;
    if (p === '/v1/user-service/user/login') {
      const u = o.users.find((x) => x.email === String(body.account ?? '').toLowerCase());
      if (body.code !== undefined) {
        if (!u || u.mode !== 'code') return json(400, { code: 2, error: 'invalid' });
        if (body.code !== u.code) return json(400, { code: 2, error: 'Incorrect code' });
        return json(200, { accessToken: issue(u), refreshToken: '', expiresIn: 7776000, refreshExpiresIn: 0, loginType: '' });
      }
      if (!u || body.password !== u.password) return json(400, { code: 1, error: 'Incorrect account or password' });
      if (u.mode === 'code') return json(200, { accessToken: '', loginType: 'verifyCode' });
      if (u.mode === 'tfa') { const k = crypto.randomBytes(8).toString('hex'); tfaKeys.set(k, u); return json(200, { accessToken: '', loginType: 'tfa', tfaKey: k }); }
      return json(200, { accessToken: issue(u), refreshToken: '', expiresIn: 7776000, loginType: '' });
    }
    if (p === '/v1/user-service/user/sendemail/code') return json(200, { success: true });
    if (p === '/api/csrf') { const c = crypto.randomBytes(8).toString('hex'); csrf.add(c); res.writeHead(204, { 'Set-Cookie': `bbl_csrf_token=${c}; Path=/` }); return res.end(); }
    if (p === '/api/sign-in/tfa') {
      const c = String(req.headers['x-bbl-csrf-token'] ?? ''); const u = tfaKeys.get(body.tfaKey);
      if (!csrf.has(c) || !u) return json(403, { error: 'missing_cookie' });
      if (body.tfaCode !== u.tfa) return json(400, { error: 'invalid code' });
      return json(200, { success: true }, { 'Set-Cookie': [`token=${issue(u)}; Path=/; HttpOnly`] });
    }
    if (p === '/__sim/expire' && req.method === 'POST') { expireAll(); return json(200, { ok: true }); }
    if (p.startsWith('/covers/')) {
      const serial = p.slice(8).replace(/\.png$/, ''); const d = o.users.flatMap((u) => u.devices).find((x) => x.sim.opts.serial === serial);
      res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(await cover(d?.sim));
    }
    const u = userOf(req); if (!u) return json(401, { code: 401, error: 'unauthorized' });
    if (p === '/v1/design-user-service/my/preference') return json(200, { uid: Number(u.uid), name: u.name, handle: u.name.toLowerCase() });
    if (p === '/v1/iot-service/api/user/bind') return json(200, { message: 'success', code: null, devices: u.devices.map(({ sim }) => ({ dev_id: sim.opts.serial, name: sim.opts.name, online: online.get(sim.opts.serial), print_status: sim.state.gcode_state === 'RUNNING' ? 'RUNNING' : 'ACTIVE', dev_model_name: sim.opts.model, dev_product_name: sim.opts.name, dev_access_code: sim.opts.accessCode, nozzle_diameter: 0.4 })) });
    if (p === '/v1/user-service/my/tasks') {
      const dev = url.searchParams.get('deviceId');
      const hits = u.devices.filter(({ sim }) => !dev || sim.opts.serial === dev).filter(({ sim }) => sim.state.gcode_file).map(({ sim }, i) => ({ id: 1000 + i, deviceId: sim.opts.serial, title: String(sim.state.subtask_name || sim.state.gcode_file), cover: `${apiBase}/covers/${sim.opts.serial}.png`, status: 2, weight: 42.5, costTime: 7680, startTime: new Date().toISOString() }));
      return json(200, { total: hits.length, hits });
    }
    json(404, { error: 'not found' });
  });
  await new Promise<void>((r) => api.listen(o.apiPort, '127.0.0.1', () => r()));

  // broker MQTT «de la nube»
  const { Aedes } = await import('aedes');
  const broker = await Aedes.createBroker();
  const clientUser = new Map<string, CloudUser>();
  broker.authenticate = (c, user, pass, done) => {
    const u = tokens.get(pass?.toString() ?? ''); const ok = !!u && user === `u_${u.uid}`;
    if (ok) clientUser.set(c.id, u!);
    done(ok ? null : Object.assign(new Error('Not authorized'), { returnCode: 5 }) as any, ok);
  };
  const owns = (cid: string, serial: string) => !!clientUser.get(cid)?.devices.some((d) => d.sim.opts.serial === serial);
  broker.authorizeSubscribe = (c, sub, done) => { const serial = sub.topic.split('/')[1]; done(/^device\/[^/]+\/report$/.test(sub.topic) && owns(c!.id, serial) ? null : new Error('denegado'), sub); };
  broker.authorizePublish = (c, pkt, done) => { const serial = pkt.topic.split('/')[1]; done(c && /^device\/[^/]+\/request$/.test(pkt.topic) && owns(c.id, serial) ? null : new Error('denegado')); };
  const pub = (serial: string, payload: unknown) => broker.publish({ topic: `device/${serial}/report`, payload: Buffer.from(JSON.stringify(payload)), qos: 0, retain: false, cmd: 'publish', dup: false } as any, () => {});
  for (const u of o.users) for (const { sim } of u.devices) sim.onReport((payload) => { if (online.get(sim.opts.serial)) pub(sim.opts.serial, payload); });
  broker.on('publish', (pkt, client) => {
    if (!client || !/^device\/[^/]+\/request$/.test(pkt.topic)) return;
    const serial = pkt.topic.split('/')[1]; const sim = o.users.flatMap((u) => u.devices).find((d) => d.sim.opts.serial === serial)?.sim; if (!sim) return;
    let m: any; try { m = JSON.parse(pkt.payload.toString()); } catch { return; }
    const cmd = m.pushing?.command ?? m.info?.command ?? m.print?.command ?? m.system?.command;
    if (cmd === 'pushall' || cmd === 'get_version') { if (online.get(serial)) sim.request(m); return; }
    rejected.push({ serial, m }); const k = Object.keys(m)[0];
    pub(serial, { [k]: { command: cmd, sequence_id: m[k]?.sequence_id, result: 'fail', reason: 'authorization required' } });
  });
  const mqttSrv = tls.createServer({ key: pems.private, cert: pems.cert }, (sock) => broker.handle(sock as any));
  await new Promise<void>((r) => mqttSrv.listen(o.mqttPort, '127.0.0.1', () => r()));

  function expireAll() { tokens.clear(); for (const c of Object.values((broker as any).clients ?? {})) (c as any).close?.(); }
  return {
    apiBase, mqtt: `127.0.0.1:${o.mqttPort}`, caFile: o.caFile, rejected, expireAll,
    setOnline: (serial, v) => { online.set(serial, v); },
    stop: async () => { await new Promise<void>((r) => api.close(() => r())); await new Promise<void>((r) => { mqttSrv.close(() => r()); setTimeout(r, 300); }); await new Promise<void>((r) => broker.close(() => r())); },
  };
}

/** Miniatura de la placa (como las que guarda Bambu Cloud por trabajo). */
async function cover(sim?: SimHandle) {
  const color = (sim?.state.ams?.ams?.[0]?.tray?.[0]?.tray_color ?? sim?.state.vt_tray?.tray_color ?? 'FF5B1FFF').slice(0, 6);
  const rows = Array.from({ length: 18 }, (_, i) => { const w = 120 + 60 * Math.sin((i / 18) * Math.PI); return `<rect x="${256 - w / 2}" y="${330 - i * 9}" width="${w}" height="7" rx="3" fill="#${color}" opacity="${0.8 + (i % 3) * 0.06}"/>`; }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#1d1d1f"/><polygon points="56,420 456,420 400,330 112,330" fill="#3a3734"/>${rows}<text x="256" y="470" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#cfcac0">${sim?.state.subtask_name ?? ''}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
