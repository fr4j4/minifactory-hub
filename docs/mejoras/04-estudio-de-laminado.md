# 04 · Propuesta: «Estudio de laminado» (slicer embebido y configurable)

Resuelve: **VIS-01 … VIS-08**, **PFC-06**, **BIB-07/08**, **TEC-01**.
Depende de: `02-perfiles-filamentos-calidad.md` (resolvedor, calidades, ajustes de sesión).
Se apoya en lo ya construido: **asesor de perfiles** (Fase 1 de `docs/spec-ia.md`: candidatos validados + laminado real + ranking), **ficha de desempeño** y **explicación de errores** (`lib/slicer/performance.ts`, `explain.ts`, `slice-error-help.tsx`), **validador determinista** (`lib/slicer/validate.ts`) y **etiquetas de parámetros por i18n** (`src/i18n/{es,en}/slicerParam.ts`).

## 1. Qué es posible (y qué no) — punto de partida realista

El «laminador» del sitio es **OrcaSlicer en modo línea de comandos (CLI)**, ejecutado en el servidor (`lib/slicer/run.ts`): recibe un modelo + 3 JSON de perfil y devuelve G-code, 3MF y metadatos. Eso define el alcance:

| Capacidad | ¿Viable? | Cómo |
|---|---|---|
| Cambiar **cualquier parámetro** de máquina/proceso/filamento y ver tiempo, gramos, costo y capas | ✅ Sí | Ajustes de sesión → `--load-settings` (ya soportado: `buildCliProfile` aplica `changes`) |
| Ver el G-code resultante capa a capa con colores por tipo/velocidad/flujo | ✅ Sí | Parser propio (`lib/gcode.ts`) + visor three.js mejorado |
| «Re-laminar al vuelo» tras cada cambio | ⚠️ Parcial | Cada corrida es un proceso (≈ 1–2 s piezas chicas; minutos piezas grandes). Con _debounce_, cancelación y caché es usable; **no** es instantáneo como el programa de escritorio |
| Mover/rotar/escalar el modelo y que cuente al laminar | ✅ Sí | Construir un 3MF con la transformación (hoy el visor es solo visual: BIB-08) |
| Varios objetos en la placa, orden automático (`--arrange`) y orientación automática (`--orient`) | ✅ Sí _(por verificar flags)_ | 3MF construido en servidor + opciones de CLI |
| Ajustes **por objeto** (relleno distinto por pieza) | ⚠️ Medio | Escribir `Metadata/model_settings.config` en el 3MF _(por verificar compatibilidad CLI)_ |
| **Pintar soportes / costuras / multicolor por zona** | ❌ No recomendado | Requiere el editor gráfico de Orca (gizmos de pintura, volúmenes modificadores). Coste desproporcionado |
| Slicer **en el navegador** (WASM) | ❌ No | OrcaSlicer no ofrece build WASM mantenido; el servidor sigue siendo el motor |

**Conclusión:** el objetivo «slicer full configurable embebido» se cumple **al nivel de parámetros + vista previa + exploración + edición de placa básica**. El pintado y los modificadores gráficos quedan fuera (y se pueden abrir en Bambu Studio exportando el 3MF).

## 2. Spikes de validación (antes de comprometer fechas)

| Spike | Pregunta | Entregable | Esfuerzo |
|---|---|---|---|
| **S1** | ¿Qué flags del CLI de la versión instalada (2.4.2) sirven? (`--orient`, `--arrange`, `--rotate*`, `--scale`, `--load-assemble-list`, `--info`, salida de progreso) | Tabla de flags verificada con `OrcaSlicer --help` + pruebas | 0,5 d |
| **S2** | ¿Se pueden obtener **etiquetas/tooltips/rangos** de los parámetros desde el propio AppImage (catálogos `i18n`, metadatos de `PrintConfig`)? Si no, curar a mano ~120 parámetros | Generador `scripts/gen-orca-schema.ts` o lista curada | 1–1,5 d |
| **S3** | Tiempos reales de laminado (pieza chica / media / grande, con y sin soportes) en el hardware del taller | Tabla de tiempos → define UX de espera | 0,5 d |
| **S4** | ¿El CLI respeta objetos/transformaciones/ajustes por objeto de un 3MF construido por nosotros? | Prueba con 3MF sintético (2 objetos, 1 con relleno distinto) | 1 d |
| **S5** | Tipos de línea (`;TYPE:`) y datos disponibles en el G-code de Orca para colorear por velocidad/flujo/tiempo | Muestras + especificación del parser | 0,5 d |

Total spikes ≈ **3,5–4 jornadas** (paquete 5.0 del plan de estimaciones, previo al resto de la Fase 5).

## 3. Experiencia propuesta

### 3.1 Layout (escritorio)

```
┌ Estudio · Engranaje 16 dientes (v2) ──────────── [Guardar como perfil] [Cotizar] [⬇] ┐
│ Máquina ▾ Bambu A1 #1    Calidad ( Borrador )( ●Estándar )( Fino )…   Filamento ▾ PETG│
├───────────────┬───────────────────────────────────────────────┬─────────────────────┤
│ PLACA         │            [ Preparar ]  [ Vista previa ]      │ AJUSTES   🔎 buscar │
│ ▸ Engranaje×1 │                                                │ [Simple|Avanzado|Experto]
│   rot  0 0 0  │      ┌─────────────────────────────┐          │ ─ Calidad ────────── │
│   esc 100 %   │      │        visor 3D / capas     │          │ Altura de capa 0,20 ●│
│ + Agregar     │      │   (cámara compartida)       │          │ Altura 1ª capa  0,20 │
│ [Orientar ↺]  │      └─────────────────────────────┘          │ ─ Resistencia ────── │
│ [Ordenar  ▦]  │   ◀ capa 164/164 ▶  ━━━━━━●━━  Z 32,7 mm      │ Paredes   2 → [3] ● ↺│
│ ¿Cabe? ✓A1 ✓P1│   Color: [Tipo] Velocidad Flujo Capa-t Temp   │ Relleno 15 %  gyroide│
├───────────────┴───────────────────────────────────────────────┤ ─ Soportes ───────── │
│ ⏱ 0:43 h  (−0:06 vs base)  ⚖ 7,3 g (+0,4)  ≡ 164 capas  💲 $3.000 (+$120)           │
│ [ ● Laminado  hace 4 s ] [ Desactualizado ⟳ Re-laminar ]  Base: Estándar  [Comparar] │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- **Modos Preparar / Vista previa** con **cámara compartida** (cambiar de modo no pierde el encuadre).
- **Barra de resultados** con KPIs y **deltas contra una base** («−0:06 vs Estándar»): lo más valioso al explorar.
- Estado visible del laminado: _Laminado_ · _Desactualizado_ (ajustes cambiaron) · _Laminando…_ (con cancelar) · _Error_ (mensaje legible).
- En móvil: vista previa + resultados + selector de calidad; el panel de parámetros avanzados en una hoja inferior (edición completa en escritorio).

### 3.2 Panel de ajustes (sustituye al `ProfileEditor` plano)

- **Esquema de parámetros** (`src/lib/slicer/schema/*.json`): por clave Orca → `{ label_es, tooltip_es, group, page, kind, unit, min, max, options[], mode: simple|advanced|expert, dependsOn }`.
  - Fuente: S2 (si el AppImage trae los textos) o lista curada de ~120 parámetros (los que se usan en la práctica) con _fallback genérico_ para el resto (clave cruda editable, como hoy).
  - **i18n:** cada `label`/`tooltip` es una `MessageKey` con versión **es y en** (mismo mecanismo que `SIMPLE_PARAMS` en `lib/slicer/params.ts`); el esquema curado **extiende** `SIMPLE_PARAMS` (hoy 7 de máquina, 14 de proceso y 9 de filamento) en lugar de crear una segunda lista (evita repetir PFC-07). El generador de S2 solo propone claves; la traducción se revisa a mano.
- Organización como en Orca: **Calidad · Resistencia · Velocidad · Soportes · Otros** (proceso) · **Filamento** (temperaturas, flujo, enfriamiento) · **Máquina** (límites, G-code, retracción).
- **Valor modificado resaltado** (punto de color + «↺ restablecer»), contador por grupo («3 cambios») y **filtro «solo modificados»**.
- **Búsqueda difusa** en español e inglés (reemplaza el buscador de claves en inglés).
- **Ayudas visuales:** íconos SVG para patrón de relleno, controles con unidades, vista de efecto (p. ej. regla de altura de capa), validación de rangos y avisos de conflicto (p. ej. «TPU con AMS», «boquilla 0,4 con capa 0,32»).
- Reutiliza el mismo componente en **Mis perfiles → editar** (un solo editor, no dos).

### 3.3 Ajustes de sesión vs. perfiles guardados

```
Perfil base (fábrica o personalizado)  +  Ajustes de sesión (overrides)  =  Perfil efectivo → Orca
                                              │
                         [Guardar como perfil nuevo]  [Actualizar el perfil base (nueva versión)]  [Descartar]
```

- Los ajustes de sesión viven en el estado del Estudio y se envían como `overrides` en la corrida (`slice_runs.inputs`), formando parte del `cache_key` (la caché por hash que ya existe sigue funcionando: misma entrada → mismo resultado instantáneo).
- «Guardar como perfil» promueve los overrides a `slicer_profiles` (nuevo perfil o nueva versión; ya soportado por `updateProfileAction`/`createProfileRow`).

### 3.4 Laminado «casi en vivo»

1. **Debounce** (≈ 700 ms) tras el último cambio; el botón «Re-laminar» siempre disponible.
2. **Cancelación:** si llega un cambio nuevo mientras corre uno, se mata el proceso anterior (`SIGKILL`) y se encola el vigente. Hoy no existe cancelación (`run.ts` solo tiene _timeout_).
3. **Último resultado válido atenuado** con la insignia «Desactualizado» mientras se espera el nuevo: la interfaz nunca queda en blanco.
4. **Transporte:** SSE/WebSocket por corrida en lugar de _polling_ de 700 ms. Progreso por fases si el stdout de Orca lo permite (_S1_); si no, indeterminado + tiempo transcurrido.
5. **Vista previa rápida opcional** (parámetro «solo estimación»: relleno disperso mínimo y sin soportes) etiquetada como _aproximada_: útil para orientar, **nunca** para cotizar. _Decisión de producto; ver D8._
6. **Worker aislado** (TEC-01): proceso/contendor separado con `ORCA_CONCURRENCY` propio, prioridad (interactivo > lote) y límite de memoria, para que el laminado no degrade la web.

### 3.5 Visor de G-code v2 (vista previa)

| Hoy (`gcode-viewer.tsx`) | Propuesta |
|---|---|
| 5 tipos genéricos | Tipos reales de Orca: pared exterior/interior, voladizo, relleno disperso/sólido, superficie superior/inferior, puente, falda/borde, soporte/interfaz, torre de purga, personalizado |
| Solo color por tipo | **Modos de color:** Tipo · Velocidad · Flujo volumétrico · Altura de capa · **Tiempo de capa** · Temperatura · Ventilador · Herramienta/color (AMS) |
| Líneas de 1 px | **Extrusiones con ancho/alto reales** (ribbons/tubos de baja poligonización) con sombreado; _fat lines_ como alternativa liviana |
| Relleno «muestreado» (se pierde información) | Sin muestreo: geometría **indexada por capa** con LOD según zoom; carga por rangos de capa |
| Sin viajes ni retracciones | Conmutadores: movimientos de viaje, retracciones, saltos Z, cambios de color |
| Un slider de capa | **Slider vertical de capas + slider horizontal de movimientos** dentro de la capa, con «boquilla» animada |
| Sin leyenda | **Leyenda con tiempo y gramos por tipo** (p. ej. «Relleno 41 % del tiempo · 2,9 g») calculada del G-code |
| — | **Comparar dos corridas** (A/B) con barras de tiempo/gramos por tipo y diferencia de capas |

Necesita ampliar el binario de vista previa (`MFG1`) con campos de velocidad/flujo/tiempo por segmento (S5).

## 4. Edición de placa (Nivel B, opcional)

| Función | Notas |
|---|---|
| Varios modelos en la placa | Lista «Placa» con instancias; cada una con posición/rotación/escala |
| Transformaciones con gizmo | `TransformControls` de three.js sobre el visor actual (`model-viewer.tsx` ya maneja rotación, escala y «cara a la cama») |
| **Ordenar** y **Orientar** automáticos | `--arrange`/`--orient` de Orca _(S1)_ y relectura del 3MF resultante para reflejar posiciones en el visor |
| Cama real | Forma/tamaño desde `printable_area` del perfil de máquina, zonas excluidas y textura de placa |
| Ajustes por objeto | Opcional: relleno/paredes por objeto vía `model_settings.config` _(S4)_ |
| Colisiones y «no cabe» | Aviso inmediato; hoy el error `-50` llega recién tras laminar |

Es la parte de **mayor riesgo y esfuerzo**; se estima aparte (5.5) y se recomienda decidirla después de usar el Nivel A en producción.

## 5. Exploración de perfiles (reemplaza y supera al «Comparador»)

- **Barrido de un parámetro:** «altura de capa: 0,12 · 0,16 · 0,20 · 0,28» → 4 corridas en paralelo (reutiliza `compareAction`/`groupId`).
- **Rejilla de 2 parámetros:** paredes × relleno (hasta 8–12 corridas con límite).
- **Resultados:** tabla + **gráfico de dispersión tiempo vs gramos** (burbuja = precio), resaltado de la «mejor» según criterio (más rápido, más barato, equilibrio) y **frontera de Pareto**.
- Acciones: «Usar esta configuración» (carga overrides al Estudio), «Guardar como perfil», «Usar en presupuesto».
- Presets de exploración: «Calidad vs. tiempo», «Ahorro de material», «Resistencia».
- Límites de seguridad: máximo de corridas simultáneas por usuario y estimación previa del tiempo total.

## 6. Integración con el resto del sistema

- **Orientación:** el Estudio es el dueño de la orientación; se guarda en el modelo y se aplica en toda corrida (incluida la de presupuesto) — cierra BIB-08.
- **Presupuesto:** «Usar en presupuesto» conserva la corrida y sus overrides (trazabilidad: `slice_runs.inputs`), igual que hoy conserva `sliceRunId`.
- **Máquinas:** «Enviar a imprimir» desde el resultado cuando la máquina tiene conector Bambu (hoy solo en `/maquinas/[id]`; reutiliza `sendableRuns`).
- **Cola/producción:** botón «Agregar a la cola con esta configuración».

### 6.1 Asesor de IA, desempeño y errores (ya existentes) dentro del Estudio

| Hoy | En el Estudio |
|---|---|
| Botón «Mejorar con IA» en el panel de laminado; los candidatos se laminan como **perfiles «fantasma»** (filas con borrado lógico que _no se purgan todavía_, según `docs/spec-ia.md`) | Cada candidato es un conjunto de **ajustes de sesión** (`overrides`) sobre la base: **sin filas fantasma**. «Usar para este trabajo» = cargar los overrides en el Estudio; «Guardar» = promover a perfil (la misma acción que hoy) |
| Comparación de candidatos con `comparator.tsx` | La vista **Explorar** (§5) es la misma tabla/gráfico; los candidatos de IA aparecen como un origen más de variantes |
| Validación determinista (`validate.ts`: lista permitida, rangos por boquilla/material/máquina) | Se reutiliza para **validar todo cambio manual del panel de parámetros** (avisos en línea), no solo los de IA |
| Ficha de desempeño por perfil y reglas «qué probar» | Insignia en el Estudio («este perfil falla 3/10 por despegue») con enlace a la ficha |
| Explicación de errores de laminado (`slice-error-help.tsx`) | Se muestra en la barra de resultados cuando una corrida falla, con acciones de un clic (rotar, escalar, menos copias) |

Regla: la IA sigue siendo **opcional y apagada por defecto**; el Estudio debe funcionar completo sin ella.

## 7. Cambios técnicos principales

| Pieza | Cambio |
|---|---|
| `lib/slicer/run.ts` | Soporte de cancelación (`AbortSignal`), construcción de 3MF (transformaciones/objetos), flags de S1, captura de progreso |
| `lib/slicer/queue.ts` | Prioridades, cancelación, worker aislado, eventos (SSE), `overrides` en `cacheKey` |
| `lib/slicer/schema/` (nuevo) | Esquema de parámetros + utilidades (diff vs. base, validación, dependencias) |
| `lib/gcode.ts` + visor | Parser extendido (tipo/velocidad/flujo/tiempo), `MFG2`, estadísticas por tipo |
| `components/studio/*` (nuevo) | `StudioShell`, `ParamPanel`, `PlateViewport`, `PreviewViewport`, `ResultBar`, `ExploreDialog` |
| `app/(app)/archivos/[id]/estudio` | Ruta del Estudio (o `/estudio/[fileId]`) |
| `comparator.tsx` | Se retira tras migrar a «Explorar» |

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| Latencia del CLI percibida como «lento» | S3 para dimensionar; UX de estado + caché + debounce + cancelación; vista rápida aproximada opcional |
| Etiquetas/rangos de parámetros no extraíbles automáticamente | Lista curada de 120 + fallback genérico; ampliar por demanda |
| Cambios del CLI entre versiones de Orca | Fijar versión (ya se hace), pruebas de contrato en CI con el binario real |
| CPU compartida con la web | Worker aislado (5.4) y límites de concurrencia |
| Mantener dos listas de parámetros (curada y `SIMPLE_PARAMS`) | Una sola fuente: el esquema extiende `SIMPLE_PARAMS` |
| Expectativa de «igual que el programa de escritorio» | Comunicar el alcance (§1) y ofrecer «Abrir en Bambu Studio» (exportar 3MF/perfiles; la exportación de perfiles ya existe) |

## 9. Decisiones que necesito de ti

| # | Decisión | Recomendación |
|---|---|---|
| D7 | **Nivel de ambición:** A) parámetros + previsualización + exploración · B) A + edición de placa multiobjeto · C) incluir pintado | **A primero**, B después de validar; C descartado |
| D8 | ¿Incluir «vista rápida aproximada» etiquetada como no apta para cotizar? | Sí, si S3 muestra tiempos > 15 s en piezas habituales |
| D9 | Etiquetas de parámetros: el sitio es bilingüe (es/en) y ya hay prueba de paridad de claves. ¿Cuántos parámetros traducir al inicio? | Los ≈ 120 curados en es y en; el resto se muestra con la clave de Orca. En es, nombre de Orca entre paréntesis (ayuda a buscar en foros) |
