# Empaquetado e instalación desde releases (Windows y Linux)

Estado: implementado · Workflow: `.github/workflows/release.yml` · Código: `packaging/`

---

## 1. Objetivos

1. Instalar MiniFactory Hub **sin Docker, sin Git y sin instalar Node ni una base de datos**: se descarga un archivo del release y se ejecuta.
2. Un **instalador para Windows** (`.exe`) y **paquetes para Linux** (`.tar.gz` y `.deb`), generados por GitHub Actions en cada tag `v*`.
3. Mismo comportamiento que la instalación con Docker: base embebida (PGlite), configuración inicial en `/bienvenida`, datos que sobreviven a las actualizaciones.
4. Seguridad por defecto: la llave de sesión se genera en el primer arranque. **Nunca** se distribuye una llave por defecto.
5. Docker sigue disponible y sin cambios para quien lo prefiera (y es la única opción que trae OrcaSlicer ya instalado).

## 2. Arquitectura elegida

Cada paquete es una carpeta autocontenida:

```
minifactory-hub-<versión>-<sistema>-x64/
├── node/                 Node 22 oficial (sin npm), descargado de nodejs.org y verificado con SHASUMS256
├── app/                  build de Next en modo standalone (solo con MF_STANDALONE=1; server.js + node_modules mínimos)
│   ├── mf-seed.js        preparación de la base (scripts/seed.ts --bootstrap-only), en JS plano con esbuild
│   ├── mf-worker.js      worker aparte (scripts/worker.ts), solo para instalaciones con Postgres
│   └── drizzle/ public/ .next/static/ node_modules/occt-import-js/
├── launcher.mjs          lanzador común a Windows y Linux
├── MiniFactory Hub.cmd   (Windows) doble clic: arranca y abre el navegador
├── bin/minifactory-hub   (Linux) script de arranque
├── minifactory-hub.service   (Linux) ejemplo de servicio systemd
└── install-orca.sh       (Linux) instalador opcional de OrcaSlicer
```

**Qué hace el lanzador** (`packaging/launcher.mjs`) en cada arranque:

1. Elige la carpeta de datos (ver §5) y la crea si falta (permisos 0700 en Linux).
2. Lee `config.env` de esa carpeta (lo crea comentado, con permisos 0600, la primera vez). Las variables de entorno ya definidas mandan. `#` es comentario solo al inicio de la línea o tras un espacio, nunca entre comillas; las comillas que rodean un valor se quitan.
3. Si no hay `SESSION_SECRET`, usa el archivo `session-secret` de la carpeta de datos; si no existe, lo crea con 32 bytes aleatorios (`crypto.randomBytes`).
4. Busca OrcaSlicer y un navegador para los PDF (Edge/Chrome/Chromium) en las rutas habituales.
5. Toma el candado `.lock` de la carpeta de datos (contiene el PID; si ese proceso ya no existe, el candado se descarta). Si otra instancia viva lo tiene, abre el navegador hacia ella y termina.
6. Prueba el puerto. Si está ocupado por MiniFactory Hub (lo reconoce por la cabecera `X-MiniFactory`), abre el navegador y termina. Si lo ocupa otro programa, dice «puerto X en uso, cambia PORT en config.env» y termina con error (en Windows la ventana espera una tecla).
7. Ejecuta `mf-seed.js --bootstrap-only` y espera a que termine: PGlite admite **un solo proceso** a la vez.
8. Arranca `server.js` de Next. Con `--open` espera a que responda y abre el navegador (`explorer.exe` / `xdg-open`, sin shell).

Las dependencias nativas (`@node-rs/argon2`, `sharp`) y wasm (PGlite, `occt-import-js`) se resuelven en el propio runner de cada sistema con `npm ci`: por eso hay una pierna de la matriz por sistema y no se compila en cruzado.

### Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| **Electron** | Agrega ~150 MB y otro Chromium solo para mostrar una web que ya se abre en el navegador. MiniFactory es un servidor para toda la red del taller (celulares, otros PCs), no una app de escritorio de un solo usuario. |
| **pkg / Node SEA (un solo .exe)** | `pkg` está abandonado. SEA no empaqueta bien módulos nativos (`.node` de argon2 y sharp), wasm de PGlite ni el árbol de archivos de Next; habría que extraerlos a disco igual. Una carpeta con `node.exe` es lo mismo, sin trucos. |
| **Solo Docker** | Exige instalar Docker Desktop (WSL 2, virtualización en la BIOS, ~2 GB) y usar la terminal. Es la mayor barrera para personas sin experiencia técnica. Se mantiene como opción. |
| **MSI (WiX)** | Más complejo de mantener que Inno Setup y sin ventaja para una instalación por usuario. |

## 3. Archivos de cada release

| Archivo | Sistema | Uso |
|---|---|---|
| `minifactory-hub-<v>-win-x64-setup.exe` | Windows 10/11 x64 | Instalador (Inno Setup). Recomendado. |
| `minifactory-hub-<v>-win-x64.zip` | Windows 10/11 x64 | Portable: descomprimir y doble clic en `MiniFactory Hub.cmd`. |
| `minifactory-hub_<v>_amd64.deb` | Debian 11+/Ubuntu 22.04+ x64 | Paquete con servicio systemd. Recomendado en servidores. En el nombre y la versión del paquete el primer `-` pasa a `~` (`1.2.0~rc.1`), para que Debian ordene la pre-versión antes de `1.2.0`. |
| `minifactory-hub-<v>-linux-x64.tar.gz` | Linux x64 (glibc 2.28+) | Portable para cualquier distribución. |
| `SHA256SUMS` | todos | Sumas para verificar las descargas: `sha256sum -c SHA256SUMS --ignore-missing`. |

Tamaños medidos en CI (versión 1.0.0): instalador de Windows 45 MB, .zip 69 MB, .deb 59 MB, .tar.gz 86 MB. Descomprimido ocupa unos 206 MB (Windows).

## 4. Instalar, actualizar y desinstalar

### Windows (instalador)

1. Descargue `…-win-x64-setup.exe` del release y ábralo.
2. Windows SmartScreen puede decir «Windows protegió su PC» (el instalador aún no está firmado, ver §7): pulse **Más información → Ejecutar de todas formas**.
3. El instalador no pide permisos de administrador. Instala en `%LOCALAPPDATA%\Programs\MiniFactory Hub` y crea accesos en el menú Inicio (y en el escritorio si se marca).
4. Al terminar abre **MiniFactory Hub**: una ventana negra (el servidor) y el navegador en `http://localhost:3000`.
5. La primera vez el navegador lleva a `/bienvenida`. El código de un solo uso aparece en la ventana negra.

Uso diario: abrir **MiniFactory Hub** desde el menú Inicio. **Cerrar la ventana negra apaga la aplicación.** Para que otros equipos de la red entren, Windows puede preguntar si permite a Node.js en redes privadas: responda **Permitir**.

- **Actualizar:** ejecute el instalador de la versión nueva. Cierre antes la ventana de MiniFactory Hub. Reemplaza el programa y conserva los datos.
- **Desinstalar:** Configuración → Aplicaciones → MiniFactory Hub → Desinstalar. **Los datos no se borran**; para borrarlos, elimine `%LOCALAPPDATA%\MiniFactoryHub` a mano.
- **Portable (.zip):** descomprima donde quiera y use `MiniFactory Hub.cmd`. Usa la misma carpeta de datos que el instalador.

### Linux (.deb)

```bash
sudo apt install ./minifactory-hub_<v>_amd64.deb
journalctl -u minifactory-hub | grep código      # código para /bienvenida
```

El paquete crea el usuario de sistema `minifactory`, la carpeta `/var/lib/minifactory-hub` (permisos 0700), y deja el servicio `minifactory-hub` habilitado y en marcha en el puerto 3000. El servicio corre aislado: `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`, y solo puede escribir en `/var/lib/minifactory-hub`.

- **Actualizar:** `sudo apt install ./minifactory-hub_<nueva>_amd64.deb`. Reinicia el servicio y conserva los datos.
- **Desinstalar:** `sudo apt remove minifactory-hub`. Detiene el servicio. Los datos en `/var/lib/minifactory-hub` se conservan siempre (también con `purge`).
- **Comandos:** `sudo systemctl status|restart|stop minifactory-hub`.

### Linux (.tar.gz)

```bash
tar -xzf minifactory-hub-<v>-linux-x64.tar.gz
./minifactory-hub-<v>-linux-x64/bin/minifactory-hub start --open
```

Datos en `~/.local/share/minifactory-hub`. Para dejarlo como servicio: copie la carpeta a `/opt/minifactory-hub`, ajuste `User` en `minifactory-hub.service`, cópielo a `/etc/systemd/system/` y ejecute `sudo systemctl daemon-reload && sudo systemctl enable --now minifactory-hub`.

Actualizar = reemplazar la carpeta por la nueva. Desinstalar = borrar la carpeta (los datos quedan en `~/.local/share/minifactory-hub`).

## 5. Carpeta de datos, ajustes y respaldos

| Instalación | Carpeta de datos |
|---|---|
| Windows (instalador y .zip) | `%LOCALAPPDATA%\MiniFactoryHub` |
| Linux .deb (servicio) | `/var/lib/minifactory-hub` |
| Linux .tar.gz | `$XDG_DATA_HOME/minifactory-hub` (por defecto `~/.local/share/minifactory-hub`) |
| Cualquiera | la que indique la variable `MF_DATA_DIR` |

Contenido: `pgdata/` (base embebida), `storage/` (STL, G-code, fotos), `session-secret`, `config.env` y cachés de OrcaSlicer.

`config.env` admite, entre otros: `PORT`, `MF_HOST` (`127.0.0.1` = solo este equipo; por defecto `0.0.0.0`, toda la red), `ORCA_BIN`, `ORCA_PROFILES_DIR`, `CHROMIUM_PATH` y `DATABASE_URL` (Postgres externo en vez de PGlite). Reinicie la aplicación después de editarlo.

**Respaldos:** igual que con Docker, use **Configuración → Respaldo** (descarga un ZIP). Para un respaldo completo en frío: detenga la aplicación y copie la carpeta de datos entera. **No borre ni pierda `session-secret`**: cifra los secretos guardados en la base (tokens de impresoras, llaves de IA).

## 6. OrcaSlicer (laminador del servidor)

No se incluye en los paquetes: pesa ~400 MB, tiene licencia AGPL y publica sus propios builds por sistema. Sin OrcaSlicer la aplicación funciona; solo queda deshabilitado el laminador del servidor (Configuración → Salud del sistema lo informa).

El lanzador lo detecta solo en estas rutas:

| Sistema | Rutas buscadas |
|---|---|
| Windows | `C:\Program Files\OrcaSlicer\orca-slicer.exe`, `%LOCALAPPDATA%\Programs\OrcaSlicer\orca-slicer.exe` |
| Linux | `<carpeta de datos>/orca/squashfs-root/AppRun`, `/opt/orcaslicer/squashfs-root/AppRun` |

- **Windows:** instale OrcaSlicer con su instalador oficial (<https://github.com/OrcaSlicer/OrcaSlicer/releases>) y reinicie MiniFactory Hub. El laminado por línea de comandos en Windows **no está verificado** todavía (ver §10).
- **Linux:** reutilice el script incluido, que descarga el AppImage oficial y lo extrae:
  ```bash
  # .tar.gz
  ORCA_DIR=~/.local/share/minifactory-hub/orca bash minifactory-hub-<v>-linux-x64/install-orca.sh
  # .deb
  sudo -u minifactory ORCA_DIR=/var/lib/minifactory-hub/orca bash /opt/minifactory-hub/install-orca.sh
  sudo systemctl restart minifactory-hub
  ```
  El script avisa qué paquetes del sistema faltan (`libwebkit2gtk-4.1-0`, `libgl1`, …).
- **Otra ruta:** defina `ORCA_BIN` y `ORCA_PROFILES_DIR` en `config.env`.

**PDF de presupuestos:** necesitan un navegador Chromium. En Windows se usa Microsoft Edge (viene con el sistema). En Linux instale `chromium` o Google Chrome, o defina `CHROMIUM_PATH`.

## 7. Firma de código

Hoy los binarios **no están firmados**. Efectos: SmartScreen en Windows muestra una advertencia al abrir el instalador; Linux no se ve afectado. `SHA256SUMS` permite verificar que la descarga es íntegra.

Opciones para más adelante, de menor a mayor costo:

1. **Azure Trusted Signing** (~10 USD/mes): firma desde GitHub Actions sin token físico. Requiere una organización verificable.
2. **Certificado OV/EV** de una CA (SSL.com, Certum, Sectigo): desde 2023 vive en un HSM o token; se firma en CI con su servicio en la nube (p. ej. eSigner) y `signtool`.
3. **SignPath.io**: gratis para proyectos de código abierto, se integra con GitHub Actions.

Cómo agregarlo: un paso después de `ISCC` que firme `node\node.exe` y el `…-setup.exe` (Inno Setup también admite `SignTool=` para firmar el desinstalador). La reputación de SmartScreen se acumula con las descargas, incluso con certificado OV.

## 8. Actualización automática

Fuera de alcance. Hoy se actualiza instalando la versión nueva encima (Windows) o con `apt install` (Linux).

Cómo agregarla después, sin Electron:

1. Un aviso en la app: consultar `https://api.github.com/repos/fr4j4/minifactory-hub/releases/latest` una vez al día y mostrar «Hay una versión nueva» con el enlace.
2. En Linux, publicar un repositorio APT (p. ej. en GitHub Pages con `reprepro`) para que `apt upgrade` lo actualice.
3. En Windows, `winget` (manifiesto en `microsoft/winget-pkgs`) permite `winget upgrade MiniFactoryHub`.

## 9. Cómo publicar un release

1. Verifique que `development` (o la rama de release) pasa las pruebas.
2. Suba la versión en `package.json` (por ejemplo `1.2.0`) y haga commit.
3. Cree y suba el tag: `git tag v1.2.0 && git push origin v1.2.0`.
4. El workflow **release** arma los paquetes en Windows y Linux (imágenes fijas `windows-2025` y `ubuntu-24.04`), ejecuta la prueba de humo en cada uno, en Windows además instala y desinstala en silencio el `.exe`, y publica el GitHub Release con los archivos y `SHA256SUMS`. Las notas se generan a partir de los PR.
5. Un tag con guion (`v1.2.0-rc.1`) se publica como *pre-release*.
6. Revise el release y descargue al menos el instalador de Windows para probarlo.

Prueba sin publicar nada: **Actions → release → Run workflow** (o `gh workflow run release.yml --ref <rama>`). Deja los archivos como artifacts del run y no crea tags ni releases.

En Linux, `packaging/linux/check-service.sh` instala el `.deb` en el runner (systemd real), espera `/bienvenida`, instala OrcaSlicer como indica §6 y, con las mismas propiedades de aislamiento de la unidad (`systemd-run`), comprueba que OrcaSlicer arranca y que Chrome genera un PDF con el Playwright de la app; al final desinstala y verifica que los datos quedan.

Probar localmente: `node packaging/build.mjs && node packaging/smoke.mjs dist/minifactory-hub-<v>-<sistema>-<arq>` (`build.mjs` ejecuta `next build` con `MF_STANDALONE=1`). La prueba de humo copia el paquete a una carpeta `Mini Factory Ñandú`, con datos en `datos José`, y comprueba: el lector de `config.env`, las dependencias nativas (sharp, argon2, pg, occt), la configuración inicial (`/bienvenida`), que un segundo lanzador detecta la instancia en marcha, que un puerto ocupado por otro programa da error, `/login` con una cuenta creada y que la llave de sesión persiste.

En un tag, el workflow falla si la versión del tag (sin la `v` ni el sufijo `-rc.1`) no coincide con `package.json`.

## 10. Límites conocidos

- Solo x64. ARM (Raspberry Pi, Windows ARM) requiere sumar `ubuntu-24.04-arm` / `windows-11-arm` a la matriz; no está probado.
- macOS no tiene paquete (el script lo arma para pruebas locales, sin firma ni notarización).
- El laminado con OrcaSlicer en **Windows** no está verificado: el código usa `mkfifo` para el progreso, que no existe en Windows (el laminado podría funcionar sin barra de progreso).
- La base embebida (PGlite) admite un solo proceso: el worker aparte (`launcher.mjs worker`) solo sirve con `DATABASE_URL`.
- No se instala como servicio de Windows: la aplicación vive mientras la ventana está abierta. Para un PC servidor, use Docker o un `.deb` en Linux, o programe el acceso directo en el Programador de tareas al iniciar sesión.
- El standalone solo se activa con `MF_STANDALONE=1`; Docker y desarrollo siguen con `next build` / `next start` sin cambios.
- Si el equipo se apaga de golpe y otro programa toma el mismo PID, el lanzador puede creer que hay otra instancia: el mensaje indica qué `.lock` borrar.
