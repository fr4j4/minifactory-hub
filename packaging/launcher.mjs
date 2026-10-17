// Lanzador de MiniFactory Hub instalado desde un release (Windows y Linux). Lo ejecuta el Node que viene en el paquete.
// Uso: launcher.mjs [start|worker] [--open]
//   start   prepara la carpeta de datos, crea la base si falta y arranca el servidor web (por defecto)
//   worker  arranca el proceso aparte de laminados (solo con DATABASE_URL, ver scripts/worker.ts)
//   --open  abre el navegador cuando el servidor responde (si ya estaba corriendo, solo abre el navegador)
// Una sola instancia por carpeta de datos (archivo .lock con el PID): PGlite no admite dos procesos sobre la misma base.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseEnv } from './env-file.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const app = path.join(root, 'app');
const win = process.platform === 'win32';
const env = process.env;
const cmd = process.argv.slice(2).find((a) => !a.startsWith('-')) ?? 'start';
const open = process.argv.includes('--open');

const dataDir = path.resolve(env.MF_DATA_DIR
  || (win ? path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'MiniFactoryHub')
    : path.join(env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'minifactory-hub')));
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });

// config.env: ajustes de la persona (PORT, ORCA_BIN, DATABASE_URL…). Las variables de entorno ya definidas mandan.
const cfgFile = path.join(dataDir, 'config.env');
if (!fs.existsSync(cfgFile)) fs.writeFileSync(cfgFile, [
  '# Ajustes de MiniFactory Hub. Quite el # de una línea para activarla y reinicie la aplicación.',
  '# PORT=3000',
  '# MF_HOST=0.0.0.0            # 127.0.0.1 = solo este equipo; 0.0.0.0 = también otros equipos de la red',
  win ? '# ORCA_BIN=C:\\Program Files\\OrcaSlicer\\orca-slicer.exe' : '# ORCA_BIN=/ruta/a/squashfs-root/AppRun',
  win ? '# ORCA_PROFILES_DIR=C:\\Program Files\\OrcaSlicer\\resources\\profiles' : '# ORCA_PROFILES_DIR=/ruta/a/squashfs-root/resources/profiles',
  '# CHROMIUM_PATH=             # navegador para los PDF (se detecta Edge/Chrome/Chromium)',
  '# DATABASE_URL=postgres://usuario:clave@localhost:5432/minifactory',
  '',
].join(os.EOL), { mode: 0o600 });
for (const [k, v] of Object.entries(parseEnv(fs.readFileSync(cfgFile, 'utf8')))) env[k] ??= v;

// Llave de sesión: se genera una vez por instalación y se guarda en la carpeta de datos. Nunca se usa una por defecto.
if (!env.SESSION_SECRET) {
  const f = path.join(dataDir, 'session-secret');
  try { fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  env.SESSION_SECRET = fs.readFileSync(f, 'utf8').trim();
  if (env.SESSION_SECRET.length < 32) { console.error(`La llave de sesión en ${f} es demasiado corta. Bórrela para generar otra.`); process.exit(1); }
}

const first = (list) => list.find((p) => p && fs.existsSync(p));
if (!env.ORCA_BIN) {
  const bin = first(win
    ? [path.join(env.ProgramFiles || 'C:\\Program Files', 'OrcaSlicer', 'orca-slicer.exe'), path.join(env.LOCALAPPDATA || '', 'Programs', 'OrcaSlicer', 'orca-slicer.exe')]
    : [path.join(dataDir, 'orca', 'squashfs-root', 'AppRun'), '/opt/orcaslicer/squashfs-root/AppRun']);
  if (bin) { env.ORCA_BIN = bin; env.ORCA_PROFILES_DIR ??= path.join(path.dirname(bin), 'resources', 'profiles'); }
}
if (!env.CHROMIUM_PATH) {
  const pf86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', pf = env.ProgramFiles || 'C:\\Program Files';
  const ch = first(win
    ? [path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe')]
    : ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable']);
  if (ch) env.CHROMIUM_PATH = ch;
}

Object.assign(env, {
  NODE_ENV: 'production',
  DATA_DIR: env.DATA_DIR || dataDir,
  STORAGE_DIR: env.STORAGE_DIR || path.join(dataDir, 'storage'),
  PGLITE_DIR: env.PGLITE_DIR || path.join(dataDir, 'pgdata'),
  PORT: env.PORT || '3000',
  HOSTNAME: env.MF_HOST || '0.0.0.0', // server.js de Next escucha en HOSTNAME; algunos shells lo definen con el nombre del equipo
});
const url = `http://127.0.0.1:${env.PORT}`;
const node = (script, args = []) => spawn(process.execPath, [script, ...args], { cwd: app, env, stdio: 'inherit' });

const fail = (msg) => { console.error(msg); process.exit(1); }; // MiniFactory Hub.cmd hace pause si el código no es 0
// Nuestro servidor responde con la cabecera X-MiniFactory (next.config.mjs); cualquier otro programa en el puerto no.
async function ours() { try { return (await fetch(url + '/login', { redirect: 'manual' })).headers.get('x-minifactory') === '1'; } catch { return false; } }
const portFree = () => new Promise((resolve) => {
  const s = net.createServer().once('error', () => resolve(false)).once('listening', () => s.close(() => resolve(true)));
  s.listen(Number(env.PORT), env.HOSTNAME);
});
const lockFile = path.join(dataDir, '.lock');
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
/** Toma el candado de la carpeta de datos. Devuelve 0, o el PID vivo que ya lo tiene. Un candado con PID muerto se descarta. */
function lock() {
  // ponytail: un PID reutilizado por otro programa tras un corte de luz parece vivo; el mensaje dice cómo borrar el .lock.
  for (;;) {
    try { fs.writeFileSync(lockFile, String(process.pid), { flag: 'wx' }); break; } catch (e) { if (e.code !== 'EEXIST') throw e; }
    const pid = Number(fs.readFileSync(lockFile, 'utf8'));
    if (pid && alive(pid)) return pid;
    fs.rmSync(lockFile, { force: true });
  }
  process.on('exit', () => { try { if (fs.readFileSync(lockFile, 'utf8') === String(process.pid)) fs.rmSync(lockFile); } catch { /* ya no está */ } });
  return 0;
}
function openBrowser() {
  spawn(win ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}
async function alreadyRunning(detail) {
  console.log(`MiniFactory Hub ya está en marcha en ${url}${detail}.`);
  if (open) openBrowser();
  process.exit(0);
}
function run(child) {
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => child.kill(s)); // SIGHUP: cerrar la ventana en Windows
  child.on('exit', (code, sig) => process.exit(code ?? (sig ? 1 : 0)));
}

if (cmd === 'worker') run(node('mf-worker.js'));
else if (cmd !== 'start') { console.error(`Comando desconocido: ${cmd}. Use start o worker.`); process.exit(2); }
else {
  const holder = lock();
  if (holder) {
    for (let i = 0; i < 60 && !(await ours()); i++) await new Promise((r) => setTimeout(r, 1000)); // puede estar arrancando
    if (await ours()) await alreadyRunning('');
    fail(`Otra instancia de MiniFactory Hub (PID ${holder}) usa ${dataDir}. Ciérrela; si no hay ninguna, borre ${lockFile}.`);
  }
  if (!(await portFree())) {
    if (await ours()) await alreadyRunning(' (con otra carpeta de datos)');
    fail(`Puerto ${env.PORT} en uso, cambia PORT en config.env (${cfgFile}).`);
  }
  console.log(`MiniFactory Hub · datos en ${dataDir}`);
  console.log(env.ORCA_BIN ? `OrcaSlicer: ${env.ORCA_BIN}` : 'OrcaSlicer no encontrado: el laminador del servidor queda deshabilitado (ver docs/empaquetado-releases.md).');
  // La base embebida (PGlite) admite un solo proceso: la preparación termina antes de arrancar el servidor.
  const boot = spawnSync(process.execPath, ['mf-seed.js', '--bootstrap-only'], { cwd: app, env, stdio: 'inherit' });
  if (boot.status !== 0) { console.error('No se pudo preparar la base de datos.'); process.exit(boot.status ?? 1); }
  run(node('server.js'));
  console.log(`Abra ${url} en el navegador. Para detener la aplicación, cierre esta ventana o pulse Ctrl+C.`);
  if (open) { for (let i = 0; i < 120 && !(await ours()); i++) await new Promise((r) => setTimeout(r, 500)); openBrowser(); }
}
