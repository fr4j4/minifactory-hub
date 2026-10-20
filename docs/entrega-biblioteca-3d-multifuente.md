# Primera entrega de la biblioteca 3D multifuente — entorno de pruebas

> Documento histórico de la primera entrega. El estado posterior está en [implementación y validación de la spec](validacion-spec-biblioteca-3d.md).

Fecha de trabajo: 17–18 de octubre de 2026 (UTC).

Rama: `feature/biblioteca-3d-multifuente`, creada desde `3d70f49`.

Referencias: [spec y evaluación de alternativas](spec-biblioteca-3d-multifuente.md) · [plan de implementación](plan-biblioteca-3d-multifuente.md).

## 1. Acceso y estado

Versión funcional desplegada para pruebas en **http://192.168.1.14:3011**, también accesible desde el servidor en **http://localhost:3011**. Biblioteca: `/archivos`. Configuración: `/archivos/fuentes`.

Cuenta: `biblioteca-test@minifactory.local`. Contraseña en `data/library-test-access.txt`, archivo local excluido de Git. Los secretos de infraestructura están en `data/library-test.env`, también excluido de Git y con permisos restringidos.

La entrega implementa el núcleo multifuente y una primera interfaz integrada. **No cierra todas las extensiones de la spec**: la sección 7 identifica funciones pendientes y limitaciones. Los conectores externos requieren aceptación con cuentas reales antes de considerarlos validados para producción.

## 2. Aislamiento respecto a producción

| Recurso | Entorno nuevo |
| --- | --- |
| Proyecto Compose | `minifactory-library-test` |
| Imagen | `minifactory-library-test:feature` |
| Aplicación | `minifactory-library-test-app-1`, puerto 3011 |
| Worker | `minifactory-library-test-worker-1` |
| PostgreSQL | `minifactory-library-test-db-1`, base `library_test`, sin puerto publicado |
| Red | `minifactory-library-test_default` |
| Volumen de base | `minifactory-library-test_library_test_pg` |
| Archivos administrados | `minifactory-library-test_library_test_files` |
| Fuentes locales de prueba | `minifactory-library-test_library_test_sources`, montado en `/sources` |
| Cookie | `mf_library_test_session` |

No se montaron volúmenes productivos ni se copiaron datos de producción. Se generaron dos carpetas de prueba y un cubo STL sintético de 20 mm. La imagen base reutiliza herramientas instaladas de `minifactory-hub-app`; esto no comparte bases, volúmenes ni contenedores. La construcción depende de que esa imagen exista en el servidor.

Producción se inspeccionó únicamente para verificar aislamiento. Sus contenedores conservaban los arranques `2026-10-17T17:08:34.635386732Z` (app) y `2026-10-16T23:48:31.790702187Z` (db), y sus volúmenes `minifactory-hub_files` y `minifactory-hub_pgdata`.

Impresoras desactivadas mediante `BAMBU_DISABLED=1`. IA desactivada en este despliegue mediante `AI_FORCE_DISABLED=1`. Los controles de IA están implementados, pero no generan gasto en esta instancia. Su prueba real exige habilitarla exclusivamente en este Compose, configurar proveedor/función y permitir IA en la fuente correspondiente.

## 3. Funciones entregadas

- Conexiones independientes de la procedencia editorial del diseño; secretos cifrados y controles administrativos.
- Escaneos persistentes por páginas y carpetas, progreso, cancelación, reintentos y programación periódica. Solo un recorrido completo marca ausentes; un fallo no borra el inventario.
- Catalogación sin descargar todos los originales. Nuevas revisiones generan versiones; descarga bajo demanda con controles de tamaño, revisión y SHA-256. Integración con descarga, análisis, reparación y laminado.
- Buscador global sobre el catálogo local, disponible aunque falle una fuente. Filtros por fuente, disponibilidad, carpeta lógica, etiqueta, formato, licencia, colección, tamaño, dimensión, fotos, animación y favoritos; cuadrícula, tabla, paginación y vista guardada por usuario en el navegador.
- Gestión de carpetas lógicas, etiquetas, colecciones y ubicaciones. Operaciones físicas mediante plan y confirmación, según capacidades del proveedor: crear carpeta, renombrar archivo, copiar, mover o enviar a papelera. Copia verificada antes de retirar el origen.
- Vinculación manual de duplicados exactos con controles de hash, licencia, autor y cliente. No fusiona automáticamente por similitud visual.
- Importación en cola desde URL HTTPS directa de un modelo. Para páginas de diseños: metadatos y estado de espera del archivo, con carga manual. MakerWorld no incluye una descarga automática no autorizada.
- Animación WebP de 12 ángulos, 240×180, calidad 65 y límite de 300 KiB; simplificación para modelos grandes. Exportación GIF bajo demanda con límite de 1 MiB y ZIP de capturas. Preferencias de movimiento reducido y ahorro de datos en la cuadrícula.
- Fotos reales asociadas al modelo, captura/subida manual, reintentos idempotentes y cola sin conexión separada por identidad. Límite de 100 MiB para la cola del navegador.
- Propuestas opcionales de título, descripción, categoría y etiquetas mediante IA, sujetas a configuración, permisos y aprobación humana. Se comprueba que la versión no haya cambiado antes de aplicar.
- Exportación de respaldo en streaming, sin secretos ni sesiones. El manifiesto identifica originales remotos no descargados; un respaldo en línea no garantiza una instantánea transaccional.

## 4. Capacidades de conectores

Todas las capacidades también dependen de permisos de la cuenta y de que la fuente esté habilitada para escritura.

| Fuente | Listar/leer | Renombrar archivo | Crear carpeta | Recibir copia | Papelera | Validación |
| --- | --- | --- | --- | --- | --- | --- |
| Local / NAS montado | Sí | Sí | Sí | Sí | `.mf-trash` | Integración local y navegador |
| Google Drive | Sí | Según permisos | Sí | No | Según permisos | Contratos simulados; falta cuenta real |
| FTP / FTPS | Sí | Sí | Sí | Sí | No | Implementado; falta servidor real |
| SFTP | Sí | Sí | Sí | Sí | No | Implementado; exige huella del servidor |
| WebDAV / Nextcloud | Sí | Sí | Sí | Sí, hasta 64 MiB | No | Implementado; falta servidor real |
| S3 compatible | Sí | No | Prefijos | Sí | No | Implementado; falta bucket real |
| OneDrive | Sí | No | No | No | No | Contratos simulados; falta cuenta real |
| Dropbox | Sí | No | No | No | No | Contratos simulados; falta cuenta real |

NAS SMB/NFS se utiliza a través de una carpeta montada; no hay un cliente SMB/NFS nativo. No hay carpetas del host montadas por defecto: `/sources` pertenece al volumen exclusivo de prueba.

Google Drive admite credenciales de acceso/renovación; el backend contempla cuenta de servicio, pero no existe un asistente OAuth ni un formulario completo para ese flujo. OneDrive y Dropbox también requieren configuración manual. Deben comprobarse cuotas, permisos, revocación, archivos no descargables y carpetas compartidas con cada cuenta real.

## 5. Validación realizada

- Suite completa dentro de la imagen de pruebas: **53 archivos, 416 pruebas aprobadas**, 157 segundos. Base PGlite en memoria, sin conexión al PostgreSQL productivo.
- Suite específica posterior: **4 archivos, 27 pruebas aprobadas**, con escaneo local, contratos de Drive/OneDrive/Dropbox, límites HTTP e i18n. Parte de estas pruebas también está incluida en la suite completa; no se suman como casos únicos.
- TypeScript y construcción de producción correctos.
- Prueba Playwright: autenticación, cookie aislada, catálogo, ficha, descarga original, GIF, fuentes, filtros, subida de foto y reintento sin duplicados, respaldo y vista móvil.
- Evidencias visuales locales en `test-results/library/`: `catalog.png`, `model.png`, `sources.png`, `mobile.png`. Excluidas de Git.
- `git diff --check` sin errores.

La ejecución completa inicial en el host tuvo limitaciones del entorno (perfiles de Orca ausentes y sockets de simuladores bloqueados por el sandbox). La ejecución completa válida se realizó dentro del contenedor de pruebas, con herramientas instaladas y base en memoria. No se utilizaron esas limitaciones para declarar éxito de pruebas omitidas.

## 6. Operación del entorno

Desde la raíz del repositorio:

```bash
bash scripts/library-test.sh up       # construye y actualiza solo pruebas
bash scripts/library-test.sh status
bash scripts/library-test.sh logs
bash scripts/library-test.sh stop     # conserva sus volúmenes
node scripts/library-test-smoke.mjs
```

El script utiliza expresamente `docker-compose.library-test.yml` y `data/library-test.env`. No ejecutar el Compose productivo para probar esta rama. No se ha publicado la rama ni se ha realizado merge o migración a producción.

Recorrido recomendado: entrar en Fuentes, inspeccionar “Entrada de pruebas” y “Destino de pruebas”, escanear, abrir el cubo en la biblioteca, exportar GIF, asociar una foto y preparar una copia entre ambas fuentes. Después, agregar una cuenta externa autorizada con acceso de solo lectura para validar su inventario antes de habilitar escritura.

## 7. Limitaciones y siguiente trabajo

1. **Aceptación de proveedores reales:** faltan credenciales autorizadas. Los contratos simulados no certifican compatibilidad con todas las variantes de servicio ni sus restricciones comerciales.
2. **Sincronización:** hay recorridos paginados y periódicos; faltan feeds incrementales nativos, webhooks y reconciliación avanzada de renombres externos. El explorador de fuentes muestra hasta 1.000 entradas; necesita paginación propia para inventarios grandes. El buscador global sí pagina.
3. **Administración:** no se permiten renombrados ni papelera de directorios completos. Faltan edición integral de la configuración de una fuente, operaciones físicas masivas y resolver conflictos mediante una interfaz especializada. Mover requiere papelera en el origen y carga en destino; no se ofrece borrado irreversible como alternativa.
4. **Almacenamiento:** originales materializados se conservan como snapshots; no hay política LRU, cuotas por fuente ni fijación/liberación desde interfaz. Límite de materialización de 500 MiB y reserva de disco de 64 MiB. Revisar límites antes de usar modelos mayores.
5. **Permisos:** fuentes compartidas por taller; falta un sistema de fuentes personales y ACL por conexión. Las operaciones administrativas dependen de permisos existentes de la aplicación.
6. **Previews:** faltan comparaciones visuales, vistas ortográficas específicas, coordinación de una única animación global y ajuste uniforme de encuadre para todos los formatos. No se genera GIF permanentemente para cada modelo.
7. **IA:** faltan búsqueda semántica, similitud por imagen, asociación automática de fotos, organización masiva y políticas de presupuesto específicas por fuente. La clasificación implementada es opcional y revisable.
8. **Importación:** falta extracción automática de paquetes ZIP en el flujo URL y manejo avanzado de dependencias CAD. MakerWorld conserva la alternativa manual hasta verificar un mecanismo autorizado. No se eluden autenticación, CAPTCHA ni controles del proveedor.
9. **Respaldo:** falta un asistente de restauración integral y una modalidad coordinada de snapshot consistente. Respaldar también las credenciales por un canal seguro separado si se necesita recuperar conexiones; el exportador las omite deliberadamente.
10. **Extensiones P4:** agente de escritorio, CAD nativo y fotogrametría permanecen fuera de esta entrega.

Estas tareas deben cerrarse en la misma rama o en PR sucesivos antes de declarar cumplida toda la spec. El despliegue actual permite probar el flujo principal sin modificar producción.
