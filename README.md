# MiniFactory Hub

Herramienta interna para gestionar un taller de impresión 3D: pedidos registrados a mano (WhatsApp, Instagram, marketplace, feria, presencial), presupuestos con varios modelos, visor 3D de archivos, **laminador real en el servidor (OrcaSlicer)**, inventario de filamento por bobina, catálogo de piezas terminadas (producto simple o con variantes), ventas rápidas, cola de producción, mantenimiento, galería de fotos y reportes.

Fuera de alcance por decisión: relación con proveedores e interacción directa con clientes (no hay portal de clientes).

---

## Instalación desde releases (sin Docker)

La forma más rápida: descargas un instalador y listo. No necesitas Docker, Git ni la terminal.

1. Entra a la página **Releases** del proyecto en GitHub y abre la versión más reciente.
2. Descarga el archivo de tu sistema:
   - **Windows 10/11:** `minifactory-hub-…-win-x64-setup.exe`. Ábrelo y sigue los pasos. Si Windows muestra «Windows protegió su PC», pulsa **Más información → Ejecutar de todas formas**.
   - **Ubuntu/Debian:** `minifactory-hub_…_amd64.deb`. Instálalo con `sudo apt install ./minifactory-hub_…_amd64.deb`.
3. Abre **MiniFactory Hub** desde el menú Inicio (Windows). En Linux queda funcionando sola. El navegador abre <http://localhost:3000>.
4. La primera vez te lleva al **asistente de bienvenida**. El código de un solo uso aparece en la ventana negra de MiniFactory Hub (Windows) o con `journalctl -u minifactory-hub` (Linux).

En Windows, **cerrar la ventana negra apaga la aplicación**. Tus datos se guardan aparte y se conservan al actualizar o desinstalar.

Diferencia con Docker: estos paquetes **no traen el laminador OrcaSlicer**; la aplicación funciona sin él y puedes instalarlo después. Detalles (actualizar, respaldos, OrcaSlicer, otros formatos): [docs/empaquetado-releases.md](docs/empaquetado-releases.md).

---

## Instalación con Docker (recomendado)

Esta guía es para personas sin experiencia técnica: copia y pega los comandos tal como aparecen. Tiempo estimado: **20–40 minutos**, casi todo esperando descargas.

**¿Qué es Docker?** Un programa que ejecuta MiniFactory Hub dentro de una «caja» ya preparada. Así no tienes que instalar nada más (ni la base de datos ni el laminador OrcaSlicer): todo viene incluido.

### Antes de empezar

| Necesitas | Detalle |
|---|---|
| Un computador | Windows 10/11 (64 bits) o Linux (Ubuntu, Debian, Fedora…) |
| Memoria y disco | 8 GB de RAM (mínimo 4 GB) y unos **10 GB libres** |
| Internet | Para descargar Docker y la aplicación (la primera vez son ~2 GB) |
| Permisos | Poder instalar programas (cuenta de administrador) |

> **Dónde se escriben los comandos:** en Windows, abre **PowerShell** (botón Inicio → escribe «PowerShell» → Enter). En Linux, abre la aplicación **Terminal**. Para pegar en PowerShell basta con clic derecho; en Terminal usa `Ctrl+Shift+V`.

### Parte A — Windows

**A1. Instalar Docker Desktop**

1. Entra a <https://www.docker.com/products/docker-desktop/> y pulsa **Download for Windows** (elige «AMD64» para la mayoría de equipos).
2. Abre el instalador descargado. Deja marcada la opción **«Use WSL 2 instead of Hyper-V»** y pulsa **OK**.
3. Al terminar, pulsa **Close and restart** (el equipo se reinicia).
4. Al volver, abre **Docker Desktop** desde el menú Inicio. Acepta los términos de uso. Puedes **omitir** la creación de cuenta («Skip»).
5. Espera hasta que, abajo a la izquierda, aparezca **«Engine running»** en verde.

Comprueba que funciona en PowerShell:

```powershell
docker --version
```

Debe responder algo como `Docker version 27...`. Si dice que no reconoce el comando, cierra y vuelve a abrir PowerShell.

> **Si Docker Desktop muestra un error de «virtualización» o «WSL»:** entra a la BIOS del equipo y activa «Virtualization» (Intel VT-x / AMD-V); luego, en PowerShell como administrador, ejecuta `wsl --install` y reinicia.

**A2. Descargar MiniFactory Hub**

Si tienes Git instalado:

```powershell
cd $HOME
git clone https://github.com/fr4j4/minifactory-hub.git
cd minifactory-hub
```

Si no lo tienes: en la página del proyecto en GitHub pulsa **Code → Download ZIP**, descomprime la carpeta (clic derecho → *Extraer todo*) y en PowerShell entra a ella, por ejemplo:

```powershell
cd $HOME\Downloads\minifactory-hub
```

**A3. Crear tu configuración**

Solo hace falta una llave secreta; no necesitas definir una contraseña de administrador todavía (el siguiente paso explica por qué):

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); $clave = -join ($b | ForEach-Object { $_.ToString('x2') })
Set-Content -Path .env -Value "SESSION_SECRET=$clave"
```

**A4. Iniciar la aplicación**

```powershell
docker compose -f docker-compose.yml -f docker-compose.windows.yml up -d --build
```

La **primera vez tarda 10–20 minutos** (descarga y prepara todo, incluido el laminador OrcaSlicer). Es normal ver mucho texto; espera hasta que vuelva a aparecer el cursor.

**A5. Completar la configuración inicial**

Abre tu navegador en **<http://localhost:3000>**. Como todavía no hay ninguna cuenta, te lleva automáticamente a un **asistente de bienvenida** (`/bienvenida`) que pide un **código de un solo uso**. Ese código aparece en el registro del servidor:

```powershell
docker compose logs app
```

Busca un bloque como:

```
┌─ MiniFactory · configuración inicial ─────────────────
│ Abre /bienvenida e ingresa este código: XY4SKDUOXP2K
└───────────────────────────────────────────────────────
```

Copia el código en el asistente, crea tu cuenta de administrador con tu propio correo y contraseña, y sigue los pasos opcionales (datos del taller, impuestos, máquinas…). Puedes omitir los pasos opcionales y completarlos después desde Configuración.

✅ Listo. Salta a [Uso diario](#uso-diario).

### Parte B — Linux

Los pasos están escritos para **Ubuntu/Debian**. En Fedora y otras distribuciones, usa la guía oficial: <https://docs.docker.com/engine/install/>.

**B1. Instalar Docker**

La forma más simple es el script oficial. Pega estas dos líneas (te pedirá tu contraseña de usuario):

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

Después, permite usar Docker sin escribir `sudo` cada vez:

```bash
sudo usermod -aG docker $USER
```

**Cierra la sesión y vuelve a entrar** (o reinicia) para que el cambio tenga efecto.

Comprueba que funciona:

```bash
docker --version
docker compose version
docker run --rm hello-world
```

El último comando debe mostrar el mensaje «Hello from Docker!».

**B2. Descargar MiniFactory Hub**

```bash
sudo apt install -y git      # solo si no tienes git (Ubuntu/Debian)
cd ~
git clone https://github.com/fr4j4/minifactory-hub.git
cd minifactory-hub
```

**B3. Crear tu configuración**

Solo hace falta una llave secreta; no necesitas definir una contraseña de administrador todavía (el siguiente paso explica por qué):

```bash
echo "SESSION_SECRET=$(openssl rand -hex 32)" > .env
```

**B4. Iniciar la aplicación**

```bash
docker compose up -d --build
```

La **primera vez tarda 10–20 minutos** (descarga y prepara todo, incluido el laminador OrcaSlicer). Espera hasta que vuelva el cursor.

**B5. Completar la configuración inicial**

Abre el navegador en **<http://localhost:3000>**. Como todavía no hay ninguna cuenta, te lleva automáticamente a un **asistente de bienvenida** (`/bienvenida`) que pide un **código de un solo uso**. Ese código aparece en el registro del servidor:

```bash
docker compose logs app
```

Busca un bloque como:

```
┌─ MiniFactory · configuración inicial ─────────────────
│ Abre /bienvenida e ingresa este código: XY4SKDUOXP2K
└───────────────────────────────────────────────────────
```

Copia el código en el asistente, crea tu cuenta de administrador con tu propio correo y contraseña, y sigue los pasos opcionales (datos del taller, impuestos, máquinas…). Puedes omitir los pasos opcionales y completarlos después desde Configuración.

Para entrar desde **otro equipo de la red** (por ejemplo, un celular), usa la IP del computador: `http://192.168.x.x:3000` (averíguala con `hostname -I`).

### Uso diario

Ejecuta estos comandos dentro de la carpeta `minifactory-hub`. **En Windows agrega** `-f docker-compose.yml -f docker-compose.windows.yml` después de `docker compose` (ejemplo: `docker compose -f docker-compose.yml -f docker-compose.windows.yml stop`).

| Quiero… | Comando |
|---|---|
| Apagar la aplicación (sin perder datos) | `docker compose stop` |
| Encenderla otra vez | `docker compose start` |
| Ver si está funcionando | `docker compose ps` |
| Ver mensajes (si algo falla) | `docker compose logs --tail 100 app` |

La aplicación **se inicia sola** cuando enciendes el computador, siempre que Docker esté abierto (en Windows, Docker Desktop → ⚙ Settings → *General* → «Start Docker Desktop when you sign in»).

**Actualizar a una versión nueva:**

```bash
git pull
docker compose up -d --build
```

(En Windows, con los dos `-f` ya indicados.) Tus datos se conservan.

**Si la aplicación no arranca tras actualizar** y `docker compose logs app` dice «SESSION_SECRET falta, es corto…»: la llave de `.env` tiene menos de 32 caracteres (el comando de PowerShell anterior generaba 16) o es el valor de ejemplo.

1. Copia el valor actual de `SESSION_SECRET` (si no había, usa `dev-secret-cambiar-en-produccion`).
2. En `.env`, agrega `SESSION_SECRET_PREVIOUS=<ese valor>`.
3. Cambia `SESSION_SECRET` por una llave nueva (paso A3 o B3).
4. Ejecuta `docker compose up -d`.
5. Vuelve a guardar los códigos de acceso de las impresoras, la cuenta de Bambu Cloud y la clave de IA. Así quedan sellados con la llave nueva.
6. Quita `SESSION_SECRET_PREVIOUS` de `.env`.

Sin el paso 2, los códigos y claves guardados con la llave anterior ya no se pueden leer: hay que escribirlos de nuevo.

**Respaldar tus datos:** tus pedidos, modelos y fotos viven en volúmenes de Docker, **no** en la carpeta del proyecto. Respalda con regularidad desde la propia aplicación: **Configuración → Respaldo** descarga un archivo ZIP. Guárdalo en un disco externo o en la nube.

> ⚠️ **No uses** `docker compose down -v`: la opción `-v` **borra todos tus datos** (base de datos y archivos). Para apagar usa siempre `stop`.

### Dos procesos: `app` y `worker`

`docker-compose.yml` levanta dos contenedores con la misma imagen: **`app`** (páginas web; solo encola los laminados, `MF_EXTERNAL_WORKER=1`) y **`worker`** (ejecuta en segundo plano los laminados de OrcaSlicer y otros trabajos pesados). Así un laminado largo no compite con la navegación. Si necesitas ver qué hace cada uno: `docker compose logs app` / `docker compose logs worker`.

### Impresoras Bambu Lab

- **Linux:** la app detecta las impresoras de tu red automáticamente (usa `network_mode: host`).
- **Windows:** Docker Desktop no permite esa detección automática. En *Máquinas → Conectar impresoras* escribe la **IP de la impresora** (la ves en la pantalla de la impresora: Configuración → Red) y su código de acceso de 8 caracteres. También puedes usar el modo nube con tu cuenta de Bambu Lab. Ver detalles técnicos del conector más abajo.

### IA opcional

Está apagada por defecto. Si quieres usarla, se activa dentro de la aplicación en *Configuración → Inteligencia artificial*. Si usas un programa de IA local (por ejemplo Ollama) instalado en Windows, la dirección que debes escribir desde Docker es `http://host.docker.internal:11434/v1`. Ver detalles más abajo.

### Problemas frecuentes

| Síntoma | Solución |
|---|---|
| `docker: command not found` / «no se reconoce» | Cierra y abre de nuevo la terminal; en Windows reinicia el equipo. |
| «Cannot connect to the Docker daemon» | Docker no está encendido: abre Docker Desktop (Windows) o ejecuta `sudo systemctl start docker` (Linux). |
| `permission denied` al usar docker en Linux | Falta el paso `usermod` o cerrar sesión; como alternativa temporal, antepón `sudo`. |
| Error «defina SESSION_SECRET» | No existe el archivo `.env` o estás en otra carpeta. Repite el paso A3/B3 dentro de `minifactory-hub`. |
| «SESSION_SECRET falta, es corto (mínimo 32 caracteres) o es el valor de ejemplo» | La llave de `.env` no sirve. Sigue «Si la aplicación no arranca tras actualizar» en *Uso diario*. |
| `http://localhost:3000` no carga | Espera 1–2 minutos tras iniciar y revisa `docker compose ps`; si dice «Exited», mira `docker compose logs --tail 100 app`. |
| No aparece el asistente `/bienvenida`, va directo a `/login` | Ya existe una cuenta de administrador (de una instalación anterior). Entra con esas credenciales, o si es un reinicio limpio revisa que no hayas definido `ADMIN_PASSWORD` en `.env`. |
| El puerto 3000 ya está en uso (Windows) | Cierra el programa que lo usa, o cambia `"3000:3000"` por `"3001:3000"` en `docker-compose.windows.yml` y abre `localhost:3001`. |
| Se acabó el espacio en disco | `docker system prune` elimina restos de descargas antiguas (no borra tus datos). |
| Olvidé la contraseña | Entra con otro administrador y restablécela en *Configuración → Usuarios*. Sin otro administrador, hay que restablecerla directo en la base de datos. |

> **Nota técnica (Linux):** `docker-compose.yml` usa `network_mode: host` para detectar impresoras, por lo que la app escucha directamente en el puerto 3000 del equipo; ahí el puerto no se cambia con `ports`, sino con la variable `PORT` (por ejemplo `PORT=3011` en el archivo `.env`).

¿Sigues con problemas? Copia el resultado de `docker compose logs --tail 100 app` y compártelo con quien administra el proyecto.

---

## Puesta en marcha sin Docker (desarrollo)

Para desarrollar o para instalar directo en el sistema (sin contenedores):

```bash
npm install
cp .env.example .env            # cambia SESSION_SECRET
npm run orca:install            # descarga OrcaSlicer 2.4.2 en .orca/ (laminador; ~200 MB) y genera el esquema ampliado de parámetros en data/
npm run db:seed -- --reset      # base de datos con datos de demostración
npm run build && npm start      # http://localhost:3000
```

Usuarios de demostración (solo con `db:seed` sin `--bootstrap-only`): `admin@minifactory.cl / admin1234`, `operador@minifactory.cl` y `ventas@minifactory.cl` / `taller1234`.

Para una instalación real, **no definas `ADMIN_PASSWORD`**: usa `npm run db:seed -- --bootstrap-only` y completa la cuenta de administrador desde el asistente `/bienvenida` con el código de un solo uso que se imprime en la consola (igual que en la instalación con Docker).

Sin `DATABASE_URL` se usa PGlite (Postgres embebido en `./data/pgdata`): no hay nada que instalar. Con `DATABASE_URL=postgres://…` usa un Postgres normal. Las migraciones se aplican solas al iniciar.

## Pruebas

```bash
npm test                 # unitarias + integración (incluye laminado real si OrcaSlicer está instalado)
npm run build && npm run test:e2e   # usabilidad con Playwright; genera capturas y videos en docs/reporte
```

## Laminar en el servidor

Laminador → **Configurar laminado**: elige qué impresora es cada máquina, la calidad por defecto y el filamento de cada material (se sugieren solos). Puedes **importar tus perfiles de Bambu Studio u OrcaSlicer** subiendo un proyecto `.3mf` (lo más fácil: guarda un proyecto con tu impresora, filamentos y proceso), un paquete `.bbscfg`/`.bbsflmt` (Archivo → Exportar → Exportar paquete de preajustes) o archivos `.json`, y crear **filamentos personalizados** con un formulario. Cada perfil se puede exportar de vuelta a Bambu Studio.

**Boquillas y calidades.** Cada máquina puede tener varias boquillas (0,2 · 0,4 · 0,6 · 0,8 · 1,0 · 1,2…); en su ficha se marca la **boquilla puesta** y el laminador usa el perfil de impresora y la calidad de esa boquilla. Laminador → Calidad → *Plantillas por boquilla* crea Borrador / Estándar / Fino / Resistente / Funcional calculados para cualquier diámetro (paredes en múltiplos de la boquilla). Cualquier perfil se puede editar, duplicar con nombre propio y cambiar de base. Guía completa y revisión del módulo: `docs/revision-perfiles-maquinas.md`.

## Eliminar y archivar

Casi todos los registros (materiales, bobinas, repuestos e insumos, productos y variantes, clientes, presupuestos, pedidos cancelados, listas de precios, canales, usuarios, colecciones de fotos, planes de mantenimiento, incidencias, contactos y pagos) se pueden eliminar desde su pantalla con el botón **Eliminar** (permiso «eliminar» del módulo). Es un borrado lógico: el historial, los reportes y los movimientos se conservan. Antes de confirmar, el sistema avisa si hay algo que lo impide (stock, pedidos abiertos, la última cuenta de administrador…). Las reglas están en `src/lib/services/removal.ts`.

**Archivados:** en *Configuración → Archivados* se listan los registros eliminados y se pueden **restaurar** (también sus variantes o bobinas eliminadas junto con ellos). No se restaura si el registro del que depende sigue eliminado o si su código, SKU o correo ya lo usa otro (`src/lib/services/archive.ts`).

## Editar registros ya creados

Pedidos, pagos, ventas rápidas, bobinas (lote, fecha y costo), planes de mantenimiento, incidencias, colecciones de fotos y contactos tienen un botón **Editar** (✎). Solo se aceptan los campos de una lista blanca por tipo (`EDIT_SPEC` en `src/lib/services/edits.ts`): totales, estados y claves no se tocan desde ahí. Corregir un pago recalcula lo pagado del pedido o la venta, y no se editan pedidos cancelados ni ventas anuladas. Cada cambio queda en la auditoría.

## Idiomas (i18n)

La interfaz está disponible en **español** (idioma por defecto) e **inglés**. El idioma se elige en el selector del menú de cuenta (o en la pantalla de ingreso) y se recuerda en la cookie `mf_lang`; sin cookie se usa `Accept-Language` y, si no coincide, español.

- Los textos viven en `src/i18n/es/<área>.ts` y `src/i18n/en/<área>.ts` (un archivo por área: `orders`, `quotes`, `machines`…). El diccionario en español es la referencia y TypeScript obliga a que el inglés tenga las mismas claves.
- En componentes de cliente: `const t = useT()`; en páginas, acciones y servicios de servidor: `const t = await getT()`. Ejemplo: `t('orders.registerOrder')`, con parámetros `t('orders.createdOn', { date })` (en el texto se escribe `{date}`).
- Plurales: se definen `clave_one` y `clave_other` y se usa `t('clave', { count })`.
- Valores internos (estados, canales, etapas…) se traducen con claves como `status.<estado>` o `tOr(t, 'gallery.stage.' + etapa, etapa)`.
- Errores de bajo nivel (sin petición HTTP, como los conectores) usan `LocalizedError`; el texto queda en español para los registros y se traduce al idioma de la petición cuando se muestra al usuario.
- Los textos que se guardan en la base (notas, avisos, datos de demostración y plantillas por defecto) se escriben en el idioma de quien los crea y no se traducen después.
- Moneda, números y fechas siguen la convención del taller (CLP, `es-CL`, `dd-mm-aaaa`) en todos los idiomas.
- Para agregar un idioma: añadirlo en `src/i18n/config.ts`, crear `src/i18n/<código>/` con el mismo árbol y registrarlo en `src/i18n/translate.ts`. `npm test` comprueba que no falten claves ni parámetros.

## Conector Bambu Lab (modo LAN)

Máquinas → **Conectar impresoras**: detecta las Bambu Lab de la red (SSDP), pide el código de acceso de 8 caracteres y muestra en vivo estado, avance por capas, temperaturas, filamento del AMS / bobina externa, avisos HMS y cámara. Permite pausar, reanudar, detener, cambiar velocidad y luz, asociar bobinas del inventario a las bandejas y **enviar a imprimir** un laminado (sube el 3MF por FTPS y lo inicia), verificando antes modelo, boquilla y material.

- Protocolo: MQTT con TLS (8883), cámara JPEG por TLS (6000, P1/A1) o RTSPS (322, X1/H2, requiere ffmpeg), FTPS implícito (990). Todo dentro de la red local.
- El código de acceso se guarda cifrado (AES-256-GCM con llave derivada de `SESSION_SECRET`) y la huella del certificado se fija en la primera conexión.
- Simulador para desarrollo: `npx tsx scripts/bambu-sim.ts` (P1S, A1 y X1C falsas; códigos y puertos en la salida). Con `BAMBU_SIM_SSDP_TARGETS=127.0.0.1:2021` anuncia al puerto que escucha la app.
- **Modo nube (Bambu Cloud):** inicia sesión con la cuenta de Bambu Lab (contraseña → código por correo o 2FA; la contraseña no se guarda, el token queda cifrado y dura ~3 meses). Permite ver en vivo, desde cualquier red, las impresoras de la cuenta (estado, capas, temperaturas, AMS, avisos) y la miniatura de la placa del trabajo. Es **solo lectura**: el firmware actual de Bambu Lab rechaza el control desde programas externos por la nube y no ofrece cámara en vivo. La cuenta también entrega el código LAN de cada impresora, así que se pueden conectar por LAN sin ir a la pantalla.
- La API de la nube no es oficial (documentada por la comunidad: ha-bambulab, OpenBambuAPI); Bambu Lab puede cambiarla. Para pruebas: `BAMBU_SIM_CLOUD_API_PORT=18080 npx tsx scripts/bambu-sim.ts` levanta también una nube simulada y la app se apunta a ella con `BAMBU_CLOUD_API`, `BAMBU_CLOUD_WEB`, `BAMBU_CLOUD_MQTT` y `BAMBU_CLOUD_CA_FILE`.
- Probado contra el simulador; antes de confiar en «Enviar a imprimir» pruébalo con tu impresora real y una pieza pequeña (ver `docs/reporte`).

## IA opcional (Fases 0 y 1)

Apagada por defecto. Se configura en **Configuración → Inteligencia artificial**: proveedor (lista preconfigurada —Ollama, LM Studio, llama.cpp, vLLM, Jan, Anthropic, Ollama Cloud, OpenAI, OpenRouter, Groq, Gemini, Mistral, Together, DeepSeek— o uno **genérico** compatible con OpenAI o con Anthropic; el botón **Buscar IA local** detecta servidores en este equipo, o en otro equipo de tu red si escribes su dirección, y **Cargar modelos** lista y sugiere los modelos), clave (cifrada), modelos, funciones por rol, privacidad (ocultar datos personales, imágenes, «solo local»), tope de gasto y consumo. Mientras esté apagada no hay controles de IA ni llamadas de red. `AI_FORCE_DISABLED=1` la apaga siempre. La infraestructura está en `src/lib/ai`. Funciones disponibles: **asesor de perfiles de impresión** (Laminador → «Mejorar con IA»: propone candidatos, los lamina de verdad con OrcaSlicer, los compara y guarda el elegido como nueva versión del perfil) y **explicación de errores de laminado**. Sin IA, cada perfil muestra igualmente su **ficha de desempeño** con los trabajos reales y las reglas de «qué probar». Diseño completo en `docs/spec-ia.md`. Para desarrollo: `npx tsx scripts/ai-sim.ts` levanta un proveedor simulado en `http://127.0.0.1:18090`.

## Documentación

- `docs/reporte/index.html`: informe final con capturas, videos y métricas de usabilidad.
- `docs/mejoras/README.md`: análisis de interfaces y propuesta de mejoras (perfiles y filamentos, biblioteca 3D, estudio de laminado, cotizaciones y PDF, calculadoras, sistema visual) con estimaciones. **Solo documentación; aún sin implementar.**
- Variables de entorno: ver `.env.example`.
