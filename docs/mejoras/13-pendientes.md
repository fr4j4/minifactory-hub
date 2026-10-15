# 13 · Pendientes del plan de mejoras

Registro de lo que falta tras fusionar R0–R6 en `development` (commit `663d813`). Versión interactiva: <https://claude.ai/artifact/8TgLT4hyryz1CfgPtAEMVc> (privada). Detalle de lo entregado por release: [`12-estado-de-implementacion.md`](12-estado-de-implementacion.md).

Tamaño = estimación relativa mía (S: menos de un día · M: 1 a 3 días · L: más de 3), no la del plan original.

## Fallos de prueba y verificación
| Ítem | Estado | Detalle | Tamaño |
|---|---|---|---|
| e2e `13-ia` (URL base de Ollama) | falla | Intermitente bajo carga; ya fallaba antes de estos cambios | S |
| e2e `14-asesor-ia` (versión «Sugerido por IA») | falla | Igual: falta repetirla para descartar un fallo real | S |
| Desborde horizontal `/notificaciones` (360 px) y `/cola` (768 px) | falla | Lo detecta `19-regresion`; no se reproduce con base limpia | S |
| Regiones con scroll sin foco por teclado (`/cola`, `/reportes`) | sin confirmar | Corregido y subido; falta re-correr la regresión | S |
| S6 · MakerWorld | sin verificar | El sandbox bloquea el dominio; correr `scripts/spikes/s6-makerworld.sh` con acceso | S |
| Piloto visual de la librería de componentes (S8) | pendiente | Solo se midió peso y compatibilidad | S |

## R1 · Cimientos, PDF y arranque
- Asistente: modo Rápido/Completo (M) · datos de demostración y re-ejecución (S).
- F0 0.2 guarda de borrado «reemplazar/archivar» (M) · 0.3 filtros de compatibilidad (S) · 0.4 arreglos de copy (S) · 0.6 iconografía unificada (M).
- WP-6.1' librería y kit de componentes: hay temas y marca; no se adoptó shadcn/Radix ni se migró ningún componente (L).

## R2 · Perfiles, filamentos y calculadora fase 1
- Contraer `materials.filament_profile_id` (M) · tabla `quality_presets` y `ProfileRef` con backfill (L).
- Líneas de filamento como entidad (`filament_lines`, edición masiva) (L) · «Mis perfiles» rediseñado (M).
- Calculadora: «recalcular con tarifas actuales» y perfil «Heredado» como entidad (M) · fases 2 a 5 de `docs/spec-calculadora.md` (L, fuera del plan, bloqueadas por decisiones).
- Verificar los proveedores sembrados (todos `verified: false`) (M).

## R3 · Cotizaciones y documentos
- Kanban (opcional, M) · diff de versiones (M) · pestaña de actividad (M) · «Ver detalles» como modal/página (S) · seguimiento configurable con recordatorios (M) · N7b editor de bloques (opcional, L).

## R4 · Biblioteca e importación
- N3 ruta B, descarga con cuenta Bambu (bloqueada por S6, L); imágenes de galería sin descargar.
- Cola de procesamiento persistente `jobs` (L) · duplicados antes de subir (M) · papelera, archivado y colecciones (M) · tablas `tags`/`folders` (M).
- Miniatura giratoria, 3MF inteligente, STEP, reparación de malla (L) · pintura por cara en el visor (M) · etiquetado con imagen y aplicación automática (S).

## R5 · Estudio de laminado
- Edición de placa, nivel B (opcional, L): `--rotate`/`--scale` fallan en Orca 2.4.2; hornear transformaciones en un 3MF propio con vértices soldados.
- Esquema generado desde Orca al instalar (L; hoy 64 claves curadas) · progreso real con `--pipe` (M) · orientación automática `--orient` (M).
- Visor: flujo, temperatura, ventilador, herramienta, viajes/retracciones, comparar A/B (L) · asesor de IA dentro del Estudio sin perfiles fantasma (M).
- Worker aislado y vista rápida aproximada (L) · enviar a imprimir/cola desde el resultado (M) · multicolor al laminar (M; verificado en S7).

## R6 · Pulido y paletas
- Barrido de pantallas restantes (L) · regresión visual con capturas (M) · Inicio con widgets (opcional, M) · tokenizar colores sueltos (`emerald-`, `amber-`, `red-`, `slate`) (L).

## Decisiones que dependen del equipo
1. Las 10 decisiones de `docs/spec-calculadora.md` §14 (bloquean calculadora fases 2 a 5 y el paso «Tarifas» del asistente).
2. Verificar el directorio de proveedores.
3. Borrar o conservar las ramas `feature/r0-spikes` … `feature/r5-r6-estudio-paletas` (ya están en `development`).

## Orden recomendado
1. Cerrar los tres fallos de prueba y re-correr la regresión.
2. Correr S6 y decidir la descarga automática.
3. R1: modo Rápido/Completo y arreglos F0.
4. R5: `--pipe`, orientación automática, multicolor en el Estudio.
5. R3: diff de versiones y actividad.
6. R4: cola persistente y duplicados.
7. Tokenizar colores y adoptar la librería de componentes, pantalla por pantalla.
