# 13 · Pendientes del plan de mejoras

Lo entregado está en [`12-estado-de-implementacion.md`](12-estado-de-implementacion.md); el plan, en [`14-plan-de-implementacion-pendientes.md`](14-plan-de-implementacion-pendientes.md). La versión interactiva (artefacto) quedó desactualizada: este archivo es la fuente vigente.

Tamaño = estimación relativa: S menos de un día · M 1 a 3 días · L más de 3.

## Depende de ti o del entorno
| Ítem | Detalle | Tamaño |
|---|---|---|
| S6 · MakerWorld y N3 ruta B | El sandbox bloquea el dominio. Correr `scripts/spikes/s6-makerworld.sh` con acceso; de su resultado depende la descarga automática con cuenta Bambu | S + L |
| Calculadora fases 2 a 5 y perfil «Heredado» como entidad | Bloqueadas por las 10 decisiones de `docs/spec-calculadora.md` §14 | L |
| Verificar el directorio de proveedores | Lo hace el equipo; el flujo para marcar «verificado» (fecha y quién) ya existe | S |
| Líneas base de regresión visual | Se generaron en este entorno; en CI hay que regenerarlas con `npm run test:visual:update` | S |

## Opcionales que no se hicieron
- **Edición de placa, nivel B** (L): `--rotate`/`--scale` fallan en Orca 2.4.2; habría que hornear las transformaciones en un 3MF propio con vértices soldados.
- **N7b editor de bloques** del documento de presupuesto (L) y **tablero con arrastrar y soltar** (S; los estados siguen su flujo, por eso es solo lectura).
- **«Ver detalles» como página propia** (S; hoy es un desplegable por línea).

## Pulido que queda
- Colores literales de chips e insignias (`emerald-`, `amber-`, `sky-` en fondos) hacia tokens (M); barrido de Reportes (M); migrar el resto de los componentes al kit Radix, pantalla por pantalla (L).
- Pintura por cara: una cara subdividida en varios colores muestra uno solo (S).
- Los archivos analizados antes de `MFG3` no muestran ventilador/temperatura/herramienta/viajes hasta volver a analizarlos (S: botón «Reprocesar» ya existe por archivo).

## Decisiones que dependen del equipo
1. Las 10 decisiones de `docs/spec-calculadora.md` §14.
2. Borrar o conservar las ramas `feature/r0-spikes` … `feature/p4-biblioteca` (ya están en `development`).
