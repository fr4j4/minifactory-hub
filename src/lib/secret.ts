import crypto from 'node:crypto';
import { config } from './config';

/** Cifrado simétrico (AES-256-GCM) para secretos guardados en la base, con llave derivada de SESSION_SECRET. */
const key = () => crypto.createHash('sha256').update(`${config.sessionSecret}:printer-secrets:v1`).digest();
export function seal(plain: string) {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
}
export function unseal(sealed: string) {
  const [v, iv, tag, enc] = sealed.split('.');
  if (v !== 'v1') throw new Error('Formato de secreto desconocido');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64')); d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString('utf8');
}
