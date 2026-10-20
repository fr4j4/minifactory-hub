import tls from 'node:tls';
import { Duplex } from 'node:stream';
import { tDefault } from '@/i18n/errors';

/**
 * Confianza en el primer uso (TOFU) a nivel TLS: la huella SHA-256 del certificado se compara apenas termina el
 * saludo TLS, antes de enviar el código de acceso. Sin huella guardada se acepta y se informa la nueva.
 */
export function checkPin(sock: tls.TLSSocket, fingerprint?: string | null): { fp: string | null; ok: boolean } {
  const fp = sock.getPeerCertificate()?.fingerprint256 ?? null;
  return { fp, ok: !fingerprint || fp === fingerprint };
}
export const certChangedError = () => Object.assign(new Error(tDefault('connector.certChanged')), { code: 'cert_changed' });

/** Socket TLS que retiene lo que se escribe hasta validar la huella (mqtt.js escribe CONNECT, con el código, de inmediato). */
export function pinnedTlsStream(opts: tls.ConnectionOptions, fingerprint: string | null | undefined, onCert: (fp: string | null, ok: boolean) => void): Duplex {
  const sock = tls.connect({ ...opts, rejectUnauthorized: false });
  let ready!: Promise<void>;
  const d = new Duplex({
    read() { sock.resume(); },
    write(chunk, _enc, cb) { ready.then(() => { sock.write(chunk, cb); }, cb); },
    final(cb) { sock.end(); cb(); },
    destroy(err, cb) { sock.destroy(); cb(err); },
  });
  ready = new Promise((res, rej) => sock.once('secureConnect', () => {
    const { fp, ok } = checkPin(sock, fingerprint); onCert(fp, ok);
    if (ok) res(); else { const e = certChangedError(); rej(e); d.destroy(e); }
  }));
  ready.catch(() => {});
  sock.on('data', (c) => { if (!d.push(c)) sock.pause(); });
  sock.on('end', () => d.push(null));
  sock.on('error', (e) => d.destroy(e));
  sock.on('close', () => d.destroy());
  return d;
}
