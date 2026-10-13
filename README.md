# MiniFactory Hub

Herramienta interna para gestionar un taller de impresión 3D: pedidos registrados a mano (WhatsApp, Instagram, marketplace, feria, presencial), presupuestos con varios modelos, visor 3D de archivos, **laminador real en el servidor (OrcaSlicer)**, inventario de filamento por bobina, catálogo de piezas terminadas (producto simple o con variantes), ventas rápidas, cola de producción, mantenimiento, galería de fotos y reportes.

Fuera de alcance por decisión: relación con proveedores e interacción directa con clientes (no hay portal de clientes).

## Puesta en marcha (sin Docker)

```bash
npm install
cp .env.example .env            # cambie SESSION_SECRET
npm run orca:install            # descarga OrcaSlicer 2.4.2 en .orca/ (laminador; ~200 MB)
npm run db:seed -- --reset      # base de datos con datos de demostración
npm run build && npm start      # http://localhost:3000
```

Usuarios de demostración: `admin@minifactory.cl / admin1234`, `operador@minifactory.cl` y `ventas@minifactory.cl` / `taller1234`.
Para una instalación real use `npm run db:seed -- --bootstrap-only` (solo crea el administrador y la configuración base) y cambie las contraseñas.

Sin `DATABASE_URL` se usa PGlite (Postgres embebido en `./data/pgdata`): no hay nada que instalar. Con `DATABASE_URL=postgres://…` usa un Postgres normal. Las migraciones se aplican solas al iniciar.

## Docker

```bash
SESSION_SECRET=$(openssl rand -hex 32) docker compose up -d --build
```

Volúmenes: `pgdata` (base) y `files` (modelos, G-code, fotos). **Respalde ambos**; además, Configuración → Respaldo descarga un ZIP.

## Pruebas

```bash
npm test                 # unitarias + integración (incluye laminado real si OrcaSlicer está instalado)
npm run build && npm run test:e2e   # usabilidad con Playwright; genera capturas y videos en docs/reporte
```

## Conector Bambu Lab (modo LAN)

Máquinas → **Conectar impresoras**: detecta las Bambu Lab de la red (SSDP), pide el código de acceso de 8 caracteres y muestra en vivo estado, avance por capas, temperaturas, filamento del AMS / bobina externa, avisos HMS y cámara. Permite pausar, reanudar, detener, cambiar velocidad y luz, asociar bobinas del inventario a las bandejas y **enviar a imprimir** un laminado (sube el 3MF por FTPS y lo inicia), verificando antes modelo, boquilla y material.

- Protocolo: MQTT con TLS (8883), cámara JPEG por TLS (6000, P1/A1) o RTSPS (322, X1/H2, requiere ffmpeg), FTPS implícito (990). Todo dentro de la red local.
- El código de acceso se guarda cifrado (AES-256-GCM con llave derivada de `SESSION_SECRET`) y la huella del certificado se fija en la primera conexión.
- Simulador para desarrollo: `npx tsx scripts/bambu-sim.ts` (P1S, A1 y X1C falsas; códigos y puertos en la salida). Con `BAMBU_SIM_SSDP_TARGETS=127.0.0.1:2021` anuncia al puerto que escucha la app.
- Probado contra el simulador; antes de confiar en «Enviar a imprimir» pruébalo con tu impresora real y una pieza pequeña (ver `docs/reporte`).

## Documentación

- `docs/reporte/index.html`: informe final con capturas, videos y métricas de usabilidad.
- Variables de entorno: ver `.env.example`.
