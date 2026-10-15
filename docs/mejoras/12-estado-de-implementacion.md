# 12 · Estado de implementación (R1–R6)

Qué se construyó de cada release, qué quedó fuera a propósito y por qué. Ramas apiladas: `feature/r1-cimientos` ⊂ `r2-perfiles` ⊂ `r3-cotizaciones` ⊂ `r4-biblioteca` ⊂ **`feature/r5-r6-estudio-paletas`** (integra todo). Ninguna se ha fusionado a `development`; no hay PR abierto.

Pendientes consolidados: [`13-pendientes.md`](13-pendientes.md).

Convención: ✅ hecho y probado · ◐ hecho en parte (se indica el recorte) · ✗ no se hizo.

## R1 · Cimientos, PDF y arranque
| Paquete | Estado | Notas |
|---|---|---|
| N10 asistente inicial | ◐ | Token de un solo uso (hash, regenerado en cada arranque), creación de cuenta en una sola operación, **sin contraseña `admin1234`**, lista de puesta en marcha (datos fiscales y marca con formulario; el resto enlaza a su pantalla) y alertas en Inicio por lo omitido. **Falta:** modo Rápido/Completo, paso «datos de demostración», re-ejecución desde Configuración |
| F0 0.1 / 0.5 / 0.7 | ✅ | `loading` / `error` / `not-found`; salud del sistema (Orca, Chromium, ffmpeg, almacenamiento) en Configuración → Sistema; fallo explícito del PDF; `playwright` a dependencias y Dockerfile sin `\|\| true`; fecha `dd-mm-aaaa` |
| F0 0.2 / 0.3 / 0.4 / 0.6 | ✅ | Hechos en la fase de pendientes (ver más abajo) |
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

## Fase de pendientes (P0–P5) · rama `feature/p0-estabilizacion` → `development` y `feature/p4-biblioteca`
Plan: [`14-plan-de-implementacion-pendientes.md`](14-plan-de-implementacion-pendientes.md). Lo que sigue pendiente: [`13-pendientes.md`](13-pendientes.md).

| Paquete | Estado | Notas |
|---|---|---|
| P0 estabilización | ✅ | Pestañas de Reportes sin corte, recuperación de análisis «procesando» al arrancar, desbordes de `/notificaciones` y `/cola` corregidos (reproducidos con datos de e2e), e2e con esperas de hidratación y navegación por `href` (los clics tras `networkidle` se perdían de forma intermitente) |
| N10 modo Rápido / Completo | ✅ | Elegir modo, cargar datos de demostración desde el asistente (sin usuarios de ejemplo), reabrir desde Configuración → Sistema; e2e con segunda instancia y base vacía (`20-asistente`) |
| F0.2 guarda de borrado | ✅ | Un material en presupuestos/pedidos abiertos o variantes activas no se elimina; se ofrece «Reemplazar y eliminar» |
| F0.3 compatibilidad | ✅ | Las calidades de otra impresora quedan en un grupo aparte (misma impresora con otra boquilla sigue siendo compatible) en laminador, Estudio, comparador y línea de cotización |
| F0.4 / F0.6 | ✅ | Aviso «orientación solo de prueba» en el visor (copy VIS-07 ya estaba) · iconos del shell sobre `lucide-react` |
| Kit de componentes | ◐ | `components/ui/kit.tsx` con Dialog, Select, Tabs, Dropdown y Switch (Radix). **Solo el modal propio se migró a Dialog** (con foco al primer campo); el resto queda disponible para migrar por pantalla |
| P2 proveedores | ✅ | Marcar «verificado» registra fecha y quién; se muestra en la lista |
| P2 recalcular con tarifas actuales | ✅ | Vista previa línea a línea (antes/ahora/diferencia) y nueva versión; no cambia la versión original |
| P3 versiones y actividad | ✅ | Diff entre versiones (líneas agregadas/quitadas/cambiadas y total), pestaña «Actividad» con los eventos del presupuesto |
| P3 tablero | ✅ | Vista «Tablero» por estado (solo lectura: los estados siguen su flujo) |
| P3 seguimiento | ✅ | Plazos configurables (días tras enviar, por defecto 3 y 7); una notificación por plazo, sin repetir |
| P4 duplicados | ✅ | SHA-256 en el navegador y diálogo antes de subir (omitir / subir igual / ver el existente) |
| P4 papelera | ✅ | Los archivos 3D eliminados van a «Archivados» y se restauran |
| P5 `--orient` | ✅ | Casilla «Orientar automáticamente» en el laminador; entra en la clave de caché; probado con Orca real |
| P5 `--pipe` | ✅ | Progreso real (porcentaje y etapa) con tubería con nombre; la barra aparece en el panel de laminado |
| P2 «Mis perfiles» y líneas | ✅ | Filtro «Mis perfiles» (personalizados e importados) y edición masiva de costo/stock mínimo por marca + línea (sin tabla `filament_lines`) |
| P4 etiquetado automático | ✅ | Opcional (Configuración → Sistema): solo reglas con confianza ≥ 0,8; la IA nunca se aplica sola |
| P5 orientación por modelo | ✅ | `model_files.auto_orient` (migración `0012`); la casilla del laminador se recuerda |
| P5 cola desde el laminado | ✅ | «Agregar a la cola» crea un trabajo de prueba con máquina, material, gramos y horas del laminado |
| P5 visor | ◐ | Modos por caudal, ventilador, temperatura y herramienta (formato `MFG3`; los archivos analizados antes siguen en MFG2 y no muestran los tres últimos). Faltan viajes/retracciones y comparar A/B |
| P5 multicolor | ✅ | Un material por extrusor en proyectos 3MF multicolor; OrcaSlicer exige colores distintos por filamento (si no, error −100), por eso cada extrusor extra recibe uno; probado con Orca real (`samples/multicolor-2-extrusores.3mf`) |
| P6 | ◐ | Pestañas de Configuración agrupadas, alertas de Inicio por urgencia (máx. 5 por grupo), colores de estado semánticos (`text-danger/warn/ok`, 54 usos). Sin regresión visual con capturas |


## Fase de cierre (esquemas, cola y Estudio) · rama `feature/jobs-queue`
Migraciones nuevas: `0013` jobs · `0014` quality_presets · `0015`/`0016` vínculo material→perfil (copiar y luego contraer) · `0017` filament_lines · `0018` carpetas y etiquetas. Todas expanden y copian antes de contraer; `0015` copia cada vínculo heredado a la tabla nueva y recién `0016` elimina la columna, así que ningún dato se pierde (conviene igualmente un respaldo previo desde Configuración → Respaldo).

| Paquete | Estado | Notas |
|---|---|---|
| P4 cola `jobs` persistente | ✅ | Tabla `jobs`, worker con reintentos y espera creciente, recuperación de lo «en ejecución» tras un reinicio, panel en Configuración → Sistema con reintento manual. Hoy lo usa el análisis de archivos; los nuevos tipos se registran en `lib/jobs.ts` |
| P2 `quality_presets` + `ProfileRef` | ✅ | Calidades editables (Configuración → Calidades), sembradas desde las de fábrica (backfill idempotente); sirven para cualquier boquilla; los chips del laminador salen de la tabla. `ProfileRef` = perfil concreto o intención de calidad resuelta contra una impresora |
| P2 contraer `materials.filament_profile_id` | ✅ | Tabla `material_filament_links` (general o por impresora). Orden de resolución del filamento: explícito → perfil del material (el de esa impresora primero) → perfil de la línea → sugerido por marca/tipo |
| P2 `filament_lines` | ✅ | Entidad con costo, stock mínimo y perfil de laminado por defecto; backfill desde marca + línea; edición masiva en Inventario |
| P2 diff contra fábrica | ✅ | El editor de perfiles lista cada cambio con su valor de fábrica |
| P4 carpetas y etiquetas | ✅ | Carpetas jerárquicas (`A/B`) que existen aunque estén vacías, renombrar/mover arrastra subcarpetas y archivos; colores de etiquetas |
| P4 reparación de malla | ✅ | Soldar, quitar degenerados/repetidos, orientar, tapar huecos pequeños; se guarda como versión nueva. No reconstruye zonas grandes |
| P4 STEP | ✅ | Estaba programado pero `occt-import-js` no era dependencia (fallaba al convertir); ahora se instala y está probado con un cubo STEP |
| P4 miniatura giratoria | ✅ | WebP animado de 12 cuadros que gira al pasar el mouse sobre la tarjeta |
| P4 3MF inteligente | ✅ | «Usar los ajustes de este proyecto»: impresora, calidad y filamentos del 3MF pasan a perfiles |
| P4 etiquetado con imagen | ✅ | La miniatura viaja a la IA solo si el taller permitió enviar imágenes; si no, reintenta solo con texto |
| P4 pintura por cara | ◐ | Decodifica `paint_color`; una cara subdividida en varios colores toma el de su primera hoja |
| P5 visor | ✅ | Caudal, ventilador, temperatura, herramienta, viajes y retracciones (`MFG3`); los archivos analizados antes no traen los datos nuevos hasta volver a analizarlos |
| P5 comparar A/B | ✅ | Estudio: base y ajustes lado a lado |
| P5 SSE | ✅ | `/api/runs/stream` con respaldo de sondeo |
| P5 asesor de IA en el Estudio | ✅ | Los candidatos se lamina con ajustes de sesión sobre el perfil real: ya no se crean perfiles ocultos |
| P5 esquema ampliado | ✅ | `npm run orca:install` genera `data/orca-schema.json` (≈450 claves) desde el código fuente de OrcaSlicer; no se versiona (AGPL). Entran como página «Otros (OrcaSlicer)», nivel Experto, con el texto en inglés de Orca |
| P5 worker aislado | ✅ | `MF_EXTERNAL_WORKER=1` + `npm run worker` (servicio `worker` en docker-compose); requiere Postgres |
| P5 estimación rápida | ✅ | En el Estudio, mientras Orca calcula, se muestra una estimación aproximada desde la malla |
| P6 | ◐ | Regresión visual con líneas base (`npm run test:visual`, opt-in), cajas de aviso semánticas (`box-warn`/`box-danger`), etiqueta de resina en la cola. Quedan colores literales de chips y el barrido de Reportes |

## Decisiones técnicas que conviene revisar
1. **Compatibilidad hacia atrás por encima de la limpieza:** nada se eliminó (columnas heredadas, modelo de precios histórico, `taxMode`). Cada «contraer» necesita su propia migración con vista previa.
2. **Migraciones nuevas** (`drizzle/0006`–`0010`): proveedores, IVA como casilla, plantilla/PDF, origen de modelos, `inputs` del laminado. Son aditivas.
3. **Flakiness de e2e:** las pruebas que suben archivos o navegan justo tras un clic dependían de la hidratación; se corrigieron las del Estudio y la subida (`waitForURL`/`networkidle`). Quedan 1–2 pruebas antiguas que fallan de forma intermitente bajo carga (02 y 15), también al repetirlas sin cambios.
4. **Seguridad:** el asistente inicial no deja cuentas sin credencial; el importador por URL bloquea IP privadas incluso tras redirecciones; la plantilla de documentos es JSON (sin HTML); el logo se re-codifica (sin SVG).

## Cambios por decisiones del equipo (fase final)
- Modelo de precios: se eliminó el «heredado»; `Rates` ya no tiene `pricingModel` y `taxMode` solo toma `sumado`/`exento` según la casilla del presupuesto. Margen por defecto 40 % sobre la venta neta.
- Calculadora rápida con varias piezas y nivel Básico/Avanzado recordado por usuario (migración `0019`).
- IVA de compras por proveedor (`suppliers.recovers_vat`, migración `0020`).
- Bloques de texto libre en el documento del presupuesto; «Ver detalles» como página propia.
- Se retiraron las pruebas de regresión visual.
