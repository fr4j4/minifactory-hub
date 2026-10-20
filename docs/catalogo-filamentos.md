# Catálogo de filamentos (Open Filament Database)

La biblioteca de filamentos viene con datos preexistentes de [Open Filament Database](https://github.com/OpenFilamentCollective/open-filament-database) (licencia MIT): 160+ marcas, ~2.100 líneas y ~14.600 colores con hex, densidad, temperaturas, tamaños, GTIN y rasgos.

## Dónde están los datos
`vendor/open-filament-database/` es una copia **sin modificar** de `data/`, `schemas/`, `stores/` y `LICENSE` del origen (sin imágenes). `SYNC.json` guarda el commit. No se edita a mano.

**Actualizar**

    git clone --depth 1 https://github.com/OpenFilamentCollective/open-filament-database.git /tmp/ofd
    npm run catalog:sync -- /tmp/ofd
    git diff --stat vendor/

El script valida cada JSON y no toca `vendor/` si alguno falla. El diff de Git es el diff del origen.

**Correcciones y marcas propias:** `vendor/catalog-local/data/<marca>/<MATERIAL>/<filamento>/…` con la misma estructura. Gana sobre el origen y no se pisa al sincronizar. (Variables `CATALOG_LOCAL_DIR` / `CATALOG_DIR` para cambiar las rutas.)

## Cómo se sirve
`src/lib/catalog/ofd.ts` indexa los JSON una vez en memoria (~3 s la primera vez; se invalida si cambia `SYNC.json`). Los colores se leen del disco al pedirlos. API paginada (requiere sesión con permiso de ver inventario; `ETag` según el commit del catálogo):

| Ruta | Parámetros |
|---|---|
| `GET /api/catalog/meta` | versión, conteos y cobertura |
| `GET /api/catalog/brands` | `q`, `origin`, `page`, `pageSize` |
| `GET /api/catalog/materials` | tipos de material con conteo |
| `GET /api/catalog/filaments` | `q`, `brand`, `material`, `trait`, `hasTemps=1`, `sort` (`brand`/`name`/`colors`/`density`), `page`, `pageSize` |
| `GET /api/catalog/filaments/{marca}/{material}/{filamento}` | ficha |
| `GET /api/catalog/filaments/{marca}/{material}/{filamento}/variants` | `q`, `page`, `pageSize` |

Respuesta de listas: `{ items, page, pageSize, total, nextPage }` (`pageSize` por defecto 50, máximo 200).

## Qué usa el catálogo en la app
- **Alta rápida** (`/inventario/alta-rapida`): buscador del catálogo, colores reales con hex y precarga de tipo, densidad, diámetro, pesos y temperaturas. El servidor completa temperaturas, GTIN y rasgos desde el catálogo (no confía en lo que mande el navegador).
- **Biblioteca** (`/inventario/biblioteca`): explorador con búsqueda, filtros y páginas; «Agregar al inventario» abre el alta rápida precargada.
- **Completar existentes** (`/inventario/completar`): propone, con vista previa, rellenar campos **vacíos** de materiales que ya tienes (nunca pisa lo escrito).
- **Ficha del material**: datos del fabricante, rasgos y avisos (abrasivo → boquilla endurecida; filtrado del aire).
- **Escaneo** (`/inventario/escanear`): además del QR de bobina, lee códigos de barras (GTIN/EAN); si el producto está en el catálogo abre el alta rápida con ese color.
- **Laminador**: la sugerencia de perfil de filamento usa primero el nombre de perfil de OrcaSlicer/Bambu Studio del catálogo.
- **Etiquetas**: incluyen las temperaturas.

Migración 0029: `filament_lines.catalog_id/specs`, `materials.variant_id/gtin/traits` (aditiva, todo opcional).

## Límites
Faltan datos en el origen (≈23 % de las líneas sin temperaturas; secado en el 7 %): la interfaz solo muestra lo que existe. No incluye precios, flow ratio, K ni datasheets mecánicos.

## Puerto
`PORT` (variable de entorno, por defecto 3000) define el puerto de la app en Docker; con `network_mode: host` basta `PORT=3011` en `.env`.
