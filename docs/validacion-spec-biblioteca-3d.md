# Implementación y validación de la spec multifuente

Fecha: 18 de octubre de 2026. Rama: `feature/biblioteca-3d-multifuente`.

Este documento sustituye la lista de pendientes de la primera entrega. Conserva la [spec original](spec-biblioteca-3d-multifuente.md) como referencia de diseño y distingue implementación, validación reproducible y dependencias externas. El despliegue de pruebas continúa en `http://192.168.1.14:3011`; sus credenciales están en `data/library-test-access.txt`, fuera de Git.

## Funciones y recorridos

| Requisito | Implementación y acceso |
| --- | --- |
| B3D-01 · Fuentes | Crear, probar, previsualizar primer listado, escanear, pausar, editar raíz/políticas, renovar credenciales y desconectar. `/archivos/fuentes` |
| B3D-02 · Organización | Carpetas lógicas con IDs existentes conservados, colecciones múltiples, favoritos y búsquedas con nombre por usuario/navegador |
| B3D-03 · Metadatos | Datos originales más descripción, categoría, proyecto, notas y campos tipados en «Gestión avanzada» de la ficha. Separados de la revisión remota |
| B3D-04 · Explorador | Páginas de 100 entradas; crear carpetas, renombrar archivos/carpetas, movimiento nativo local/SFTP/FTP/WebDAV y transferencias entre fuentes según capacidad |
| B3D-05 · Lotes | Selección persistente entre páginas y captura de hasta 5.000 resultados actuales; plan explícito, estado individual, conservación de éxitos, reintento de fallos y deshacer cambios lógicos |
| B3D-06 · Nombres | Plantillas de título `{name}`, `{format}`, `{n}` con previsualización. El nombre físico se modifica mediante operación explícita y política de colisiones del conector |
| B3D-07 · Versiones | Historial, hash, dimensiones y miniaturas comparables; restaurar versión actual conserva las históricas. Snapshots antes de operaciones que retiran un original |
| B3D-08 · Recuperación | Archivo lógico y restauración en `/archivos/revision`; papelera local con identificador recuperable y restauración de Drive. Sin borrado irreversible automático |
| B3D-09 · Relaciones | Piezas, variantes, derivados, accesorios y dependencias. Referencias OBJ/glTF se registran sin descargar URI arbitrarias; paquetes conservan adjuntos y recursos reconocidos |
| B3D-10 · Taller | Integración existente con cotizaciones, producción, materiales, laminado y fotos; acceso a modelos restringidos comprobado en servicios de biblioteca y consumidores principales |
| B3D-11 · Exportación | Selección con manifiesto JSON/CSV, recursos locales y versiones originales disponibles; respaldo completo por streaming con inventario de hashes y omisiones explícitas |
| B3D-12 · Mantenimiento | Relocalizar raíz, reconectar, regenerar análisis, fijar copias offline, cuota de caché y recuperación de planes fallidos |

La selección masiva representa IDs capturados, no una consulta que cambia antes de confirmar. Un cambio manual posterior impide aplicar un plan obsoleto sobre ese elemento. Deshacer valida todos los elementos dentro de una transacción: un conflicto conserva el lote completo. Está destinado a cambios lógicos; no promete revertir cualquier operación remota.

## Fuentes y limitaciones deliberadas

| Adaptador | Lectura | Gestión física | Cambios / restricciones |
| --- | --- | --- | --- |
| Administrado | Originales y versiones existentes | Ingesta y edición lógica; originales inmutables | Migración sin mover archivos; nuevas ingestas registran ubicación |
| Local / NAS montado | Raíz autorizada, sin enlaces | Crear, renombrar, mover dentro de fuente, copiar, papelera/restaurar | Sondeo; reconoce renombrado externo cuando la identidad del archivo es inequívoca |
| Drive | OAuth o cuenta de servicio | Crear, renombrar, subir hasta 64 MiB, papelera/restaurar según permisos | Cursor de cambios; unidades compartidas; cuenta real pendiente de aceptación |
| FTP/FTPS/SFTP | Listado y streaming | Crear, renombrar, mover nativamente, subir | SFTP exige huella. No se presenta borrado permanente como papelera |
| WebDAV | PROPFIND/GET | Capacidades descubiertas mediante OPTIONS; MOVE/MKCOL/PUT cuando anunciadas | Si no anuncia capacidades, se informa solo lectura. Carga hasta 64 MiB |
| S3 compatible | Listado/GET y prefijos | Escritura condicional sin sobrescribir | No se promete renombrado atómico ni papelera universal; archivos fríos no descargables |
| OneDrive | Graph, IDs y paginación | Crear carpetas y renombrar con ETag | Cursor delta; no se promete carga ni papelera en este adaptador |
| Dropbox | Carpetas, descargas y cursores | Crear, renombrar y subir hasta 64 MiB sin sobrescribir | Cursor recursivo; no se promete recuperación de borrados por todos los planes |
| Agente de computador | WebDAV de solo lectura | Administración lógica en Hub | Script Python con raíz explícita, autenticación y no-follow; ver [guía](agente-biblioteca-local.md) |

Los feeds nativos actúan como detector de cambios: si no hay cambios se conserva el inventario; si los hay se recorre la raíz y se publican solo revisiones nuevas. No se aplica una eliminación a partir de un recorrido incompleto. Los escaneos manuales fuerzan reconciliación. No se requiere publicar webhooks en Internet.

Las credenciales se configuran manualmente. No se provisionan aplicaciones OAuth, permisos de empresas, buckets o cuentas de terceros. Las variantes de servidores y cuotas comerciales deben aceptarse con una cuenta real; los contratos simulados no sustituyen esa aceptación.

## Búsqueda, previews, fotos e IA

El catálogo usa SQL local y paginación estable: fuente, formato, etiquetas con AND/OR, estado, tamaño, dimensiones, volumen, triángulos, malla cerrada/desconocida, fechas, categoría, proyecto y ruta. Ordena por actualización, nombre, tamaño, relevancia textual, uso o favoritos. La búsqueda tolera acentos en nombres y conserva búsqueda parcial; no se anuncia corrección ortográfica universal.

El render de mallas se ejecuta en proceso independiente con 768 MiB de heap y 120 segundos de timeout, sin credenciales de base de datos. Usa una malla simplificada para portada y giro, encuadre común para toda la vuelta y receta versionada. WebP animado hasta 300 KiB; GIF solicitado hasta 1 MiB. Hay seis vistas técnicas descargables. Solo una tarjeta gira a la vez, respetando movimiento reducido y ahorro de datos.

Las fotos pueden vincularse a varios modelos y a una versión, ordenarse por ángulo, incluir pie/etapa/material/tipo y elegirse como portada. La rotación y el recorte del servicio crean un derivado sin alterar el original. Con 8–12 fotos ordenadas se exporta un giro fotográfico, claramente separado del render. No reconstruye geometría mediante fotogrametría.

La IA tiene funciones independientes de búsqueda natural, organización y similitud, además del etiquetado/metadatos existente. Produce filtros visibles, propuestas de organización o candidatos, nunca cambios físicos automáticos. La similitud evalúa un conjunto acotado de candidatos autorizados (hasta 200 por texto y 100 para foto), no un índice vectorial exhaustivo. Embeddings siguen siendo opcionales; la búsqueda funciona sin ellos.

Cada fuente controla texto, miniaturas, fotos y generación de propuestas al escanear. Se conservan los controles globales de roles, presupuesto, privacidad y caché de IA. Rechazar una propuesta impide repetirla con la misma evidencia. En el despliegue de pruebas `AI_FORCE_DISABLED=1`: no se han enviado datos a proveedores ni generado cargos.

## Respaldo, restauración y agente

`/api/backup?archivos=1` incluye datos y archivos locales; `&remotos=1` solicita materializar también originales remotos accesibles. El manifiesto registra SHA-256/tamaño y errores. Sigue siendo una exportación en línea: para una instantánea exacta se deben detener las escrituras. Secretos y sesiones se excluyen.

Restauración sobre un directorio nuevo, nunca sobre la base existente:

```bash
npx tsx scripts/library-restore.ts respaldo.zip /ruta/nueva/recuperacion
```

El comando ignora `DATABASE_URL`, utiliza una base PGlite nueva, comprueba rutas/hashes, restaura relaciones, deja servicios externos desconectados y marca originales ausentes. Genera `RESTORE.json` y una credencial nueva en `ACCESS.txt` con permisos restringidos. No reanuda impresoras ni tareas remotas. Tiene un límite explícito de 20 GiB/100.000 entradas; bibliotecas mayores requieren ajustar la estrategia de restauración y validar recursos antes de usarlo.

El agente Python es una alternativa opcional para computadores externos, validada en Linux. Requiere soporte de `dir_fd`/`O_NOFOLLOW`; no se presenta como instalador Windows terminado. Usar un túnel o HTTPS y una contraseña exclusiva. Conectores propietarios CAD e importadores que requieran APIs no disponibles continúan sujetos a viabilidad; archivos STEP y formatos CAD ya admitidos se importan por las fuentes de archivos.

## Validación y alcance de las pruebas

Las suites cubren catalogación sin copia, reintentos, revisiones, restricciones por fuente, rechazo de versiones ajenas, cuota/retención de caché, traslado de carpetas, identidad tras renombrado externo, restauración de papelera, planes obsoletos y undo, tipos de metadatos, dependencias, cursores cloud y agente WebDAV autenticado.

Playwright comprueba autenticación, cookie aislada, listado, descarga, GIF, vistas técnicas, edición persistente, plan/aplicación/undo de lote, fotos idempotentes, exportación y respaldo. Se restauró el respaldo de pruebas en `/tmp/minifactory-library-restore-20261018-final`: un original verificado, cero originales ausentes; el inventario del respaldo comprueba también archivos de fotos y derivados.

Suite completa final: **58 archivos, 443 pruebas aprobadas, 196,11 s**, incluyendo el caso de fotos y relaciones enlazadas a modelos restringidos. Ejecutada en un contenedor temporal `--network none`, sin montar datos de producción, con PostgreSQL desactivado para la suite y PGlite en memoria. OrcaSlicer se ejecutó realmente; servicios cloud e impresoras se simularon. Compilación Next y comprobación TypeScript completadas. Las cuentas de terceros, el consentimiento OAuth empresarial y pruebas de instaladores de otros sistemas operativos requieren un entorno externo autorizado.

## Límites de aceptación del piloto

No se declara una liberación productiva ni aceptación universal de los veinte escenarios AC de la spec. Las pruebas locales y los contratos simulados cubren sus mecanismos; quedan por ejecutar AC-01/02/05 con permisos y fallos reales de Drive, AC-10 en dispositivos móviles físicos y AC-14 con interrupciones controladas de infraestructura. AC-20 tiene evidencia para ingesta/cola/fotos y operaciones locales; una caída exactamente después de una escritura remota puede requerir reconciliación manual del proveedor.

El aislamiento de proceso aplica al análisis de mallas y a los metadatos 3MF. La importación de ZIP y el análisis directo de G-code mantienen límites de entrada, pero no disponen del mismo aislamiento de proceso. Las carpetas se mueven nativamente dentro de una fuente compatible; la transferencia entre fuentes se implementa para archivos, no para árboles completos. La similitud por IA usa candidatos acotados y los filtros textuales no implementan corrección de errores ortográficos. Estas restricciones no deben confundirse con funcionalidades verificadas.

Benchmark reproducible: `scripts/library-benchmark.ts`, ejecutado exclusivamente contra la base nueva `library_benchmark` del contenedor PostgreSQL de pruebas. Se insertaron 100.000 entradas en cinco fuentes sintéticas; 50 consultas medidas tras calentamiento dieron p50 **1,49 ms**, p95 **2,29 ms** y p99 **2,50 ms**. Equipo visible: Ryzen 7 3700X, 16 CPU lógicas, 15,02 GiB. No incluye HTTP, render del navegador ni acceso cloud, y no acredita el objetivo integral de 4 vCPU/8 GiB o de página usable en 2 s. Evidencia local: `test-results/library/benchmark.json`.

## Referencias para los cambios de conectores

- [Google Drive: subida de archivos](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [actualización y papelera](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/update), [feed de cambios](https://developers.google.com/workspace/drive/api/guides/manage-changes).
- [Microsoft Graph: actualización condicional](https://learn.microsoft.com/en-us/graph/api/driveitem-update?view=graph-rest-1.0), [crear carpetas](https://learn.microsoft.com/en-us/graph/api/driveitem-post-children?view=graph-rest-1.0), [delta](https://learn.microsoft.com/en-us/graph/api/driveitem-delta?view=graph-rest-1.0).
- [Dropbox HTTP API](https://www.dropbox.com/developers/documentation/http/documentation).

MakerWorld mantiene URL, metadatos recuperables y asociación del archivo subido manualmente. La falta de un mecanismo autorizado verificado para descargar originales se resuelve con ese flujo previsto por la spec, no con evasión de controles.

Prueba real del 18 de octubre de 2026: al importar `3317662-pumpkin-patch-pal`, el worker recuperó «Pumpkin Patch Pal», autor «Zesty 3D by Art» y «Standard Digital File License»; la app lo presenta como `awaiting_file` y permite asociar el archivo subido manualmente. La página del sitio respondió HTTP 403 con desafío Cloudflare desde este entorno, así que el original 3D no se descargó. Se conserva `profileId-3766961` en el enlace para volver a la placa elegida. No se ejecutó una descarga por un endpoint no verificado.
