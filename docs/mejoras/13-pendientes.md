# 13 · Pendientes del plan de mejoras

Lo entregado está en [`12-estado-de-implementacion.md`](12-estado-de-implementacion.md); el plan, en [`14-plan-de-implementacion-pendientes.md`](14-plan-de-implementacion-pendientes.md). Este archivo es la fuente vigente.

Tamaño = estimación relativa: S menos de un día · M 1 a 3 días · L más de 3.

## Decisiones tomadas (respuestas del equipo)
| Tema | Decisión | Estado |
|---|---|---|
| Modelo heredado de precios | Instalación fresca: **se eliminó** (solo existe el modelo neto: margen sobre la venta neta, IVA como casilla) | ✅ hecho |
| IVA y margen | El IVA se aplica sobre el precio final y nunca se come el margen | ✅ ya era así; con pruebas |
| Costos fijos, ingreso objetivo, horas de impresión | No se precargan: dependen de cada taller | ✅ no hay valores de fábrica |
| Mano de obra | Una tarifa por rol; el equipo no está seguro de cómo abordarlo | ⏳ por diseñar (ver abajo) |
| IVA de las compras | Depende del proveedor; por defecto **no** se recupera | ✅ casilla «Recupero el IVA» por proveedor; el costo del carrete se guarda neto solo si se marca |
| Cobros, comisiones, mínimo por pedido | Por ahora no se consideran | — |
| Perfiles de partida | Sirven los 9 tal cual | — |
| Cotizaciones reales para calibrar | No hay | — |
| Niveles de la calculadora | Básico por defecto; se recuerda la elección por persona | ✅ `users.calc_level`, selector en la calculadora |
| Calculadora rápida | Parte con una pieza y permite agregar más; se convierte en presupuesto | ✅ |
| MakerWorld (descarga automática) | Decidir más adelante | ⏳ S6 sigue pendiente |
| Directorio de proveedores | Dejarlos sin verificar | — |
| Worker aparte | Se usa Postgres → worker separado; el laminado corre en su propio proceso | ✅ `MF_EXTERNAL_WORKER=1` + servicio `worker` de docker-compose |
| Respaldo antes de actualizar | Es solo una instalación de pruebas | — |
| Pruebas visuales | No se usarán: **se eliminaron** (`tests/visual`, `test:visual`) | ✅ |
| Ramas antiguas | Borrarlas | ⚠ ver abajo |

## Hecho a partir de estas decisiones
- Editor de bloques del documento de presupuesto: además de las secciones de fábrica, se pueden agregar hasta 6 **bloques de texto libre**, reordenarlos y quitarlos (Configuración › Documentos).
- «Ver detalles» es ahora una página propia por línea: `/presupuestos/<id>/linea/<línea>`.
- Chips e insignias sueltos pasan por `TONES` (un solo lugar para los colores).

## Pendiente
- **Mano de obra por rol (M).** Propuesta simple: una lista de roles (p. ej. operación, preparación, post-proceso, diseño) con su $/hora en Configuración; cada tarea de la línea (preparación, post-proceso) elige su rol. Hoy hay una sola tarifa (`laborHour`). Falta que el equipo confirme los roles.
- **Calculadora fases 2 a 5** (L) y el resto de `docs/spec-calculadora.md` §14 que dependía del modelo heredado: ya no hay nada bloqueado por decisiones salvo mano de obra.
- **Barrido de Reportes** (M).
- **Migrar el resto de los componentes al kit Radix**, pantalla por pantalla (L).
- **Pintura por cara exacta** en el visor 3D (S/M): hoy una cara subdividida en varios colores toma el de su primera hoja.
- **S6 · MakerWorld y N3 ruta B**: el sandbox bloquea el dominio; correr `scripts/spikes/s6-makerworld.sh` con acceso cuando se decida retomarlo.
- Edición de placa, nivel B (L): `--rotate`/`--scale` fallan en Orca 2.4.2.
- Tablero con arrastrar y soltar (S): los estados siguen su flujo, por eso es solo lectura.
- Los archivos analizados antes de `MFG3` no muestran ventilador/temperatura/herramienta/viajes hasta volver a analizarlos (botón «Reprocesar»).

## Ramas antiguas a borrar (lo debe hacer el equipo)
El entorno de la sesión no puede borrar ramas remotas (el proxy responde 403). Ya están todas dentro de `development`; desde un equipo con permisos:

```bash
git push origin --delete feature/p0-estabilizacion feature/p2-p6-resto feature/p4-biblioteca feature/r0-spikes feature/r1-cimientos feature/r2-perfiles feature/r3-cotizaciones feature/r4-biblioteca feature/r5-r6-estudio-paletas
```
Otras ramas (`feature/calculator-v2`, `feature/jobs-queue`, `feature/visor-modos`, `feat/boquillas-pendientes`, `claude/*`, `ccr-*`) no son de este plan: revisarlas antes de borrar.
