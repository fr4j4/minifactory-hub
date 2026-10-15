# MiniFactory Hub

Herramienta interna para gestionar un taller de impresión 3D: pedidos registrados a mano (WhatsApp, Instagram, marketplace, feria, presencial), presupuestos con varios modelos, visor 3D de archivos, **laminador real en el servidor (OrcaSlicer)**, inventario de filamento por bobina, catálogo de piezas terminadas (producto simple o con variantes), ventas rápidas, cola de producción, mantenimiento, galería de fotos y reportes.

Fuera de alcance por decisión: relación con proveedores e interacción directa con clientes (no hay portal de clientes).

## Puesta en marcha (sin Docker)

```bash
npm install
cp .env.example .env            # cambie SESSION_SECRET
npm run orca:install            # descarga OrcaSlicer 2.4.2 en .orca/ (laminador; ~200 MB) y genera el esquema ampliado de parámetros en data/
npm run db:seed -- --reset      # base de datos con datos de demostración
npm run build && npm start      # http://localhost:3000
```

Usuarios de demostración: `admin@minifactory.cl / admin1234`, `operador@minifactory.cl` y `ventas@minifactory.cl` / `taller1234`.
Para una instalación real use `npm run db:seed -- --bootstrap-only` (solo crea el administrador y la configuración base) y cambie las contraseñas.

Sin `DATABASE_URL` se usa PGlite (Postgres embebido en `./data/pgdata`): no hay nada que instalar. Con `DATABASE_URL=postgres://…` usa un Postgres normal. Las migraciones se aplican solas al iniciar.

## Docker

> Guía paso a paso para Windows y Linux (incluye instalar Docker): [INSTALL.md](docs/INSTALACION.md).

```bash
SESSION_SECRET=$(openssl rand -hex 32) docker compose up -d --build
```

Volúmenes: `pgdata` (base) y `files` (modelos, G-code, fotos). **Respalde ambos**; además, Configuración → Respaldo descarga un ZIP.

**Worker aparte.** `docker-compose.yml` levanta dos procesos con la misma imagen: `app` (páginas; solo encola, `MF_EXTERNAL_WORKER=1`) y `worker` (`npm run worker`: laminados de OrcaSlicer y trabajos en segundo plano). Así un laminado largo no compite con las páginas. Requiere Postgres; con la base embebida (PGlite) todo corre en un solo proceso, que es el comportamiento por defecto.

## Pruebas

```bash
npm test                 # unitarias + integración (incluye laminado real si OrcaSlicer está instalado)
npm run build && npm run test:e2e   # usabilidad con Playwright; genera capturas y videos en docs/reporte
npm run build && npm run test:visual          # regresión visual contra tests/visual/__snapshots__ (opt-in)
npm run test:visual:update                    # regenera las líneas base (hágalo en el mismo entorno donde se compara)
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
