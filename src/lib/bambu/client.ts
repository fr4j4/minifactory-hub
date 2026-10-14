import { EventEmitter } from 'node:events';
import type { TLSSocket } from 'node:tls';
import mqtt, { type MqttClient } from 'mqtt';
import { deepMerge, normalize, type PrinterStatus } from './state';
import { LocalizedError, tDefault } from '@/i18n/errors';

export interface ConnOpts { host: string; serial: string; accessCode: string; mqttPort?: number; fingerprint?: string | null }

/**
 * Conexión LAN a una impresora Bambu Lab por MQTT sobre TLS (puerto 8883, usuario `bblp`, contraseña =
 * código de acceso LAN). La impresora usa un certificado propio que no valida una CA pública, así que se
 * aplica «confianza en el primer uso»: se guarda la huella SHA-256 la primera vez y se rechaza si cambia.
 *
 * Eventos: 'status' (PrinterStatus), 'online'/'offline', 'fingerprint' (huella nueva), 'error' (Error con code).
 */
export class BambuClient extends EventEmitter {
  private mq: MqttClient | null = null; private raw: Record<string, any> = {}; private seq = 1; private push: NodeJS.Timeout | null = null;
  online = false; lastError: string | null = null;
  constructor(readonly o: ConnOpts) { super(); }

  get status(): PrinterStatus { return normalize(this.raw, this.online); }
  get rawReport() { return this.raw; }

  connect() {
    if (this.mq) return;
    const mq = mqtt.connect(`mqtts://${this.o.host}:${this.o.mqttPort ?? 8883}`, {
      username: 'bblp', password: this.o.accessCode, clientId: `minifactory_${Math.random().toString(16).slice(2, 10)}`,
      rejectUnauthorized: false, reconnectPeriod: 5000, connectTimeout: 8000, keepalive: 30, protocolVersion: 4,
    });
    this.mq = mq;
    mq.on('connect', () => {
      const sock = (mq as unknown as { stream?: TLSSocket }).stream;
      const fp = sock?.getPeerCertificate?.()?.fingerprint256 ?? null;
      if (this.o.fingerprint && fp && fp !== this.o.fingerprint) {
        this.fail('cert_changed', tDefault('connector.certChanged'));
        this.close(); return;
      }
      if (!this.o.fingerprint && fp) { this.o.fingerprint = fp; this.emit('fingerprint', fp); }
      this.online = true; this.lastError = null; this.emit('online');
      mq.subscribe(`device/${this.o.serial}/report`, (err) => { if (err) this.fail('subscribe', err.message); });
      this.pushall(); this.send({ info: { command: 'get_version' } });
      // la familia P1/A1 solo informa cambios: se pide el estado completo cada 5 minutos
      this.push = setInterval(() => this.pushall(), 5 * 60_000);
    });
    mq.on('message', (_t, buf) => {
      let msg: any; try { msg = JSON.parse(buf.toString('utf8')); } catch { return; }
      if (msg.print) this.raw = deepMerge(this.raw, { print: msg.print });
      if (msg.info?.command === 'get_version') this.raw = { ...this.raw, info: msg.info };
      if (msg.system) this.emit('system', msg.system);
      this.emit('status', this.status);
    });
    mq.on('error', (e: Error & { code?: number | string }) => {
      const auth = e.code === 5 || e.code === 4 || /Not authorized|Bad username/i.test(e.message);
      this.fail(auth ? 'auth' : 'connect', auth ? tDefault('connector.wrongAccessCode') : e.message);
      if (auth) this.close();
    });
    mq.on('close', () => { if (this.push) clearInterval(this.push); this.push = null; if (this.online) { this.online = false; this.emit('offline'); this.emit('status', this.status); } });
  }

  private fail(code: string, message: string) { this.lastError = message; const e = Object.assign(new Error(message), { code }); if (this.listenerCount('error')) this.emit('error', e); }

  close() { if (this.push) clearInterval(this.push); this.push = null; this.mq?.end(true); this.mq = null; this.online = false; }

  /** Espera el primer estado completo (útil para probar una conexión nueva). */
  waitReady(ms = 10_000): Promise<PrinterStatus> {
    return new Promise((res, rej) => {
      const tt = setTimeout(() => { cleanup(); rej(Object.assign(new Error(this.lastError ?? tDefault('connector.printerTimeout')), { code: 'timeout' })); }, ms);
      const ok = (s: PrinterStatus) => { if (this.raw.print?.gcode_state) { cleanup(); res(s); } };
      const bad = (e: Error) => { cleanup(); rej(e); };
      const cleanup = () => { clearTimeout(tt); this.off('status', ok); this.off('error', bad); };
      this.on('status', ok); this.on('error', bad);
    });
  }

  private send(payload: Record<string, any>) {
    if (!this.mq?.connected) throw Object.assign(new LocalizedError('connector.printerNotConnected'), { code: 'offline' });
    const [k] = Object.keys(payload); const body = { [k]: { sequence_id: String(this.seq++), ...payload[k] } };
    this.mq.publish(`device/${this.o.serial}/request`, JSON.stringify(body));
    return body;
  }
  pushall() { try { this.send({ pushing: { command: 'pushall', version: 1, push_target: 1 } }); } catch { /* sin conexión */ } }
  pause() { return this.send({ print: { command: 'pause', param: '' } }); }
  resume() { return this.send({ print: { command: 'resume', param: '' } }); }
  stop() { return this.send({ print: { command: 'stop', param: '' } }); }
  /** 1 silencioso · 2 estándar · 3 sport · 4 ludicrous */
  speed(level: 1 | 2 | 3 | 4) { return this.send({ print: { command: 'print_speed', param: String(level) } }); }
  light(on: boolean) { return this.send({ system: { command: 'ledctrl', led_node: 'chamber_light', led_mode: on ? 'on' : 'off', led_on_time: 500, led_off_time: 500, loop_times: 0, interval_time: 0 } }); }
  gcode(line: string) { return this.send({ print: { command: 'gcode_line', param: line.endsWith('\n') ? line : line + '\n' } }); }
  /** Inicia un 3MF laminado que ya está en la tarjeta de la impresora (subido por FTPS). */
  startProject(o: { fileName: string; plate?: number; urlPrefix?: string; useAms: boolean; amsMapping?: number[]; timelapse?: boolean; bedLeveling?: boolean; flowCali?: boolean; md5?: string }) {
    return this.send({ print: {
      command: 'project_file', param: `Metadata/plate_${o.plate ?? 1}.gcode`, project_id: '0', profile_id: '0', task_id: '0', subtask_id: '0',
      subtask_name: o.fileName.replace(/\.3mf$/i, '').replace(/\.gcode$/i, ''), url: `${o.urlPrefix ?? 'file:///sdcard/'}${o.fileName}`, md5: o.md5 ?? '',
      timelapse: !!o.timelapse, bed_type: 'auto', bed_levelling: o.bedLeveling ?? true, flow_cali: !!o.flowCali, vibration_cali: false, layer_inspect: false,
      use_ams: o.useAms, ams_mapping: o.amsMapping ?? (o.useAms ? [0] : []),
    } });
  }
}
