# 12 · Estado de implementación (R1–R6)

Qué se construyó de cada release, qué quedó fuera a propósito y por qué. Ramas apiladas: `feature/r1-cimientos` ⊂ `r2-perfiles` ⊂ `r3-cotizaciones` ⊂ `r4-biblioteca` ⊂ **`feature/r5-r6-estudio-paletas`** (integra todo). Ninguna se ha fusionado a `development`; no hay PR abierto.

Pendientes consolidados: [`13-pendientes.md`](13-pendientes.md).

Convención: ✅ hecho y probado · ◐ hecho en parte (se indica el recorte) · ✗ no se hizo.

## R1 · Cimientos, PDF y arranque
| Paquete | Estado | Notas |
|---|---|---|
| N10 asistente inicial | ◐ | Token de un solo uso (hash, regenerado en cada arranque), creación de cuenta en una sola operación, **sin contraseña `admin1234`**, lista de puesta en marcha (datos fiscales y marca con formulario; el resto enlaza a su pantalla) y alertas en Inicio por lo omitido. **Falta:** modo Rápido/Completo, paso «datos de demostración», re-ejecución desde Configuración |
| F0 0.1 / 0.5 / 0.7 | ✅ | `loading` / `error` / `not-found`; salud del sistema (Orca, Chromium, ffmpeg, almacenamiento) en Configuración → Sistema; fallo explícito del PDF; `playwright` a dependencias y Dockerfile sin `\|\| true`; fecha `dd-mm-aaaa` |
| F0 0.2 / 0.3 / 0.4 / 0.6 | ✗ | Guarda de borrado «reemplazar/archivar», filtros de compatibilidad, arreglos de copy, unificar iconos |
| WP-6.1' kit + temas | ◐ | Arquitectura de temas y marca derivada con contraste AA. **No se adoptó shadcn/Radix**: ningún componente se migró (la decisión de S8 sigue vigente para cuando se haga) |

## R2 · Perfiles y filamentos (+ R2b)
| Paquete | Estado | Notas |
|---|---|---|
| Material desacoplado del perfil de filamento (D1) | ◐ | Resolvedor (explícito → ficha heredada → sugerido por marca/tipo). El selector sale del formulario de material y la configuración guiada ya no lo exige. **Se conserva la columna `materials.filament_profile_id`** como lectura heredada (fase «contraer» pendiente) |
| Calidad por intención | ◐ | Chips Borrador/Estándar/Fino/Resistente resueltos por impresora y boquilla (reutilizando las plantillas por boquilla). **No** hay tabla `quality_presets` ni `ProfileRef` ni backfill |
| N4 alta rápida | ✅ | Datos comunes + tabla de colores (hex sugerido por nombre), pegar lista, vista previa con duplicados, ingreso de bobinas. Catálogo con marcas de Chile. **Agrupación por línea: virtual** (sin tabla `filament_lines`) |
| N4b proveedores | ✅ | Tabla, siembra (todo «sin verificar»), pestaña en Configuración, «dónde compré» en bobinas |
| N1a color en el visor | ✅ | Selector de material con su color |
| R2b calculadora fase 1 | ◐ | Modelo `pricingModel: 'neto'` (margen sobre venta, falla `f/(1−f)`, factor de tiempo en todos los modos, IVA como casilla del presupuesto, avisos de datos incompletos). **El modelo histórico sigue por defecto** en instalaciones existentes; las nuevas arrancan en `neto` (margen 40 %). Falta «recalcular con tarifas actuales» y el perfil «Heredado» como entidad |

## R3 · Cotizaciones y documentos
| Paquete | Estado | Notas |
|---|---|---|
| N7a plantilla L1 + PDF v2 | ✅ | Modelo JSON tipado (nunca HTML), editor con vista previa en vivo, logo (PNG/JPG/WebP, re-codificado), un único `QuoteDocument` para vista cliente, PDF y previa. **Chromium persistente**; al enviar se **congela la plantilla** y se guarda la copia del PDF |
| N5 / N6 listado y detalle | ◐ | KPIs, segmentos con conteo, filas ricas, vista tabla recordada, «Ver detalles» por línea (desplegable), vista cliente, resumen al aprobar, alertas de seguimiento. **Falta:** kanban (opcional), diff de versiones, pestaña de actividad, «Ver detalles» como modal/página, recordatorios configurables |
| N7b editor de bloques | ✗ | Opcional, posterior |

## R4 · Biblioteca e importación
| Paquete | Estado | Notas |
|---|---|---|
| N1b multicolor / AMS | ✅ | Lectura de `filament_colour/type` y extrusor por objeto; la malla sale coloreada por extrusor en el visor; ficha con ranuras. **Pintura por cara:** solo se avisa |
| N3 origen por URL | ◐ | Ruta A (enlace + 3MF subido a mano): metadatos públicos, licencia normalizada y uso comercial, anti-SSRF, aviso de licencia al cotizar (sin bloquear). **Ruta B (descarga automática con cuenta Bambu) no implementada; S6 sigue sin verificarse** (el sandbox bloquea MakerWorld). Imágenes: se guarda la URL, no se descargan |
| N2 etiquetas | ✅ | Reglas (nombre, carpeta, sitio, forma) + IA opcional (`files.tag`), validación determinista y vocabulario, procedencia por etiqueta. Se **sugiere y confirma** (no hay aplicación automática) |
| F2 biblioteca | ◐ | Selección múltiple y acciones masivas, insignias (cabe en, laminados, presupuestos, multicolor), administración y combinación de etiquetas, importación de ZIP con carpetas. **Falta:** cola `jobs` persistente, diálogo de duplicados previo a la subida, miniatura giratoria, tablas `tags/folders`, papelera, colecciones, STEP, reparación de malla |

## R5 · Estudio de laminado (nivel A)
| Paquete | Estado | Notas |
|---|---|---|
| Ajustes de sesión | ✅ | `slice_runs.inputs.overrides` (en la clave de caché), **sin perfiles fantasma**, cancelación (`SIGKILL` / cola) |
| Panel de parámetros | ◐ | Esquema **curado de 64 claves** bilingüe (verificadas contra PrintConfig.cpp 2.4.2), búsqueda es/en, niveles, modificado + restablecer, validación en línea. **No** se generó desde Orca (S2 queda como camino de ampliación; AGPL: generar al instalar) |
| Estudio | ✅ | Máquina/calidad/material/copias, re-laminado con debounce, estado «desactualizado», deltas contra la base, guardar como perfil nuevo o como nueva versión, usar en presupuesto |
| Visor v2 | ◐ | Color por tipo / velocidad / ancho / tiempo de capa, tiempo por tipo. **Falta:** flujo, temperatura, ventilador, herramienta, ribbons, movimientos de viaje, comparar A/B |
| 5.4 Explorar | ✅ | Barrido de un parámetro y rejilla de dos (≤ 12), tabla, dispersión tiempo-vs-material con frontera de Pareto, «usar esta» |
| Pendiente | ✗ | Edición de placa (nivel B), `--pipe`/SSE para progreso real, `--orient/--arrange` expuestos, worker aislado, vista rápida aproximada, integración del asesor de IA dentro del Estudio |

## R6 · Pulido y paletas
| Paquete | Estado | Notas |
|---|---|---|
| N9b paletas | ✅ | 6 paletas × claro/oscuro/sistema, contraste AA verificado por prueba, preferencia en `localStorage` con script de arranque (sin parpadeo), paleta por defecto del taller; los visores 3D respetan el modo elegido. La marca del taller personaliza la paleta «capa a capa» |
| 6.3 regresión | ◐ | Prueba estructural (24 pantallas × 360/768/1280, claro/oscuro): sin desborde horizontal, sin pantalla de error, sin violaciones graves de axe; matriz paleta×tema de contraste. **Sin comparación de capturas** (las líneas base no son portables entre máquinas) |
| 4.3 ficha de máquina | ✅ | Tarjeta «Laminado» (lista/falta configurar, impresora, calidad, boquilla, últimos laminados) |
| 6.2 barrido de pantallas | ◐ | Solo lo que encontró la regresión (nombre accesible del logo, campo de logo, desborde de enlaces). Sin rediseño de clientes/pedidos/cola/ventas/galería/reportes |

## Decisiones técnicas que conviene revisar
1. **Compatibilidad hacia atrás por encima de la limpieza:** nada se eliminó (columnas heredadas, modelo de precios histórico, `taxMode`). Cada «contraer» necesita su propia migración con vista previa.
2. **Migraciones nuevas** (`drizzle/0006`–`0010`): proveedores, IVA como casilla, plantilla/PDF, origen de modelos, `inputs` del laminado. Son aditivas.
3. **Flakiness de e2e:** las pruebas que suben archivos o navegan justo tras un clic dependían de la hidratación; se corrigieron las del Estudio y la subida (`waitForURL`/`networkidle`). Quedan 1–2 pruebas antiguas que fallan de forma intermitente bajo carga (02 y 15), también al repetirlas sin cambios.
4. **Seguridad:** el asistente inicial no deja cuentas sin credencial; el importador por URL bloquea IP privadas incluso tras redirecciones; la plantilla de documentos es JSON (sin HTML); el logo se re-codifica (sin SVG).
