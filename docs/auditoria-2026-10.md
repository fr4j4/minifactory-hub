# Auditoría de octubre 2026

Auditoría de MiniFactory Hub sobre la rama `development` (commit 764f9c1). Doce revisiones por área: lectura de código, pruebas en el navegador (escritorio 1440x900 y móvil) y una verificación independiente de cada hallazgo.

- Hallazgos confirmados: 141 (18 de severidad alta, 50 media, 73 baja).
- Hallazgos rechazados en la verificación: 15 (ver el anexo).

## Ramas que corrigen los hallazgos

| Rama | Contenido | Hallazgos |
|-|-|-|
| `fix/seguridad` | Autorización, secretos, SSRF, redirección abierta, inyección CSV, PDF, Docker y validación de entradas | 22 |
| `feat/plantillas-presupuesto` | Documento y plantillas de presupuesto | 11 |
| `fix/ui-iconos-i18n-transiciones` | Íconos, textos en otros idiomas, transiciones y detalles visuales | 42 |
| `fix/inventario-ventas-laminado` | Inventario, ventas, reportes, laminador e impresoras | 27 |
| `fix/presupuestos-pedidos-produccion` | Presupuestos, pedidos, producción e integridad de datos | 39 |
| `chore/release-packaging` | Empaquetado y publicación (Next standalone, sección de versiones del README). No corrige hallazgos de esta auditoría | 0 |

Severidad: **alta** rompe un flujo principal o expone datos; **media** da un resultado incorrecto en un caso real; **baja** es un caso límite, endurecimiento o detalle.

## Presupuestos, pedidos y producción

| ID | Severidad | Ubicación | Problema | Rama |
|-|-|-|-|-|
| flow-quotes-orders-1 | alta | `src/lib/services/quotes.ts:103-154 (insert/update at 105-108, item replace 113-147, throw at 151-154); src/components/quote-editor.tsx:66 (autosave)` | saveQuote escribe las líneas antes de revisar el precio bajo el costo: un guardado fallido deja presupuestos huérfanos y totales viejos. | `fix/presupuestos-pedidos-produccion` |
| flow-quotes-orders-5 | alta | `src/lib/services/quotes.ts:206-211 (newQuoteVersion), 100 (applyTax default)` | Una nueva versión del presupuesto pierde la opción de IVA sin avisar. | `fix/presupuestos-pedidos-produccion` |
| flow-quotes-orders-2 | media | `src/lib/services/orders.ts:86-113 (approveQuote), 114-142 (planProduction)` | Aprobar un presupuesto y planificar la producción no son idempotentes: se duplican pedidos y trabajos. | `fix/presupuestos-pedidos-produccion` |
| flow-quotes-orders-3 | media | `src/lib/services/orders.ts:165-191 (setOrderStatus), 193-208 (cancelOrder)` | Los cambios de estado del pedido no tienen guarda: entregar dos veces descuenta stock dos veces y cancelar dos veces libera reservas de otros pedidos. | `fix/presupuestos-pedidos-produccion` |
| flow-quotes-orders-6 | media | `src/lib/services/quotes.ts:201-205, 122-124` | «Nueva versión» sin recalcular igual recalcula el precio de las líneas que usaban el sugerido. | `fix/presupuestos-pedidos-produccion` |
| flow-quotes-orders-7 | media | `src/lib/services/quotes.ts:218-228 (previewRecalc) vs 92-96, 122-124 (saveQuote)` | La vista previa del recálculo ignora la lista de precios del cliente y la urgencia: el total mostrado no es el que se aplica. | `fix/presupuestos-pedidos-produccion` |
| flow-quotes-orders-8 | media | `src/components/line-editor.tsx:34 vs src/lib/services/quotes.ts:67; quotes.ts:56,124; quote-editor.tsx:38` | El ajuste de la lista de precios se redondea distinto en el navegador y en el servidor; la urgencia ignora el modo de redondeo. | `fix/presupuestos-pedidos-produccion` |
| flow-quotes-orders-9 | media | `src/lib/services/orders.ts:33-45, 102-107` | Al aprobar se recalculan los costos con las tarifas actuales y se puede rechazar un presupuesto ya congelado. | `fix/presupuestos-pedidos-produccion` |
| flow-quotes-orders-10 | media | `src/lib/services/quotes.ts:212; src/lib/services/orders.ts:86-87; src/components/quote-actions.tsx:24-25` | Un presupuesto aprobado puede generar un segundo pedido mediante una nueva versión. | `fix/presupuestos-pedidos-produccion` |
| flow-quotes-orders-11 | media | `src/app/(app)/presupuestos/[id]/page.tsx:34-50; src/components/quote-actions.tsx:24,49; src/components/quote-editor.tsx:66` | «El cliente aceptó» sobre un borrador aprueba el último autoguardado y pierde lo no guardado. | `fix/presupuestos-pedidos-produccion` |
| flow-quotes-orders-12 | media | `src/lib/services/production.ts:99-110 (startJob), 123-129 (finishJob), 197-210 (pause/resume)` | Los trabajos de impresión no validan transiciones: se puede terminar uno cancelado, reiniciar uno cerrado o «reanudar» uno en cola. | `fix/presupuestos-pedidos-produccion` |
| flow-quotes-orders-13 | media | `src/lib/services/orders.ts:156-157; src/lib/services/production.ts:143,181,184; src/app/(app)/pedidos/[id]/page.tsx:44,54` | Una falla total sin reimpresión pasa el pedido a postproceso. | `fix/presupuestos-pedidos-produccion` |
| flow-quotes-orders-15 | media | `src/lib/services/orders.ts:135; src/lib/services/production.ts:46-47,284-293; src/components/queue-board.tsx:25,61` | Los trabajos planificados en una máquina eliminada desaparecen de la cola. | `fix/presupuestos-pedidos-produccion` |
| flow-quotes-orders-14 | baja | `src/lib/services/production.ts:211-219; src/lib/services/orders.ts:199-200` | cancelJob y cancelOrder dejan desactualizados los estados del pedido y de la máquina. | `fix/presupuestos-pedidos-produccion` |
| flow-quotes-orders-16 | baja | `src/lib/services/orders.ts:56-58, 182, 204` | Las reservas de stock se leen y reescriben sin bloqueo: con concurrencia se pierden actualizaciones. | `fix/presupuestos-pedidos-produccion` |
| flow-quotes-orders-17 | baja | `src/lib/services/quotes.ts:178-190` | rejectQuote y sendQuote no revisan el estado en el servidor. | `fix/presupuestos-pedidos-produccion` |
| flow-quotes-orders-18 | baja | `src/lib/services/orders.ts:97; src/components/quote-actions.tsx:39-50` | El cliente nunca puede aceptar líneas opcionales. | `fix/presupuestos-pedidos-produccion` |
| flow-quotes-orders-19 | baja | `src/lib/pricing.ts:150-157` | Un total fijo menor que el envío deja precios de línea negativos. | `fix/presupuestos-pedidos-produccion` |
| flow-quotes-orders-20 | baja | `src/lib/services/orders.ts:35-37, 64, 68; src/actions/orders.ts:11-19` | createOrder no valida la cantidad ni el precio final que llegan del cliente. | `fix/seguridad` |

## Inventario, catálogo, ventas y reportes

| ID | Severidad | Ubicación | Problema | Rama |
|-|-|-|-|-|
| flow-inventory-catalog-sales-1 | alta | `src/app/api/export/[kind]/route.ts:26 (vs src/app/(app)/reportes/page.tsx:18)` | La exportación de reportes ignora el filtro del rol Ventas: un vendedor descarga los datos de todos. | `fix/seguridad` |
| flow-inventory-catalog-sales-2 | media | `src/lib/services/catalog.ts:105-107 and 128-130` | Vender más que el stock lo deja en 0 y anular la venta crea unidades fantasma. | `fix/inventario-ventas-laminado` |
| flow-inventory-catalog-sales-3 | media | `src/lib/services/inventory.ts:85-87; caller src/lib/services/production.ts:137-138` | El consumo de filamento que supera lo que queda en la bobina desaparece. | `fix/inventario-ventas-laminado` |
| flow-inventory-catalog-sales-4 | media | `src/app/(app)/reportes/page.tsx:16,19; src/app/api/export/[kind]/route.ts:25; src/lib/reports.ts:24,83; src/lib/stats.ts:9,43` | Las fechas de los reportes mezclan UTC y hora local e ignoran la zona horaria del taller. | `fix/inventario-ventas-laminado` |
| flow-inventory-catalog-sales-6 | media | `src/lib/services/catalog.ts:83-107; src/actions/catalog.ts:21` | La venta rápida acepta cantidades duplicadas, cero, negativas o fraccionarias. | `fix/inventario-ventas-laminado` (también fix/seguridad (cantidad en createSale)) |
| flow-inventory-catalog-sales-7 | media | `src/lib/reports.ts:32,39,101; src/lib/stats.ts:17` | Los reportes de ventas usan createdAt y no la fecha editable de la venta. | `fix/inventario-ventas-laminado` |
| flow-inventory-catalog-sales-8 | media | `src/lib/reports.ts:90 (vs :38-40)` | El reporte de canales no descuenta el IVA de los pedidos, a diferencia del de ventas. | `fix/inventario-ventas-laminado` |
| flow-inventory-catalog-sales-9 | media | `src/lib/reports.ts:49-73,94-104` | El filtro por vendedor no se aplica a la mayoría de los reportes (embudo, precio final, catálogo). | `fix/seguridad` |
| flow-inventory-catalog-sales-11 | media | `src/lib/services/catalog.ts:39-45` | El sufijo para evitar SKU duplicados no se vuelve a revisar y choca con el índice único. | `fix/inventario-ventas-laminado` |
| flow-inventory-catalog-sales-13 | media | `src/lib/photos.ts:27-28,53; src/actions/customers.ts:16-17` | Revocar el consentimiento de fotos no oculta las fotos existentes. | `fix/inventario-ventas-laminado` |
| flow-inventory-catalog-sales-5 | baja | `src/app/api/export/[kind]/route.ts:10,22,33` | La exportación CSV permite inyección de fórmulas (=, +, -, @). | `fix/seguridad` |
| flow-inventory-catalog-sales-10 | baja | `src/lib/services/catalog.ts:30-48` | Volver a agregar un valor de variante eliminado deja la variante inactiva. | `fix/inventario-ventas-laminado` |
| flow-inventory-catalog-sales-12 | baja | `src/actions/catalog.ts:15; src/actions/inventory.ts:32-35` | Las acciones de edición copian el objeto del cliente en filas de stock y saltan el libro de movimientos. | `fix/inventario-ventas-laminado` (también fix/seguridad (campos de updateVariantAction y updateSpoolAction)) |
| flow-inventory-catalog-sales-15 | baja | `src/lib/services/catalog.ts:110,122-134` | Anular una venta rápida conserva su pago. | `fix/inventario-ventas-laminado` |
| flow-inventory-catalog-sales-16 | baja | `src/lib/services/catalog.ts:100; src/lib/services/orders.ts:215; src/lib/services/inventory.ts:53; src/lib/stats.ts:43` | Las fechas por defecto usan el día UTC. | `fix/inventario-ventas-laminado` |
| flow-inventory-catalog-sales-17 | baja | `src/app/api/export/[kind]/route.ts:33` | El CSV de reportes usa coma como separador y decimales sin formato. | `fix/inventario-ventas-laminado` |

## Impresoras, laminador y trabajos

| ID | Severidad | Ubicación | Problema | Rama |
|-|-|-|-|-|
| flow-printers-slicer-jobs-1 | alta | `src/lib/slicer/queue.ts:183-188, src/components/studio/studio.tsx:44, docker-compose.yml:20,35` | Cancelar un laminado en curso no hace nada con el worker externo de docker-compose. | `fix/inventario-ventas-laminado` |
| flow-printers-slicer-jobs-2 | media | `src/lib/storage.ts:38, src/lib/slicer/queue.ts:126-127, src/lib/files.ts:80-83, src/actions/files.ts:34` | Los resultados, vistas previas y miniaturas del laminado nunca se borran del almacenamiento. | `fix/inventario-ventas-laminado` |
| flow-printers-slicer-jobs-3 | media | `src/lib/jobs.ts:79, src/lib/slicer/queue.ts:160` | Un trabajo que hace caer al worker se vuelve a ejecutar en cada reinicio, sin fin. | `fix/inventario-ventas-laminado` |
| flow-printers-slicer-jobs-6 | media | `src/components/studio/studio.tsx:63` | El Estudio lamina dos veces la misma entrada al abrir o al cambiar la configuración. | `fix/inventario-ventas-laminado` |
| flow-printers-slicer-jobs-8 | media | `src/lib/services/printers.ts:164-168, src/lib/services/production.ts:99-107` | Enviar a la impresora inicia la impresión física antes de validar el trabajo de la cola. | `fix/inventario-ventas-laminado` |
| flow-printers-slicer-jobs-9 | media | `src/lib/bambu/client.ts:26-38, src/lib/bambu/ftps.ts:10, src/lib/bambu/camera.ts:23` | El código de acceso LAN sale antes de revisar la huella TOFU; FTPS y cámara no fijan la huella. | `fix/seguridad` |
| flow-printers-slicer-jobs-7 | baja | `src/lib/bambu/manager.ts:65,130-140` | El manejador de estado de la impresora compite en ráfagas y envía avisos de transición duplicados. | `fix/inventario-ventas-laminado` |
| flow-printers-slicer-jobs-10 | baja | `src/lib/services/production.ts:232-233,263` | Las alertas de mantenimiento se suprimen tras el primer ciclo si el aviso anterior sigue sin leer. | `fix/inventario-ventas-laminado` |
| flow-printers-slicer-jobs-11 | baja | `src/lib/slicer/run.ts:87-98, src/lib/slicer/queue.ts:113,136` | La carpeta temporal de OrcaSlicer (con una copia del modelo) queda en disco si la preparación falla. | `fix/inventario-ventas-laminado` |
| flow-printers-slicer-jobs-13 | baja | `src/lib/jobs.ts:59-66, src/lib/files.ts:57-58` | La subida síncrona puede responder antes de que termine el análisis. | `fix/inventario-ventas-laminado` |

## Seguridad

| ID | Severidad | Ubicación | Problema | Rama |
|-|-|-|-|-|
| security-1 | media | `src/actions/auth.ts:14-16, src/actions/setup.ts:13, src/lib/auth.ts:27-39` | El límite de intentos de login y del token de instalación usa x-forwarded-for, que controla el cliente; el mapa crece sin límite. | `fix/seguridad` |
| security-2 | media | `README.md:67` | El comando de PowerShell del README genera una llave de 16 caracteres con un RNG no criptográfico. | `fix/seguridad` |
| security-4 | media | `src/actions/links.ts:15-21` | saveLinksAction permite a cualquier rol reemplazar los links de cualquier presupuesto, pedido o producto (incluidos los del PDF). | `fix/seguridad` |
| security-3 | baja | `src/lib/links.ts:33-40, src/actions/links.ts:8-10` | SSRF en la vista previa de links: la IP se revisa una vez y luego fetch sigue redirecciones a IP internas. | `fix/seguridad` |
| security-5 | baja | `src/app/(app)/calculadora/page.tsx:11-13, src/lib/editor-data.ts:11-18, src/lib/context.ts:26` | El Operador recibe costos de materiales y costo promedio de productos en el payload RSC. | `fix/seguridad` |
| security-6 | baja | `src/actions/auth.ts:23, src/app/login/page.tsx:19,49` | Redirección abierta tras iniciar sesión mediante el parámetro next. | `fix/seguridad` |
| security-7 | baja | `src/actions/settings.ts:22-31` | Un no-admin con config E puede hacerse admin y cambiar sus propios permisos. | `fix/seguridad` |
| security-8 | baja | `.dockerignore:1-5, Dockerfile:13` | .env (SESSION_SECRET) se copia a la imagen Docker. | `fix/seguridad` |
| security-9 | baja | `Dockerfile:1-23, src/lib/pdf.ts:15, docker-compose.yml:24-25` | El contenedor corre como root y Chromium con --no-sandbox. | `fix/seguridad` |
| security-10 | baja | `src/lib/config.ts:10, src/lib/secret.ts:5, .env.example:3` | SESSION_SECRET tiene un valor de respaldo fijo y conocido que sella los secretos guardados. | `fix/seguridad` |
| security-11 | baja | `src/app/api/export/[kind]/route.ts:10,30` | La exportación CSV es vulnerable a inyección de fórmulas (duplicado de flow-inventory-catalog-sales-5). | `fix/seguridad` |
| security-12 | baja | `src/app/api/quotes/[id]/pdf/route.ts:25-27,33` | El PDF del presupuesto se genera navegando a un origen tomado del encabezado Host. | `fix/seguridad` |
| security-13 | baja | `src/actions/ai.ts:70, src/actions/ai.ts:94` | Probar o listar modelos de IA envía la clave guardada a una baseUrl elegida en el formulario. | `fix/seguridad` |

### Riesgos que quedan tras `fix/seguridad`

- La cámara RTSPS (X1/H2): antes de lanzar ffmpeg, una conexión TLS de prueba compara la huella. ffmpeg abre otra conexión: un intermediario que reenvíe la prueba a la impresora real no se detecta. Cerrarlo requiere un proxy TLS local fijado.
- safeGet revisa la IP antes de cada salto, pero fetch vuelve a resolver el DNS (rebinding). Cerrarlo requiere fijar la IP en el agente HTTP.
- El Operador sigue recibiendo el costo por kg de materiales y el costo de máquinas: el editor los usa para el precio sugerido (decisión de security-5). En Inventario también: el Operador registra materiales y bobinas con su costo.
- El límite de intentos de login cuenta por correo; un navegador donde la cuenta ya inició sesión cuenta aparte. Un navegador nuevo del dueño sí queda bloqueado 15 minutos. El token de instalación (62 bits, un solo uso) tiene un contador global; reiniciar el servidor lo libera.
- Chromium sigue con --no-sandbox dentro de Docker; quitarlo requiere un perfil seccomp.
- El cambio de huella en FTPS y cámara supone que la impresora usa el mismo certificado en los tres puertos (así lo hace el simulador). Falta confirmarlo con una impresora real.

## Idiomas (i18n)

| ID | Severidad | Ubicación | Problema | Rama |
|-|-|-|-|-|
| i18n-1 | media | `src/lib/format.ts:3-4, src/lib/settings.ts:97-98, src/app/bienvenida/wizard.tsx:33, src/actions/setup.ts:27` | money() ignora la moneda y el idioma del taller: los talleres en USD o EUR ven montos en CLP. | `fix/ui-iconos-i18n-transiciones` |
| i18n-2 | media | `src/lib/format.ts:9-10 (dmy, dmyHm); 56 call sites; Dockerfile and docker-compose.yml set no TZ; src/components/config-forms.tsx:23 (timezone field)` | Las fechas se formatean en la zona del servidor (UTC en Docker); shop.timezone nunca se usa. | `fix/inventario-ventas-laminado` |
| i18n-5 | media | `src/lib/library/folders.ts:39,41,43,45,73; src/actions/files.ts:50,77,120,140; src/actions/slicer.ts:361; src/lib/slicer/resolve.ts:24,26,36; src/lib/slicer/presets.ts:36-39; src/lib/library/source.ts:53,54,58,63; src/lib/slicer/usage.ts:11,27; src/lib/slicer/setup.ts:201; src/lib/storage.ts:11; src/lib/secret.ts:13; src/lib/jobs.ts:17,42; src/lib/mesh/repair-file.ts:14; src/actions/advisor.ts:17` | Errores del servidor sin LocalizedError llegan crudos a la interfaz. | `fix/ui-iconos-i18n-transiciones` |
| i18n-3 | baja | `src/lib/pdf.ts:27-30, src/app/api/quotes/[id]/pdf/route.ts:27, src/app/imprimir/presupuesto/[id]/page.tsx:15` | El idioma del PDF no coincide con la vista previa: renderPdf solo pasa la cookie de sesión, no mf_lang. | `feat/plantillas-presupuesto` |
| i18n-4 | baja | `src/components/line-editor.tsx:213, src/components/line-editor.tsx:224, src/components/quote-editor.tsx:116` | Texto en español fijo en el editor de líneas y en el total del presupuesto. | `fix/ui-iconos-i18n-transiciones` |
| i18n-6 | baja | `src/lib/slicer/validate.ts:25-34` | Los errores de validación de perfiles muestran siempre el nombre del campo en español. | `fix/ui-iconos-i18n-transiciones` |
| i18n-7 | baja | `src/components/ui.tsx:55, src/app/bienvenida/wizard.tsx:28` | La tabla compartida y el asistente inicial tienen aria-labels en español. | `fix/ui-iconos-i18n-transiciones` |
| i18n-8 | baja | `src/components/printer-live.tsx:210, src/components/slice-panel.tsx:132, src/components/slicing-setup.tsx:148` | Otras palabras en español fijas en los paneles de impresora y laminador. | `fix/ui-iconos-i18n-transiciones` |
| i18n-9 | baja | `src/components/model-viewer.tsx:14, src/components/model-viewer.tsx:20, src/components/gcode-viewer.tsx:20` | El visor 3D usa siempre coma decimal y sus errores están en inglés. | `fix/ui-iconos-i18n-transiciones` |

## Iconografía

| ID | Severidad | Ubicación | Problema | Rama |
|-|-|-|-|-|
| iconography-1 | alta | `src/components/shell.tsx:13-19 (ICONS map + Icon fallback); callers: src/components/ui.tsx:11, src/app/(app)/page.tsx:77, src/components/shell.tsx:99,147, src/components/line-editor.tsx:109 and the next two buttons, src/components/model-viewer.tsx:211,234, src/components/file-bits.tsx:12, src/components/file-grid.tsx:38, src/components/photo-grid.tsx:31, src/components/catalog-bits.tsx, comparator.tsx, links-editor.tsx, profile-bits.tsx, queue-board.tsx, quick-sale.tsx, slicing-setup.tsx` | Todos los íconos agregados en 764f9c1 se ven como el ícono Package (caja). | `fix/ui-iconos-i18n-transiciones` |
| iconography-2 | media | `src/app/(app)/pedidos/[id]/page.tsx:79 (edit-contact, remove-contact), :86 (edit-payment, remove-payment); src/app/(app)/ventas/page.tsx:28 (edit-sale); src/app/(app)/maquinas/[id]/page.tsx:74 (edit-plan), :77 (edit-incident, remove-incident); src/components/edit-button.tsx:19; src/components/remove-button.tsx:22` | Los botones de editar y quitar siguen con los glifos ✎ y ✕ y no tienen nombre accesible. | `fix/ui-iconos-i18n-transiciones` |
| iconography-3 | media | `src/components/file-grid.tsx:38` | El botón masivo «marcar favorito» es solo ícono, sin etiqueta. | `fix/ui-iconos-i18n-transiciones` |
| iconography-4 | baja | `src/components/shell.tsx:99; src/i18n/es/shell.ts:4; src/i18n/en/shell.ts:7` | El botón de colapsar muestra dos flechas: los chevrons de Lucide más « de la traducción. | `fix/ui-iconos-i18n-transiciones` |
| iconography-5 | baja | `src/components/printer-live.tsx:179-180; src/i18n/es/machines.ts:210,211,213; src/i18n/en/machines.ts:213,214,216` | Los controles de la impresora usan los glifos ▶ ❚❚ ■ en sus traducciones. | `fix/ui-iconos-i18n-transiciones` |
| iconography-6 | baja | `src/components/photo-grid.tsx:56; src/app/(app)/galeria/page.tsx:40; src/i18n/es/gallery.ts:23,69,70; src/i18n/en/gallery.ts:26,72,73` | El destacado y el filtro de la galería usan ★ ☆ mientras archivos usa la estrella de Lucide. | `fix/ui-iconos-i18n-transiciones` |
| iconography-7 | baja | `src/components/photo-grid.tsx:31` | La insignia de foto destacada no tiene texto alternativo. | `fix/ui-iconos-i18n-transiciones` |
| iconography-8 | baja | `src/components/slicing-setup.tsx:62 (nozzle chip ' ✓'); src/components/studio/explore.tsx:58 (result cell '✕' for error, '…' for pending)` | Quedan glifos ✓ / ✕ / … de estado donde en otros lados se usa Lucide. | `fix/ui-iconos-i18n-transiciones` |
| iconography-9 | baja | `src/app/(app)/pedidos/page.tsx:32 (late ' ⚠'); src/app/(app)/pedidos/[id]/page.tsx:53; src/components/machine-bits.tsx:62 (maint-done '⚠ '); src/components/advisor-panel.tsx:88,92; src/components/process-options.tsx:28; src/components/profile-bits.tsx:217; src/i18n/es/slicer.ts:205 + en/slicer.ts:208 (profileMismatch); src/components/queue-board.tsx:75 ('🌙 ' overnight job)` | ⚠ y 🌙 se usan como íconos de estado en lugar de Lucide. | `fix/ui-iconos-i18n-transiciones` |

## Movimiento y transiciones

| ID | Severidad | Ubicación | Problema | Rama |
|-|-|-|-|-|
| motion-1 | alta | `src/components/shell.tsx:84-90 (sidebar Link), src/components/shell.tsx:142-144 (BottomLink), src/components/ui-client.tsx:17-22 (Tabs Link); no loading.tsx or Suspense left under src/app` | No hay ninguna señal de navegación desde que se quitó (app)/loading.tsx. | `fix/ui-iconos-i18n-transiciones` |
| motion-3 | baja | `src/components/ui/kit.tsx:20-23` | Los diálogos Radix (todo Modal) no tienen transición de entrada ni de salida. | `fix/ui-iconos-i18n-transiciones` |
| motion-4 | baja | `src/components/client.tsx:13-24` | Los avisos aparecen y desaparecen sin transición y la pila salta. | `fix/ui-iconos-i18n-transiciones` |
| motion-5 | baja | `src/components/shell.tsx:72, 74-76, 88, 101` | Colapsar la barra lateral anima el ancho y reacomoda la página en cada cuadro; las etiquetas saltan a mitad. | `fix/ui-iconos-i18n-transiciones` |
| motion-7 | baja | `src/app/globals.css:78, 80` | La regla de movimiento reducido no anula los retrasos: el contenido queda oculto hasta 120 ms. | `fix/ui-iconos-i18n-transiciones` |
| motion-8 | baja | `src/components/client.tsx:59; callers src/components/file-bits.tsx:36, printer-live.tsx:180, profile-bits.tsx:138, printer-connect.tsx:82, printer-connect.tsx:91, printer-cloud.tsx:69` | Las acciones destructivas de ConfirmButton cierran el modal y no muestran que están en curso. | `fix/ui-iconos-i18n-transiciones` |

## Formularios y CRUD

| ID | Severidad | Ubicación | Problema | Rama |
|-|-|-|-|-|
| crud-1 | alta | `src/components/quote-editor.tsx:50-61` | El autoguardado del presupuesto marca como guardadas las ediciones hechas durante un guardado en curso, y se pierden. | `fix/presupuestos-pedidos-produccion` |
| crud-2 | alta | `src/lib/services/quotes.ts:110-146; src/components/quote-editor.tsx:43-58` | saveQuote borra y vuelve a insertar todas las líneas en cada guardado: cambian los ids, se rompe el historial de precios y una falla pierde las líneas. | `fix/presupuestos-pedidos-produccion` |
| crud-3 | media | `src/lib/services/catalog.ts:23-48, src/lib/services/removal.ts:52-66 and 158-197, src/actions/inventory.ts:18-19, src/lib/services/orders.ts (createOrder/approveQuote)` | Ninguna escritura de varios pasos usa transacción. | `fix/presupuestos-pedidos-produccion` |
| crud-4 | media | `src/i18n/errors.ts errorText; src/actions/settings.ts saveSupplierAction / saveUserAction; src/lib/services/catalog.ts:40-41` | Las violaciones de índice único llegan al usuario como errores crudos de Postgres. | `fix/presupuestos-pedidos-produccion` |
| crud-6 | media | `src/components/photo-grid.tsx:57; src/lib/services/removal.ts:14 (REMOVABLE); src/lib/services/archive.ts TABLE` | Borrar una foto no pide confirmación; fotos y máquinas borradas no se pueden restaurar. | `fix/ui-iconos-i18n-transiciones` |
| crud-7 | media | `src/components/order-form.tsx:33-43; src/components/quick-calc.tsx:24-27; useAction create flows in customer-form.tsx, machine-bits.tsx:22, catalog-bits.tsx:19` | Los botones de crear se reactivan antes de terminar la navegación: un segundo clic crea un duplicado. | `fix/presupuestos-pedidos-produccion` |
| crud-5 | baja | `src/actions/inventory.ts:11-20 and 41-48; src/actions/catalog.ts:14-16 and 23-29; src/actions/settings.ts savePriceListAction; src/actions/production.ts setMachineStatusAction` | Las acciones aceptan números negativos o fuera de rango (densidad, costos, stock, ajuste de lista, comisión, estado de máquina). | `fix/seguridad` |
| crud-8 | baja | `src/components/inventory-bits.tsx:9-17 (MaterialForm) and 73-75 (ItemForm); src/components/config-forms.tsx:94-106 (ChannelDialog, PriceListDialog) and 123 (SupplierDialog)` | Los formularios modales conservan estado viejo: tras crear, el siguiente «nuevo» viene lleno y las ediciones canceladas vuelven. | `fix/ui-iconos-i18n-transiciones` |
| crud-9 | baja | `src/app/(app)/clientes/page.tsx:22 (300), pedidos/page.tsx:20 (200), presupuestos/page.tsx:23 (150), archivos/page.tsx:25 (200), ventas/page.tsx:19 (120), galeria/page.tsx:26 (300), inventario/page.tsx:21-28` | Las listas se cortan en un límite oculto, sin paginación ni total; inventario carga todo y no tiene búsqueda. | `fix/ui-iconos-i18n-transiciones` |
| crud-10 | baja | `src/app/(app)/clientes/page.tsx:29, pedidos/page.tsx:28, presupuestos/page.tsx:83, catalogo/page.tsx:27, archivos/page.tsx:49` | El estado vacío dice «crea el primero» cuando una búsqueda o filtro no encuentra nada. | `fix/ui-iconos-i18n-transiciones` |

## Plantillas de presupuesto

| ID | Severidad | Ubicación | Problema | Rama |
|-|-|-|-|-|
| quote-templates-1 | alta | `src/lib/pricing.ts:174 (subtotal += shipping); src/lib/services/quote-doc.ts:15-17; src/components/quote-document.tsx:39-43` | El envío se cobra en el total pero no se muestra: el documento no cuadra. | `feat/plantillas-presupuesto` |
| quote-templates-2 | media | `src/lib/services/quotes.ts:181-182; src/lib/services/quote-doc.ts:12,23-24; src/app/api/quotes/[id]/pdf/route.ts:24-28` | Los presupuestos enviados congelan solo la plantilla: datos del taller, logo, % de IVA y condiciones siguen vivos. | `feat/plantillas-presupuesto` |
| quote-templates-3 | media | `src/app/api/quotes/[id]/pdf/route.ts:25-28; src/lib/pdf.ts:28-30` | El origen del PDF sale del encabezado Host (SSRF y PDF guardado alterado). | `fix/seguridad` |
| quote-templates-4 | baja | `src/lib/pdf.ts:32; src/components/quote-document.tsx:30-58; src/app/globals.css:81` | Presupuestos largos: sin reglas de salto de página, sin encabezado ni pie repetidos, sin números de página. | `feat/plantillas-presupuesto` |
| quote-templates-5 | baja | `src/components/doc-template-editor.tsx:57; src/components/quote-document.tsx:31,39` | El editor muestra un campo de título para Cliente y Totales que el documento ignora. | `feat/plantillas-presupuesto` |
| quote-templates-6 | baja | `src/app/(app)/configuracion/page.tsx:45-50; src/components/doc-template-editor.tsx:65` | La muestra de vista previa oculta la mayoría de las secciones y no usa el ancho A4. | `feat/plantillas-presupuesto` |
| quote-templates-7 | baja | `src/lib/services/quote-doc.ts:17` | El precio unitario se muestra redondeado: cantidad x unitario no da el total de la línea. | `feat/plantillas-presupuesto` |
| quote-templates-8 | baja | `src/components/quote-document.tsx:46` | La sección de condiciones muestra un título vacío cuando no hay condiciones. | `feat/plantillas-presupuesto` |
| quote-templates-9 | baja | `src/components/doc-template-editor.tsx:36; src/components/quote-document.tsx:19` | El selector de color de marca muestra el color de fábrica y la vista previa el del taller. | `feat/plantillas-presupuesto` |

## Integridad de datos

| ID | Severidad | Ubicación | Problema | Rama |
|-|-|-|-|-|
| data-integrity-1 | alta | `src/lib/services/quotes.ts:105-117, 151-154` | saveQuote valida el precio bajo el costo después de reescribir el presupuesto. | `fix/presupuestos-pedidos-produccion` |
| data-integrity-2 | alta | `src/lib/services/orders.ts:22-78, 81-111; src/lib/services/production.ts:123-195; src/lib/services/catalog.ts:79-114; src/lib/services/printers.ts:56-77; src/lib/services/inventory.ts:155-169; src/actions/setup.ts:32-49` | Ninguna escritura de varios pasos usa transacción de base de datos. | `fix/presupuestos-pedidos-produccion` |
| data-integrity-4 | alta | `src/lib/services/orders.ts:165-191, 86-108; src/lib/services/production.ts:127-145; src/lib/services/catalog.ts:119-134` | Los cambios de estado son «revisar y luego actuar»: entregar un pedido dos veces descuenta stock dos veces. | `fix/presupuestos-pedidos-produccion` |
| data-integrity-5 | alta | `src/lib/services/production.ts:83; src/db/schema.ts:532` | moveJob escribe un valor fraccionario en la columna entera print_jobs.position, así que todo movimiento falla. | corregido en upstream (da5ea38: reorderJob y assignJob reemplazan a moveJob) |
| data-integrity-3 | media | `src/lib/services/orders.ts:54-58, 179-182, 204-205; src/lib/services/catalog.ts:83-107, 126-129; src/lib/services/production.ts:160, 167-171; src/lib/services/inventory.ts:83-86, 124-130` | Los contadores de stock se leen y reescriben: con escrituras concurrentes se pierden actualizaciones. | `fix/presupuestos-pedidos-produccion` |
| data-integrity-6 | media | `src/db/schema.ts:746; src/lib/services/printers.ts:49, 63-75, 99` | Tras quitar una impresora no se puede volver a conectar y cada intento deja una máquina huérfana. | `fix/presupuestos-pedidos-produccion` |
| data-integrity-9 | media | `drizzle/meta/ (0000-0010_snapshot.json only); drizzle/0011..0020*.sql` | Las instantáneas meta de drizzle llegan solo a 0010: el próximo drizzle-kit generate compara contra un esquema viejo. | `fix/presupuestos-pedidos-produccion` |
| data-integrity-10 | media | `src/actions/setup.ts:27; src/db/schema.ts:108, 377-385, 471-475, 587, 645; src/lib/pricing.ts:61-64` | Todo el dinero se guarda en unidades enteras, pero el asistente ofrece USD y EUR. | `fix/presupuestos-pedidos-produccion` |
| data-integrity-7 | baja | `src/lib/services/removal.ts:156-157, 163; src/lib/services/archive.ts:61-74` | Restaurar un material o producto también restaura bobinas o variantes borradas antes por separado. | `fix/presupuestos-pedidos-produccion` |
| data-integrity-8 | baja | `src/db/schema.ts (all tables, e.g. 397, 489, 549, 598, 632, 643); drizzle/*.sql` | No hay claves foráneas ni índices en las columnas que apuntan a otras tablas. | `fix/presupuestos-pedidos-produccion` |
| data-integrity-11 | baja | `src/lib/services/catalog.ts:91, 105-107` | createSale vende unidades reservadas y deja el stock en 0 como mínimo: el libro de stock deja de cuadrar. | `fix/inventario-ventas-laminado` |
| data-integrity-12 | baja | `src/app/(app)/inventario/page.tsx:30; src/lib/services/inventory.ts:12-20` | Consultas N+1 en la columna de costo de la lista de inventario. | `fix/presupuestos-pedidos-produccion` |
| data-integrity-13 | baja | `src/lib/slicer/presets.ts:8-17; src/lib/services/inventory.ts:60-64; src/lib/seed.ts:55-60; src/actions/setup.ts:34-46` | El seed y la generación de códigos no resisten concurrencia ni fallas parciales. | `fix/presupuestos-pedidos-produccion` |
| data-integrity-14 | baja | `src/db/schema.ts:366, 460, 513, 525, 610; src/lib/settings.ts:84-95` | No hay índice único en los números de documento. | `fix/presupuestos-pedidos-produccion` |

## Revisión visual en escritorio

| ID | Severidad | Ubicación | Problema | Rama |
|-|-|-|-|-|
| visual-desktop-1 | alta | `src/components/shell.tsx:13-19 (ICONS map, fallback `?? Package`); used at ui.tsx:11, (app)/page.tsx:77, shell.tsx:99, line-editor.tsx:109,112,131, file-bits.tsx:12, file-grid.tsx:38, photo-grid.tsx:31, queue-board.tsx:45, comparator.tsx:53, quick-sale.tsx:50, links-editor.tsx:46, profile-bits.tsx:243, catalog-bits.tsx:26, model-viewer.tsx:211,234, slicing-setup.tsx:26` | 10 nombres de ícono usados en la app faltan en el mapa Icon y todos se ven como el mismo cubo. | `fix/ui-iconos-i18n-transiciones` |
| visual-desktop-2 | alta | `src/components/line-bulk-edit.tsx:18; src/components/profile-bits.tsx:214; src/components/repair-button.tsx:19` | Las claves i18n en plural se llaman con {n} en vez de {count} y la interfaz muestra la clave cruda. | `fix/ui-iconos-i18n-transiciones` |
| visual-desktop-4 | media | `src/components/ui-client.tsx:20 (tab count pill), src/components/shell.tsx:115,117,135,139 (notification badge, Nuevo menu), src/app/(app)/page.tsx:77, src/components/printer-live.tsx:96, src/components/source-panel.tsx:40` | Texto oscuro fijo sobre el color de acento: no cumple contraste en las paletas Océano, Violeta y Contraste. | `fix/ui-iconos-i18n-transiciones` |
| visual-desktop-5 | media | `src/app/(app)/reportes/page.tsx:16,19,25; src/lib/stats.ts:43; src/app/(app)/pedidos/page.tsx:21 (+19 `toISOString().slice(0, 10)` sites across 16 files)` | La fecha «Hasta» del reporte avanza un día en cada Aplicar; el panel y las listas usan el «hoy» UTC. | `fix/inventario-ventas-laminado` |
| visual-desktop-3 | baja | `src/components/ui/kit.tsx:20-22 (ModalDialog: Dialog.Overlay / Dialog.Content)` | Los diálogos abren y cierran sin transición. | `fix/ui-iconos-i18n-transiciones` |
| visual-desktop-6 | baja | `src/lib/services/catalog.ts:108 (notify(... t('catalog.lowProductStock'), t('catalog.unitsLeftMinimumSuggestionProduc') ...)); src/lib/audit.ts:8` | Los avisos se guardan ya traducidos y quedan en español con la interfaz en inglés. | `fix/ui-iconos-i18n-transiciones` |
| visual-desktop-7 | baja | `src/components/ui.tsx:24 (Card header)` | Una tarjeta con acciones y sin título muestra una barra naranja huérfana. | `fix/ui-iconos-i18n-transiciones` |
| visual-desktop-8 | baja | `src/components/shell.tsx:75-99 (aside nav + footer)` | El último ítem de la barra lateral, «Configuración», queda oculto a 1440x900, también cuando es la página activa. | `fix/ui-iconos-i18n-transiciones` |
| visual-desktop-9 | baja | `src/i18n/es/inventory.ts:32,43,107; machines.ts:30,225; common.ts:81; slicer.ts:95; viewer.ts:55; queue.ts:13; src/components/photo-capture.tsx:41; ventas edit button '✎'; versiones '⬇'; pedidos late marker '⚠'` | Emojis y glifos unicode usados como íconos junto al set de Lucide. | `fix/ui-iconos-i18n-transiciones` |
| visual-desktop-10 | baja | `src/app/(app)/configuracion/page.tsx:55` | La columna «Detalle» del registro de auditoría muestra JSON crudo. | `fix/ui-iconos-i18n-transiciones` |
| visual-desktop-12 | baja | `src/components/shell.tsx:28,103-107` | La miga de pan queda vacía en páginas fuera de la barra lateral (p. ej. Notificaciones). | `fix/ui-iconos-i18n-transiciones` |

## Flujos completos y móvil

| ID | Severidad | Ubicación | Problema | Rama |
|-|-|-|-|-|
| visual-flows-mobile-1 | alta | `src/components/quote-editor.tsx:57-60,67 + src/actions/quotes.ts:17` | Lo que se escribe mientras corre el primer autoguardado de un presupuesto nuevo se pierde sin aviso. | `fix/presupuestos-pedidos-produccion` |
| visual-flows-mobile-2 | alta | `src/app/(app)/cola/page.tsx:16 ; src/components/line-editor.tsx:143 ; src/lib/services/orders.ts:135` | Los trabajos en una máquina simulada desaparecen de la cola de producción. | `fix/presupuestos-pedidos-produccion` |
| visual-flows-mobile-4 | alta | `src/components/shell.tsx:59,133-137` | La barra inferior móvil se parte en 2 filas y tapa el botón Guardar del presupuesto. | `fix/ui-iconos-i18n-transiciones` |
| visual-flows-mobile-3 | media | `src/lib/services/catalog.ts:89 ; src/actions/catalog.ts:21` | El Operador puede vender productos del catálogo a cualquier precio, incluso bajo el costo. | `fix/seguridad` |
| visual-flows-mobile-5 | media | `src/components/shell.tsx:13-19` | La mayoría de los íconos se ven como una caja: los nombres sin mapear caen en Package. | `fix/ui-iconos-i18n-transiciones` |
| visual-flows-mobile-6 | media | `src/lib/services/orders.ts:215 ; src/lib/services/catalog.ts:100 ; src/lib/services/inventory.ts:53 ; src/lib/stats.ts:43 ; src/app/(app)/pedidos/page.tsx:21 ; src/lib/services/quotes.ts:257 ; src/lib/services/production.ts:259` | Las fechas de «hoy» usan UTC: pagos, ventas y bobinas después de las 21:00 quedan con la fecha de mañana. | `fix/inventario-ventas-laminado` |
| visual-flows-mobile-7 | media | `src/app/(app)/pedidos/[id]/page.tsx:59-60 ; src/components/quick-sale.tsx:37 ; quote read-only view` | Las páginas de detalle se desbordan horizontalmente en móvil (pedido, presupuesto, venta rápida). | `fix/ui-iconos-i18n-transiciones` |
| visual-flows-mobile-10 | media | `src/lib/services/catalog.ts:91,105` | La venta rápida con sobreventa deja el stock en 0 sin avisar y el libro diverge. | `fix/inventario-ventas-laminado` |
| visual-flows-mobile-8 | baja | `src/app/imprimir/presupuesto/[id]/page.tsx:22` | La página de respaldo del PDF no tiene salida: ni botón de imprimir ni forma de volver. | `fix/ui-iconos-i18n-transiciones` |
| visual-flows-mobile-9 | baja | `src/app/(app)/cola/page.tsx:16` | Las columnas de la cola cambian de orden cuando cambia el estado de una máquina. | `fix/presupuestos-pedidos-produccion` |
| visual-flows-mobile-11 | baja | `src/components/doc-template-editor.tsx:36 vs src/components/quote-document.tsx:20` | La muestra de color del editor de plantillas no es el color del documento. | `feat/plantillas-presupuesto` |
| visual-flows-mobile-12 | baja | `src/components/quote-document.tsx:33,42 ; src/lib/services/quote-doc.ts:19,22` | Documento del presupuesto: fila de impuesto confusa, un «·» inicial suelto y faltan los datos tributarios del cliente. | `feat/plantillas-presupuesto` |
| visual-flows-mobile-13 | baja | `src/components/line-editor.tsx:143` | El nombre de la máquina muestra «(simulada) (simulada)», con el sufijo fijo en español. | `fix/ui-iconos-i18n-transiciones` |
| visual-flows-mobile-14 | baja | `src/actions/customers.ts:11-17` | El formulario de cliente acepta un RUT y un teléfono inválidos; el % de abono solo se limita en el HTML. | `fix/seguridad` |
| visual-flows-mobile-15 | baja | `src/components/doc-template-editor.tsx (layout)` | La vista previa de la plantilla queda ~2200 px bajo los controles en móvil. | `fix/ui-iconos-i18n-transiciones` |

## Anexo: hallazgos rechazados

La verificación descartó estos hallazgos. No se corrigen.

| ID | Hallazgo y motivo |
|-|-|
| flow-quotes-orders-4 | updateOrderAction copia el objeto del cliente en el pedido. Rechazado: la acción no se importa en ningún lado (código muerto); la edición usa editRecordAction, que filtra campos. |
| flow-quotes-orders-21 | expireQuotes vence borradores mientras se editan. Rechazado: es el comportamiento documentado y la interfaz ofrece cómo recuperarlos. |
| flow-inventory-catalog-sales-14 | La deduplicación de clientes compara solo el nombre exacto. Rechazado: regla simple a propósito; lo demás es una función nueva. |
| flow-printers-slicer-jobs-4 | Los trabajos en segundo plano no tienen tope de tiempo. Rechazado: especulativo, y el arreglo propuesto no sirve para trabajo de CPU síncrono. |
| flow-printers-slicer-jobs-5 | El worker reencola trabajos de otro worker vivo. Rechazado: no ocurre con el docker-compose entregado (un solo worker). |
| flow-printers-slicer-jobs-12 | La detección de timeout busca «timeout» en la salida de OrcaSlicer. Rechazado: frágil, pero sin evidencia de que falle. |
| i18n-10 | Ajustes del seed en español. Rechazado: son datos del taller que el usuario edita. |
| iconography-10 | Botones con prefijo «+ » en texto. Rechazado: sin defecto funcional ni de accesibilidad; pulido visual. |
| iconography-11 | Grosor de trazo 2 vs 1.8 en íconos. Rechazado: detalle de estilo; lucide ya pone aria-hidden. |
| motion-2 | La animación de entrada de página parpadea. Rechazado: el análisis del montaje muestra que no ocurre. |
| motion-6 | Menús y paneles sin animación de salida. Rechazado: ya está en 13-pendientes (migrar al kit Radix). |
| motion-9 | Las barras de progreso animan el ancho. Rechazado: detalle sin efecto visible medido. |
| quote-templates-10 | Faltan campos comunes en la plantilla. Rechazado: lista de deseos, no un defecto. |
| visual-desktop-11 | Las acciones del encabezado del Laminador cambian entre pestañas. Rechazado: es a propósito. |
| visual-flows-mobile-16 | La cola promete arrastrar y soltar que no existe. Rechazado: sí existe en escritorio. |
