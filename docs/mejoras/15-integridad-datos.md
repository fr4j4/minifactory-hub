# 15 · Integridad de datos: lo que queda

La rama `fix/presupuestos-pedidos-produccion` cerró los errores de presupuestos, pedidos y cola (transiciones condicionadas, stock con incrementos SQL, `saveQuote` en `db.transaction()`). Este archivo lista lo que no se hizo en esa rama y cómo hacerlo.

Regla para toda transacción nueva: dentro de `db.transaction(async (tx) => …)` solo se usa `tx`. En PGlite hay una sola conexión: una consulta con `getDb()` dentro de la transacción queda esperando para siempre (medido). `audit()`, `notify()`, `getSettings()` y `nextNumber()` llaman a `getDb()`: van antes o después de la transacción.

## 1. Claves foráneas e índices (data-integrity-8) · L

Hoy ninguna migración declara `REFERENCES` y las columnas hijas no tienen índice.

Pasos:
1. Medir primero. Con la base de demo y una de 10× (script de carga), registrar el tiempo de `/pedidos/[id]`, `/presupuestos/[id]` y `recomputeOrderStatus`. Si no hay diferencia medible, hacer solo los pasos 2 a 4.
2. Buscar huérfanos con una consulta por relación, por ejemplo:
   `select count(*) from quote_items qi left join quotes q on q.id = qi.quote_id where q.id is null;`
   Relaciones: `quote_items.quote_id`, `quote_item_models.quote_item_id|order_item_id`, `order_items.order_id`, `job_items.job_id|order_item_id`, `print_jobs.order_id|machine_id|production_order_id`, `payments.order_id|sale_id`, `sale_items.sale_id|variant_id`, `stock_movements.variant_id`, `inventory_movements.spool_id|item_id`, `file_versions.model_file_id`, `spools.material_id`, `product_variants.product_id`.
3. Limpiar o poner en null los huérfanos en una migración de datos (la siguiente libre, `0022_*`), antes de crear las claves.
4. En `src/db/schema.ts`, agregar `.references(() => padre.id, { onDelete })`:
   - `cascade` para los hijos que se borran de verdad: `quote_items → quotes`, `quote_item_models → quote_items`, `job_items → print_jobs`, `sale_items → sales`.
   - `restrict` para el resto (todo lo demás usa borrado lógico, así que el padre nunca se borra).
   - `reference_links.owner_id` y `price_adjustments.owner_id` son polimórficos (`owner_type`): sin clave foránea.
5. Agregar un índice por columna hija: `index('quote_items_quote_ix').on(t.quoteId)`, y así con cada relación del paso 2.
6. Generar la migración con `npm run db:generate` (desde esta rama `drizzle/meta/0020_snapshot.json` está al día) y probarla contra una copia de una base real con datos.

## 2. Montos con decimales para USD/EUR (data-integrity-10) · L

Todos los montos son `integer` en unidades enteras. Sirve para CLP. Por eso el asistente de instalación ahora acepta solo CLP (`src/actions/setup.ts`, `src/app/bienvenida/wizard.tsx`).

Si un taller con USD o EUR pasa a ser un requisito:
1. Guardar los montos en unidades menores (centavos) y conservar las columnas `integer`.
2. Agregar `currencyExponent(cur)` (CLP 0, USD/EUR 2) en `src/lib/format.ts`.
3. Convertir en los bordes: al leer formularios (`× 10^exp`) y al mostrar (`money(n, cur)` divide por `10^exp`). Hoy `money()` fija CLP: recibir la moneda de `settings.shop.currency`.
4. `roundPrice` y los pasos de redondeo (`step`, `ending990`) pasan a expresarse en unidades menores.
5. Migración de datos: multiplicar por 100 todas las columnas de dinero solo si la moneda del taller no es CLP. Lista de columnas: `grep -n "integer('.*\(price\|cost\|total\|amount\|paid\|discount\|shipping\|commission\)" src/db/schema.ts`.
6. Volver a habilitar USD y EUR en el asistente.

## 3. Transacciones pendientes (data-integrity-2: parcial) · M

Hechas: `saveQuote`, `createOrder` + `approveQuote` (pedido, líneas, reservas, abono y la toma del presupuesto en una sola transacción; el número se pide antes), `removeRecord`, `saveProduct`, `connectPrinter`, `addCloudPrinter`. Las transiciones de estado ya son condicionadas, así que un doble envío no repite efectos.

Faltan (necesitan pasar `tx` a varios ayudantes):
1. `createSale` (`src/lib/services/catalog.ts`): venta, líneas, stock y pago en una transacción.
2. `finishJob`: el cierre es condicionado (no repite consumo). Una falla a mitad de camino deja efectos parciales. `consumeFromSpool` ya acepta `db`; faltan `createJob`, `scheduleMachine` y `checkMaintenance`.
3. `nextNumber(kind, tx)`: llama a `getSettings()` con `getDb()`. Con `tx` en PGlite se bloquea. Leer la plantilla antes y pasarla como argumento.
4. `createAccountAction` y `seedDemo`: una sola transacción y volver a revisar `hasUsers()` dentro de ella.

## 4. Otros

- `nextSpoolCode` usa `count(*) + 1`: dos altas simultáneas chocan en `spools_code_uq`. No se cambió a `nextNumber`, porque esa secuencia empieza en 1 y repetiría códigos existentes. Opción: reintentar el insert una vez ante el error 23505.
- Índices únicos de número de documento (data-integrity-14: parcial, solo se exige `{YYYY}`): `(workspace_id, number)` en `orders`, `sales`, `print_jobs`, `production_orders` y `(workspace_id, number, version)` en `quotes`. Desde esta rama la numeración exige `{YYYY}`, así que no debería haber repetidos; revisarlo con una consulta antes de crear los índices.
- Aceptar líneas opcionales al aprobar (flow-quotes-orders-18): casillas en el modal de aprobación y recalcular el total con `calcQuote`.
- «Nueva versión» sin recálculo (flow-quotes-orders-6): el borrador nuevo vuelve a calcular el precio sugerido con las tarifas de hoy, igual que cualquier borrador (el editor también lo calcula en vivo). Congelarlo solo en el servidor no sirve: el primer autoguardado lo pisaría. Decisión de producto pendiente: copiar los precios como precio final, o un modo «costos congelados» en el editor.
