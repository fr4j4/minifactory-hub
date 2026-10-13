import path from 'node:path';

const cwd = process.cwd();
export const config = {
  storageDir: path.resolve(process.env.STORAGE_DIR || path.join(cwd, 'data', 'storage')),
  orcaBin: path.resolve(process.env.ORCA_BIN || path.join(cwd, '.orca', 'squashfs-root', 'AppRun')),
  orcaProfilesDir: path.resolve(process.env.ORCA_PROFILES_DIR || path.join(cwd, '.orca', 'squashfs-root', 'resources', 'profiles')),
  orcaConcurrency: Number(process.env.ORCA_CONCURRENCY || 2),
  orcaTimeoutS: Number(process.env.ORCA_TIMEOUT_S || 180),
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-cambiar-en-produccion',
  maxUploadBytes: 500 * 1024 * 1024,
  dataDir: path.resolve(process.env.DATA_DIR || path.join(cwd, 'data')),
};
