# R0 · Informe de spikes S6–S8

## S7 · 3MF multicolor / AMS (verificado)

**Lectura de un 3MF de Bambu/Orca** (`samples/llavero-a1.3mf`):
- `Metadata/project_settings.config` (JSON) → `filament_colour[]`, `filament_type[]`, `filament_settings_id[]`, `flush_volumes_matrix`, `enable_prime_tower`. Da colores y materiales por ranura → **detección de filamentos/AMS al importar** (decisión D1: color en el visor 3D).
- `Metadata/slice_info.config` → predicción de tiempo (s), peso, `support_used`, uso por filamento.
- `Metadata/model_settings.config` → `extruder` por objeto/parte, matrices, ajustes por objeto.

**Laminado multicolor por objeto**: con un 3MF propio con `<metadata key="extruder">` por objeto y **dos filamentos cargados** (`--load-filaments f1;f2`, *sin* `--load-filament-ids`) Orca lamina bien: 2 filamentos usados (6,50 g + 10,81 g), cambios `T0/T1`, torre de purga, tiempo 31 min → 1 h 16 min por los cambios. Con un solo filamento cargado ignora el extrusor 2. `--allow-multicolor-oneplate` no cambia el resultado. **Regla:** el extrusor se asigna en el 3MF, no con `--load-filament-ids` (que falla por torre de purga).
- Pendiente (no bloqueante): pintura por cara/parte (`paint_color`) y partes con extrusor distinto dentro de un mismo objeto.

## S6 · MakerWorld (NO verificado desde el sandbox)

`makerworld.com` y `api.bambulab.com` devuelven 403 en el túnel de red del entorno, así que no se pudo medir formato de respuesta, límites ni descarga. No hay token de usuario. Se deja `scripts/spikes/s6-makerworld.sh <id> [token]` para ejecutarlo en una máquina con acceso. Hasta entonces el importador se diseña como **mejor esfuerzo**: (1) pegar URL → intento de metadatos (JSON-LD/OpenGraph + API pública si responde); (2) si falla, formulario manual precargado y subida del 3MF descargado a mano por el usuario. Riesgo: ToS/Cloudflare; mantener `model_sources` tolerante a campos ausentes. Esto mantiene la estimación del importador en su rango alto (R3 sin cambios, pero marcado como riesgo).

## S8 · Librería visual (parcial)

No se montó el piloto comparativo en pantalla; solo se verificó compatibilidad por manifiesto (npm):
| | React 19 | Tailwind 3.4 | Notas |
|---|---|---|---|
| shadcn/ui (Radix `react-dialog` 1.3.1) | ✅ peer incluye 19 | ✅ nativo (copiar componentes, `class-variance-authority`) | Sin runtime CSS-in-JS; se integra con los tokens/paletas actuales (variables CSS) y con `lucide-react` ya instalado. |
| Mantine 9.7 | ✅ requiere ^19.2 (el proyecto usa 19.3) | ⚠️ trae su propio CSS/tema; convive pero duplica sistema de diseño | Componentes ricos (tabla, selects, fechas) pero segunda fuente de verdad de estilos y temas. |

**Recomendación provisional:** shadcn/ui (Radix) sobre Tailwind actual, por encajar con las paletas por variables CSS (F5) y el peso. Piloto visual completo (1 pantalla, bundle, tema oscuro, móvil) sigue pendiente (~0,5 jornada) antes de cerrar la decisión.
