import { Readable } from 'node:stream';
import type { TLSSocket } from 'node:tls';
import { Client } from 'basic-ftp';
import { certChangedError, checkPin } from './pin';
import { getT } from '@/i18n/server';

export interface FtpOpts { host: string; accessCode: string; port?: number; fingerprint?: string | null }

/** FTPS implícito (puerto 990, usuario `bblp`) hacia la tarjeta de la impresora. */
async function open(o: FtpOpts) {
  const c = new Client(20_000);
  // como access(), pero revisa la huella del certificado antes de enviar el código de acceso
  try {
    await c.connectImplicitTLS(o.host, o.port ?? 990, { rejectUnauthorized: false });
    if (!checkPin(c.ftp.socket as TLSSocket, o.fingerprint).ok) throw certChangedError();
    await c.sendIgnoringError('OPTS UTF8 ON'); await c.login('bblp', o.accessCode); await c.useDefaultSettings();
  } catch (e) { c.close(); throw e; }
  return c;
}

export async function uploadFile(o: FtpOpts, name: string, data: Buffer, onProgress?: (bytes: number) => void) {
  const t = await getT();
  if (!/^[\w.\- ()]+$/.test(name)) throw new Error(t('machines.fileNameNotAllowedFor'));
  const c = await open(o);
  try { if (onProgress) c.trackProgress((i) => onProgress(i.bytes)); await c.uploadFrom(Readable.from(data), name); }
  finally { c.trackProgress(); c.close(); }
}

export async function listFiles(o: FtpOpts, dir = '/') {
  const c = await open(o);
  try { return (await c.list(dir)).map((f) => ({ name: f.name, size: f.size, isDir: f.isDirectory, date: f.modifiedAt?.toISOString() ?? f.rawModifiedAt ?? null })); }
  finally { c.close(); }
}
