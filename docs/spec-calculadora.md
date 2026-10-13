# Spec — Calculadora de costos y precios v2 (con perfiles de cálculo)

Estado: **borrador para revisión** · Alcance: `src/lib/pricing.ts`, `settings.rates`, calculadora rápida, editor de líneas de presupuesto/pedido, configuración de tarifas.
Esto es un diseño; no hay código cambiado todavía.

---

## 1. Diagnóstico del motor actual (v1)

Se corrió `calcLine` con los valores por defecto del seed (Bambu A1: compra $480.000, residual $100.000, 5.000 h, 130 W, mantención $150/h; PLA a $17.000/kg; IVA 19 % incluido; margen 70 %).

| Caso | Costo calculado | Precio sugerido | $/g | $/h máquina | Margen real sobre neto | Markup real |
|---|---|---|---|---|---|---|
| 50 g / 4 h, sin post | $3.011 | $5.100 | 102 | 1.275 | **29,7 %** | 42 % |
| 50 g / 4 h, 10 min de post | $4.011 | $6.800 | 136 | 1.700 | 29,8 % | 42 % |
| 200 g / 16 h | $9.046 | $15.400 | 77 | **963** | 30,1 % | 43 % |
| 10 u × 20 g (placa de 12 h) | $7.998 | $12.000 | 60 | **1.000** | **20,7 %** | 26 % |

El caso "200 g / 16 h" cobra ~$963 por hora de máquina ocupada, que no cubre ni un sueldo ni costos fijos. Hallazgos, de mayor a menor impacto:

1. **El IVA se come el margen (bug de fórmula).** `price = cost × (1 + margen)` se trata como precio final con IVA cuando `taxMode = 'incluido'` (el default). El neto real es `precio / 1,19`, así que el "70 %" configurado es en realidad ~42 % de markup y ~30 % de margen sobre venta. El usuario cree que gana 70 % y gana 30 %. **Decisión:** la calculadora deja de conocer el IVA (ver §2 y §3.6); el IVA es una opción del presupuesto.
2. **"Margen" significa dos cosas.** Se configura como *markup sobre costo* (70 %), pero la alerta `minMarginPct` (25 %) y los semáforos del editor miden *margen sobre precio neto*. No son comparables.
3. **El descuento por volumen rompe el margen mínimo por defecto.** Con ≥10 unidades (−10 %) el margen real baja a ~21 %, bajo el 25 % de alerta, sin que el costo cambie (la preparación no se amortiza ni se protege).
4. **La mano de obra casi no existe.** Solo hay `prepMinutes` (10 min fijos por línea, no por placa) y `postMinutes` (default 0). No hay tiempo de supervisión, cambio de placa, retiro, control de calidad, empaque, atención del cliente ni diseño/arreglo de archivo.
5. **El costo de máquina por hora es solo depreciación + mantención + energía ≈ $250/h.** No hay costos fijos del taller (arriendo, internet, software, contabilidad, seguros, patente), ni costo de capital, ni tiempo ocioso. Para un taller real, el costo por hora productiva es varias veces eso.
6. **Máquinas sin datos cuestan $0/h.** En el esquema `purchaseValue`, `maintCostHour` y `costPerKg` tienen `default 0`. Una máquina o material recién creado cotiza casi gratis, sin ningún aviso.
7. **La tasa de falla medida puede ser 0 %.** `machineCostOf` usa `jobsFailed/(ok+failed)` con ≥10 trabajos; con 10 éxitos la falla pasa de 5 % a **0 %** y el precio baja. Con tan pocas muestras debería encogerse hacia el valor por defecto.
8. **La falla solo se suma al costo directo** (`failure = f × (material+máquina+energía)`) y se aplica igual a PLA que a TPU/ASA/nylon, o a una pieza alta y delgada.
9. **Tiempo del laminador optimista.** `hoursTotal` viene del slicer y excluye calentamiento, nivelación, purga, cambios de color/AMS y enfriado. `timeFactor` corrige solo si existen trabajos terminados y solo cuando `mode !== 'manual'`; en modo manual (el de la calculadora rápida) no se aplica nunca.
10. **Material:** usa un único material por línea (un trabajo multicolor se cotiza con el costo de un solo color), el costo es promedio ponderado de bobinas (no costo de reposición, que sube con la inflación/dólar), y `wastePct` 8 % es plano aunque los gramos del laminador ya incluyan soportes y torre de purga (riesgo de doble conteo o de conteo corto según el caso).
11. **Costos que no entran al precio:** comisión de pasarela/POS (Transbank, MercadoPago) sobre el valor con IVA, comisión del canal (existe en `sales_channels`, pero no llega a la calculadora), embalaje, despacho promedio, riesgo/complejidad, envío de muestra.
12. **Redondeo inconsistente.** El cliente (`computeItem`) redondea el ajuste de lista a múltiplos de 10; el servidor (`priceItem`) usa `rt.rounding`. Un mismo presupuesto puede mostrar un precio y guardar otro.
13. **La calculadora rápida no tiene contexto comercial.** No sabe de cliente, canal ni tipo de trabajo; todo se cotiza con un único juego de tarifas. Por eso no puede distinguir un prototipo de una pieza de venta o un pedido mayorista.

---

## 2. Principios de diseño

- El motor sigue siendo **puro** (sin BD) y determinista. Todo parámetro nuevo entra por `Rates` ya resuelto.
- **El precio sugerido es una banda con explicación, no un número.** El usuario sigue decidiendo el precio final (spec original §4.1).
- **Los pisos mandan sobre el cálculo costo+margen.** Si el costo+margen da menos que el piso de realidad (tarifa por hora, mínimo por pedido), gana el piso y la UI dice cuál.
- **La calculadora trabaja siempre en neto (sin IVA).** Costos, margen, pisos y precio sugerido son netos. El IVA no existe en el motor de líneas: es una opción **del presupuesto** (casilla "Aplicar IVA") que se suma sobre el neto solo si se marca. Así el IVA nunca resta margen ni altera la sugerencia.
- **Margen explícito sobre el neto** y siempre reportado en esa base.
- **Compatibilidad:** los presupuestos congelados no cambian. El perfil "Heredado (v1)" reproduce exactamente la fórmula actual.
- Ningún valor por defecto de mercado se inventa en código: los números de esta spec marcados *(calibrar)* son ejemplos; ver §7.

---

## 3. Modelo de costos v2

Notación: por línea; `U` unidades, `P` placas, `G` gramos del laminador, `H` horas del laminador.

### 3.1 Tiempo
```
H_ef  = H × timeFactor(máquina, material)          # también en modo manual (con aviso si no hay historial)
      + P × setupHorasPorPlaca                      # precalentar, nivelar, purgar, retirar, enfriar
      + cambiosDeColor × minPorCambio / 60          # solo si el laminador no los incluye
P     = ceil(U / unidadesPorPlaca)                  # del laminador; manual: 1 si no se informa
```

### 3.2 Máquina (costo por hora productiva)
```
dep      = (compra − residual) / vidaHoras
mant     = max(mantManual, consumiblesPlan/vidaConsumible)   # boquilla, placa, correas desde los planes de mantención
energia  = watts/1000 × factorUso × kWh                      # factorUso = consumo medio / potencia de placa (calibrar)
capital  = compra × tasaAnual / horasProductivasAño          # opcional
fijos    = costosFijosMes / (Σ horasProductivasMes de todas las máquinas)
tarifaMaq = dep + mant + energia + capital + fijos
horasProductivasMes = horasDia × diasMes × utilización       # utilización objetivo (calibrar), p. ej. 35–60 %
```
`fijos` es el cambio que más sube el costo realista: reparte arriendo, internet, software, contabilidad, patente, seguros entre las horas que de verdad se venden.

### 3.3 Mano de obra (todo a `laborHour`, o a tarifa distinta por rol)
```
prep         = P × prepMinPorPlaca/60 × laborHour       # preparar archivo, cargar, laminar
supervision  = H_ef × superMinPorHora/60 × laborHour    # revisar a distancia; 0 en impresoras con cámara si el perfil lo dice
post         = U × postMinPorUnidad/60 × laborHour + U × insumosPorUnidad
diseno       = disenoMin/60 × laborHour                 # modelado / reparación de malla, solo si se informa
atencion     = atencionMin/60 × laborHour                # por pedido, no por línea (se reparte)
empaque      = U × empaqueUnidad + empaquePedido
```
`postMinPorUnidad` e `insumos` pueden tener **default por categoría/material** (p. ej. ABS con alisado, resina con lavado/curado), no 0.

### 3.4 Material
```
costoKg   = según materialCostBasis: 'promedio' | 'reposicion' | 'max(promedio, última compra)'
costoKg  *= costsIncludeTax ? 1/(1+IVA) : 1                      # costo neto si se recupera crédito fiscal
gramos_ef = G × (1 + merma)  # merma por material/perfil; separar de purga ya contenida en G
material  = Σ por filamento (g_i/1000 × costoKg_i)                # multicolor: un costo por slot, no uno solo
```
- Alerta (no cálculo) si el material tiene `costPerKg = 0` o la máquina `purchaseValue = 0`: la línea se marca "datos incompletos" y la banda no se muestra como confiable.

### 3.5 Falla / riesgo
```
f_med   = (fallos + k × f_defecto) / (hechos + k)            # k ≈ 20: encoge hacia el valor por defecto (calibrar)
f       = f_med × riesgoMaterial[tipo] × riesgoComplejidad[tag]   # tabla editable; 1.0 por defecto
falla   = (directo) × f/(1−f)                                 # pérdida esperada; incluye mano de obra de prep/supervisión
```
Etiquetas de complejidad opcionales por línea: *soportes pesados*, *pieza alta/delgada*, *muchas capas de puente*, *flexible*, *ajuste de precisión*.

### 3.6 Formación de precio
```
costo_total  = material + máquina + energía + prep + supervisión + post + diseño + falla + empaque + (envío a costo)
precio_neto  = costo_total / (1 − margenObjetivo)            # margen sobre venta (modo 'margen'); modo 'markup' disponible
precio_neto *= (1 + urgencia)
precio_neto  = max(precio_neto, pisoHora × H_ef, pisoGramo × G, minPrecioLinea)
descuento    = tramo de volumen, pero  precio_neto ≥ costo_total / (1 − margenMinVolumen)   # el descuento nunca baja del margen mínimo
precio_neto /= (1 − comisionPasarela − comisionCanal)         # tarifas sobre lo cobrado
redondeo     = roundPrice(precio_neto)                          # una sola implementación, cliente y servidor
```
**Sin IVA en la línea.** `suggestedUnit`, `finalUnit` y todos los márgenes son netos. El IVA se calcula solo en los totales del presupuesto (§3.8).
A nivel de **pedido/presupuesto**: `pisoPedido` (mínimo por pedido) cubre atención + empaque + despacho aunque la suma de líneas sea baja; se reparte proporcional.

### 3.8 IVA en el presupuesto (opcional)
- `quotes.applyTax` (boolean; valor inicial = `settings.rates.taxDefault`, que parte en **desactivado**) y `taxPct` desde configuración (19 %).
- Con la casilla marcada: `iva = round(neto_tras_descuento × taxPct/100)` y `total = neto + iva`. Sin marcar: `total = neto`, sin línea de IVA en pantalla ni PDF.
- Se retira el modo `incluido` (que dividía el precio final por 1,19); `exento` equivale a casilla desmarcada y `sumado` es el único comportamiento con IVA.
- PDF y WhatsApp indican "+ IVA" o el desglose según la casilla; la calculadora rápida muestra el neto y, si se marca, el total con IVA.
- Pedidos y ventas heredan `applyTax` del presupuesto; el margen en editor y reportes es siempre sobre el neto.
- La comisión de pasarela se cobra sobre el total pagado (con IVA si aplica); en la línea se estima sobre el neto y se rotula como estimación.
- Migración: los presupuestos existentes con `taxMode = 'incluido'` conservan su total congelado (marca `legacyTaxMode` en `calc`) y no se recalculan.

### 3.7 Banda de sugerencia (salida)
| Nivel | Definición | Uso |
|---|---|---|
| **Piso** | `costo / (1 − margenMínimo)` con pisos de hora/pedido | no vender por debajo |
| **Recomendado** | fórmula §3.6 con margen objetivo del perfil | precio por defecto |
| **Alto** | recomendado × (1 + recargo de complejidad/urgencia) o el máximo de referencias de mercado | cliente sin alternativa / urgente |

La UI muestra además **qué regla fijó el precio** ("subió al piso de $/hora", "mínimo por pedido", "descuento limitado por margen mínimo") y el margen real sobre neto.

---

## 4. Perfiles de cálculo

Un **perfil de cálculo** es un juego nominado de ajustes que se superpone a las tarifas base y responde "¿qué tipo de trabajo es este?".

### 4.1 Resolución (de menor a mayor prioridad)
```
tarifas base (settings.rates)  →  perfil de cálculo  →  override por material  →  override por máquina
   →  override por categoría  →  override manual de la línea
```
Se resuelve a un `Rates` completo (`resolveRates(base, perfil, {material, máquina, categoría, línea})`) y se pasa a `calcLine`. El motor no cambia de forma; solo recibe tarifas ya resueltas. Un perfil guarda **solo las diferencias** (`params` parcial).

### 4.2 Qué puede variar un perfil
margen objetivo y modo · margen mínimo · tarifa laboral y tiempos (prep/supervisión/post/diseño/atención) · merma y falla · factor de riesgo · pisos ($/h, $/g, mínimo de línea y de pedido) · urgencia · tramos de volumen · redondeo · comisión de canal/pasarela · base de costo de material · si aplica `timeFactor` · empaque. (El IVA **no** es parte de un perfil: es una casilla del presupuesto.)

### 4.3 Perfiles predefinidos (sembrados, editables; valores = *calibrar*)
| Perfil | Intención | Diferencias típicas |
|---|---|---|
| **Estándar** | trabajo normal a medida | tarifas base |
| **Prototipo rápido** | iteración, tolerancia baja | menos post, margen menor, sin recargo de acabado |
| **Funcional / ingeniería** | piezas que cargan, ajuste | más post y control de calidad, falla × riesgo material, margen mayor |
| **Producción en serie** | repetición ≥ N | prep por placa amortizada, descuento por volumen con piso de margen |
| **Mayorista / revendedor** | cliente tipo `revendedor` | margen menor pero piso de margen duro, sin diseño |
| **Marketplace** | venta por canal con comisión | `comisionCanal` incluida, empaque y despacho promedio |
| **Urgente** | plazo < 48 h | recargo, prioriza máquina, sin descuento de volumen |
| **Personalizado / regalo** | diseño y atención altos | diseño y atención, margen mayor, mínimo por pedido |
| **Resina / otra tecnología** | `tech ≠ FDM` | lavado/curado, insumos, falla propia |
| **Heredado (v1)** | compatibilidad | reproduce exactamente la fórmula actual |

### 4.4 Dónde se elige el perfil (default en cascada)
`línea > presupuesto > cliente (tipo/lista) > canal de venta > categoría de producto > Estándar`.
- `customers.calcProfileId`, `sales_channels.calcProfileId`, `quotes.calcProfileId`, `quote_items.calcProfileId` (nullable).
- Calculadora rápida: selector de perfil arriba del resultado, con cliente/canal opcionales para precargarlo.
- Cambiar el perfil recalcula en vivo y muestra la diferencia de precio y de margen contra el perfil anterior.

### 4.5 Congelado
Al guardar una línea, `costBreakdown` guarda `engineVersion`, `profileId`, un **snapshot del `Rates` resuelto** y la regla ganadora del precio. Editar un perfil nunca altera un presupuesto ya guardado; "Recalcular con tarifas actuales" es una acción explícita (como el flag `frozen` actual).

---

## 5. Anclas de realismo (lo que evita sugerencias baratas)

1. **Tarifa de equilibrio por hora de máquina** (pantalla de configuración):
   ```
   horasProductivasMes = Σ máquinas (horasDía × díasMes × utilización)
   tarifaEquilibrio    = (costosFijosMes + ingresoObjetivoMes) / horasProductivasMes
   ```
   Se usa como `pisoHora` por defecto y se muestra al lado de lo que cobra hoy el sistema. Es la ancla principal: el usuario ve "tu taller necesita ≥ $X por hora de máquina para llegar a $Y al mes".
2. **Referencias de mercado propias.** Tabla `price_benchmarks` (nombre, tecnología, material, $/g, $/h o precio de pieza con g y h, fecha, fuente). La banda se compara contra ellas y avisa "estás un N % bajo tu referencia". Se carga con un asistente de **calibración**: el usuario ingresa 3–5 cotizaciones reales (propias o de la competencia) con gramos, horas y precio; el sistema infiere $/g y $/h y propone ajustar el perfil. No se incluyen tarifas de mercado fijas en código (no hay datos públicos fiables que respalden un default).
3. **Calibración con histórico propio:** de los trabajos terminados (`printJobs.estG/realG`, `estH/realH`, `result`) derivar por máquina×material: `timeFactor`, `mermaReal`, `fallaReal` (con encogimiento). Pantalla "Tus números reales vs lo que usa la calculadora" con botón de aceptar.
4. **Chequeo de datos incompletos:** máquina sin valor de compra, material sin costo, `kWh`/`laborHour` en 0, tarifa de equilibrio no configurada → banner en la calculadora y banda marcada "no confiable".
5. **Chequeo de coherencia al guardar tarifas:** advertir si `margenObjetivo` real sobre neto < `margenMínimo`, si el tramo de volumen más bajo cae bajo el margen mínimo, o si el precio/hora resultante en un caso tipo queda bajo la tarifa de equilibrio.

---

## 6. Cambios de datos y código

**Esquema (drizzle, migración nueva `0003_*`):**
- `calc_profiles(id, workspace_id, name, description, kind, tech, params jsonb, is_default, active, ...base)`.
- `customers.calc_profile_id`, `sales_channels.calc_profile_id`, `quotes.calc_profile_id`, `quote_items.calc_profile_id`.
- `quotes.apply_tax boolean not null default false` (casilla de IVA, §3.8).
- `price_benchmarks(...)` (§5.2).
- `materials.risk_factor`, `materials.waste_pct`, `materials.cost_basis` (nullable → usa el default).
- `settings.data.rates` crece con: `fixedCostsMonth`, `targetIncomeMonth`, `productiveHoursPerMonth`/utilización, `marginMode`, `floors{perHour, perGram, perOrder}`, `payFeePct`, tiempos de mano de obra, `costsIncludeTax`, `volumeMinMarginPct`, `failShrinkK`. `taxMode` se reemplaza por `taxDefault: boolean` (default false) y se conserva `taxPct`; `taxMode` antiguo solo se lee para presupuestos congelados. `merge()` ya aplica defaults a lo que falte.

**Código:**
| Archivo | Cambio |
|---|---|
| `src/lib/pricing.ts` | `calcLine` v2 + `resolveRates`, `breakEvenRate`, `priceBand`, `explainPrice`; versión del motor; modo `legacy` |
| `src/lib/settings.ts` | nuevos campos y defaults; `DEFAULT_SETTINGS` con perfil Estándar |
| `src/lib/services/quotes.ts` | `machineCostOf` con encogimiento y tarifa de fijos; `priceItem` usa perfil + snapshot |
| `src/lib/context.ts` | exponer perfiles, benchmarks y tarifa de equilibrio al cliente |
| `src/components/line-editor.tsx` | quitar redondeo duplicado de `computeItem`; selector de perfil; banda y regla ganadora |
| `src/components/quick-calc.tsx` | selector de perfil/cliente/canal, banda Piso/Recomendado/Alto, avisos de datos |
| `src/components/config-forms.tsx` | secciones "Costos fijos y tarifa de equilibrio", "Mano de obra", "Perfiles", "Referencias" |
| `src/lib/seed.ts` | perfiles predefinidos y costos fijos de ejemplo |
| `src/app/(app)/configuracion/*` | pantalla de perfiles y calibración |

---

## 7. Valores que necesito de ti para fijar defaults realistas

Ningún número de mercado se asume. Para calibrar:
1. **Costos fijos mensuales** del taller (arriendo, internet, software, contabilidad, seguros, patente) y cuántas máquinas + horas/día + días/mes se usan.
2. **Ingreso mensual objetivo** (sueldo del operador/dueño) y utilización realista de las máquinas.
3. **Tarifa laboral** vigente y cuántos minutos reales toma preparar, supervisar, retirar/post-procesar y empacar un trabajo típico.
4. **3–5 cotizaciones reales** (tuyas o de la competencia) con g, h y precio, para contrastar la banda.
5. **Materiales:** como la calculadora es sin IVA, los costos se cargan **netos**. ¿Recuperas crédito fiscal? Si no, el IVA de compra es costo y hay que sumarlo al costo por kg. ¿Reposición o promedio?
6. **Cobros:** pasarela/POS usada y su comisión, canales con comisión, política de mínimo por pedido.
7. **Margen:** ¿se piensa en markup o en margen sobre venta? (propongo margen sobre neto en toda la UI).
8. **Qué diferencia a tus tipos de trabajo** (prototipo, funcional, serie, mayorista…) y cuántos perfiles quieres de partida.

---

## 8. Criterios de aceptación y pruebas

Unitarias (`tests/unit/pricing.test.ts`), por propiedades, no por números mágicos:
- El margen real sobre neto de la sugerencia ≈ `margenObjetivo` (± redondeo), sin depender de ningún ajuste de IVA.
- `calcLine` no recibe ni devuelve IVA; `calcQuote` con `applyTax = false` → `total = neto`; con `true` → `total = neto + round(neto × taxPct)`; el descuento se aplica antes del IVA.
- `precio_neto / H_ef ≥ pisoHora` siempre que `pisoHora > 0`; idem `pisoGramo`, `minPrecioLinea`, `pisoPedido`.
- El descuento por volumen nunca produce margen < `volumeMinMarginPct`.
- Falla con 10 éxitos / 0 fallos > 0 y converge a la tasa observada con muchas muestras; con 0 muestras = valor por defecto.
- Multicolor: costo material = Σ por slot, no el de un solo color.
- `modo 'markup'` y `'margen'` coinciden en el caso límite equivalente.
- `resolveRates`: orden de prioridad, perfil parcial no pisa campos no definidos, perfil `Heredado (v1)` reproduce los resultados actuales (golden de la tabla del §1).
- Cliente y servidor devuelven el mismo `suggestedUnit` (misma función de redondeo).
- Datos incompletos (compra 0, costo 0) → `confiable = false`.

Integración: guardar con perfil → editar el perfil → el presupuesto guardado no cambia; "recalcular" sí.
E2E: calculadora rápida con cambio de perfil actualiza banda, regla ganadora y diferencia de margen; banner de datos incompletos.

---

## 9. Fases propuestas

1. **Corrección sin perfiles (rápida, alto impacto):** calculadora en neto, IVA como casilla opcional del presupuesto (`applyTax`), margen sobre neto, encogimiento de la tasa de falla, avisos de datos incompletos, redondeo único cliente/servidor, `timeFactor` en modo manual. Perfil `Heredado` para no mover presupuestos viejos.
2. **Modelo de costos v2:** mano de obra por placa/hora/unidad, costos fijos y tarifa de equilibrio, pisos, material multicolor y costo de reposición, comisión de pasarela.
3. **Perfiles de cálculo:** tabla, resolución en cascada, selector en calculadora y editor, snapshot al guardar, perfiles sembrados.
4. **Realismo guiado:** referencias de mercado, asistente de calibración, "tus números reales vs la calculadora", banda Piso/Recomendado/Alto con explicación.

Cada fase se entrega con sus pruebas y sin alterar presupuestos ya congelados.
