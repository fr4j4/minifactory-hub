# 11 · Datos iniciales: directorio de proveedores y tiendas

Responde al pedido de investigar proveedores chilenos y extranjeros (Mercado Libre, Maxi3D, Imperio 3D, TodoToner, etc.) para que existan en la **data de inicio**. Complementa a N4 (alta masiva y catálogo de marcas, `10-decisiones-y-alcance-ampliado.md`). Sigue siendo solo documentación; los datos están en [`datos/proveedores-iniciales.json`](datos/proveedores-iniciales.json) (29 registros, 20 de Chile).

## 1. Alcance y una salvedad

Hoy el proveedor es **texto libre** (`supplier_text` en materiales, bobinas e ítems). El README declara **fuera de alcance** la «relación con proveedores». Este directorio no la reabre: es una **lista de referencia** (nombre, tipo, sitio, marcas, notas) para **autocompletar «dónde compré»** y para sembrar el catálogo; **no** incluye pedidos, contactos, cotizaciones ni cuentas por pagar. Confirmación pendiente en la pregunta **H1** (README).

## 2. Cómo se reunió y qué tan confiable es

- Fuente: **búsquedas web**. **No pude abrir los sitios** de las tiendas desde este entorno, así que no hay precios, stock ni catálogos verificados.
- La búsqueda es irregular: algunas tiendas aparecieron en una consulta y no en otra. Un proveedor **ausente de esta lista no significa que no exista**.
- Todos los registros llevan `verified: false`. Antes de publicar la data inicial hay que confirmar con cada proveedor: nombre legal o comercial, URL, marcas, si despacha, y si acepta venta por mayor.
- Los precios citados son de resultados de búsqueda y **pueden estar desactualizados**; no se cargan como datos del sistema.

## 3. Proveedores en Chile

| Proveedor | Tipo | Ciudad | Marcas | Despacha a Chile | Evidencia y notas |
|---|---|---|---|---|---|
| **TodoToner** | Tienda especializada | Santiago (Centro) | Bambu Lab, Creality, Elegoo, eSUN, marca propia | Sí | Tienda con despacho a todo Chile, showroom y estacionamientos en Santiago Centro; catálogo de PLA/PETG de varias marcas (resultados de búsqueda y directorio de terceros). _Vende impresoras 3D, filamentos, resinas, tóner y tintas._ |
| **Imperio 3D** | Tienda especializada | Santiago (Las Condes) | Bambu Lab, Prusa, Plast Ar | Sí | Su blog anuncia una tienda nueva en Las Condes; tiene tienda en Mercado Libre Chile con PLA de Plast Ar y líneas Bambu Lab (PLA Lite, PLA Basic). _La dirección exacta del showroom no se pudo confirmar._ |
| **Maxi3D** | Importador | Cerro Navia | — | Por confirmar | Aparece una página de Facebook que dice enfocarse en la importación de insumos y filamentos para impresión 3D, con base en Cerro Navia. _No encontré sitio web propio ni más fuentes: confirmar canal de venta, marcas y si vende por mayor._ |
| **Horus3D** | Tienda especializada | Santiago | Jamg He | Por confirmar | Tienda de Santiago con categoría de filamentos; un listado muestra Jamg He ECO PLA+ desde $10.000. _Datos tomados de resultados de búsqueda; confirmar._ |
| **DesignTec** | Tienda especializada | Providencia | — | Por confirmar | Figura en un directorio con impresión 3D y despacho gratis a varias comunas de Santiago. _Confirmar si vende filamentos y cuáles._ |
| **FullCompras** | Importador | Santiago | eSUN, Hatchbox | Sí | Se presenta como importador de materiales de impresión 3D (filamentos eSUN y Hatchbox) en Santiago. |
| **eVStore** | Tienda especializada | Temuco | eSUN, SUNLU | Sí | Despacha a todo Chile desde Temuco; filamentos PLA, PLA+, PETG, TPU; garantía local y soporte técnico. _Única tienda del sur observada._ |
| **Tugadget** | Tienda especializada | — | Creality, Bambu Lab | Sí | Sección de filamentos con stock en Chile y despacho rápido. |
| **Cimech 3D** | Tienda especializada | — | eSUN, PopBit | Sí | PETG eSUN a $15.990 IVA incluido por kilo (varios colores agotados al momento de la búsqueda); PETG PopBit 1,75 mm 1 kg; ofrece compra de PETG al por mayor. _Ofrece venta por mayor: pedir lista._ |
| **Tecnosistec** | Tienda especializada | — | SUNLU | Sí | Categoría de filamento PLA con envíos a todo Chile. |
| **MakersChile** | Vendedor en marketplace | — | Bambu Lab, Creality, Macrotec | Sí | Vendedor en Mercado Libre Chile con PLA Basic de Bambu Lab, PLA Wood y TPU; envío gratis y cuotas. |
| **Source Shop** | Vendedor en marketplace | — | SUNLU, eSUN | Sí | Vendedor en Mercado Libre Chile con PLA SUNLU 1,75 mm y PLA+ eSUN. _Marketplace: precios y stock cambian._ |
| **Norte en 3D (Construex)** | Tienda especializada | Norte de Chile | Grilon3 | Por confirmar | Expositor en Construex con PETG; el listado menciona Grilon3. _Sin detalle de precio ni stock._ |
| **uPrint 3D** | Distribuidor de marca | — | PP3DP | Por confirmar | Un directorio indica que representa en Chile a PP3DP (impresoras personales). _Más relevante para impresoras que para filamento._ |
| **Cicla 3D** | Fabricante | Concepción | Cicla 3D, Cicla NANO, Cicla Wood | Sí | Primera fábrica chilena de filamentos (2019): PLA reciclado y biodegradable, línea antimicrobiana Cicla NANO y Cicla Wood; vende en Chile y exporta. _El dominio proviene de una fuente secundaria: confirmar. Catálogo y colores por confirmar._ |
| **Filamaker** | Fabricante | Santiago (Providencia) | Filamaker | Sí | Se presenta como filamento PLA diseñado en Chile; dirección Av. Nueva Los Leones 0203; se vende por Tienda Cargosud. _Sin sitio propio encontrado: confirmar canal._ |
| **Mercado Libre Chile** | Marketplace | — | varias | Sí | Marketplace con muchos vendedores de filamento (Bambu Lab, Creality, SUNLU, eSUN, Plast Ar, Macrotec); no encontré tiendas oficiales de SUNLU, eSUN o Elegoo en Chile. _Comprobar la insignia «Tienda oficial» en cada publicación._ |
| **Líder** | Retail | — | Safe and Sound, Polymaker (accesorios) | Sí | PLA Safe and Sound 1,75 mm 1 kg a ≈ $13.000 (vendedor tercero Casa Cortez Chile); accesorios como secadores Polymaker. _Marketplace dentro del retail: vendedor tercero._ |
| **Paris** | Retail | — | varias | Sí | Categoría de filamento para impresora 3D con ≈ 180 productos. _Marcas no confirmadas._ |
| **Falabella** | Retail | — | varias | Sí | Categoría de filamento para impresora 3D en Falabella Chile. _Marcas no confirmadas._ |

## 4. Proveedores y marketplaces fuera de Chile

| Proveedor | Tipo | Ciudad | Marcas | Despacha a Chile | Evidencia y notas |
|---|---|---|---|---|---|
| **Mercado Libre Argentina** | Marketplace | — | Grilon3, GST3D | Por confirmar | Varios revendedores de Grilon3 (PLA, PETG, Nylon, Flex) y reportes de GST3D entre lo más vendido. _No hay evidencia de envío a Chile._ |
| **Mercado Libre Colombia (tienda Bambu Lab)** | Marketplace | — | Bambu Lab | Por confirmar | Tienda Bambu Lab con PLA y PETG en la versión colombiana. _Solo referencia regional._ |
| **Bambu Lab Store** | Tienda de la marca | — | Bambu Lab | Vía courier/importación | Un foro indica tiendas oficiales para EE. UU., Reino Unido, Australia, Japón, UE, Corea del Sur, Canadá y «Global» (Hong Kong, Macao, Malasia, Nueva Zelanda, Taiwán); Latinoamérica no figura. Usuarios de Argentina mencionan compras por courier. _Verificar en el selector de país si despacha a Chile; si no, usar revendedor local o casillero._ |
| **AliExpress** | Marketplace | — | Geeetech, Eryone, Anycubic, Nexaforge, (tiendas oficiales de otras marcas por confirmar) | Vía courier/importación | Tiendas de varias marcas publican envío desde bodega en EE. UU.; no confirmé tiendas oficiales de Elegoo, SUNLU, eSUN ni Polymaker. _Importación: considerar aduana e impuestos._ |
| **Amazon** | Marketplace | — | eSUN, SUNLU, varias | Vía courier/importación | Sin evidencia verificada en esta búsqueda; es una vía habitual de importación. _Confirmar despacho a Chile y costos de importación._ |
| **MatterHackers** | Tienda internacional | — | Bambu Lab, varias | Por confirmar | Aparece con filamento Bambu Lab; no hay indicación de envío a Chile. _Solo referencia._ |
| **3D Printing USA** | Tienda internacional | — | varias | Por confirmar | Tienda de EE. UU. con amplio catálogo de filamentos; no confirmé envío a Chile. _Solo referencia._ |
| **PcComponentes** | Tienda internacional | — | Bambu Lab | Por confirmar | Vende filamentos Bambu Lab para España; sin indicación de envío a Chile. _Solo referencia._ |
| **Forward2Me** | Servicio de reenvío | — | — | Sí | Servicio de reenvío para comprar en tiendas que no despachan al país, mencionado para Bambu Lab. _No es proveedor: es una vía logística._ |

## 5. Lo que **no** pude confirmar (de los nombres que pediste)

| Nombre | Estado |
|---|---|
| **Maxi3D** | Solo una página de Facebook (base en Cerro Navia, enfocada en importar insumos y filamentos). Sin sitio web ni más fuentes |
| **Imperio 3D** | Confirmada con sitio, anuncio de tienda en Las Condes y tienda en Mercado Libre Chile. Dirección exacta del showroom y marcas completas por confirmar |
| **GST3D** | Marca vista en Mercado Libre Argentina; sin evidencia de venta en Chile |
| **Polymaker** | Sin evidencia en tiendas chilenas en esta búsqueda (sí accesorios de la marca en Líder) |
| **Sodimac, PC Factory, SP Digital** | No encontré filamentos en sus catálogos chilenos (Sodimac solo apareció la versión de Perú) |
| **Tiendas oficiales en Mercado Libre Chile** (SUNLU, eSUN, Elegoo) | No encontré; hay vendedores independientes |
| **Bambu Lab Store → Chile** | Un foro indica que Latinoamérica no figura entre las regiones de la tienda oficial; hay que revisar el selector de país o usar revendedor/casillero |

## 6. Propuesta de datos

```
suppliers (nueva)
  id, workspace_id, slug (único por taller), name, kind
    ('tienda_especializada'|'importador'|'marketplace'|'marketplace_vendedor'|'retail'|'fabricante'
     |'distribuidor_marca'|'tienda_marca'|'tienda_internacional'|'servicio_casillero'|'otro'),
  country, city, url, channels jsonb, brands jsonb, ships_to_chile ('si'|'via_courier'|'desconocido'|'no'),
  notes, source ('sistema'|'taller'), verified bool, active bool, created_at, updated_at, deleted_at
spools.supplier_id, inventory_items.supplier_id        → FK opcional (se conserva supplier_text durante la migración)
filament_lines.supplier_id                              → proveedor habitual de la línea (D14), opcional
```

- **Datos de partida:** el JSON se carga en el primer arranque como proveedores `source: 'sistema'`, **editables y archivables** por el taller (no se pisan al actualizar el sistema; las actualizaciones agregan por `slug` solo los nuevos).
- **Migración:** los textos libres existentes (`supplier_text`) se **emparejan** con el directorio por nombre normalizado y, si no coinciden, se ofrece crear el proveedor (vista previa; nunca automático).
- **Sin** datos sensibles: no se guardan contactos ni credenciales.

## 7. Dónde aparece

| Pantalla | Cambio |
|---|---|
| **Entrada de compra** (`AddSpoolButton`) y **Alta masiva de filamentos** (N4) | El campo «Proveedor» pasa de texto libre a un **selector con búsqueda** sobre el directorio, con «Agregar nuevo» |
| **Ficha de la línea de filamento** (D14) | Proveedor habitual (opcional) |
| **Lista de compras** (`/inventario?tab=compras`) | Muestra el proveedor habitual y un **enlace al sitio** para reponer |
| **Asistente inicial** (N10, paso 10 Materiales) | Pregunta opcional «¿Dónde compras tus filamentos?» con los proveedores sugeridos; los elegidos quedan marcados como favoritos |
| **Configuración → Proveedores** | Lista simple: crear, editar, archivar, marcar favorito |

## 8. Estimación y preguntas

| Paquete | Opt. | Prob. | Pes. | Release |
|---|---:|---:|---:|---|
| **N4b** · Directorio de proveedores: tabla, carga inicial, selector en entrada de compra y alta masiva, pantalla en Configuración, migración de textos | 2,5 | 3,5 | 5 | R2 |

Incluye curar y revisar el JSON, pero **no** la verificación con cada proveedor (tarea del taller, ≈ 1 jornada de llamadas o mensajes).

**Pregunta H1:** ¿Se acepta un **directorio liviano** (sin pedidos ni contactos) como excepción acotada a «relación con proveedores fuera de alcance»? Recomendación: sí.

## 9. Lista de verificación antes de publicar la data inicial

- [ ] Confirmar en cada sitio nombre, URL y marcas; quitar los que no despachen o hayan cerrado.
- [ ] Confirmar Maxi3D (sitio, canal de venta), Horus3D, DesignTec y Filamaker (canal y dirección).
- [ ] Confirmar dominio y catálogo de Cicla 3D y si GST3D se vende en Chile.
- [ ] Confirmar tiendas oficiales de marca en Mercado Libre Chile.
- [ ] Revisar si Bambu Lab Store despacha a Chile.
- [ ] Agregar proveedores propios del taller (los que ya usa) antes de la carga.
- [ ] Decidir si se publican en la data inicial los proveedores extranjeros de «solo referencia».

_Fuentes: resultados de búsqueda web (octubre de 2026) sobre las tiendas y marcas citadas; el detalle por proveedor está en la columna «Evidencia» y los enlaces en el JSON._
