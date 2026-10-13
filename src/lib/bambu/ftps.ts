import { Readable } from 'node:stream';
import { Client } from 'basic-ftp';

export interface FtpOpts { host: string; accessCode: string; port?: number }

/** FTPS implícito (puerto 990, usuario `bblp`) hacia la tarjeta de la impresora. */
async function open(o: FtpOpts) {
  const c = new Client(20_000);
  await c.access({ host: o.host, port: o.port ?? 990, user: 'bblp', password: o.accessCode, secure: 'implicit', secureOptions: { rejectUnauthorized: false } });
  return c;
}

export async function uploadFile(o: FtpOpts, name: string, data: Buffer, onProgress?: (bytes: number) => void) {
  if (!/^[\w.\- ()]+$/.test(name)) throw new Error('Nombre de archivo no permitido para la impresora');
  const c = await open(o);
  try { if (onProgress) c.trackProgress((i) => onProgress(i.bytes)); await c.uploadFrom(Readable.from(data), name); }
  finally { c.trackProgress(); c.close(); }
}

export async function listFiles(o: FtpOpts, dir = '/') {
  const c = await open(o);
  try { return (await c.list(dir)).map((f) => ({ name: f.name, size: f.size, isDir: f.isDirectory, date: f.modifiedAt?.toISOString() ?? f.rawModifiedAt ?? null })); }
  finally { c.close(); }
}
