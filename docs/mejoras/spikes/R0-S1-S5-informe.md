# R0 · Informe de spikes S1–S5 (OrcaSlicer 2.4.2 CLI)

Entorno: OrcaSlicer 2.4.2 AppImage, perfil Bambu Lab A1 0.4 / 0.20mm Standard / Bambu PLA Basic, 4 núcleos. Scripts en `scripts/spikes/`. Ayuda completa del CLI en `orca-help-2.4.2.txt`.

## S1 · Flags del CLI

| Capacidad | Resultado |
|---|---|
| `--orient 1` | ✅ Funciona (pieza hongo: 370→230 capas, 2h40→1h16). Base para «orientación automática». |
| `--arrange 1`, `--clone-objects` | ✅ (20 copias ≈ 9 s). |
| `--info` | ✅ Dimensiones/volumen sin laminar. |
| `--pipe` | ✅ Emite JSON de progreso (`{"message":"Generating walls","plate_percent":15,...}`) → barra de progreso real. |
| `--rotate`, `--rotate-x/y`, `--scale`, `--repetitions` | ❌ Segfault o error -50/-100/-2 en headless. **Decisión:** aplicar transformaciones nosotros, horneadas en el 3MF (ver S4). |
| Multifilamento con ids explícitos (`--load-filament-ids`) | ⚠️ Falla (-101/-102, torre de purga). Sin ids funciona; ver S7. |
| PLA+PETG | Requiere `--allow-mix-temp` y `curr_bed_type` Textured PEI. |

## S3 · Tiempos de laminado (A1)

| Caso | Tiempo |
|---|---|
| Piezas pequeñas | 0,5–1,1 s |
| Barquito 0,12 mm | 1,1 s |
| 20 copias | 8,9 s |
| Esfera 50k tri / 200k tri | 4,9 s / 13 s (0,12 mm: 18 s) |
| Soporte árbol en pieza pequeña | 10 s (normal: 1,1 s) |
| Torre 200 mm | 1,1–1,7 s |

**Conclusión (D8):** laminar es lo bastante rápido para re-laminado casi en vivo con *debounce* (~500 ms) y cola; para mallas >200k triángulos o soporte árbol mostrar estado «calculando».

## S4 · 3MF construido por nosotros

- ✅ Un 3MF mínimo (`3D/3dmodel.model` + `Metadata/model_settings.config`, sin `project_settings.config`) más `--load-settings` lamina correctamente.
- ✅ Transformaciones `<item transform>` (rotación X/Z, escala, traslación) se respetan; posición verificada en el G-code (bbox X/Y).
- ✅ **Ajustes por objeto** vía `<metadata key="sparse_infill_density" .../>` en `model_settings.config`: 60 % + 5 paredes sobre un objeto subió 31 min → 47 min.
- ⚠️ **Hallazgo crítico:** hay que **soldar vértices** (indexar). La «sopa de triángulos» (3 vértices por triángulo, como devuelve `parseMesh`) hace que Orca vea la malla abierta y falle con -100 «Failed slicing the model» / capas vacías. Solución: deduplicar por posición (tolerancia 1e-4) al exportar.
- Extrusor por objeto (`extruder`): se acepta, pero su efecto real depende de cargar ≥2 filamentos (S7).

## S5 · G-code para visor

Presentes: `; FEATURE:` (Custom, Support, Inner/Outer wall, Overhang wall, Bottom/Top surface, Internal solid infill, Sparse infill, Support interface, Bridge, Internal Bridge), `; LINE_WIDTH:`, `; LAYER_HEIGHT:`, `; CHANGE_LAYER`+`; Z_HEIGHT:`, `; layer num/total_layer_count:`, `M73 P R`, velocidades `G1 F`, `WIPE_START/END`. Cabecera con tiempo, capas, `max_z_height`. No hay `;TYPE:`. Suficiente para modos de color por tipo, velocidad, flujo y tiempo de capa; `buildGcodePreview` ya acepta `; FEATURE:`.

## S2 · Esquema de parámetros

Generador viable en tiempo de instalación: `PrintConfig.cpp` + `Tab.cpp` (tag v2.4.2) dan 753 opciones, 634 etiquetas, 617 tooltips, 227 unidades, páginas/grupos (print 7 páginas/340 claves, filament 87, printer 105); el `.mo` de la AppImage (22 idiomas) traduce 609/634 etiquetas y 588/617 tooltips al español. Limitaciones: min/max y enums parseados de forma imprecisa en parte (enums solo 48 por macros), requiere endurecer el parser (+1–1,5 jornadas vs. estimado). **Licencia:** OrcaSlicer es AGPL-3.0 → no versionar texto generado; generarlo en `orca:install` al directorio de datos.

## Impacto en estimaciones
- R0: sin cambios mayores (S2 +~1 j en R4 por parser).
- R4 (slicer embebido): pasada de transformaciones por 3MF propio + soldado de vértices (+0,5 j); progreso real por `--pipe` (−0,5 j frente a barra simulada).
