import tls from 'node:tls';
import { spawn } from 'node:child_process';
import type { CameraKind } from './models';
import { getT } from '@/i18n/server';
import { LocalizedError } from '@/i18n/errors';
import { certChangedError, checkPin } from './pin';

export interface CamOpts { host: string; accessCode: string; kind: CameraKind; port?: number; fingerprint?: string | null }

/** Paquete de autenticación de la cámara P1/A1: 4 enteros LE (0x40, 0x3000, 0, 0) + usuario y código en 32 bytes cada uno. */
export function cameraAuthPacket(accessCode: string) {
  const b = Buffer.alloc(80);
  b.writeUInt32LE(0x40, 0); b.writeUInt32LE(0x3000, 4); b.writeUInt32LE(0, 8); b.writeUInt32LE(0, 12);
  b.write('bblp', 16, 32, 'ascii'); b.write(accessCode, 48, 32, 'ascii');
  return b;
}

/**
 * Cuadros JPEG de la cámara P1/A1 (TLS, puerto 6000). Cada cuadro llega con una cabecera de 16 bytes
 * cuyo tamaño de carga está en los 3 primeros bytes (little endian), seguida del JPEG completo.
 */
export async function* jpegTlsFrames(o: CamOpts, signal?: AbortSignal): AsyncGenerator<Buffer> {
  const t = await getT();
  const sock = tls.connect({ host: o.host, port: o.port ?? 6000, rejectUnauthorized: false, timeout: 10_000 });
  const queue: Buffer[] = []; let wake: (() => void) | null = null; let done: Error | null | true = null;
  let buf = Buffer.alloc(0);
  const finish = (e: Error | true) => { done = e; wake?.(); };
  signal?.addEventListener('abort', () => { sock.destroy(); finish(true); });
  // el código de acceso sale solo si el certificado es el de la impresora (huella fijada en la primera conexión MQTT)
  sock.on('secureConnect', () => { if (!checkPin(sock, o.fingerprint).ok) { sock.destroy(); finish(certChangedError()); return; } sock.write(cameraAuthPacket(o.accessCode)); });
  sock.on('timeout', () => { sock.destroy(); finish(Object.assign(new Error(t('machines.theCameraDidNotRespond')), { code: 'cam_timeout' })); });
  sock.on('error', (e) => finish(e));
  sock.on('close', () => finish(true));
  sock.on('data', (d: Buffer) => {
    buf = Buffer.concat([buf, d]);
    while (buf.length >= 16) {
      const size = buf[0] | (buf[1] << 8) | (buf[2] << 16);
      if (size <= 0 || size > 8_000_000) { sock.destroy(); finish(Object.assign(new Error(t('machines.invalidCameraResponseWrongAccess')), { code: 'cam_bad' })); return; }
      if (buf.length < 16 + size) break;
      const jpg = buf.subarray(16, 16 + size); buf = buf.subarray(16 + size);
      if (jpg[0] === 0xff && jpg[1] === 0xd8 && jpg[jpg.length - 2] === 0xff && jpg[jpg.length - 1] === 0xd9) { queue.push(Buffer.from(jpg)); wake?.(); }
    }
  });
  try {
    while (true) {
      if (queue.length) { yield queue.shift()!; continue; }
      if (done) { if (done !== true) throw done; return; }
      await new Promise<void>((r) => { wake = r; }); wake = null;
    }
  } finally { sock.destroy(); }
}

/** Separa un flujo MJPEG (de ffmpeg) en cuadros JPEG. */
export async function* splitMjpeg(src: AsyncIterable<Buffer>): AsyncGenerator<Buffer> {
  let buf = Buffer.alloc(0);
  for await (const d of src) {
    buf = Buffer.concat([buf, d]);
    while (true) {
      const s = buf.indexOf(Buffer.from([0xff, 0xd8])); if (s < 0) { buf = Buffer.alloc(0); break; }
      const e = buf.indexOf(Buffer.from([0xff, 0xd9]), s + 2); if (e < 0) { buf = buf.subarray(s); break; }
      yield Buffer.from(buf.subarray(s, e + 2)); buf = buf.subarray(e + 2);
    }
  }
}

/** Cuadros de la cámara X1/H2 (RTSPS, puerto 322) convertidos a MJPEG con ffmpeg. */
export async function* rtspsFrames(o: CamOpts, signal?: AbortSignal, fps = 2): AsyncGenerator<Buffer> {
  const t = await getT();
  const url = `rtsps://bblp:${encodeURIComponent(o.accessCode)}@${o.host}:${o.port ?? 322}/streaming/live/1`;
  const ff = spawn(process.env.FFMPEG_BIN || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-rtsp_transport', 'tcp', '-timeout', '10000000', '-i', url, '-an', '-vf', `fps=${fps}`, '-q:v', '6', '-f', 'mjpeg', 'pipe:1'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let err = ''; ff.stderr.on('data', (d) => { err = (err + d).slice(-400); });
  signal?.addEventListener('abort', () => ff.kill('SIGKILL'));
  let any = false;
  try { for await (const f of splitMjpeg(ff.stdout)) { any = true; yield f; } }
  finally { ff.kill('SIGKILL'); }
  if (!any && !signal?.aborted) throw Object.assign(new Error(t('machines.couldNotOpenTheRtsps', { detail: err.trim() })), { code: 'cam_rtsp' });
}

export function cameraFrames(o: CamOpts, signal?: AbortSignal) {
  if (o.kind === 'rtsps') return rtspsFrames(o, signal);
  if (o.kind === 'jpeg-tls') return jpegTlsFrames(o, signal);
  throw Object.assign(new LocalizedError('connector.noCamera'), { code: 'no_camera' });
}

/** Una sola foto de la cámara. */
export async function snapshot(o: CamOpts, timeoutMs = 15_000): Promise<Buffer> {
  const t = await getT();
  const ac = new AbortController(); const tt = setTimeout(() => ac.abort(), timeoutMs);
  try {
    for await (const f of cameraFrames(o, ac.signal)) return f;
    throw Object.assign(new Error(t('machines.theCameraDidNotDeliver')), { code: 'cam_timeout' });
  } finally { clearTimeout(tt); ac.abort(); }
}
