import path from 'node:path';

const cwd = process.cwd();
const DEV_SECRET = 'dev-secret-cambiar-en-produccion';
const PLACEHOLDERS = [DEV_SECRET, 'cambia-esto-por-un-valor-largo-y-aleatorio'];

/** En producción SESSION_SECRET debe existir, tener 32+ caracteres y no ser un valor de ejemplo: sella las claves de impresoras, nube e IA. */
export function sessionSecret() {
  const v = process.env.SESSION_SECRET ?? '';
  if (process.env.NODE_ENV !== 'production') return v || DEV_SECRET;
  if (v.length < 32 || PLACEHOLDERS.includes(v)) throw new Error('SESSION_SECRET falta, es corto (mínimo 32 caracteres) o es el valor de ejemplo. Genera uno con: openssl rand -hex 32. Si reemplazas uno que ya usabas, pon el anterior en SESSION_SECRET_PREVIOUS para no perder los códigos de impresoras ni la clave de IA guardados.');
  return v;
}
export const config = {
  storageDir: path.resolve(process.env.STORAGE_DIR || path.join(cwd, 'data', 'storage')),
  orcaBin: path.resolve(process.env.ORCA_BIN || path.join(cwd, '.orca', 'squashfs-root', 'AppRun')),
  orcaProfilesDir: path.resolve(process.env.ORCA_PROFILES_DIR || path.join(cwd, '.orca', 'squashfs-root', 'resources', 'profiles')),
  orcaConcurrency: Number(process.env.ORCA_CONCURRENCY || 2),
  orcaTimeoutS: Number(process.env.ORCA_TIMEOUT_S || 180),
  maxUploadBytes: 500 * 1024 * 1024,
  dataDir: path.resolve(process.env.DATA_DIR || path.join(cwd, 'data')),
};
