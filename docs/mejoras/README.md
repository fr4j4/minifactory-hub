# Mejoras de interfaz y usabilidad · Análisis y propuesta

> **Estado: solo documentación.** No se ha implementado nada. Este conjunto de documentos analiza las interfaces e interacciones del sitio, propone mejoras y las estima. El análisis es **estático** (código + capturas existentes en `docs/reporte`); no se ejecutó la aplicación. Lo no verificado está marcado _(por verificar)_.
>
> **Línea base:** `development` @ `54a4bc6`. Se revalidó tras integrar el trabajo reciente (i18n es/en, perfiles por boquilla, guarda de borrado, asesor de IA) y se **alinea con las specs existentes** `docs/spec-calculadora.md`, `docs/spec-ia.md` y `docs/revision-perfiles-maquinas.md` en lugar de duplicarlas (ver `01-diagnostico.md §0.1`).

## Resumen ejecutivo

**Lo que está bien:** identidad visual «capa a capa» coherente, motor de laminado real (OrcaSlicer) con caché y versionado de perfiles, visor 3D con herramientas útiles, subida reanudable, presupuestos con congelado de precios y auditoría, accesibilidad probada; y, recién integrado, **i18n es/en**, **perfiles por boquilla** con reglas verificadas, **guarda de borrado** de perfiles en uso, **asesor de perfiles** con validación determinista, ficha de desempeño y archivar/restaurar.

**Lo que más pesa hoy (los 8 hallazgos de mayor impacto, ya revalidados):**

| # | Hallazgo | ID |
|---|---|---|
| 1 | El **material del inventario está atado a un perfil de filamento** (si no lo tiene, desaparece del laminador) y la **«calidad» es una fila por máquina/boquilla** (las plantillas por boquilla la multiplican aún más) | PFC-01, 02, 11 |
| 2 | Los **selectores** ya ordenan por boquilla, pero **no filtran por compatibilidad de impresora** (se puede elegir un proceso de otra marca y fallar después de esperar) _(parcial)_ | PFC-03 |
| 3 | Las **rotaciones/escala del visor 3D no llegan al laminador**: se puede laminar una orientación distinta de la que se ve | BIB-08 |
| 4 | **Laminar = 4 selects + botón**; no hay ajustes en el momento, y el editor de perfil (mejorado con grupos y ayudas de boquilla) sigue siendo una lista corta + buscador de claves en inglés. No es un «slicer configurable» | VIS-01, PFC-06 |
| 5 | **Visor de G-code básico** (5 tipos genéricos, líneas de 1 px, relleno muestreado, sin modos por velocidad/flujo/tiempo) | VIS-02 |
| 6 | **Detalle de presupuesto enviado/aprobado pobre**: sin miniaturas, desglose de costos, versiones comparables ni actividad | COT-02 |
| 7 | **PDF frágil y básico**: Chromium lanzado en cada petición, **fallo silencioso** (entrega HTML creyendo que es PDF), sin logo, sin paginación ni cierre comercial, sin copia guardada | PDF-01…06 |
| 8 | **Biblioteca sin escala ni rutinas de importación**: duplicados solo avisados, procesamiento que se pierde al reiniciar, sin ZIP/lotes/acciones masivas | BIB-01…05 |

**Propuesta en una línea por eje**

- **Perfiles/filamentos/calidad:** referencia de fábrica + cambios (copy-on-write), **calidades como presets de intención** resueltos por (máquina, boquilla) —generalizando las plantillas por boquilla ya hechas—, **filamento como recomendación opcional** (nunca bloquea) y datos comerciales como única fuente de verdad → `02`.
- **Biblioteca:** cola persistente, duplicados con decisión, ZIP/lote, etiquetas/carpetas reales, acciones masivas, miniaturas giratorias e insignias («cabe», «usado en…») → `03`.
- **Estudio de laminado:** pantalla única con placa, **panel de parámetros por secciones** (simple/avanzado/experto, es/en), **ajustes de sesión** con re-laminado casi en vivo (reemplazan los «perfiles fantasma» del asesor de IA), **deltas** contra una base, **visor de G-code v2** y **exploración** de parámetros; alcance honesto (el motor es el CLI de Orca) → `04`.
- **Cotizaciones y PDF:** tablero con KPIs, detalle con pestañas (resumen, líneas, costos, versiones con diff, actividad, vista cliente), un solo componente para vista previa y PDF, **PDF v2** con logo, paginación, cierre comercial, navegador persistente y **copia almacenada** → `05`.
- **Calculadoras y mantenedores:** la calculadora **ya está especificada** (`docs/spec-calculadora.md`); aquí se agregan complementos (barra de costos «en capas», selectores ricos, enlace al Estudio, chips «¿y si…?») y se coordinan totales/IVA con presupuestos y PDF; materiales agrupados por línea con carretes visuales; «Mis perfiles» con diff → `06`.
- **Visual y usabilidad:** kit de componentes (Select rico, Tabs sin recarga, Drawer, DataTable…), esqueletos de carga, íconos unificados, fechas es-CL, regresión visual → `07`.

**Esfuerzo (orden de magnitud), tras la segunda ronda:** ≈ **164–271 jornadas**, probable **≈ 212** (≈ 244 con 15 % de contingencia), sin opcionales (editor de plantillas con bloques, widgets de Inicio y edición de placa suman ≈ 41 más). Antes de la segunda ronda eran ≈ 118: la ampliación (+93,5) viene de las decisiones D14/E2/E3 y de once requisitos nuevos (asistente inicial, importador MakerWorld, editor de plantillas de documentos en Configuración, librería visual con temas, alta masiva de filamentos con marcas y proveedores de Chile, multicolor/AMS, etiquetas por IA, detalle y vista tabla de cotizaciones). Entregable en **R0 + 6 releases** y con «recortes posibles» si hay que acotar → `09`, `10`, `11`.

## Índice

| Documento | Contenido |
|---|---|
| [`01-diagnostico.md`](01-diagnostico.md) | Hallazgos con ID, severidad y evidencia por archivo/línea; lo que conviene conservar |
| [`02-perfiles-filamentos-calidad.md`](02-perfiles-filamentos-calidad.md) | Desacople material↔perfil, calidades, resolvedor, migración |
| [`03-biblioteca-modelos-3d.md`](03-biblioteca-modelos-3d.md) | Importación, listado, detalle, datos y pruebas |
| [`04-estudio-de-laminado.md`](04-estudio-de-laminado.md) | Slicer embebido: alcance real, spikes, UX, visor de capas, exploración, riesgos |
| [`05-cotizaciones-y-pdf.md`](05-cotizaciones-y-pdf.md) | Listado, detalle, editor, PDF v2 y su arquitectura |
| [`06-calculadoras-y-mantenedores.md`](06-calculadoras-y-mantenedores.md) | Alineación con la spec de calculadora, filamentos, perfiles, máquinas |
| [`07-sistema-visual.md`](07-sistema-visual.md) | Principios, kit de componentes, mejoras visuales, migración |
| [`08-otras-mejoras.md`](08-otras-mejoras.md) | Robustez, rendimiento, flujo, calidad de código, arreglos rápidos y lo que **no** conviene hacer |
| [`09-plan-y-estimaciones.md`](09-plan-y-estimaciones.md) | Paquetes de trabajo, estimaciones (opt./prob./pes.), releases, dependencias, recortes, riesgos |
| [`11-datos-iniciales-proveedores.md`](11-datos-iniciales-proveedores.md) | **Datos iniciales:** directorio de proveedores y tiendas de Chile y del extranjero (TodoToner, Imperio 3D, Maxi3D, Mercado Libre…), con evidencia, propuesta de datos y lista de verificación; datos en `datos/proveedores-iniciales.json` |
| [`10-decisiones-y-alcance-ampliado.md`](10-decisiones-y-alcance-ampliado.md) | **Segunda ronda:** decisiones D1–E3 respondidas, su impacto y los requisitos N1–N10 (color y AMS en 3MF, etiquetas por IA, importador MakerWorld, alta masiva de filamentos, detalle y vista tabla de cotizaciones, editor de documentos, librería visual, temas, asistente inicial) |

## Decisiones tomadas (primera ronda)

Respondidas por el equipo; el detalle y su impacto están en [`10-decisiones-y-alcance-ampliado.md`](10-decisiones-y-alcance-ampliado.md) §1.

| # | Decisión |
|---|---|
| D1 | **Eliminar** el perfil de filamento del material (el color del filamento se ve en el visor 3D y se detecta el AMS en 3MF) |
| D2 | Calidades como presets de intención |
| D3 | Temperaturas del material desde el perfil resuelto (solo lectura) |
| D4 | STEP: solo adjuntar y corregir el texto |
| D5 | Importación por URL **incluida** en R4 (mejor esfuerzo) |
| D6 | Reparación de mallas: fase posterior (avisar y guiar) |
| D7 | Estudio de laminado nivel **A** (parámetros, vista previa, exploración) |
| D8 | «Vista rápida aproximada»: decidir tras medir tiempos (S3) |
| D9 | ≈ 120 parámetros curados en es y en |
| D10 | PDF con Chromium persistente y copia guardada al enviar |
| D11 | Sin enlace público para el cliente |
| D12 | Transferencia, anticipo y plazo: configurables y visibles por defecto |
| D13 | Kanban de cotizaciones como vista opcional |
| D14 | Materiales agrupados por marca y línea **desde el inicio** |
| E1 | Orden R1 → R2 → R3 → R4 → R5 → R6 |
| E2 | Fase 1 de la spec de calculadora **antes** de R3 |
| E3 | Spikes **ahora**, antes de comprometer fechas |

## Decisiones tomadas (segunda ronda)

Respondidas en el artefacto; detalle y matices en `10` §1.0.

| # | Decisión | Matiz |
|---|---|---|
| F1 | «Ver detalles»: en el sitio (modal y página) y anexo opcional en el PDF | — |
| F2 | Vista tabla en listado y en líneas de la cotización | — |
| F3 | «Sin editor por ahora» | **Aclaración:** el editor es de **plantillas, en Configuración** (se usa al generar documentos); no edita documentos ya generados. Se planifica como L1 sin edición por cotización |
| F4 | Librería visual: decidir tras el piloto comparativo (2,5 jornadas) | — |
| F5 | Paleta del taller por defecto y preferencia por usuario | La preferencia va en `localStorage` |
| F6 | Token de un solo uso en los logs; `ADMIN_*` para desatendido; sin contraseña por defecto | — |
| F7 | Licencias de modelos importados: advertir en la línea, sin bloquear | — |
| F8 | Etiquetas por IA: sugerir y confirmar; miniatura solo a IA local salvo autorización | — |
| F9 | Catálogo inicial: Bambu Lab, Sunlu, eSun, Polymaker, Creality, Elegoo, Grilon3 y genéricos | Sumar marcas de la región (Cicla 3D, GST3D, etc.): ver `10` §N4 |
| F10 | Recordar la última elección de filamento como preferencia de usuario | Se guarda en la base de datos |

## Decisiones abiertas

**No quedan preguntas abiertas de esta propuesta.** G1 (editor de plantillas en Configuración, sin edición por cotización) y H1 (directorio liviano de proveedores, sin pedidos ni contactos) fueron confirmadas.

Siguen pendientes las **10 decisiones abiertas de `docs/spec-calculadora.md §14`** (bloquean su Fase 2).

## Próximos pasos sugeridos

1. Responder las **10 decisiones abiertas de `docs/spec-calculadora.md §14`** y revisar con cada proveedor la lista de `11` antes de cargar la data inicial.
2. Ejecutar **R0 · Spikes S1–S8** (decidido en E3) (≈ 9,5 jornadas probables): alcance del Estudio, MakerWorld con token real, 3MF multicolor y piloto comparativo de librería visual.
3. Empezar por **R1 · Cimientos, PDF y arranque** (asistente inicial, PDF v2, librería y temas).
4. Mantener este directorio como fuente de verdad: al implementar, marcar cada ID como resuelto y actualizar el README principal.

## Convenciones

- **ID de hallazgo:** `PFC` perfiles/filamento/calidad · `BIB` biblioteca · `VIS` visor/laminado · `COT` cotizaciones · `PDF` · `CLC` calculadora (los `CAL-xx` son de `docs/spec-calculadora.md`) · `MAT` materiales · `UX` transversal · `TEC` técnico.
- **ID de mejora adicional:** `OM-xx` (doc 08). **ID de paquete:** `WP-f.n` (doc 09). **Decisión:** `Dn`.
- Severidad: **Alta** / **Media** / **Baja** (ver `01-diagnostico.md`).
