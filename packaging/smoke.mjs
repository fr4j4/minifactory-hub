// Prueba de humo de un paquete armado. Se copia a una carpeta con espacios y no ASCII, con datos en otra igual:
//   1.º arranque, base nueva sin cuentas: /login lleva a /bienvenida (200) y se emite el código de configuración inicial.
//       Con el servidor en marcha: un 2.º lanzador con la misma carpeta dice «ya está en marcha» y sale con 0;
//       un lanzador en un puerto ocupado por otro programa sale con error y pide cambiar PORT.
//   2.º arranque, misma base y ADMIN_PASSWORD: la preparación crea la cuenta y /login responde 200; la llave de sesión no cambia.
// Uso: node packaging/smoke.mjs dist/minifactory-hub-<versión>-<sistema>-<arq> [puerto]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { parseEnv } from './env-file.mjs';

// Lector de config.env: «#» es comentario solo al inicio o tras un espacio, nunca entre comillas.
assert.deepEqual(parseEnv('# X=1\nA=1 # c\nB="x # y" # c\nC=\'a#b\'\nD=a#b\nE=\n  F = " sp "\r\nG=#solo-comentario'),
  { A: '1', B: 'x # y', C: 'a#b', D: 'a#b', E: '', F: ' sp ', G: '' });

// Se prueba una copia fuera del repositorio: dentro, Node resolvería módulos faltantes desde el node_modules del repo.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-pkg-'));
const pkgDir = path.join(tmp, 'Mini Factory Ñandú');
const data = path.join(tmp, 'datos José');
// fs.promises.cp y no fs.cpSync: en el runner de Windows (Node 22.23.3) cpSync no dejó la copia en la carpeta con «Ñandú».
await fs.promises.cp(path.resolve(process.argv[2] ?? ''), pkgDir, { recursive: true, verbatimSymlinks: true });
const port = Number(process.argv[3] ?? '3917');
const win = process.platform === 'win32';
const node = path.join(pkgDir, 'node', win ? 'node.exe' : 'bin/node');
const launcher = path.join(pkgDir, 'launcher.mjs');
const fail = (m) => { console.error(`SMOKE FALLÓ: ${m}`); process.exit(1); };
const envFor = (extra) => ({ ...process.env, MF_DATA_DIR: data, PORT: String(port), MF_HOST: '127.0.0.1', ...extra });

/** Ejecuta el lanzador hasta que termine solo. */
function once(extra) {
  return new Promise((resolve) => {
    let out = '';
    const c = spawn(node, [launcher, 'start'], { env: envFor(extra), stdio: ['ignore', 'pipe', 'pipe'] });
    c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
    const t = setTimeout(() => c.kill(), 120_000);
    c.on('exit', (code) => { clearTimeout(t); resolve({ code, out }); });
  });
}

async function boot(extra = {}, whileUp = async () => {}) {
  let log = '';
  const child = spawn(node, [launcher, 'start'], { env: envFor(extra), stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (d) => { log += d; process.stdout.write(d); });
  child.stderr.on('data', (d) => { log += d; process.stderr.write(d); });
  let status = 0, location = '';
  for (let i = 0; i < 180 && !status && child.exitCode === null; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/login`, { redirect: 'manual' }); status = r.status; location = r.headers.get('location') ?? ''; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  const bienvenida = status ? (await fetch(`http://127.0.0.1:${port}/bienvenida`, { redirect: 'manual' })).status : 0;
  if (status) await whileUp();
  if (win) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']); else child.kill('SIGTERM');
  await new Promise((r) => (child.exitCode !== null ? r() : child.on('exit', r)));
  return { status, location, bienvenida, log };
}

// Dependencias nativas (sharp, argon2, pg) y wasm (occt) se cargan desde app/node_modules.
const nat = spawnSync(node, ['-e', "require('sharp'); require('@node-rs/argon2').hashSync('x'); require('pg'); require('occt-import-js')"], { cwd: path.join(pkgDir, 'app'), encoding: 'utf8' });
if (nat.status !== 0) fail(`dependencias nativas (${node}): ${nat.error ?? nat.stderr}`);

const a = await boot({}, async () => {
  const again = await once({});
  if (again.code !== 0 || !/ya está en marcha/.test(again.out)) fail(`2.º lanzador con la misma carpeta: código ${again.code}\n${again.out}`);
  // Otro programa que responde 200 en un puerto: el lanzador no debe tomarlo por MiniFactory.
  const other = http.createServer((_q, r) => r.end('otro')).listen(port + 1, '127.0.0.1');
  await new Promise((r) => other.once('listening', r));
  const busy = await once({ PORT: String(port + 1), MF_DATA_DIR: path.join(tmp, 'otros datos') });
  other.close();
  if (busy.code === 0 || !/en uso, cambia PORT en config\.env/.test(busy.out)) fail(`puerto ocupado: código ${busy.code}\n${busy.out}`);
});
if (a.status !== 307 || !a.location.includes('/bienvenida')) fail(`/login respondió ${a.status} ${a.location} en el primer arranque (se esperaba 307 a /bienvenida)`);
if (a.bienvenida !== 200) fail(`/bienvenida respondió ${a.bienvenida}`);
if (!/bienvenida/.test(a.log)) fail('no se emitió el código de configuración inicial');
const secret = fs.readFileSync(path.join(data, 'session-secret'), 'utf8');
if (!/^[0-9a-f]{64}$/.test(secret)) fail('llave de sesión inválida');
const b = await boot({ ADMIN_PASSWORD: 'smoke-test-1234', ADMIN_EMAIL: 'smoke@example.com' });
if (b.status !== 200) fail(`/login respondió ${b.status} en el segundo arranque (base existente)`);
if (fs.readFileSync(path.join(data, 'session-secret'), 'utf8') !== secret) fail('la llave de sesión cambió entre arranques');
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows puede tardar en soltar archivos */ }
console.log('SMOKE OK: nativas cargan (sharp, argon2, pg, occt); rutas con espacios y Ñ/é; base nueva -> /bienvenida 200 con código; '
  + '2.º lanzador -> «ya está en marcha»; puerto ajeno -> error; base existente + cuenta -> /login 200; llave de sesión persistente');
