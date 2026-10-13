import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { config } from './config';

/** Almacenamiento local de archivos. Las claves son rutas relativas y nunca salen del directorio base. */
function abs(key: string) {
  const p = path.resolve(config.storageDir, key);
  if (!p.startsWith(config.storageDir + path.sep)) throw new Error('Clave de almacenamiento inválida');
  return p;
}
export function newKey(prefix: string, ext = '') {
  const id = crypto.randomUUID();
  const d = new Date();
  const e = ext && !ext.startsWith('.') ? '.' + ext : ext;
  return `${prefix}/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${id}${e.toLowerCase()}`;
}
export async function putBuffer(key: string, data: Buffer | Uint8Array) {
  const p = abs(key);
  await fsp.mkdir(path.dirname(p), { recursive: true });
  await fsp.writeFile(p, data);
  return key;
}
export async function putFile(key: string, srcPath: string, move = true) {
  const p = abs(key);
  await fsp.mkdir(path.dirname(p), { recursive: true });
  if (move) { try { await fsp.rename(srcPath, p); return key; } catch { /* otro dispositivo */ } }
  await fsp.copyFile(srcPath, p);
  if (move) await fsp.rm(srcPath, { force: true });
  return key;
}
export async function getBuffer(key: string) { return fsp.readFile(abs(key)); }
export async function exists(key: string) { try { await fsp.access(abs(key)); return true; } catch { return false; } }
export async function stat(key: string) { return fsp.stat(abs(key)); }
export function absPath(key: string) { return abs(key); }
export async function remove(key: string) { await fsp.rm(abs(key), { force: true }); }
export function readStream(key: string, range?: { start: number; end: number }) {
  return fs.createReadStream(abs(key), range);
}
export function webStream(key: string, range?: { start: number; end: number }) {
  return Readable.toWeb(readStream(key, range)) as ReadableStream;
}
export async function sha256File(p: string) {
  const h = crypto.createHash('sha256');
  await new Promise<void>((res, rej) => fs.createReadStream(p).on('data', (c) => h.update(c)).on('end', () => res()).on('error', rej));
  return h.digest('hex');
}
