# 01 · Diagnóstico de interfaces e interacciones

> Alcance: análisis estático del código (`src/**`) y de las capturas ya generadas en `docs/reporte/media/screens`.
> **No se ejecutó la aplicación ni se modificó código.** Lo que no pude comprobar con certeza está marcado como _(por verificar)_.
> Convención: cada hallazgo tiene un ID (`PFC-01`…) que se referencia en los demás documentos y en el plan de estimaciones.
> Severidad: **Alta** = bloquea o confunde un flujo principal · **Media** = fricción frecuente o deuda con riesgo · **Baja** = pulido.

## 0. Mapa de pantallas analizadas

| Ruta | Componentes clave | Observación general |
|---|---|---|
| `/calculadora` | `quick-calc.tsx` → `line-editor.tsx` | Reutiliza el editor de líneas de presupuesto completo |
| `/presupuestos` | `presupuestos/page.tsx` | Tabla + filtro por formulario GET |
| `/presupuestos/nuevo`, `/presupuestos/[id]` (borrador) | `quote-editor.tsx`, `line-editor.tsx` | Editor monolítico, autoguardado, barra de totales fija |
| `/presupuestos/[id]` (enviado/aprobado) | `presupuestos/[id]/page.tsx` | Vista de solo lectura mínima |
| `/api/quotes/[id]/pdf`, `/imprimir/presupuesto/[id]` | `pdf/route.ts`, `imprimir/.../page.tsx` | PDF = Chromium imprimiendo una página HTML |
| `/archivos`, `/archivos/[id]` | `uploader.tsx`, `model-viewer.tsx`, `gcode-viewer.tsx`, `slice-panel.tsx`, `file-bits.tsx` | Biblioteca en grilla; detalle con 4 pestañas |
| `/laminador` (Perfiles · Comparador · Corridas) | `profile-bits.tsx`, `comparator.tsx` | Tres tablas apiladas de perfiles |
| `/laminador/perfiles/[id]` | `ProfileEditor` | Formulario de ~8–14 parámetros + buscador de claves |
| `/laminador/configurar` | `slicing-setup.tsx` | Asistente de 3 pasos (impresoras · filamentos · laminar) |
| `/inventario` (+ bobinas, escanear, etiquetas) | `inventory-bits.tsx` | Mantenedor de materiales en un modal de 13 campos |
| `/maquinas`, `/maquinas/[id]` | `machine-bits.tsx`, `printer-live.tsx` | Fuera del foco, pero conectadas a perfiles |

---

## 1. Perfiles, filamentos y calidad (PFC)

El laminador exige el trío **máquina + proceso (calidad) + filamento** (`EnqueueInput` en `lib/slicer/queue.ts`). Hoy ese trío está _persistido_ como relaciones fijas:

```
machines.machine_profile_id ──► slicer_profiles (machine)
machines.default_process_profile_id ──► slicer_profiles (process)
materials.filament_profile_id ──► slicer_profiles (filament)      ← acoplamiento material↔perfil
quote_items.process_profile_id / products.process_profile_id ──► slicer_profiles (process)
```

| ID | Sev. | Hallazgo | Evidencia |
|---|---|---|---|
| **PFC-01** | Alta | **El material del inventario está atado a un perfil de filamento.** Si no tiene perfil, _desaparece_ del Laminador y del Comparador («N materiales no aparecen porque no tienen perfil») y el asistente obliga a asignarlo. Un dato comercial (marca, color, costo, stock) queda condicionado a un dato técnico del laminador. | `schema.ts:111` (`materials.filamentProfileId`); `slice-panel.tsx:45`, `comparator.tsx` (`mats = … && m.filamentProfileId`); `slicing-setup.tsx` paso 2 |
| **PFC-02** | Alta | **«Calidad» es una fila de BD por máquina.** `setupMachine` → `ensureProfile` crea perfiles tipo «A1 · 0,20 Standard» con **0 cambios** (idénticos al de fábrica). En la captura `25-perfiles.png`, 5 de 7 perfiles de proceso, 4 de 5 de filamento y las 3 máquinas tienen 0 cambios: ruido que oculta los pocos perfiles realmente personalizados («A1 lenta», «relleno 40 % giroide», «PETG lento»). | `lib/slicer/setup.ts:17,129`; `docs/reporte/media/screens/25-perfiles.png` |
| **PFC-03** | Alta | **Los selectores no filtran por compatibilidad.** El panel de laminado, el editor de líneas y el comparador listan _todos_ los procesos (`ctx.profiles.filter(type==='process')`), incluso los de otra marca → error de laminado `-17` («perfil no compatible») que recién se ve tras esperar el trabajo. | `slice-panel.tsx:44`, `line-editor.tsx` (`line-process`), `lib/slicer/run.ts` (`ERR_MAP[-17]`) |
| **PFC-04** | Media | **Doble fuente de verdad** de densidad, costo y temperaturas: `materials.density/costPerKg/tempNozzle/tempBed` (texto libre) vs. `filament_density/filament_cost/nozzle_temperature` del perfil. Los gramos del laminador usan la densidad del perfil; el estimador desde malla usa la del material → cifras distintas para el mismo material. | `schema.ts:96-113`; `lib/pricing.ts` `estimateFromMesh`; `lib/slicer/setup.ts` `CUSTOM_FILAMENT_FIELDS` |
| **PFC-05** | Media | **Eliminar un perfil no verifica uso.** `deleteProfileAction` solo marca `deletedAt`; las máquinas, materiales, líneas de presupuesto o productos que lo referencian quedan con ids huérfanos (los selectores simplemente dejan de mostrarlo). La lista muestra «Usado en» pero no bloquea ni advierte. | `actions/slicer.ts:91`; `laminador/page.tsx` (`usedBy`) |
| **PFC-06** | Media | **Editor de perfil pobre para el objetivo «slicer configurable».** Muestra una lista plana de 8 (proceso) a 14 (filamento) campos «que mueven el costo» y, para todo lo demás, un buscador de claves **en inglés** (`retraction`, `ironing`…) sin descripción, rango, unidad ni agrupación. No hay diff contra fábrica ni versión comparada. | `profile-bits.tsx:46` (`ProfileEditor`); `lib/slicer/catalog.ts:143` (`SIMPLE_PARAMS`) |
| **PFC-07** | Baja | **Código triplicado:** `SIMPLE_PARAMS` (catalog.ts y params.ts), `FIELDS` (slicing-setup.tsx:155) vs `CUSTOM_FILAMENT_FIELDS` (setup.ts:151), listas `TYPES`. Cualquier cambio exige tocar 2–3 sitios. | archivos citados |
| **PFC-08** | Media | **Dos rutas de importación** (`importProfileAction` JSON legado y `previewImportAction`/`importSelectedAction`) con lógica de herencia duplicada. | `actions/slicer.ts` (`importProfileAction`, `importSelectedAction`) y `lib/slicer/import.ts` |
| **PFC-09** | Baja | **Lista de perfiles:** tres tablas idénticas apiladas, sin búsqueda, filtros ni agrupación por máquina; acciones solo «Duplicar/Eliminar». | `laminador/page.tsx` |
| **PFC-10** | Media | **El asistente exige 3 pasos** aunque con una impresora bien definida el sistema podría laminar con valores por defecto razonables (filamento genérico por tipo, calidad estándar). Para el taller, «configurar» se siente obligatorio antes de poder cotizar. | `slicing-setup.tsx`; `slicingReadiness()` |

---

## 2. Biblioteca de modelos 3D (BIB) y visores (VIS)

### 2.1 Importación y biblioteca

| ID | Sev. | Hallazgo | Evidencia |
|---|---|---|---|
| **BIB-01** | Alta | **Duplicados por hash solo se avisan, no se evitan.** `ingestModel` inserta la ficha nueva y devuelve `duplicateOf`; la UI muestra un toast («ya existe…») pero el duplicado ya quedó creado. | `lib/files.ts:56`; `uploader.tsx` (`data.duplicateOf`) |
| **BIB-02** | Alta | **Procesamiento sin cola persistente.** `processVersion()` se dispara en memoria (`files.ts:52`); si el servidor se reinicia mientras analiza, la versión queda en `status:'processing'` para siempre. La página «espera» recargándose entera cada 1,5 s (`AutoRefresh`). | `files.ts:52`; `file-bits.tsx:39` |
| **BIB-03** | Media | **Subida limitada:** se suben archivos de a uno (bucle secuencial), sin ZIP/carpeta, sin metadatos por lote (cliente, etiquetas, carpeta), sin importar por URL (Printables/Thingiverse/MakerWorld). | `uploader.tsx` (`for` secuencial) |
| **BIB-04** | Media | **3MF multi-objeto/multi-placa = un solo modelo.** No se listan objetos/placas ni se aprovechan las miniaturas embebidas (p. ej. `Metadata/plate_1.png` en 3MF de Bambu Studio) _(por verificar en `parse.ts`)_. | `lib/files.ts` `processVersion` |
| **BIB-05** | Media | **Listado básico:** grilla única; filtros por formulario GET con recarga; `limit(200)` sin paginación; búsqueda libre y etiquetas resueltas con `tags::text ilike` sobre el JSON serializado (sin índice; la búsqueda libre puede coincidir con signos del propio JSON); carpetas son texto libre sin árbol; sin orden configurable; sin selección múltiple ni acciones masivas. | `archivos/page.tsx:17-21` |
| **BIB-06** | Baja | **Miniatura estática** (una vista isométrica) y sin señales rápidas: «cabe en…», «laminado N veces», «usado en N presupuestos», tiempo/gramos de la última corrida. | `archivos/page.tsx` |
| **BIB-07** | Media | **Detalle fragmentado:** Visor y «Laminar y cotizar» son pestañas con recarga; la tarjeta «¿Cabe en mis máquinas?» solo remite a otra pestaña (texto, sin contenido). | `archivos/[id]/page.tsx:92,103` |
| **BIB-08** | **Alta** | **Trampa de UX: las transformaciones del visor no llegan al laminador.** Rotar, «cara a la cama» y escala de prueba son puramente visuales y no se guardan; `SlicePanel` recibe solo `fileVersionId`. El usuario puede orientar la pieza para imprimir y luego laminar _otra_ orientación sin saberlo. | `model-viewer.tsx:167` (`rotate`), `slice-panel.tsx` (props), `run.ts:46` |
| **BIB-09** | Baja | **STEP:** se acepta y analiza (`parseSTEP`) pero el panel lo bloquea y el texto afirma «se convierten a malla antes de laminar» _(por verificar si existe conversión)_. | `parse.ts:359`; `archivos/[id]/page.tsx` |
| **BIB-10** | Baja | Versiones sin comparación visual (Δ dimensiones/volumen) ni comentario sugerido. | `archivos/[id]/page.tsx` pestaña versiones |
| **BIB-11** | Baja | Sin colecciones/proyectos (p. ej. «Pedido Café Sur») más allá de carpeta de texto + cliente. | `schema.ts:225` |

### 2.2 Visor 3D, laminado y vista de capas

| ID | Sev. | Hallazgo | Evidencia |
|---|---|---|---|
| **VIS-01** | Alta | **Laminar = 4 selects + botón.** No se puede ajustar ningún parámetro «en el momento»: para probar «¿y con 3 paredes?» hay que editar el perfil global (genera versión), volver y laminar. No hay noción de _ajustes de sesión_. | `slice-panel.tsx`; `actions/slicer.ts` `updateProfileAction` |
| **VIS-02** | Alta | **Visor de G-code limitado:** 5 tipos genéricos (Perímetros, Relleno, Superficies, Soportes, Otro) en lugar de los tipos reales de Orca (pared exterior/interior, voladizo, relleno sólido/disperso, puente, falda/borde…); sin modos por velocidad/flujo/tiempo de capa/temperatura/ventilador; líneas de 1 px; **relleno muestreado** («Relleno muestreado para el visor»); sin viajes ni retracciones; sin leyenda con tiempos por tipo. | `gcode-viewer.tsx:3-9,85`; `lib/gcode.ts` |
| **VIS-03** | Media | **Laminado por CLI sin cancelación ni progreso real.** Cada ajuste implica un proceso `orca` (≈ 1–2 s en piezas pequeñas, minutos en grandes; timeout 180 s). El cliente hace _polling_ HTTP cada 700 ms. El worker vive dentro del proceso web (`ensureWorker`). | `lib/slicer/queue.ts` (`ensureWorker`, `tick`); `slice-panel.tsx` `useRunPolling` |
| **VIS-04** | Media | **`--arrange 1` siempre y copias solo con `--clone-objects`:** no hay placa multi-objeto, posiciones manuales ni ajustes por objeto. | `lib/slicer/run.ts:46` |
| **VIS-05** | Media | **Comparador frágil:** las 3 combinaciones iniciales se eligen por regex sobre nombres (`/Fine\|0,12/`, `/Draft/`); solo compara perfiles completos (no variaciones de un parámetro); resultados en tabla, sin gráfico. | `comparator.tsx:21` |
| **VIS-06** | Baja | **Pestaña «Corridas»:** sin filtros, sin abrir el resultado ni el visor, tope 60 filas, «Etiqueta» muestra solo el proceso. | `laminador/page.tsx` |
| **VIS-07** | Baja | Copy confuso en el resultado: «sin IVA incluido según tarifas». | `slice-panel.tsx:85` |
| **VIS-08** | Media | Desde el resultado no se puede «Enviar a imprimir» (existe en `/maquinas/[id]`) ni «Guardar estos parámetros como perfil». | `slice-panel.tsx`; `maquinas/[id]/page.tsx` |

---

## 3. Cotizaciones y PDF (COT, PDF)

| ID | Sev. | Hallazgo | Evidencia |
|---|---|---|---|
| **COT-01** | Media | **Listado = tabla.** Sin KPIs (abiertos, por vencer, conversión), sin pipeline/kanban por estado, sin alerta visual de vigencia, filtros por GET, `limit(150)`. | `presupuestos/page.tsx:16` |
| **COT-02** | **Alta** | **El detalle de un presupuesto enviado/aprobado es pobre:** sin miniaturas ni visor del modelo, sin desglose de costos por línea (aunque `quote_items.cost_breakdown` ya se guarda), sin línea de tiempo/actividad (`activity_log` existe), sin comparación entre versiones, sin vista previa del PDF. Es justo donde el usuario pide «ver bien los detalles». | `presupuestos/[id]/page.tsx:43+` |
| **COT-03** | Media | **Borrador = editor completo; no hay «vista cliente».** No se puede revisar cómo quedará el documento sin descargar el PDF. La barra de totales fija compite con el contenido (en `34-presupuesto-detalle.png` se superpone a las tarjetas inferiores) y con la barra inferior móvil. | `quote-editor.tsx` (resumen fijo) |
| **COT-04** | Media | **Doble mecanismo de precio:** «precio final por unidad» (línea) + «precio final del presupuesto» + «descuento». Si se fija el total, `calcQuote` lo reparte proporcionalmente entre líneas (implícito, no explicado en la UI). | `lib/pricing.ts` `calcQuote`; `quote-editor.tsx` |
| **COT-05** | Media | **`LineEditor` monolítico (~320 líneas):** tres modos (auto/semi/manual), orígenes de datos, modelos, opciones, costos. Línea colapsada sin miniatura; todo con `<select>` nativo. | `line-editor.tsx` |
| **COT-06** | Media | **`loadEditorData` envía al cliente todos los modelos y clientes** en cada edición; no escala con una biblioteca grande. | `lib/editor-data.ts:9` |
| **COT-07** | Baja | **Sin seguimiento:** la plantilla admite `{seguimiento}` pero no hay recordatorios de «enviado hace N días», ni registro de a quién/cómo se envió. | `lib/messages.ts`; `services/quotes.ts` |
| **COT-08** | Baja | **Aprobación:** modal de 7 campos sin resumen de lo que se creará (pedido, trabajos en cola, reservas de material). | `quote-actions.tsx` |
| **PDF-01** | **Alta** | **PDF = Chromium lanzado por cada petición** (`chromium.launch` + `--no-sandbox`): 1–3 s y cientos de MB por descarga, sin límite de concurrencia. `playwright` está en `devDependencies` pero se importa en runtime de producción; el `Dockerfile` instala Chromium con `\|\| true`, así que un fallo de instalación pasa inadvertido. | `pdf/route.ts:27`; `package.json`; `Dockerfile` |
| **PDF-02** | **Alta** | **Fallo silencioso:** ante _cualquier_ error redirige a la versión imprimible HTML. El usuario cree que descargó un PDF y recibe una página web. | `pdf/route.ts:34` |
| **PDF-03** | Alta | **Plantilla mínima:** sin logo (`shop.logoKey` existe en ajustes y no se usa), color de marca por defecto azul `#1d62f0` (`settings.ts:19`) distinto del sistema visual (naranja), sin `@page`, sin encabezado de tabla repetido, sin número de página, filas que pueden partirse entre páginas, tipografía `Inter/Arial` sin incrustar. | `imprimir/presupuesto/[id]/page.tsx:20-27` |
| **PDF-04** | Media | **Miniaturas 54×40 px**, máximo 2 por línea; la URL usa `fileVersionId ?? ''` → imagen rota si falta la versión. | `imprimir/.../page.tsx:27` |
| **PDF-05** | Media | **Faltan datos de cierre comerciales:** anticipo requerido (hay `minDepositPct` y `depositPct`), datos de transferencia, plazo estimado de entrega, opcionales con precio en tabla propia (hoy una línea de texto), condiciones por secciones. | `imprimir/.../page.tsx`; `settings.ts` |
| **PDF-06** | Media | **No se conserva copia:** el PDF se regenera siempre; lo «enviado» congela precios (`frozen`) pero no el documento entregado. Si cambian logo/condiciones, el PDF de un presupuesto antiguo cambia. | `services/quotes.ts` (`sendQuote`) |
| **PDF-07** | Baja | Sin vista previa en pantalla ni opciones (mostrar miniaturas, ocultar desglose, idioma). | — |

---

## 4. Calculadoras y mantenedores (CAL, MAT)

| ID | Sev. | Hallazgo | Evidencia |
|---|---|---|---|
| **CAL-01** | Media | **La «Calculadora rápida» es el editor de líneas completo con una sola línea**, con tres modos y todos los campos; el parámetro `whatsappTpl` llega vacío (`""`) y no se usa. Sin historial ni escenarios guardados. | `quick-calc.tsx:12`; `calculadora/page.tsx` |
| **CAL-02** | Media | **El costo no se «ve»:** el desglose está en un `<details>` colapsado y solo con permiso de costos; no hay escalera de precios por cantidad (aunque existen `volumeTiers`), ni cálculo inverso (precio objetivo ↔ margen). | `line-editor.tsx` (desglose); `pricing.ts` |
| **CAL-03** | Baja | No se puede responder rápido «¿y si lo hago en PLA en vez de PETG?» o «¿y a 0,28 mm?» sin editar la línea y comparar mentalmente. | — |
| **MAT-01** | Media | **`MaterialForm`: un modal de 13 campos** en 3 columnas; temperaturas como texto libre; el perfil del laminador convive con datos comerciales (costo, proveedor). | `inventory-bits.tsx:7` |
| **MAT-02** | Media | **Una fila por color repite** marca/línea/tipo/densidad/costo/perfil. Cambiar el costo de «Sunlu PETG» exige editar cada color. | `schema.ts:96`; `inventario/page.tsx` |
| **MAT-03** | Baja | Tabla de materiales sin búsqueda/filtros ni agrupación; bobinas sin representación visual del carrete. | `inventario/page.tsx` |
| **MAT-04** | Baja | `getCalcContext` calcula `materialCostPerKg` por material **en serie** (N+1) en cada página que usa el contexto. | `lib/context.ts:20` |

---

## 5. Transversal: usabilidad y sistema visual (UX, TEC)

| ID | Sev. | Hallazgo | Evidencia |
|---|---|---|---|
| **UX-01** | Media | **No existe ningún `loading.tsx`, `error.tsx` ni `not-found.tsx`** en la app: sin esqueletos de carga ni límites de error por sección. | `find src -name loading.tsx` → vacío |
| **UX-02** | Media | **`useAction` hace `router.refresh()` tras cada acción:** re-renderiza la página completa, con parpadeo y pérdida de scroll/contexto; sin actualizaciones optimistas. | `components/client.tsx` |
| **UX-03** | Media | **`<select>` nativo para todo** (máquina, proceso, material, cliente, modelo): sin muestra de color, stock, compatibilidad ni búsqueda. | `line-editor.tsx`, `slice-panel.tsx`, `comparator.tsx` |
| **UX-04** | Baja | **Pestañas como enlaces con recarga** (`/archivos/[id]?tab=`, `/laminador?tab=`, `/inventario?tab=`): se pierde estado (zoom del visor, cámara). | `archivos/[id]/page.tsx:100` |
| **UX-05** | Baja | **Iconografía mixta:** emojis (⬇ 👁 📷 🏷 ⧉ ✕ ★) junto a SVG propios (`shell.tsx` `ICONS`); `lucide-react` está instalado y **sin uso**. | `grep lucide-react src` → vacío |
| **UX-06** | Baja | **Fecha en formato EE.UU.** (`10/28/2026` en `34-presupuesto-detalle.png`) en un taller es-CL: el `<input type=date>` sigue el idioma del navegador, no el de la página. | captura 34 |
| **UX-07** | Baja | Formularios largos dentro de modales (material, filamento personalizado, importar): mejor panel lateral (Drawer) con secciones y guardado persistente. | `inventory-bits.tsx`, `slicing-setup.tsx` |
| **UX-08** | Baja | Sin atajos de teclado más allá de `Ctrl+K`; la paleta solo busca, no ejecuta acciones. | `shell.tsx` |
| **TEC-01** | Media | Worker de laminado **dentro del proceso web** (`__sliceWorker`): la CPU del laminado compite con las respuestas HTTP. | `queue.ts` (`ensureWorker`) |
| **TEC-02** | Media | **Tests e2e acoplados a `data-testid` de formularios que se rediseñarán** (specs 02, 03, 06, 07, 08, 10, 12). Todo cambio visual exige actualizarlos. | `tests/e2e/*.spec.ts` |
| **TEC-03** | Baja | `playwright` como dependencia de runtime solo en `devDependencies`; un build con `--omit=dev` rompería el PDF. | `package.json` |

---

## 6. Lo que ya está bien (conservar)

- Lenguaje visual «capa a capa» (papel técnico + grafito + naranja de boquilla): coherente, con modo oscuro y animaciones que respetan `prefers-reduced-motion`.
- Subida por partes con reanudación; análisis automático de mallas (dimensiones, volumen, normales, voladizos).
- Visor 3D con medición, sección, voladizos y verificación de volumen por máquina.
- Caché de laminado por hash de (archivo + motor + perfiles) y snapshot de versiones de perfil en cada corrida (`slice_runs.profile_versions`).
- Versionado de perfiles con vuelta atrás; importación desde Bambu Studio/OrcaSlicer; exportación de vuelta.
- Congelado de precios al enviar un presupuesto, versiones y auditoría.
- Accesibilidad verificada con axe y navegación móvil dedicada.
