# 13 · Pendientes del plan de mejoras

Estado tras la fase de pendientes (P0–P5 parcial). Lo entregado está en [`12-estado-de-implementacion.md`](12-estado-de-implementacion.md); el plan original, en [`14-plan-de-implementacion-pendientes.md`](14-plan-de-implementacion-pendientes.md). Versión interactiva (desactualizada respecto de este archivo): <https://claude.ai/artifact/8TgLT4hyryz1CfgPtAEMVc>.

Tamaño = estimación relativa: S menos de un día · M 1 a 3 días · L más de 3.

## Verificación que depende de ti
| Ítem | Detalle | Tamaño |
|---|---|---|
| S6 · MakerWorld | El sandbox bloquea el dominio; correr `scripts/spikes/s6-makerworld.sh` con acceso. De su resultado depende N3 ruta B | S |
| Regresión visual con capturas | Las líneas base no son reproducibles entre máquinas; hay que fijarlas en el entorno de CI | M |

## R2 · Perfiles, filamentos y calculadora
- Contraer `materials.filament_profile_id` (71 referencias; necesita migración con vista previa y respaldo) (M) · tabla `quality_presets` y `ProfileRef` con backfill (L).
- `filament_lines` como tabla propia (L; la edición masiva ya existe) · «Mis perfiles»: diff contra fábrica (S; «Usado en» ya enlaza).
- Calculadora: perfil «Heredado» como entidad (S) · fases 2 a 5 de `docs/spec-calculadora.md` (L, bloqueadas por decisiones).
- Verificar el contenido de los proveedores sembrados (lo hace el equipo; el flujo para marcarlos ya existe).

## R3 · Cotizaciones y documentos
- N7b editor de bloques (opcional, L) · tablero con arrastrar y soltar (opcional, S) · «Ver detalles» como página propia (S).

## R4 · Biblioteca e importación
- N3 ruta B, descarga con cuenta Bambu (bloqueada por S6, L).
- Cola de procesamiento persistente `jobs` (L) · tablas `tags`/`folders` y colecciones (M).
- Miniatura giratoria, 3MF inteligente, STEP, reparación de malla (L) · pintura por cara en el visor (M) · etiquetado con imagen (S).

## R5 · Estudio de laminado
- SSE en lugar de sondeo (S).
- Edición de placa, nivel B (opcional, L): `--rotate`/`--scale` fallan en Orca 2.4.2; hornear transformaciones en un 3MF propio con vértices soldados.
- Esquema generado desde Orca al instalar (L; hoy 64 claves curadas; el texto de Orca es AGPL: no se commitea).
- Visor: viajes/retracciones y comparar A/B (M; ventilador, temperatura y herramienta ya están, formato MFG3) · asesor de IA dentro del Estudio sin perfiles fantasma (M).
- Worker aislado y vista rápida aproximada (L) · multicolor: asignación por pieza y pintura por cara (M).

## R6 · Pulido
- Barrido de pantallas restantes: Reportes, columna de resina en Cola (M).
- Tokenizar colores sueltos (`emerald-`, `amber-`, `red-`, `slate`) (L).
- Migrar el resto de los componentes al kit Radix, pantalla por pantalla (L).

## Decisiones que dependen del equipo
1. Las 10 decisiones de `docs/spec-calculadora.md` §14.
2. Verificar el directorio de proveedores.
3. Borrar o conservar las ramas `feature/r0-spikes` … `feature/r5-r6-estudio-paletas`.
