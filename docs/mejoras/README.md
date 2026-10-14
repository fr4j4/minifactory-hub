# Mejoras de interfaz y usabilidad · Análisis y propuesta

> **Estado: solo documentación.** No se ha implementado nada. Este conjunto de documentos analiza las interfaces e interacciones del sitio, propone mejoras y las estima. El análisis es **estático** (código + capturas existentes en `docs/reporte`); no se ejecutó la aplicación. Lo no verificado está marcado _(por verificar)_.

## Resumen ejecutivo

**Lo que está bien:** identidad visual «capa a capa» coherente, motor de laminado real (OrcaSlicer) con caché y versionado de perfiles, visor 3D con herramientas útiles, subida reanudable, presupuestos con congelado de precios y auditoría, accesibilidad probada.

**Lo que más pesa hoy (los 8 hallazgos de mayor impacto):**

| # | Hallazgo | ID |
|---|---|---|
| 1 | El **material del inventario está atado a un perfil de filamento** (si no lo tiene, desaparece del laminador) y la **«calidad» es una copia por máquina** que llena la lista de perfiles idénticos a fábrica | PFC-01, PFC-02 |
| 2 | Los **selectores no filtran por compatibilidad** (se puede elegir un proceso de otra marca y fallar después de esperar) | PFC-03 |
| 3 | Las **rotaciones/escala del visor 3D no llegan al laminador**: se puede laminar una orientación distinta de la que se ve | BIB-08 |
| 4 | **Laminar = 4 selects + botón**; no hay ajustes en el momento, y el editor de perfil es una lista corta + buscador de claves en inglés. No es un «slicer configurable» | VIS-01, PFC-06 |
| 5 | **Visor de G-code básico** (5 tipos genéricos, líneas de 1 px, relleno muestreado, sin modos por velocidad/flujo/tiempo) | VIS-02 |
| 6 | **Detalle de presupuesto enviado/aprobado pobre**: sin miniaturas, desglose de costos, versiones comparables ni actividad | COT-02 |
| 7 | **PDF frágil y básico**: Chromium lanzado en cada petición, **fallo silencioso** (entrega HTML creyendo que es PDF), sin logo, sin paginación ni cierre comercial, sin copia guardada | PDF-01…06 |
| 8 | **Biblioteca sin escala ni rutinas de importación**: duplicados solo avisados, procesamiento que se pierde al reiniciar, sin ZIP/lotes/acciones masivas | BIB-01…05 |

**Propuesta en una línea por eje**

- **Perfiles/filamentos/calidad:** referencia de fábrica + cambios (copy-on-write), **calidades como presets de intención** resueltos por máquina, **filamento como recomendación opcional** (nunca bloquea) y datos comerciales como única fuente de verdad → `02`.
- **Biblioteca:** cola persistente, duplicados con decisión, ZIP/lote, etiquetas/carpetas reales, acciones masivas, miniaturas giratorias e insignias («cabe», «usado en…») → `03`.
- **Estudio de laminado:** pantalla única con placa, **panel de parámetros por secciones** (simple/avanzado/experto, en español), **ajustes de sesión** con re-laminado casi en vivo, **deltas** contra una base, **visor de G-code v2** y **exploración** de parámetros; alcance honesto (el motor es el CLI de Orca) → `04`.
- **Cotizaciones y PDF:** tablero con KPIs, detalle con pestañas (resumen, líneas, costos, versiones con diff, actividad, vista cliente), un solo componente para vista previa y PDF, **PDF v2** con logo, paginación, cierre comercial, navegador persistente y **copia almacenada** → `05`.
- **Calculadoras y mantenedores:** calculadora con barra de costos «en capas», escalera por cantidad, cálculo inverso y «¿y si…?»; materiales agrupados por línea con carretes visuales; «Mis perfiles» con diff → `06`.
- **Visual y usabilidad:** kit de componentes (Select rico, Tabs sin recarga, Drawer, DataTable…), esqueletos de carga, íconos unificados, fechas es-CL, regresión visual → `07`.

**Esfuerzo (orden de magnitud):** ≈ **92–141 jornadas**, probable **≈ 116** (≈ 133 con 15 % de contingencia), sin la edición de placa opcional (+10–15). Entregable en **6 releases** (R1 «Cimientos y PDF» ≈ 18,5 d es el primero y el más visible) → `09`.

## Índice

| Documento | Contenido |
|---|---|
| [`01-diagnostico.md`](01-diagnostico.md) | Hallazgos con ID, severidad y evidencia por archivo/línea; lo que conviene conservar |
| [`02-perfiles-filamentos-calidad.md`](02-perfiles-filamentos-calidad.md) | Desacople material↔perfil, calidades, resolvedor, migración |
| [`03-biblioteca-modelos-3d.md`](03-biblioteca-modelos-3d.md) | Importación, listado, detalle, datos y pruebas |
| [`04-estudio-de-laminado.md`](04-estudio-de-laminado.md) | Slicer embebido: alcance real, spikes, UX, visor de capas, exploración, riesgos |
| [`05-cotizaciones-y-pdf.md`](05-cotizaciones-y-pdf.md) | Listado, detalle, editor, PDF v2 y su arquitectura |
| [`06-calculadoras-y-mantenedores.md`](06-calculadoras-y-mantenedores.md) | Calculadora v2, filamentos, perfiles, máquinas |
| [`07-sistema-visual.md`](07-sistema-visual.md) | Principios, kit de componentes, mejoras visuales, migración |
| [`08-otras-mejoras.md`](08-otras-mejoras.md) | Robustez, rendimiento, flujo, calidad de código, arreglos rápidos y lo que **no** conviene hacer |
| [`09-plan-y-estimaciones.md`](09-plan-y-estimaciones.md) | Paquetes de trabajo, estimaciones (opt./prob./pes.), releases, dependencias, riesgos |

## Decisiones abiertas (necesito tu respuesta antes de planificar)

| # | Tema | Recomendación | Doc |
|---|---|---|---|
| D1 | ¿Conservar `filament_profile_id` del material como «preferencia» opcional o eliminarlo? | Preferencia opcional | 02 |
| D2 | ¿Calidades independientes de la máquina (presets de intención)? | Sí | 02 |
| D3 | ¿Temperaturas del material como texto libre? | No; mostrarlas desde el perfil resuelto | 02 |
| D4 | STEP: ¿convertir a malla o solo adjuntar? | Según uso real; si no, adjuntar y corregir texto | 03 |
| D5 | ¿Importar por URL (Printables, etc.)? | Posponer | 03 |
| D6 | ¿Reparación de mallas en el sitio? | Fase posterior | 03 |
| D7 | **Ambición del Estudio:** A (parámetros+preview+exploración) · B (+edición de placa) · C (+pintado) | **A**, luego B; C no | 04 |
| D8 | ¿«Vista rápida aproximada» no apta para cotizar? | Sí si los tiempos de laminado son altos (spike S3) | 04 |
| D9 | Idioma de parámetros | Español con nombre de Orca entre paréntesis | 04 |
| D10 | PDF: ¿mantener Chromium o librería sin navegador? | Chromium bien operado + snapshot | 05 |
| D11 | ¿Enlace público de solo lectura para el cliente? | No (fuera de alcance actual) | 05 |
| D12 | ¿Datos de transferencia/anticipo/plazo siempre en el PDF? | Configurables, visibles por defecto | 05 |
| D13 | ¿Tablero kanban de cotizaciones? | Sí, opcional | 05 |
| D14 | ¿Agrupar materiales por línea (marca/línea → colores)? | Sí, en segunda iteración | 06 |
| D15 | ¿Escenarios de calculadora persistentes? | Locales al inicio | 06 |

## Próximos pasos sugeridos

1. Revisar el resumen y responder las decisiones **D7, D10, D1/D2** (condicionan el mayor esfuerzo y riesgo).
2. Ejecutar los **spikes S1–S5** (≈ 4 jornadas) para confirmar el alcance del Estudio y afinar las cifras de R5.
3. Empezar por **R1 · Cimientos y PDF** (valor visible rápido y deja listo el kit visual).
4. Mantener este directorio como fuente de verdad: al implementar, marcar cada ID como resuelto y actualizar el README principal.

## Convenciones

- **ID de hallazgo:** `PFC` perfiles/filamento/calidad · `BIB` biblioteca · `VIS` visor/laminado · `COT` cotizaciones · `PDF` · `CAL` calculadora · `MAT` materiales · `UX` transversal · `TEC` técnico.
- **ID de mejora adicional:** `OM-xx` (doc 08). **ID de paquete:** `WP-f.n` (doc 09). **Decisión:** `Dn`.
- Severidad: **Alta** / **Media** / **Baja** (ver `01-diagnostico.md`).
