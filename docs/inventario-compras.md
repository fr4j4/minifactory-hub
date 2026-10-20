# Inventario: biblioteca, mis filamentos y compras

Cómo se ordena el inventario después de la migración `0030_inventario_compras`.

## Dos registros y una acción

| Qué | Dónde | Qué guarda |
|---|---|---|
| **Biblioteca** | `/inventario/biblioteca` | Catálogo público (Open Filament Database). Solo lectura, no es stock. |
| **Stock** | `/inventario` | «Mis filamentos»: un registro por color (`materials`), con sus carretes reales (`spools`) dentro. |
| **Compra** (acción) | `/inventario/compras/nueva` | Proveedor, fecha, documento, líneas, envío y descuento. Al recibirla crea los carretes y suma los insumos. |

- **Agregar desde la biblioteca no crea stock**: marca los colores y «Agregar a mis filamentos» (`addCatalogColors`). Quedan con 0 g.
- **El stock entra por una compra** (`receivePurchase`). Para lo que ya había en el taller se usa «Cargar lo que ya tengo», que deja los carretes como ajuste de stock inicial.
- Cada carrete guarda `purchase_line_id`; cada movimiento de entrada, `purchase_id`.

## Costo real

`costo por carrete = (precio pagado + parte del envío − parte del descuento) / cantidad`, repartiendo envío y descuento en proporción al valor de cada línea. Si el proveedor permite recuperar el IVA, el costo va sin IVA; el formulario lo muestra antes de guardar. `materials.cost_per_kg` queda como precio de referencia y sigue a la última compra.

## Anular una compra

`voidPurchase` da de baja los carretes y devuelve los insumos, solo si nada se usó todavía.

## Resina

Sigue en `materials` / `spools`, en gramos. El costo se ingresa por kg (el formulario muestra el equivalente por litro con la densidad) y la tara de una botella es 0 g por defecto.

## Materiales genéricos

`materials.generic = true` («PLA genérico», «PETG genérico»…) se crean solos (`ensureGenericMaterials`). Sirven para laminar y cotizar cuando el color pedido no está en el inventario:
- no aparecen en Stock ni en compras;
- su stock es la suma de los colores reales del mismo tipo, y su costo, el promedio ponderado;
- al iniciar o cerrar un trabajo, la bobina se toma de cualquier color del mismo tipo (`pickSpool`).

## Avisos de stock (nunca bloquean)

- Los selectores de material (laminador, Estudio, cotización) muestran «sin stock», cuánto hay o «sin color» (genérico).
- La cotización tiene el campo **Color pedido**, separado del material.
- Iniciar un trabajo sin material suficiente muestra un aviso y deja una notificación (`checkAvailability`).
- Cerrar un trabajo sin carrete registra el consumo sin carrete y avisa para corregir el stock.

## Embalaje e insumos

En «Insumos y repuestos» se definen reglas «cada pedido entregado gasta N de este ítem» (`supply_rules`). Al entregar el pedido se descuentan y su costo se suma a `orders.cost_real`.

## Fuera de este cambio

Colores equivalentes para la alerta de stock bajo, reservas desde pedidos aceptados, consumo multicolor por carrete, merma por causa y aviso de secado.
