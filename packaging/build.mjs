// Arma el paquete portable para el sistema actual: Node + app (Next standalone) + lanzador, y lo comprime.
// Uso: node packaging/build.mjs  (ejecuta `next build` con MF_STANDALONE=1)   Versión: MF_VERSION (por defecto la de package.json)
// Salida en dist/: carpeta minifactory-hub-<versión>-<sistema>-<arq>, su .zip (Windows) o .tar.gz, y un .deb en Linux.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import nextConfig from '../next.config.mjs';

const NODE_VERSION = '22.23.3'; // misma línea (22) que el Dockerfile
// SHA256 de https://nodejs.org/dist/v22.23.3/SHASUMS256.txt. Al cambiar NODE_VERSION, actualícelos.
const NODE_SHA256 = {
  'win-x64': '2b0ff57b049cda1bbcea2240eec20467018713c1efe1f7360c2681859b90ed71',
  'linux-x64': 'df450af89261115ef9f9e3830c3eeb2cc9213b63c720b1af623cb5dcbe2e02de',
  'linux-arm64': 'a44aeb94849a299b22df10b9e622ec2f605c2183501bc40590705131de7c740f',
  'darwin-arm64': '72d5d8832b41c9d9646197af614ffd751406ea4d215060eb91b98864e1919a3e',
  'darwin-x64': 'ac41874c3352937119cfec39e1a98c578fe58ce8a86d7e785b89a4706015f305',
};
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
const version = (process.env.MF_VERSION || pkg.version).replace(/^v/, '');
const plat = { win32: 'win', linux: 'linux', darwin: 'darwin' }[process.platform];
const win = plat === 'win';
const target = `${plat}-${process.arch}`;
const name = `minifactory-hub-${version}-${target}`;
const dist = path.join(repo, 'dist');
const out = path.join(dist, name);
const app = path.join(out, 'app');
// En Windows se usa el tar del sistema (bsdtar: lee y crea .zip); el GNU tar de Git Bash confunde «D:» con un host remoto.
const tar = win ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
const sh = (cmd, args, cwd = dist) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });
const cp = (from, to) => fs.cpSync(path.join(repo, from), to, { recursive: true });

execFileSync(process.execPath, [path.join(repo, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build'], { cwd: repo, stdio: 'inherit', env: { ...process.env, MF_STANDALONE: '1' } });
const standalone = path.join(repo, '.next', 'standalone');
if (!fs.existsSync(path.join(standalone, 'server.js'))) throw new Error('Falta .next/standalone/server.js tras next build.');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// 1. Aplicación web: standalone + archivos estáticos + lo que se carga por ruta en tiempo de ejecución.
fs.cpSync(standalone, app, { recursive: true });
cp('.next/static', path.join(app, '.next', 'static'));
cp('public', path.join(app, 'public'));
cp('drizzle', path.join(app, 'drizzle'));
cp('node_modules/occt-import-js', path.join(app, 'node_modules', 'occt-import-js')); // import con webpackIgnore: Next no lo traza
for (const f of fs.readdirSync(app)) if (f === 'data' || f.startsWith('.env')) fs.rmSync(path.join(app, f), { recursive: true, force: true }); // nunca datos ni secretos locales

// 2. Preparación de la base y worker en JS plano. Los paquetes nativos/wasm quedan fuera y se cargan desde app/node_modules.
await build({
  entryPoints: { 'mf-seed': path.join(repo, 'scripts/seed.ts'), 'mf-worker': path.join(repo, 'scripts/worker.ts') },
  outdir: app, bundle: true, platform: 'node', target: 'node22', format: 'cjs', logLevel: 'warning',
  tsconfig: path.join(repo, 'tsconfig.json'), external: nextConfig.serverExternalPackages, // next/headers y demás se empaquetan: el standalone no trae esos archivos
});

// 3. Node portable oficial, verificado con el SHA256 fijado arriba.
const ext = win ? 'zip' : 'tar.xz';
const nodeName = `node-v${NODE_VERSION}-${target}`;
const cache = path.join(dist, '.cache');
fs.mkdirSync(cache, { recursive: true });
const archive = path.join(cache, `${nodeName}.${ext}`);
const want = NODE_SHA256[target];
if (!want) throw new Error(`Sin SHA256 fijado para ${target}`);
if (!fs.existsSync(archive)) {
  const res = await fetch(`https://nodejs.org/dist/v${NODE_VERSION}/${nodeName}.${ext}`);
  if (!res.ok) throw new Error(`No se pudo descargar ${nodeName}.${ext} (${res.status})`);
  fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
}
if (crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex') !== want) { fs.rmSync(archive); throw new Error(`SHA256 de ${nodeName}.${ext} no coincide`); }
fs.rmSync(path.join(cache, nodeName), { recursive: true, force: true });
sh(tar, ['-xf', archive], cache);
fs.renameSync(path.join(cache, nodeName), path.join(out, 'node'));
// npm/corepack y cabeceras no hacen falta para ejecutar la aplicación.
for (const p of win ? ['node_modules', 'npm', 'npm.cmd', 'npm.ps1', 'npx', 'npx.cmd', 'npx.ps1', 'corepack', 'corepack.cmd', 'install_tools.bat']
  : ['include', 'share', 'lib/node_modules', 'bin/npm', 'bin/npx', 'bin/corepack']) fs.rmSync(path.join(out, 'node', p), { recursive: true, force: true });

// 4. Lanzador y archivos por sistema.
for (const f of ['launcher.mjs', 'env-file.mjs']) cp(`packaging/${f}`, path.join(out, f));
if (win) cp('packaging/windows/MiniFactory Hub.cmd', path.join(out, 'MiniFactory Hub.cmd'));
else {
  cp('packaging/linux/minifactory-hub', path.join(out, 'bin', 'minifactory-hub'));
  cp('packaging/linux/minifactory-hub.service', path.join(out, 'minifactory-hub.service'));
  cp('scripts/install-orca.sh', path.join(out, 'install-orca.sh'));
  fs.chmodSync(path.join(out, 'bin', 'minifactory-hub'), 0o755);
}

// 5. Archivos comprimidos.
if (win) sh(tar, ['-a', '-cf', `${name}.zip`, name]);
else sh(tar, ['-czf', `${name}.tar.gz`, name]);
if (plat === 'linux') {
  const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch];
  const debVersion = version.replace('-', '~'); // en Debian «1.2.0~rc.1» es anterior a «1.2.0», como en semver
  const deb = path.join(dist, 'deb-root');
  fs.rmSync(deb, { recursive: true, force: true });
  fs.cpSync(out, path.join(deb, 'opt', 'minifactory-hub'), { recursive: true, verbatimSymlinks: true });
  fs.mkdirSync(path.join(deb, 'usr', 'bin'), { recursive: true });
  fs.symlinkSync('/opt/minifactory-hub/bin/minifactory-hub', path.join(deb, 'usr', 'bin', 'minifactory-hub'));
  cp('packaging/linux/minifactory-hub.service', path.join(deb, 'lib', 'systemd', 'system', 'minifactory-hub.service'));
  cp('packaging/linux/debian', path.join(deb, 'DEBIAN'));
  const control = path.join(deb, 'DEBIAN', 'control');
  fs.writeFileSync(control, fs.readFileSync(control, 'utf8').replace('@VERSION@', debVersion).replace('@ARCH@', arch));
  for (const s of ['postinst', 'prerm', 'postrm']) fs.chmodSync(path.join(deb, 'DEBIAN', s), 0o755);
  sh('dpkg-deb', ['--root-owner-group', '-Zxz', '--build', deb, `minifactory-hub_${debVersion}_${arch}.deb`]);
  fs.rmSync(deb, { recursive: true, force: true });
}
console.log(`Paquete listo: ${out}`);
if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, `PKG_DIR=${out}\n`);
