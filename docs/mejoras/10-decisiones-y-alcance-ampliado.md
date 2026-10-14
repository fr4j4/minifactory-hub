# 10 · Decisiones tomadas y alcance ampliado

Segunda ronda. Recoge (1) las respuestas a las decisiones D1–E3 de la primera ronda, (2) su impacto en los documentos 02–09 y (3) diez requisitos nuevos (N1–N10) con análisis, diseño, datos, riesgos y estimación. Sigue siendo **solo documentación**.

> Convención de estimación: igual que en `09-plan-y-estimaciones.md` (jornada ≈ 6 h; optimista / probable / pesimista). Lo no verificado está marcado _(por verificar)_ y casi siempre tiene un spike asociado (S6–S8).

## 1. Decisiones registradas

| # | Decisión tomada | Impacto |
|---|---|---|
| D1 | **Eliminar del todo** el perfil de filamento del material. _Nota:_ el color del filamento debe renderizarse en la vista 3D y debe detectarse el **AMS en 3MF** (varios colores) | Doc 02 se simplifica (sin tabla de preferencias); nuevos N1a/N1b (§3.1) |
| D2 | Calidades como presets de intención | Sin cambio (doc 02) |
| D3 | Quitar temperaturas libres; mostrarlas desde el perfil resuelto (solo lectura) | Sin cambio |
| D4 | STEP: solo adjuntar y corregir el texto | Se reduce a un arreglo de copy (WP-0.4) |
| D5 | **Incluir** importación por URL en R4 (mejor esfuerzo) | Se concreta en N3 (MakerWorld primero) |
| D6 | Reparación de mallas: fase posterior (avisar y guiar) | Sin cambio |
| D7 | Estudio nivel **A** (parámetros, vista previa, exploración) | La edición de placa (5.5) queda como opcional posterior |
| D8 | «Vista rápida aproximada»: decidir tras medir tiempos (S3) | Pendiente de S3 |
| D9 | ≈ 120 parámetros curados en es y en | Sin cambio |
| D10 | PDF con Chromium persistente y copia guardada al enviar | Base de N5b y N7 |
| D11 | Sin enlace público para el cliente | Sin cambio |
| D12 | Transferencia, anticipo y plazo: configurables, visibles por defecto | Sin cambio |
| D13 | Tablero kanban de cotizaciones como vista opcional | Se suma a N6 |
| D14 | Agrupar materiales por marca y línea **desde el inicio** | Entra en WP-4.2' y N4 |
| E1 | Orden R1 → R2 → R3 → R4 → R5 → R6 | Plan reordenado en `09` |
| E2 | Ejecutar la Fase 1 de la spec de calculadora **antes** de R3 | Entra al plan como «R2b» (≈ 5 jornadas) |
| E3 | Ejecutar los spikes **ahora** | Nuevo «R0 · Spikes» al inicio del plan |

### 1.1 Consecuencias de D1 en el modelo de perfiles (reemplaza doc 02 §2.3)

Sin vínculo material → perfil de filamento, el **resolvedor de filamento** queda así:

1. **Elección explícita** en el momento (panel de laminado, Estudio, línea de presupuesto, calculadora).
2. **Sugerido automático** por marca + tipo + línea del material (`suggestFilamentBase`, ya existe) para la impresora/boquilla elegida.
3. **Genérico por tipo** (`Generic PETG @System`), siempre con aviso visible «Filamento: Generic PETG · automático».

Se eliminan: `materials.filament_profile_id` y la tabla `material_profile_prefs` propuesta antes. Se conservan: `quote_items.material_id`/`order_items.material_id` (el costo y el consumo siguen saliendo del material) y los **perfiles de filamento** como objetos propios (Mis perfiles, «Filamento personalizado»), que ya no «pertenecen» a un material.

Inyección de datos comerciales (sin cambio): `filament_density`, `filament_cost`, `filament_diameter` del material pasan como sobrescrituras al perfil efectivo.

**Migración:** al contraer, los vínculos actuales (`materials.filament_profile_id`) se vuelcan a un **informe** (material → perfil) y, según la pregunta Q-F1 (§4), se descartan o se convierten en la «última elección recordada». Los perfiles de filamento personalizados **no se pierden**: solo dejan de estar atados.

**Efecto en pantallas:** desaparece el paso 2 de «Configurar laminado»; el selector de material del laminador muestra **todos** los materiales FDM (hoy oculta los sin perfil); el selector de filamento (perfil técnico) es independiente y opcional con valor automático.

## 2. Impacto en el plan (resumen; detalle en `09`)

| Concepto | Antes | Ahora |
|---|---|---|
| Spikes | S1–S5 dentro de la Fase 5 | **R0** al inicio: S1–S5 + S6 (MakerWorld) + S7 (3MF/AMS) + S8 (librería visual) |
| Kit visual | WP-6.1 «kit propio» | WP-6.1' **adopción de una librería de componentes** + arquitectura de temas (N8, N9) |
| Materiales | agrupación «opcional» | WP-4.2' **agrupación desde el inicio** + alta masiva (N4) |
| Calculadora | Fase 1 de la spec fuera de totales | **R2b** incluida en el plan |
| Totales | ≈ 118 jornadas probables | **≈ 210** (ver §5): +91,5 por las decisiones y los requisitos N1–N10 |

## 3. Requisitos nuevos

### N1 · Color del filamento en la vista 3D y detección multicolor (AMS) en 3MF

**Hoy (verificado en código):**
- `ModelViewer` usa un color fijo (`color = '#ff6a2b'` en `archivos/[id]/page.tsx`); no refleja el material.
- El analizador de 3MF ya lee **colores por vértice** (`basematerials`/`colorgroup`, `lib/mesh/parse.ts`) y el visor los usa si existen (`flags & 1`).
- Los **metadatos de laminado** del 3MF/G-code ya incluyen `filament_colour` y tipo por filamento (`lib/gcode.ts`, `parse3mfSliceMeta`) y el importador de perfiles lee `Metadata/project_settings.config` (`lib/slicer/import.ts`).
- **No se detecta** la asignación de extrusor/AMS por objeto o por triángulo, ni se ofrece asignar materiales del inventario a cada color.

**Diseño:**

| Parte | Descripción |
|---|---|
| **N1a · Color de material en el visor** | El visor recibe `color` desde el **material seleccionado** (muestra `hex`) en la ficha del archivo, el Estudio y el detalle de línea. Selector rápido de material en la barra del visor. Cualquier modelo de un solo color se ve con el color real del filamento |
| **N1b · Multicolor / AMS** | Al procesar un 3MF de Bambu Studio/OrcaSlicer: (1) leer `filament_colour` y `filament_type` de `Metadata/project_settings.config` → **paleta de ranuras**; (2) leer la asignación de extrusor por objeto/volumen en `Metadata/model_settings.config` y la pintura por triángulo (atributos `paint_color`/segmentación multi-material en el modelo) _(por verificar con 3MF de muestra: S7)_; (3) generar **colores por ranura** en el preview (`MFM1`) y detectar «modelo multicolor: N colores» |
| **Asignación a inventario** | Panel «Colores del modelo»: cada ranura muestra su color detectado y un selector de **material del inventario** (sugiere el más cercano por color y tipo). El resultado alimenta el costo por ranura (la spec de calculadora ya define costo multicolor por slot, `CAL-15`) y la reserva de bobinas |
| **Laminado multicolor** | `runOrca` pasa hoy **un** filamento; la CLI de Orca acepta una lista en `--load-filaments` _(por verificar: S1)_. El resolvedor devuelve un filamento por ranura |
| **G-code/Estudio** | La vista de capas colorea por herramienta con los colores de las ranuras (modo «Herramienta/color» del visor v2, doc 04 §3.5) |

**Riesgos:** formatos de 3MF distintos entre Bambu Studio, OrcaSlicer y PrusaSlicer (cada uno codifica la pintura de forma diferente); modelos de gran tamaño con pintura por triángulo; costo de memoria al colorear. Mitigación: S7 con muestras reales; límite de triángulos para coloreado por triángulo, con degradación a color por objeto.

**Estimación:** N1a **1 / 1,5 / 2** (en R2) · N1b **5,5 / 7 / 9** (en R4) · S7 **0,5 / 1 / 1,5** (en R0).

### N2 · Etiquetado automático con IA al subir un modelo

**Ya contemplado:** `docs/spec-ia.md` §2.3 ítem **F1** («autoetiquetado y nombre/carpeta sugeridos desde miniatura + nombre + metadatos», Fase 2). La fundación de IA (proveedores, presupuesto, caché, ocultación de datos, tablas `ai_calls/ai_suggestions`) **ya está implementada**.

**Diseño:**

1. **Disparo:** al terminar `processVersion` (job de la cola `jobs`, doc 03), si la función `files.autotag` está activa para el taller.
2. **Entradas (nunca la malla):** nombre de archivo, carpeta, **origen/URL y metadatos importados** (p. ej. etiquetas de MakerWorld), resumen de análisis (dimensiones, relación de aspecto, volumen, `overhangPct`, cuerpos), **miniatura** (solo con visión habilitada y consentimiento; con IA solo local no sale de la red) y el **vocabulario existente** de etiquetas (las N más usadas).
3. **Salida estructurada (zod):** `{ tags: [{ name, confidence, source: 'nombre'|'forma'|'url'|'metadatos' }], suggestedName?, suggestedFolder?, category? }`.
4. **Validación determinista:** normalizar (minúsculas, sin tildes, singular), **preferir etiquetas del vocabulario**, tope de 8, descartar duplicados y términos prohibidos, límites de longitud.
5. **Política configurable:** (a) **sugerir y confirmar** (por defecto) o (b) **aplicar automáticamente** marcando cada etiqueta como «IA» (fácil de quitar en lote).
6. **Sin IA (siempre disponible):** tokenización del nombre, etiquetas del sitio de origen y heurísticas geométricas simples (placa plana, pieza alta y delgada, volumen pequeño…).

**Datos:** requiere etiquetas con procedencia → tablas `tags` y `model_tags(model_file_id, tag_id, source 'manual'|'ia'|'import'|'regla', confidence, created_at)` (ya propuestas en doc 03 §6, ahora con `source` y `confidence`).

**Riesgos:** etiquetas inconsistentes (mitigado con vocabulario y normalización); costo por modelo (una llamada corta con imagen pequeña; presupuesto de IA ya existente); privacidad (solo metadatos + miniatura, opcional y desactivable).

**Estimación (R4):** **4 / 5 / 7** (depende de las etiquetas normalizadas de WP-2.2 y de la fundación de IA ya existente).

### N3 · Importador por URL (MakerWorld primero) — factibilidad y datos

**Veredicto: factible como «mejor esfuerzo», frágil y con un riesgo de licencias que el taller no debe ignorar.**

| Aspecto | Hallazgo |
|---|---|
| API | **No hay API pública oficial.** Hay documentación comunitaria por ingeniería inversa ([OpenBambuAPI](https://github.com/Doridian/OpenBambuAPI/blob/main/cloud-makerworld.md)): base `api.bambulab.com/v1` (alterna `makerworld.com/api/v1`, detrás de Cloudflare), `GET design-service/design/{designId}`, `GET design-service/instance/{instanceId}/f3mf?type=preview|download`, comentarios, calificaciones. Puede cambiar sin aviso |
| Metadatos | La respuesta de `design/{id}` incluye al menos: `id`, `title`, `designCreator` (`name`, `uid`, `avatar`), `instances[]` (`id`, `isDefault`, `title`, `plates[]`), `tags[]`, contadores (`likeCount`, `downloadCount`, `commentCount`) e `images[]`. La documentación no detalla licencia, tiempos ni filamento: **hay que capturar una respuesta real** (S6) |
| Descarga | Requiere token de cuenta Bambu (JWT, ≈ 90 días). Hay **reportes contradictorios** sobre si el endpoint de descarga responde bien (se vio un 403 «Please log in to download models» incluso en `api.bambulab.com`, y algunos modelos «protegidos» pueden quedar vedados) |
| Autenticación reutilizable | El sitio **ya** inicia sesión en Bambu Cloud y guarda el token cifrado (`cloud_accounts.token_enc`, `lib/bambu/cloud.ts`): es el candidato natural para autenticar la descarga |
| Legal / licencias | No pude verificar los términos de uso sobre acceso automatizado. Además MakerWorld tiene **licencias por modelo** y una «Commercial License Membership». **Para un taller que vende piezas, importar sin registrar la licencia es un riesgo real** |

**Diseño recomendado (de más robusto a más frágil):**

1. **Ruta A (siempre disponible):** el usuario pega la URL y **sube el 3MF descargado a mano**; el sitio trae solo los **metadatos** (público) y los asocia al modelo.
2. **Ruta B (mejor esfuerzo):** con una cuenta Bambu Cloud conectada, descarga automática del 3MF + metadatos. Si falla (403, Cloudflare, modelo protegido), degrada a la ruta A con un mensaje claro.
3. **Ruta C (otros sitios):** Printables/Thingiverse/otros → solo metadatos básicos (OpenGraph: título, imagen, autor) y enlace, sin descarga automática.

**Lo que se captura (todo lo disponible):** título, descripción, autor (nombre, id, URL, avatar), licencia y uso comercial, categorías y etiquetas, imágenes de la galería (descargadas y guardadas), instancias y placas (nombre, miniatura, tiempo, peso, filamentos, perfil de impresión), estadísticas (descargas, likes, comentarios, valoración), fechas de creación/actualización remotas, URL canónica e ids, y la **respuesta JSON cruda** (con tope de tamaño) para no perder campos futuros. El 3MF descargado ya trae su propia configuración de laminado (se lee con `parse3mfSliceMeta` y se puede ofrecer como **perfil de impresión del autor**, reutilizando el importador de perfiles).

**Cambios propuestos al esquema:**

```
model_sources (nueva)
  id, model_file_id, version_id?, provider ('makerworld'|'printables'|'thingiverse'|'otro'),
  url, external_id (designId), instance_id?, title, description,
  author_name, author_uid, author_url, author_avatar_key,
  license_code ('cc0'|'cc-by'|'cc-by-sa'|'cc-by-nc'|'cc-by-nd'|'makerworld-comercial'|'propia'|'desconocida'),
  license_text, commercial_use ('si'|'no'|'requiere_membresia'|'desconocido'),
  category, tags jsonb, images jsonb [{url, key, w, h}],
  plates jsonb [{index, name, thumb_key, print_time_s, weight_g, filaments[]}],
  stats jsonb {likes, downloads, comments, rating}, remote_created_at, remote_updated_at,
  raw jsonb (tope 256 KiB), fetched_at, fetch_status ('ok'|'parcial'|'protegido'|'error'), fetch_error
model_files.license  → pasa a valor normalizado (enum de arriba) + model_files.source_id → model_sources.id
```

**Licencias en el flujo comercial (propuesta):** al **cotizar** un modelo con `commercial_use` ≠ `si` se muestra una advertencia en la línea («Licencia CC-BY-NC: uso comercial no permitido»); la política (solo avisar / bloquear / pedir confirmación) es una decisión (Q-F7). El PDF **no** muestra la licencia por defecto.

**Riesgos:** cambios de la API o Cloudflare (mantenimiento continuo), términos de uso, expiración del token, modelos protegidos o de pago. Mitigación: ruta A como base, caché de metadatos, pruebas de contrato con respuestas guardadas, indicador de «mejor esfuerzo» en la UI.

**Estimación:** S6 (spike con token real, respuestas completas, prueba de descarga) **1,5 / 2 / 3** (R0) · N3a MakerWorld (rutas A y B, esquema, galería, licencias, job de importación) **6 / 8 / 11** · N3b genérico OpenGraph **2 / 3 / 4** (ambos en R4). Total N3 = **8 / 11 / 15**.

### N4 · Alta masiva de filamentos y stock

**Hoy:** `MaterialForm` crea **un** material por vez (modal de 13 campos) y la entrada de compra (`AddSpoolButton`) es otro modal por material; no hay carga por lotes ni importación.

**Diseño («Alta rápida de filamentos»; página con panel lateral en móvil):**

1. **Datos comunes** (una vez): marca (autocompletar + catálogo), línea/tipo (PLA, PLA Matte, PETG HF…), diámetro, densidad (sugerida por tipo), costo por kg, peso neto y tara por bobina.
2. **Tabla de colores** estilo planilla: una fila por color con nombre, tono (selector + **hex sugerido por nombre** en es/en: «negro», «rojo», «azul cielo»), cantidad de bobinas a ingresar (0 = solo catálogo), lote y ubicación. Atajos: **pegar una lista** («Negro, Blanco, Rojo») o **pegar/subir CSV/Excel** (`exceljs` ya es dependencia), duplicar fila, completar hacia abajo.
3. **Catálogo de marcas y colores predefinido** (datos en el repo, editable): al elegir «Bambu Lab · PLA Basic» se proponen sus colores estándar con hex. Se curan pocas marcas al inicio y se amplía por demanda (la lista exacta es la pregunta Q-F9).
4. **Vista previa y validación:** detección de duplicados (marca + línea + tipo + color) contra el inventario; resumen «se crearán 8 materiales y 14 bobinas».
5. **Confirmación transaccional:** crea las líneas/colores (D14: modelo agrupado), registra la **entrada de compra** con `createSpool` (código y QR por bobina) y ofrece **imprimir etiquetas QR** del lote (ya existe la pantalla de etiquetas).
6. Edición masiva posterior: cambiar costo/kg de una línea completa, archivar colores, ajustar stock mínimo (acciones de la tabla de materiales, doc 06 §2).

**Modelo (con D14 «desde el inicio»):** `filament_lines` (marca, línea, tipo, densidad, diámetro, costo/kg por defecto, proveedor) + `materials` como **colores** (`line_id`, color, hex, costo propio opcional, stock mínimo). Migración idempotente que agrupa lo existente por (fabricante, línea, tipo, densidad), con vista previa y reversa.

**Estimación:** N4 **5,5 / 7,5 / 10** (incluye ≈ 1,5–3 jornadas de curar el catálogo inicial) + WP-4.2' (mantenedor v2 con agrupación desde el inicio) **5 / 6,5 / 8**, ambos en R2.

### N5 · Detalle de la cotización: desplegar y «Ver detalles» (modal o página)

**Interpretación** (confírmala, Q-F1): en la **vista de cotización dentro del sitio** (Vista cliente y detalle), cada línea se puede **desplegar** para ver su detalle, y un botón **«Ver detalles»** abre una **ventana (modal)** con todo, con la misma información disponible como **página** propia. Un PDF no es interactivo; para el documento impreso se ofrece un **anexo de detalles** opcional.

**Diseño:**

| Elemento | Descripción |
|---|---|
| **Fila desplegable** | Chevron por línea: miniatura(s), modelos y cantidades, material con muestra de color, calidad, tiempo y gramos con su origen, referencias; con permiso de costos, desglose en capas |
| **Botón «Ver detalles»** | Abre un modal (escritorio) / hoja a pantalla completa (móvil) con pestañas: **Modelo 3D** (visor con el color del material, N1), **Parámetros** (perfil de laminado usado y versión), **Costos** (según permiso) y **Referencias/archivos** |
| **Página equivalente** | Ruta `/presupuestos/[id]/lineas/[lineaId]` con el mismo contenido; el modal es una **ruta interceptada** de Next.js (al recargar o compartir el enlace se ve la página completa); botón anterior/siguiente línea |
| **PDF: anexo opcional (N5b)** | Opción «Incluir detalle por línea»: páginas adicionales con imagen del modelo, material, calidad, tiempo/peso estimado y notas, sin costos internos; respeta `showInPdf` de las referencias |

**Estimación (R3):** N5a modal + página + fila desplegable **3 / 4 / 5,5** · N5b anexo PDF **1,5 / 2 / 3**.

### N6 · Vista tabla además del layout existente (recordada en el navegador)

**Interpretación** (Q-F2): aplica a (a) el **listado** de cotizaciones (tarjetas/fila rica · **tabla** · tablero kanban, D13) y (b) las **líneas** de una cotización (tarjetas · **tabla editable** tipo hoja).

**Diseño:**
- Componente `ViewToggle` + hook `useViewPref(clave)` en el kit: guarda la elección en **cookie** (el servidor la lee y renderiza la vista correcta sin parpadeo) con respaldo en `localStorage`. La preferencia es **por navegador**, como se pidió; sincronizar por usuario sería una mejora posterior.
- **Tabla del listado:** columnas elegibles (número, cliente, título, estado, vigencia, total, margen), orden, densidad cómoda/compacta; en móvil cae a tarjetas apiladas o a scroll horizontal con primera columna fija.
- **Tabla de líneas:** edición en la celda (descripción, cantidad, material, calidad, precio final), selector de columnas, totales al pie, navegación con teclado; el detalle de cada línea se abre con «Ver detalles» (N5).
- El mismo patrón se reutiliza en Archivos, Inventario y Presupuestos (una sola implementación).

**Estimación (R3):** **4 / 5,5 / 7,5** (incluye tabla editable de líneas; el kanban ya está en WP-3.1).

### N7 · Editor de los documentos generados (logo, diseño, secciones…)

Se pide **estimar cómo sería el editor**. Tres niveles; recomiendo avanzar por etapas.

| Nivel | Qué permite | Cómo se construye | Estimación |
|---|---|---|---|
| **L1 · Personalización guiada** | Subir **logo** (con recorte y tamaño), **color de marca** y fuentes de una lista, **activar/ocultar y reordenar secciones** (cliente, detalle, opcionales, totales, cierre comercial, condiciones, anexo), textos del encabezado/pie y condiciones por sección, opciones (miniaturas, plazo, idioma), **vista previa en vivo** y **sobrescrituras por cotización** (cambiar un texto solo en este documento y regenerar) | Un **modelo de documento JSON** (secciones + tema + textos) que renderiza el mismo `<QuoteDocument>` de la vista cliente y del PDF (doc 05) | **8 / 10 / 13** (R3) |
| **L2 · Editor de bloques** | Todo L1 más **agregar/quitar bloques** (texto enriquecido, imagen, tabla, columnas, separador, firma, QR), arrastrar para reordenar, **variables** (`{cliente}`, `{total}`, `{vigencia}`), **varias plantillas** por tipo de documento (presupuesto, orden de trabajo, comprobante, etiqueta), versiones de plantilla y plantilla por cliente/canal | Mismo modelo JSON con bloques tipados; reordenar con `dnd-kit`; texto enriquecido con TipTap o Lexical (carga diferida); previsualización idéntica al PDF | **+16 / 21 / 27** (opcional, R7) |
| **L3 · Editor libre (HTML/CSS)** | Edición arbitraria de HTML/CSS | — | **No recomendado:** riesgo de seguridad (HTML no confiable en Chromium), plantillas rotas por cada cambio de diseño y soporte costoso (30+ jornadas) |

**Datos:** `document_templates(id, kind, name, locale, schema jsonb, theme jsonb, is_default, version, created_by, …)`, `quotes.template_id/template_version` y `quotes.doc_overrides jsonb`; el PDF almacenado (doc 05 §5.2) preserva lo entregado.

**Seguridad:** el contenido se guarda como **JSON tipado, no como HTML**; el texto enriquecido se serializa a un esquema restringido; los logos SVG se sanean (el servicio de assets ya sanea SVG); nada de HTML crudo hacia Chromium.

**Estimación del paquete:** **L1 = 8 / 10 / 13 en R3**; L2 opcional **16 / 21 / 27** (posterior).

### N8 · Librería visual (componentes y widgets, siempre móvil y responsivo)

**Punto de partida:** Next 15, React 19, Tailwind 3.4, tokens CSS propios y clases `.btn/.input/.card`; lenguaje «capa a capa» a conservar. **No existe** una librería de componentes (solo `lucide-react` instalado y sin uso).

| Opción | Encaje | Widgets incluidos | Móvil / responsivo | Temas | Contras |
|---|---|---|---|---|---|
| **A · shadcn/ui** (Radix + Tailwind, código propio) + Recharts, TanStack Table, cmdk, vaul, dnd-kit, react-day-picker | **Muy alto** (usa Tailwind y variables CSS; se adopta componente a componente) | Tablas, gráficos, calendario/selector de fecha, paleta de comandos, hojas laterales, toasts, formularios | Excelente (Drawer/Sheet móvil, primitivas accesibles) | Variables CSS: paletas intercambiables | Hay que ensamblar; **verificar** soporte con Tailwind 3.4 + React 19 (la guía oficial prioriza Tailwind 4 y Recharts exige un ajuste de `react-is`) |
| **B · Mantine** (8.x) | Medio (sistema de estilos propio, convive con Tailwind) | **Muy completo**: gráficos, fechas, editor de texto enriquecido (TipTap), dropzone, spotlight, carrusel, notificaciones | Muy bueno (props responsivas) | `createTheme` + variables CSS | Segundo sistema de estilos; migración visual mayor; identidad hay que tematizarla |
| **C · HeroUI** | Alto (plugin Tailwind, React Aria) | Pocos gráficos/tablas avanzadas | Bueno | Temas por plugin | Menos widgets; dependencia de framer-motion |
| **D · MUI / Ant Design** | Bajo | Muchísimos | Bueno | Propio | Pesadas; cuesta igualar la identidad |
| **E · Tremor** | Alto (Tailwind) | Solo dashboards y gráficos | Bueno | Limitado | No cubre formularios ni tablas generales |

**Recomendación:** **A (shadcn/ui + stack asociado)** por encaje con el código actual, propiedad del código y temas por variables; **B (Mantine)** como alternativa si pesa más «tener muchos widgets ya hechos» (gráficos, fechas y editor de texto incluidos, útil para N7/L2). **Decidir con un spike comparativo (S8)**: construir la **misma pantalla piloto** (detalle de cotización con modal «Ver detalles», tabla con vista recordada, un gráfico y cambio de paleta) en ambas y medir tiempo, peso del bundle y fidelidad con la identidad.

**Contrato «siempre móvil y responsivo»** (aplica a cualquier opción):
- Puntos de corte y objetivos táctiles ≥ 44 px (ya vigentes); **Drawer/hoja inferior en móvil** donde en escritorio hay modal o panel lateral.
- **Tablas:** columna fija + scroll horizontal, o tarjetas apiladas; nunca desbordar la página.
- **Gráficos** con tamaño fluido y leyendas que se pliegan; texto legible a 360 px.
- **Matriz de pruebas** en CI (Playwright): 360 · 768 · 1280 px, claro/oscuro, cada paleta; sin scroll horizontal de página y sin elementos solapados.
- Cada componente nuevo del kit se entrega con su variante móvil.

**Widgets (opcional):** «Inicio» configurable con un catálogo de widgets (taller en vivo, alertas, stock bajo, cotizaciones por seguir, ventas del mes, cola), ordenables y con valores por rol; en móvil se apilan. **6 / 8 / 11** (opcional, posterior).

**Estimación:** S8 **2 / 2,5 / 3,5** (R0) · WP-6.1' adopción de la librería, kit base y arquitectura de temas **8 / 10 / 13** (R1; reemplaza al 6.1 de 5 / 6 / 7).

### N9 · Temas visuales con paletas de color

**Hoy:** tokens CSS (`--bg`, `--accent`…) con claro/oscuro por `prefers-color-scheme`, **pero** `tailwind.config.ts` fija colores con hex (`brand`, y sobrescribe la escala `slate`) y muchas pantallas usan clases literales (`emerald-`, `amber-`, `red-`): para cambiar de paleta hay que **tokenizar** esos usos.

**Diseño:**
- **Tres capas de tokens:** primitivas (escalas) → semánticos (`--bg`, `--card`, `--ink`, `--accent`, `--ok/--warn/--bad`, `--chart-1…8`) → componentes. Tailwind referencia variables (`rgb(var(--accent) / <alpha>)`).
- **Selector de paleta** `data-palette` × `data-theme` (claro/oscuro/sistema). Paletas iniciales sugeridas: **Capa a capa** (actual), **Grafito**, **Océano**, **Bosque**, **Violeta** y **Alto contraste** (accesibilidad); cada una con claro y oscuro.
- **Marca:** el color de marca (wizard N10 / Configuración) **deriva** una paleta con escala tonal y tinta de texto con contraste AA calculado; validación automática de contraste al guardar.
- **Alcance de la elección:** paleta por defecto del taller (Configuración) y **preferencia por usuario** (opcional); el **PDF** sigue la marca del taller, no la paleta de la interfaz.
- Gráficos y estados semánticos usan los tokens (nada de colores sueltos).

**Estimación:** tokenización y arquitectura (**incluida en WP-6.1'**, R1) · catálogo de paletas, selector, derivación desde marca y pruebas de contraste **N9b = 3,5 / 5 / 7** (R6).

### N10 · Asistente de configuración inicial (primer arranque)

**Hoy (verificado):** `scripts/seed.ts --bootstrap-only` (que el `Dockerfile` ejecuta al iniciar) crea el taller y un administrador con `ADMIN_EMAIL`/`ADMIN_PASSWORD`; **si no se definen, la contraseña es `admin1234`** (`lib/seed.ts`). `INSTALL.md` pide editar `.env` a mano. No hay asistente ni detección de primer uso.

**Seguridad (prioridad):** un asistente abierto permite que **la primera persona que llegue al servidor se quede con la cuenta de administrador**. Propuesta: **token de configuración** de un solo uso generado al iniciar (impreso en los logs del contenedor y guardado con hash), requerido en el primer paso; se invalida al terminar. Alternativas: aceptarlo solo desde `localhost`, o seguir usando `ADMIN_EMAIL/ADMIN_PASSWORD` para instalaciones desatendidas (en ese caso se omite la creación de cuenta). Además, **eliminar el valor por defecto `admin1234`**: sin contraseña definida, no se crea administrador hasta completar el asistente.

**Detección y flujo:** bandera `settings.setup = { completedAt, steps: { id: 'hecho'|'omitido' } }`. Mientras `completedAt` sea nulo, todas las rutas redirigen a `/bienvenida`. El asistente es **reanudable**, saltable por paso (excepto los obligatorios) y **re-ejecutable** desde Configuración; lo omitido queda en una **lista de puesta en marcha** en Inicio.

**Pasos (marcados por obligatoriedad):**

| # | Paso | Tipo | Contenido |
|---|---|---|---|
| 0 | Token de configuración | **Obligatorio** (si no hay credenciales por entorno) | Verifica que quien configura tiene acceso al servidor |
| 1 | Idioma y región | **Obligatorio** (con valores por defecto) | es/en, moneda, zona horaria, formato de fecha y número |
| 2 | Cuenta de administrador | **Obligatorio** | Nombre, correo, contraseña (política mínima, medidor de fortaleza) |
| 3 | Tu taller | **Obligatorio** (solo el nombre) | Nombre comercial; el resto es opcional |
| 4 | Datos fiscales y contacto | Opcional | Razón social, RUT/identificador fiscal, dirección, teléfono, correo, web |
| 5 | Marca y apariencia | Opcional | Logo, color de marca, **paleta/tema** (N9), tipografía, vista previa en vivo |
| 6 | Documentos | Opcional | Validez, anticipo %, datos de transferencia, condiciones, plantilla del PDF (N7/L1), numeración |
| 7 | Tarifas y precios | Opcional (recomendado) | Entrada al asistente de tarifas de la spec de calculadora (§5.1); si se omite, perfil «Heredado» y medidor de completitud |
| 8 | Impresoras | Opcional (recomendado) | Agregar máquinas, conectar Bambu por LAN o nube, elegir modelo y boquilla |
| 9 | Laminador | Opcional | Verifica OrcaSlicer (versión) y calidad por defecto; guía si falta |
| 10 | Materiales | Opcional | Alta masiva de filamentos (N4) y stock inicial |
| 11 | Equipo y roles | Opcional | Invitar usuarios (administrador/operador/ventas), permisos por rol |
| 12 | Canales y listas de precios | Opcional | Hoy se siembran por defecto (WhatsApp, Instagram, Mercado Libre…): editar/ocultar |
| 13 | IA opcional | Opcional | Elegir proveedor (preferir local) o dejarla apagada |
| 14 | Datos de demostración | Opcional | Cargar ejemplos (apagado por defecto) |
| 15 | Resumen | — | Qué quedó configurado, qué falta y accesos directos |

**Dos modos:** **Rápido** (pasos 0–3, ≈ 2 minutos) y **Completo** (todos). Los pasos que ya tienen su propia especificación (7) solo se enlazan; el resto reutiliza formularios existentes (`config-forms`, máquinas, inventario).

**Estimación (R1):** marco, detección, token y guardas **3 / 4 / 5** · pasos obligatorios **2 / 2,5 / 3** · pasos opcionales (reutilizando formularios) **4 / 5,5 / 7,5** · lista de puesta en marcha en Inicio y re-ejecución **1 / 1,5 / 2** → **N10 = 10 / 13,5 / 17,5**. Fuera: el asistente de tarifas (spec calculadora, Fase 3) y las plantillas L2.

## 4. Preguntas nuevas (segunda ronda)

Se publican en el artefacto para responder allí:

| # | Pregunta | Recomendación |
|---|---|---|
| Q-F1 | «Ver detalles» de la cotización: ¿vista en el sitio, anexo en el PDF o ambos? | Ambos: en el sitio (modal + página) y anexo PDF opcional |
| Q-F2 | Vista tabla: ¿listado, líneas de la cotización o ambos? | Ambos |
| Q-F3 | Editor de documentos: ¿L1, L1 y luego L2, o L2 directo? | L1 primero; L2 después si hace falta |
| Q-F4 | Librería visual: ¿shadcn/ui, Mantine o decidir tras el spike comparativo? | Decidir tras S8 (shadcn/ui como favorita) |
| Q-F5 | Paletas: ¿solo el administrador elige la del taller o cada usuario la suya? | Taller por defecto y preferencia por usuario |
| Q-F6 | Seguridad del primer arranque | Token en los logs; se mantiene `ADMIN_*` para instalaciones desatendidas; sin contraseña por defecto |
| Q-F7 | Licencias de modelos importados al cotizar | Advertir en la línea (no bloquear) |
| Q-F8 | Etiquetas por IA: ¿sugerir y confirmar o aplicar automáticamente? ¿Se puede enviar la miniatura a un proveedor en la nube? | Sugerir y confirmar; miniatura solo a IA local salvo que el administrador autorice la nube |
| Q-F9 | Catálogo inicial de marcas y colores para el alta masiva | Bambu Lab, Sunlu, eSun, Polymaker, Creality, Elegoo, Grilon3 y genéricos |
| Q-F10 | Tras eliminar el vínculo material→perfil: ¿recordar la «última elección» de filamento por (usuario, material, máquina)? | Sí, como preferencia de usuario (no como dato del material) |

## 5. Efecto neto en esfuerzo

Resumen (el detalle por paquete está en `09-plan-y-estimaciones.md`):

| Bloque | Opt. | Prob. | Pes. |
|---|---:|---:|---:|
| Plan anterior (primera ronda) | 94 | 118,25 | 144 |
| Cambios por decisiones (E2 spec Fase 1, kit con librería, agrupación D14, i18n mayor, spike S8) | +13 | +16,5 | +22,5 |
| N1 color y AMS (incluye spike S7) | +7 | +9,5 | +12,5 |
| N2 etiquetas por IA | +4 | +5 | +7 |
| N3 importador por URL + S6 | +9,5 | +13 | +18 |
| N4 alta masiva | +5,5 | +7,5 | +10 |
| N5 detalle y anexo | +4,5 | +6 | +8,5 |
| N6 vista tabla y recordada | +4 | +5,5 | +7,5 |
| N7 editor L1 | +8 | +10 | +13 |
| N9b paletas | +3,5 | +5 | +7 |
| N10 asistente inicial | +10 | +13,5 | +17,5 |
| **Total** | **163** | **209,75** | **267,5** |

_(Las filas suman exactamente el total; el desglose por paquete está en `09`.)_ Opcionales fuera del total: editor de bloques L2 (16 / 21 / 27), widgets de Inicio (6 / 8 / 11), edición de placa (10 / 12,5 / 15), y las Fases 2–5 de la spec de calculadora (27 / 36 / 49).
