# Guía de instalación con Docker (Windows y Linux)

Esta guía es para personas sin experiencia técnica. Solo tienes que copiar y pegar los comandos tal como aparecen. Tiempo estimado: **30–40 minutos**, casi todo esperando descargas.

**¿Qué es Docker?** Un programa que ejecuta MiniFactory Hub dentro de una «caja» ya preparada. Así no tienes que instalar nada más (ni la base de datos ni el laminador OrcaSlicer): todo viene incluido.

## Antes de empezar

| Necesitas | Detalle |
|---|---|
| Un computador | Windows 10/11 (64 bits) o Linux (Ubuntu, Debian, Fedora…) |
| Memoria y disco | 8 GB de RAM (mínimo 4 GB) y unos **10 GB libres** |
| Internet | Para descargar Docker y la aplicación (la primera vez son ~2 GB) |
| Permisos | Poder instalar programas (cuenta de administrador) |

> **Dónde se escriben los comandos:** en Windows, abre **PowerShell** (botón Inicio → escribe «PowerShell» → Enter). En Linux, abre la aplicación **Terminal**. Para pegar en PowerShell basta con clic derecho; en Terminal usa `Ctrl+Shift+V`.

---

## Parte A — Windows

### A1. Instalar Docker Desktop

1. Entra a <https://www.docker.com/products/docker-desktop/> y pulsa **Download for Windows** (elige «AMD64» para la mayoría de equipos).
2. Abre el instalador descargado. Deja marcada la opción **«Use WSL 2 instead of Hyper-V»** y pulsa **OK**.
3. Al terminar, pulsa **Close and restart** (el equipo se reinicia).
4. Al volver, abre **Docker Desktop** desde el menú Inicio. Acepta los términos de uso. Puedes **omitir** la creación de cuenta («Skip»).
5. Espera hasta que, abajo a la izquierda, aparezca **«Engine running»** en verde.

**Comprobar que funciona:** en PowerShell escribe

```powershell
docker --version
```

Debe responder algo como `Docker version 27...`. Si dice que no reconoce el comando, cierra y vuelve a abrir PowerShell.

> **Si Docker Desktop muestra un error de «virtualización» o «WSL»:** entra a la BIOS del equipo y activa «Virtualization» (Intel VT-x / AMD-V); luego, en PowerShell como administrador, ejecuta `wsl --install` y reinicia.

### A2. Descargar MiniFactory Hub

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

### A3. Crear tu configuración

> **Novedad:** `ADMIN_PASSWORD` ya es opcional. Si no la defines, al abrir la aplicación por primera vez un asistente (**/bienvenida**) te pide un código de un solo uso que aparece en el registro del servidor (`docker compose logs app`) y crea tu cuenta de administrador. Ya no existe la contraseña por defecto `admin1234`.

Pega esto **tal cual** (genera una llave secreta aleatoria y crea el archivo `.env`). Cambia `MiClaveSegura123` por la contraseña que quieras usar para entrar:

```powershell
$clave = -join ((48..57)+(97..102) | Get-Random -Count 64 | ForEach-Object {[char]$_})
Set-Content -Path .env -Value "SESSION_SECRET=$clave", "ADMIN_PASSWORD=MiClaveSegura123", "ADMIN_EMAIL=admin@minifactory.cl"
```

### A4. Iniciar la aplicación

```powershell
docker compose -f docker-compose.yml -f docker-compose.windows.yml up -d --build
```

La **primera vez tarda 10–20 minutos** (descarga y prepara todo). Es normal ver mucho texto; espera hasta que vuelva a aparecer el cursor.

### A5. Abrir la aplicación

Abre tu navegador en **<http://localhost:3000>** e ingresa con:

- Correo: `admin@minifactory.cl` (o el que pusiste en `ADMIN_EMAIL`)
- Contraseña: la que escribiste en el paso A3

✅ Listo. Salta a [Uso diario](#uso-diario).

---

## Parte B — Linux

Los pasos están escritos para **Ubuntu/Debian**. En Fedora y otras distribuciones, usa la guía oficial: <https://docs.docker.com/engine/install/>.

### B1. Instalar Docker

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

**Comprobar que funciona:**

```bash
docker --version
docker compose version
docker run --rm hello-world
```

El último comando debe mostrar el mensaje «Hello from Docker!».

### B2. Descargar MiniFactory Hub

```bash
sudo apt install -y git      # solo si no tienes git (Ubuntu/Debian)
cd ~
git clone https://github.com/fr4j4/minifactory-hub.git
cd minifactory-hub
```

### B3. Crear tu configuración (contraseña de administrador)

Cambia `MiClaveSegura123` por la contraseña que quieras usar para entrar. Son tres líneas; pégalas juntas:

```bash
echo "SESSION_SECRET=$(openssl rand -hex 32)" > .env
echo "ADMIN_PASSWORD=MiClaveSegura123" >> .env
echo "ADMIN_EMAIL=admin@minifactory.cl" >> .env
```

### B4. Iniciar la aplicación

```bash
docker compose up -d --build
```

La **primera vez tarda 10–20 minutos**. Espera hasta que vuelva el cursor.

### B5. Abrir la aplicación

Abre el navegador en **<http://localhost:3000>** e ingresa con `admin@minifactory.cl` y la contraseña del paso B3.

Para entrar desde **otro equipo de la red** (por ejemplo, un celular), usa la IP del computador: `http://192.168.x.x:3000` (averíguala con `hostname -I`).

---

## Uso diario

Ejecuta estos comandos dentro de la carpeta `minifactory-hub`. **En Windows agrega** `-f docker-compose.yml -f docker-compose.windows.yml` después de `docker compose` (ejemplo: `docker compose -f docker-compose.yml -f docker-compose.windows.yml stop`).

| Quiero… | Comando |
|---|---|
| Apagar la aplicación (sin perder datos) | `docker compose stop` |
| Encenderla otra vez | `docker compose start` |
| Ver si está funcionando | `docker compose ps` |
| Ver mensajes (si algo falla) | `docker compose logs --tail 100 app` |

La aplicación **se inicia sola** cuando enciendes el computador, siempre que Docker esté abierto (en Windows, Docker Desktop → ⚙ Settings → *General* → «Start Docker Desktop when you sign in»).

### Actualizar a una versión nueva

```bash
git pull
docker compose up -d --build
```

(En Windows, con los dos `-f` ya indicados.) Tus datos se conservan.

### Respaldar tus datos

Tus pedidos, modelos y fotos viven en volúmenes de Docker, **no** en la carpeta del proyecto. Respalda con regularidad desde la propia aplicación: **Configuración → Respaldo** descarga un archivo ZIP. Guárdalo en un disco externo o en la nube.

> ⚠️ **No uses** `docker compose down -v`: la opción `-v` **borra todos tus datos**. Para apagar usa siempre `stop`.

---

## Impresoras Bambu Lab

- **Linux:** la app detecta las impresoras de tu red automáticamente.
- **Windows:** Docker Desktop no permite esa detección automática. En *Máquinas → Conectar impresoras* escribe la **IP de la impresora** (la ves en la pantalla de la impresora: Configuración → Red) y su código de acceso de 8 caracteres. También puedes usar el modo nube con tu cuenta de Bambu Lab.

## IA opcional

Está apagada por defecto. Si quieres usarla, se activa dentro de la aplicación en *Configuración → Inteligencia artificial*. Si usas un programa de IA local (por ejemplo Ollama) instalado en Windows, la dirección que debes escribir desde Docker es `http://host.docker.internal:11434/v1`.

---

## Problemas frecuentes

| Síntoma | Solución |
|---|---|
| `docker: command not found` / «no se reconoce» | Cierra y abre de nuevo la terminal; en Windows reinicia el equipo. |
| «Cannot connect to the Docker daemon» | Docker no está encendido: abre Docker Desktop (Windows) o ejecuta `sudo systemctl start docker` (Linux). |
| `permission denied` al usar docker en Linux | Falta el paso `usermod` o cerrar sesión; como alternativa temporal, antepón `sudo`. |
| Error «defina SESSION_SECRET» o «defina ADMIN_PASSWORD» | No existe el archivo `.env` o estás en otra carpeta. Repite el paso A3/B3 dentro de `minifactory-hub`. |
| `http://localhost:3000` no carga | Espera 1–2 minutos tras iniciar y revisa `docker compose ps`; si dice «Exited», mira `docker compose logs --tail 100 app`. |
| El puerto 3000 ya está en uso (Windows) | Cierra el programa que lo usa, o cambia `"3000:3000"` por `"3001:3000"` en `docker-compose.windows.yml` y abre `localhost:3001`. |
| Se acabó el espacio en disco | `docker system prune` elimina restos de descargas antiguas (no borra tus datos). |
| Olvidé la contraseña | Entra con otro administrador y restablécela en *Configuración → Usuarios*. |

> **Nota técnica (Linux):** `docker-compose.yml` usa `network_mode: host` para detectar impresoras, por lo que la app escucha directamente en el puerto 3000 del equipo; ahí el puerto no se cambia con `ports`.

¿Sigues con problemas? Copia el resultado de `docker compose logs --tail 100 app` y compártelo con quien administra el proyecto.
