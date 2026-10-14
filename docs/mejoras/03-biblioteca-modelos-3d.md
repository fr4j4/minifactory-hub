# 03 · Propuesta: biblioteca de modelos 3D (importación, gestión y visualización)

Resuelve: **BIB-01 … BIB-11**, parte de **VIS-02** (vista) y **UX-04**.
Relacionado: el Estudio de laminado (`04-estudio-de-laminado.md`) absorbe el visor, el análisis y el laminado en una sola pantalla.

## 1. Cómo funciona hoy (resumen)

```
Uploader (partes de 4 MB, reanudable, 1 archivo a la vez)
   └─ /api/uploads/[id]/complete → ingestModel()
        ├─ guarda archivo (sha256) → crea model_files + file_versions (status:'processing')
        ├─ si el hash ya existe: ✅ crea igual · ⚠ devuelve duplicateOf (solo toast)
        └─ processVersion() en memoria: análisis, miniatura WebP, preview binario MFM1,
           metadatos de laminado (3MF/G-code), preview de capas MFG1
Biblioteca /archivos: grilla 4–5 columnas · filtro GET · límite 200
Detalle /archivos/[id]: pestañas (Visor · Laminar y cotizar · Versiones · Vínculos)
```

## 2. Objetivos

1. Subir **muchos** archivos (y ZIP/carpetas) sin fricción y sin crear duplicados por accidente.
2. Que un modelo «cuente su historia» de un vistazo: ¿cabe?, ¿está sano?, ¿cuánto cuesta/tarda?, ¿dónde se usó?
3. Gestionar cientos de modelos: buscar, filtrar, ordenar, agrupar y operar en lote.
4. Un solo espacio de trabajo por modelo (ver → ajustar → laminar → cotizar) sin recargas.

## 3. Importación

| Mejora | Detalle | Hallazgo |
|---|---|---|
| **Cola de ingesta persistente** | Generalizar la cola de laminado (`slice_runs`) a una tabla `jobs(kind, payload, status, attempts, error)` con worker. `processVersion` pasa a ser un job: se reanuda tras reinicio, reintenta y reporta error legible. La UI deja de recargar la página entera; consulta solo el estado del job (SSE o polling ligero). | BIB-02 |
| **Detección de duplicados con decisión** | Calcular el hash **antes** de crear la ficha (el cliente puede enviar el SHA-256 al iniciar la subida; el servidor responde «ya existe»). Diálogo: **Usar el existente · Subir como versión nueva de… · Mantener ambos**. | BIB-01 |
| **Subida multi-archivo paralela** | 2–3 subidas concurrentes, lista con progreso por archivo, cancelar/reintentar, panel flotante que sobrevive a la navegación. | BIB-03 |
| **ZIP y carpetas** | Aceptar `.zip` (descomprimir en servidor con `fflate`, ya dependencia) y arrastrar una carpeta (`webkitdirectory`): la estructura de carpetas pasa a `folder`. Límite y validación de tamaño total. | BIB-03 |
| **Metadatos por lote** | Paso opcional tras soltar: cliente, carpeta, etiquetas, licencia/origen aplicables a todo el lote. | BIB-03 |
| **Importar por URL** _(opcional, fase posterior)_ | Pegar un enlace de Printables/Thingiverse/MakerWorld; se guarda `origin`/`author`/`license` y se descarga el archivo. Depende de términos de uso y cambios de sitios: tratar como «mejor esfuerzo». | BIB-03 |
| **3MF inteligente** | Listar objetos y placas dentro del 3MF; usar la miniatura embebida de la placa (p. ej. Bambu Studio) cuando exista; ofrecer «dividir en modelos». _(Verificar estructura real con 3MF de muestra en `samples/`.)_ | BIB-04 |
| **STEP** | Decidir: (a) convertir a malla en servidor (p. ej. `occt-import-js`/OpenCascade WASM) y permitir laminar, o (b) dejarlo como adjunto y corregir el texto de la UI. | BIB-09 |
| **Reparación** | Mostrar claramente «malla abierta/normales invertidas» con botón «Reparar y crear versión» (cierre de agujeros simple + reorientar normales) o, mínimo, enlace a guía. Alcance a definir. | análisis ya existente |

## 4. Biblioteca (listado)

```
┌ Archivos 3D ───────────────────────────────────────────── [⬆ Subir] [＋ Carpeta] ┐
│ 🔎 Buscar…        Carpeta ▾   Etiquetas ▾   Formato ▾   Cabe en ▾   ★ Favoritos   │
│ Orden: Recientes ▾        Vista: [▦ Grilla] [☰ Lista]        124 modelos          │
├───────────┬──────────────────────────────────────────────────────────────────────┤
│ Carpetas  │  ☐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                       │
│ ▸ Clientes│    │  ⟳ 3D  │ │        │ │        │ │        │  ← miniatura giratoria │
│   ▸ Aromos│    │ STL    │ │ 3MF    │ │ STL    │ │ STL    │    al pasar el cursor  │
│ ▸ Catálogo│    │ Engr.. │ │ Llavero│ │ Barco  │ │ Placa  │                        │
│ ▸ Pruebas │    │ ✓A1 ✓P1│ │ ✓A1 ⚠  │ │ ✕A1    │ │ ✓A1    │  ← «cabe en…»         │
│ ★ Favoritos│   │ 0:43 h │ │ 7,3 g  │ │ 3 cot. │ │ 12 lam.│  ← señales de uso      │
│ 🗑 Papelera│   └────────┘ └────────┘ └────────┘ └────────┘                        │
│           │  [Seleccionados: 3]  Etiquetar · Mover · Asignar cliente · Eliminar   │
└───────────┴──────────────────────────────────────────────────────────────────────┘
```

| Mejora | Detalle | Hallazgo |
|---|---|---|
| **Filtros y búsqueda en cliente/URL** | Estado en la URL (`?q=&tag=&fmt=&fits=`) con actualización sin recarga y debounce; búsqueda por nombre, etiquetas, origen, cliente. | BIB-05 |
| **Paginación / scroll infinito** | Cursor por `updated_at,id`; quitar `limit(200)`. | BIB-05 |
| **Etiquetas y carpetas de primera clase** | Tablas `tags` y `folders` (árbol con `parent_id`) en vez de JSON/texto; índice y conteos; renombrar/combinar etiquetas. Migración desde `model_files.tags/folder`. | BIB-05 |
| **Selección múltiple y acciones masivas** | Etiquetar, mover, asignar cliente, favorito, eliminar (papelera con restauración), exportar ZIP. | BIB-05 |
| **Miniatura «turntable»** | Generar al procesar un sprite de 8–12 cuadros (o 3 vistas) y animarlo al pasar el cursor; en móvil, tocar. Costo: tiempo de proceso y almacenamiento (WebP ~40–80 KB/modelo). | BIB-06 |
| **Insignias de estado** | «Cabe en A1/P1S» (según volumen de máquinas), «malla abierta», «N laminados», «usado en N cotizaciones», «última corrida: tiempo/gramos». Datos ya disponibles (`slice_runs`, `quote_item_models`). | BIB-06 |
| **Vista lista densa** | Tabla ordenable (nombre, formato, dimensiones, volumen, versión, cliente, actualizado). | BIB-05 |
| **Colecciones / proyectos** | Agrupar modelos por trabajo/cliente con portada y notas (reutiliza `collections` de la galería o un modelo propio). | BIB-11 |

## 5. Detalle del modelo

- **Un solo espacio**: el visor deja de ser una pestaña; la ficha del modelo es una página con **visor central** y panel lateral con pestañas _sin recarga_ (estado en cliente, URL con `#tab`): **Resumen · Análisis · Laminar · Versiones · Vínculos**.
- **«¿Cabe en mis máquinas?»** pasa a ser contenido real: tarjeta con cada máquina (✓/✕, holgura en mm, rotación sugerida) en lugar de un texto que remite a otra pestaña (BIB-07).
- **Orientación persistente:** las rotaciones/«cara a la cama»/escala del visor se guardan como **orientación del modelo** (`file_versions.meta.orientation` o tabla propia) y **se aplican al laminar** (ver `04-estudio-de-laminado.md` §6). Mientras no esté implementado, mostrar un aviso explícito en el visor: «La orientación es solo de prueba» (BIB-08, arreglo rápido en Fase 0).
- **Versiones:** tabla comparativa (Δ dimensiones, volumen, triángulos, tamaño) y comentario sugerido al subir; «Restaurar como actual» ya existe.
- **Reprocesar** (`reprocessVersionAction` ya existe) visible cuando una versión falló.

## 6. Datos / API (resumen técnico)

| Cambio | Nota |
|---|---|
| `jobs` (genérica) | Reemplaza `uploadSessions`-seguimiento y `processVersion` fire-and-forget; reutilizable por PDF y miniaturas. |
| `tags`, `model_tags`, `folders` | Migración con script que normaliza JSON/texto existente. |
| `file_versions.meta.orientation` | `{ quaternion:[x,y,z,w], scale:[x,y,z] }`; aplicado al construir el 3MF de laminado. |
| `GET /api/files?cursor=&q=&…` | Listado paginado para la vista cliente. |
| `POST /api/uploads` con `sha256` | Permite responder «duplicado» antes de transferir. |

## 7. Pruebas

- Unitarias: normalización de etiquetas/carpetas, hash previo, aplicación de orientación.
- Integración: ingesta con reinicio simulado (job reanudable), ZIP con subcarpetas, duplicado con las 3 decisiones.
- E2E a actualizar: `01-visor-archivos` (grilla, filtros, detalle), `07-movil`.
- Rendimiento: lista con 1 000 modelos sintéticos; miniaturas turntable (tiempo de generación por modelo grande).

## 8. Decisiones que necesito de ti

| # | Decisión | Recomendación |
|---|---|---|
| D4 | STEP: ¿convertir a malla (más dependencia) o solo adjuntar? | Convertir solo si hay uso real de STEP; si no, adjuntar y aclarar texto |
| D5 | ¿Importar por URL? | Posponer; priorizar ZIP/carpeta y duplicados |
| D6 | ¿Reparación de mallas dentro del sitio? | Fase posterior; por ahora mostrar el problema y guiar |
