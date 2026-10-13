import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import mqtt, { type MqttClient } from 'mqtt';
import { deepMerge, normalize, type PrinterStatus } from './state';
import { cloudEndpoints, type Region } from './cloud';

/**
 * Sesión MQTT con la nube de Bambu Lab (us.mqtt.bambulab.com / cn.mqtt.bambulab.com, TLS con certificado
 * público verificado). Usuario u_<uid>, contraseña = token de acceso. Una sola conexión por cuenta; cada
 * impresora recibe sus informes en `device/<serie>/report`.
 *
 * Con el «control de autorización» del firmware actual, Bambu Lab rechaza los comandos de control que
 * llegan por la nube desde programas de terceros. Por eso el modo nube es de solo lectura: estado, avance,
 * temperaturas, AMS y avisos. Solo se envía `pushall` (pedir el estado completo) y `get_version`.
 */
export class CloudSession extends EventEmitter {
  private mq: MqttClient | null = null; private devices = new Map<string, CloudDeviceClient>();
  connected = false; lastError: string | null = null;
  constructor(readonly o: { region: Region; username: string; token: string }) { super(); this.setMaxListeners(100); }

  device(serial: string) {
    let d = this.devices.get(serial);
    if (!d) { d = new CloudDeviceClient(this, serial); this.devices.set(serial, d); if (this.connected) this.watch(serial); }
    this.connect(); return d;
  }
  release(serial: string) { this.devices.delete(serial); this.mq?.unsubscribe(`device/${serial}/report`); if (!this.devices.size) this.close(); }

  private connect() {
    if (this.mq) return;
    const E = cloudEndpoints(this.o.region);
    const ca = process.env.BAMBU_CLOUD_CA_FILE && fs.existsSync(process.env.BAMBU_CLOUD_CA_FILE) ? fs.readFileSync(process.env.BAMBU_CLOUD_CA_FILE) : undefined;
    const mq = mqtt.connect(`mqtts://${E.mqttHost}:${E.mqttPort}`, {
      username: this.o.username, password: this.o.token, clientId: `minifactory_${Math.random().toString(16).slice(2, 10)}`,
      rejectUnauthorized: true, ...(ca ? { ca } : {}), servername: E.mqttHost, reconnectPeriod: 10_000, connectTimeout: 10_000, keepalive: 60, protocolVersion: 4,
    });
    this.mq = mq;
    mq.on('connect', () => { this.connected = true; this.lastError = null; for (const s of this.devices.keys()) this.watch(s); this.emit('online'); for (const d of this.devices.values()) d.emit('online'); });
    mq.on('message', (topic, buf) => {
      const serial = topic.split('/')[1]; const d = this.devices.get(serial); if (!d) return;
      let msg: any; try { msg = JSON.parse(buf.toString('utf8')); } catch { return; }
      d.ingest(msg);
    });
    mq.on('error', (e: Error & { code?: number | string }) => {
      const auth = e.code === 5 || e.code === 4 || /Not authorized|Bad user/i.test(e.message);
      this.lastError = auth ? 'Bambu Cloud rechazó la sesión: el token expiró o se cerró la sesión. Vuelve a iniciar sesión.' : `Bambu Cloud: ${e.message}`;
      for (const d of this.devices.values()) d.fail(auth ? 'auth' : 'connect', this.lastError);
      this.emit('session-error', Object.assign(new Error(this.lastError), { code: auth ? 'auth' : 'connect' }));
      if (auth) this.close();
    });
    mq.on('close', () => { if (this.connected) { this.connected = false; for (const d of this.devices.values()) { d.emit('offline'); d.emit('status', d.status); } } });
  }
  private watch(serial: string) {
    this.mq?.subscribe(`device/${serial}/report`, (err) => {
      if (err) { this.devices.get(serial)?.fail('subscribe', 'Bambu Cloud no permitió leer esta impresora (¿pertenece a la cuenta?).'); return; }
      this.publish(serial, { pushing: { command: 'pushall', version: 1, push_target: 1 } }); this.publish(serial, { info: { command: 'get_version' } });
    });
  }
  private seq = 1;
  publish(serial: string, payload: Record<string, any>) {
    if (!this.mq?.connected) return;
    const [k] = Object.keys(payload); this.mq.publish(`device/${serial}/request`, JSON.stringify({ [k]: { sequence_id: String(this.seq++), ...payload[k] } }));
  }
  close() { this.mq?.end(true); this.mq = null; this.connected = false; }
}

const readonly = () => { throw Object.assign(new Error('Bambu Lab no permite controlar la impresora desde programas externos a través de la nube. Usa Bambu Handy / Bambu Studio, o conéctala por LAN con el «Modo desarrollador».'), { code: 'cloud_readonly' }); };

/** Misma interfaz que BambuClient (LAN), pero alimentada por la sesión de la nube y sin comandos de control. */
export class CloudDeviceClient extends EventEmitter {
  private raw: Record<string, any> = {}; deviceOnline = true; lastError: string | null = null; private lastMsg = 0; readonly readonly = true;
  constructor(private session: CloudSession, readonly serial: string) { super(); }
  get online() { return this.session.connected && this.deviceOnline; }
  get status(): PrinterStatus { return normalize(this.raw, this.online); }
  get lastMessageAt() { return this.lastMsg; }
  connect() { /* la sesión maneja la conexión */ }
  ingest(msg: any) {
    this.lastMsg = Date.now();
    if (msg.print) this.raw = deepMerge(this.raw, { print: msg.print });
    if (msg.info?.command === 'get_version') this.raw = { ...this.raw, info: msg.info };
    this.emit('status', this.status);
  }
  /** La lista de impresoras de la cuenta indica si la impresora está conectada a la nube. */
  setDeviceOnline(v: boolean) { if (v !== this.deviceOnline) { this.deviceOnline = v; this.emit(v ? 'online' : 'offline'); this.emit('status', this.status); } }
  fail(code: string, message: string) { this.lastError = message; if (this.listenerCount('error')) this.emit('error', Object.assign(new Error(message), { code })); }
  close() { this.session.release(this.serial); this.removeAllListeners(); }
  pushall() { this.session.publish(this.serial, { pushing: { command: 'pushall', version: 1, push_target: 1 } }); }
  waitReady(ms = 10_000): Promise<PrinterStatus> {
    return new Promise((res, rej) => {
      const t = setTimeout(() => { cleanup(); rej(Object.assign(new Error(this.lastError ?? this.session.lastError ?? 'La impresora no respondió por la nube. ¿Está encendida y conectada a internet?'), { code: 'timeout' })); }, ms);
      const ok = (s: PrinterStatus) => { if (this.raw.print?.gcode_state) { cleanup(); res(s); } };
      const bad = (e: Error) => { cleanup(); rej(e); };
      const cleanup = () => { clearTimeout(t); this.off('status', ok); this.off('error', bad); };
      this.on('status', ok); this.on('error', bad);
    });
  }
  pause = readonly; resume = readonly; stop = readonly; speed = readonly; light = readonly; gcode = readonly; startProject = readonly;
}
