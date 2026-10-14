# 07 · Propuesta: sistema visual y usabilidad transversal («más fancy», sin perder identidad)

Resuelve: **UX-01 … UX-09**, **PDF-03** (marca), base visual de todos los demás documentos.

## 1. Punto de partida: qué conservar

El lenguaje «capa a capa» (papel técnico cálido, panel grafito, naranja de boquilla, tipografía Bricolage Grotesque + Geist/Geist Mono, LEDs de estado, barras segmentadas) es una **identidad propia y coherente**. La propuesta **no la reemplaza**: la lleva más lejos en las pantallas de trabajo (laminador, cotizaciones, inventario), que hoy son «formularios + tablas» frente a un panel de inicio mucho más cuidado.

## 2. Principios de interacción

1. **Mostrar, no solo listar:** muestras de color, miniaturas 3D, anillos de carrete, barras de costo en capas, vistas previas en vivo.
2. **Decidir con contexto:** cada selector muestra lo que ayuda a elegir (stock, compatibilidad, costo, tiempo).
3. **Sin recargas:** cambios de pestaña, filtros y acciones actualizan solo lo necesario; se conserva scroll, cámara del visor y selección.
4. **Nunca en blanco:** esqueletos de carga, estados vacíos con acción guiada, errores con salida clara.
5. **Un clic para lo común, profundidad para lo raro:** modo simple/avanzado, secciones colapsables, «Más opciones».
6. **Bilingüe por diseño:** todo componente nuevo recibe textos por `t()`/`MessageKey` (es y en); nada de cadenas literales ni de textos incrustados en SVG/imagen.
7. **Móvil-primero donde se opera** (cola, inventario, escaneo, fotos); **escritorio-primero donde se diseña** (Estudio, cotizaciones).

## 3. Biblioteca de componentes base (nueva, `src/components/kit/`)

| Componente | Reemplaza / resuelve | Usado en |
|---|---|---|
| `Select` rico (combobox con búsqueda, ítem con muestra/meta/insignias) | `<select>` nativo (UX-03) | máquina, material, calidad, cliente, modelo |
| `Tabs` cliente (estado en URL con `history.replaceState`, sin recarga) | pestañas por enlace (UX-04) | archivos/[id], laminador, inventario, cotización |
| `Drawer` (panel lateral, formularios largos con secciones y guardado fijo) | modales largos (UX-07) | material, filamento, máquina, perfil |
| `Segmented` | grupos de botones ad-hoc | calidad, modos de color, vista grilla/lista |
| `DataTable` (orden, columnas, selección múltiple, barra de acciones masivas, paginación por cursor, densidad) | tablas con `Table` básico | biblioteca, presupuestos, inventario, perfiles |
| `Stat` / `Delta` (KPI + variación) | tarjetas ad-hoc | resultados de laminado, calculadora, KPIs |
| `LayerBar` (barra apilada «capas» con leyenda) | `Meter` + desglose en `<details>` | costos, uso de material, avance |
| `Spool` (anillo de carrete con color) | barra simple de stock | inventario, bobinas |
| `Swatch` / `Thumb` (miniatura 3D con turntable) | imágenes sueltas | biblioteca, líneas, PDF |
| `Skeleton`, `EmptyState` (con ilustración y acción) | ausencia de carga (UX-01) | todo |
| `Toast` con acción («Deshacer») | toasts simples | eliminar, mover, enviar |
| `Kbd` + atajos y paleta de acciones | solo búsqueda (UX-08) | global |
| Íconos: **`lucide-react`** (ya instalado y sin uso) | emojis + SVG ad-hoc (UX-05) | todo; migrar `shell.tsx` `ICONS` |

## 4. Mejoras visuales concretas

| Área | Idea | Notas |
|---|---|---|
| **Laminador / Estudio** | Panel de parámetros por secciones con punto «modificado» y reset; resultado con tarjetas KPI y **deltas**; visor con modos de color y leyenda; **animación «pieza creciendo»** al laminar (reusa el motivo del inicio/login) | Ver doc 04 |
| **Cotizaciones** | Stepper de estado; tarjetas de línea con miniatura; **barra de costos en capas**; vista previa tipo «hoja» del documento; chips de vigencia | Ver doc 05 |
| **Biblioteca** | Miniaturas giratorias, insignias «cabe», vista lista densa, árbol de carpetas | Ver doc 03 |
| **Inventario** | Carretes circulares con color real, agrupación por marca/línea, alertas visuales de stock | Ver doc 06 |
| **Inicio** | Tarjeta «Cotizaciones por seguir», cola de laminado global (indicador en la barra superior) | Ver doc 08 |
| **Movimiento** | Transiciones de panel (Drawer), _layout animations_ al reordenar, microinteracciones en botones primarios (ya existe el «borde de capa») | Respetar `prefers-reduced-motion` (ya implementado) |
| **Tema** | Tokens CSS ya definidos (`--accent`, `--panel`…); añadir escala de espaciado y elevación, y tokens semánticos (`--ok`, `--warn`, `--bad`) para dejar de usar clases `emerald-/amber-/red-` sueltas | Modo oscuro verificado con capturas existentes (`96-98`) |
| **Tipografía** | Mantener; usar Geist Mono para cifras con unidades en versalitas (ya hay `.num`) también en tablas | — |
| **Densidad** | Preferencia de usuario «Cómoda / Compacta» (afecta `min-h` de controles) | Hoy `min-h-[44px] md:min-h-[38px]` fijo |

## 5. Usabilidad transversal

- **Estados de carga/error:** `loading.tsx` con esqueletos por sección y `error.tsx` con «Reintentar» y detalle técnico plegable; `not-found.tsx` útil (UX-01).
- **Acciones sin recarga completa:** `useAction` pasa a invalidación **granular** (revalidar solo la ruta/segmento o actualizar estado local con optimismo) y mantener foco/scroll (UX-02).
- **Fechas y números según el idioma elegido (es/en):** reemplazar `<input type="date">` (sigue el idioma del navegador, no el del sitio) por un campo con máscara (`dd-mm-aaaa` en es-CL) y selector, con la zona horaria del taller (UX-06). El selector de idioma ya existe (`locale-switcher.tsx`).
- **Formularios:** validación en línea, errores junto al campo, guardado con atajo `Ctrl+S`, aviso de cambios sin guardar (ya existe en cotizaciones; generalizar).
- **Paleta global (`Ctrl+K`)** con acciones: «Laminar archivo X», «Nuevo presupuesto para cliente Y», «Ir a bobina B-0003».
- **Atajos** documentados en un diálogo `?`.
- **Accesibilidad:** mantener axe en e2e; foco visible; navegación de teclado en Select/Drawer/DataTable; _roles_ ARIA correctos en el nuevo combobox.

## 6. Migración sin «big bang»

1. Crear el kit con 3–4 componentes críticos (Select rico, Tabs cliente, Drawer, Skeleton/EmptyState).
2. Adoptarlos primero en las pantallas del plan (Estudio, cotizaciones, biblioteca, materiales).
3. Migrar el resto (clientes, pedidos, cola, máquinas, ventas, galería, reportes, configuración) en un barrido final.
4. **Regresión visual:** capturas Playwright por pantalla y tema (claro/oscuro, móvil/escritorio) comparadas en CI (hoy hay capturas pero no comparación automática).

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| Rediseño parcial que deja pantallas «de dos épocas» | Kit pequeño primero + barrido final planificado (6.2) |
| Pruebas e2e frágiles (`data-testid`) | Mantener los `data-testid` existentes en componentes nuevos cuando sea posible; actualizar specs por fase |
| Rendimiento (componentes ricos, miniaturas animadas) | Carga diferida, sprites WebP livianos, `content-visibility` en listas largas |
