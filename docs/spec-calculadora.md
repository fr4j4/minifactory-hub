# Spec — Calculadora de costos y precios (v2)

Estado: **borrador completo para revisión** · Sustituye al borrador anterior.
Alcance: motor de precios (`src/lib/pricing.ts`), tarifas (`settings.rates`), calculadora rápida (`/calculadora`), editor de líneas de presupuesto/pedido, totales del presupuesto, configuración de tarifas, y los datos de máquinas y materiales que afectan al precio.
Esto es diseño: no hay código cambiado todavía. Los requisitos llevan id `CAL-xx` para referenciarlos en tareas y pruebas.

---

## 0. Objetivos y no-objetivos

**Objetivos**
1. Sugerir precios **realistas**: que cubran los costos reales del taller (no solo material y desgaste) y dejen el margen que el usuario cree que deja.
2. Que **una persona que recién empieza** obtenga un precio razonable en menos de un minuto, sin entender de depreciación ni costos fijos.
3. Que **un experto** controle cada parámetro, compare escenarios y audite cómo se llegó a cada número.
4. Que el precio sea **explicable**: cada resultado dice qué lo determinó y con qué confianza.
5. Que el sistema **aprenda del taller**: con trabajos terminados se calibran tiempos, mermas y fallas reales.

**No-objetivos**
- No fija precios de mercado en código (no hay datos públicos fiables); solo permite que el usuario cargue sus referencias.
- No decide por el usuario: el precio final lo fija siempre una persona.
- No es contabilidad ni facturación; el IVA es solo un cálculo del presupuesto.

---

## 1. Personas y niveles de experiencia

La interfaz usa **divulgación progresiva** con tres niveles sobre las mismas pantallas (no hay una "versión simple" aparte). El nivel se guarda por usuario y se cambia desde un selector visible en la calculadora.

| Nivel | Para quién | Qué ve | Qué decide el sistema |
|---|---|---|---|
| **Básico** (default en cuentas nuevas) | Quien empieza o cotiza por WhatsApp | Qué es la pieza, material, gramos y horas (o "no sé" → estimar), cantidad. Un precio grande y un rango. "Copiar respuesta" y "Hacer presupuesto". | Perfil Estándar, máquina por defecto, costos y pisos |
| **Detallado** | Quien cotiza a diario | Lo anterior + máquina, perfil, tiempos de preparación/postproceso, envío, urgencia, desglose y margen, banda Piso/Recomendado/Alto | Lo que no se muestra viene del perfil |
| **Experto** | Dueño o quien ajusta las tarifas | Todo + overrides por línea, fórmula, escenarios, tabla por cantidades, sensibilidad, precio objetivo inverso, benchmarks, exportar cálculo | Nada oculto |

- **CAL-01** El nivel afecta solo la **visibilidad**, nunca el resultado: el mismo ingreso da el mismo precio en los tres niveles.
- **CAL-02** Todo dato que el nivel Básico no muestra es alcanzable con "Mostrar más detalle" en el mismo lugar, sin cambiar de pantalla ni perder lo ingresado.
- **CAL-03** El nivel y las preferencias de visualización se guardan por usuario.

---

## 2. Principios de diseño

1. **Todo el cálculo es neto (sin IVA).** Costos, margen, pisos, comisiones y precio sugerido son netos. El IVA vive solo en el presupuesto (§7.4).
2. **El motor es puro y determinista** (sin base de datos ni hora actual): mismas entradas → mismo precio, en navegador y servidor.
3. **Margen sobre venta neta** como definición única en toda la UI y los reportes. "Recargo sobre costo" queda como opción avanzada con la equivalencia siempre visible.
4. **Los pisos mandan sobre costo+margen** y la UI dice qué regla fijó el precio.
5. **Honestidad sobre la incertidumbre:** un precio basado en gramos estimados muestra un rango, no una falsa precisión.
6. **Compatibilidad:** los presupuestos congelados no cambian nunca; el perfil "Heredado (v1)" reproduce la fórmula antigua.
7. **Un solo lugar por dato:** máquina → Máquinas; material → Inventario; tarifas y perfiles → Configuración. La calculadora enlaza, no duplica.

---

## 3. Modelo de cálculo

Notación por línea: `U` unidades, `P` placas, `G` gramos (del laminador o ingresados), `H` horas (ídem).

### 3.1 Tiempo efectivo
```
P     = ceil(U / unidadesPorPlaca)                 # del laminador; manual: informado o 1
H_ef  = H × timeFactor(máquina, material)          # también en modo manual
      + P × setupHorasPorPlaca                      # precalentar, nivelar, purgar, retirar, enfriar
      + cambiosDeColor × minPorCambio / 60          # solo si el laminador no los incluye
```
**CAL-10** `timeFactor` se aplica en los tres modos de entrada; sin historial suficiente se usa 1 y la línea muestra "tiempo sin calibrar".

### 3.2 Costo de máquina (por hora productiva)
```
dep       = (compra − residual) / vidaHoras
mant      = max(mantenciónManual, consumiblesDeLosPlanes / vidaConsumible)
energía   = watts/1000 × factorUso × precioKWh        # factorUso = consumo medio / potencia de placa
capital   = compra × tasaAnual / horasProductivasAño   # opcional (avanzado)
fijos     = costosFijosMes / Σ horasProductivasMes     # todas las máquinas
tarifaMáquina = dep + mant + energía + capital + fijos
horasProductivasMes = horasDía × díasMes × utilización
```
- **CAL-11** `fijos` reparte arriendo, internet, software, contabilidad, seguros y patente entre las horas que realmente se venden. Es el mayor factor de realismo.
- **CAL-12** Máquinas sin valor de compra o con potencia 0 marcan la línea "datos incompletos" (§8.4).

### 3.3 Mano de obra (a `laborHour`, o a una tarifa por rol en nivel Experto)
```
prep         = P × prepMinPorPlaca/60 × laborHour           # preparar archivo, cargar, laminar
supervisión  = H_ef × superMinPorHora/60 × laborHour        # 0 si el perfil lo indica (impresora con cámara)
post         = U × postMinPorUnidad/60 × laborHour + U × insumosPorUnidad
diseño       = diseñoMin/60 × laborHour                     # solo si se informa
atención     = atenciónMin/60 × laborHour                   # por pedido, repartido entre líneas
empaque      = U × empaqueUnidad + empaquePedido
```
**CAL-13** `postMinPorUnidad` e `insumos` tienen **default por categoría/material** (p. ej. ABS con alisado, resina con lavado y curado), no 0.

### 3.4 Material
```
costoKg   = según base: 'promedio' | 'reposición' | 'max(promedio, última compra)'
gramos_ef = G × (1 + merma)           # merma por material/perfil; la purga ya contenida en G no se cuenta dos veces
material  = Σ por filamento (g_i / 1000 × costoKg_i)       # multicolor: un costo por slot
```
- **CAL-14** Los costos de material se ingresan **netos de IVA**. Configuración pregunta "¿Recuperas el IVA de tus compras?": si no, sugiere sumar el IVA al costo por kg y lo hace visible.
- **CAL-15** Un trabajo multicolor se cotiza con el costo de cada color/material (gramos por slot del laminador o del archivo).
- **CAL-16** Material con costo 0 → "datos incompletos".

### 3.5 Falla y riesgo
```
f_med  = (fallos + k × f_defecto) / (hechos + k)        # k ≈ 20: encoge hacia el valor por defecto
f      = f_med × riesgoMaterial[tipo] × riesgoComplejidad[etiquetas]     # tablas editables, 1.0 por defecto
falla  = directo × f / (1 − f)                           # pérdida esperada; el directo incluye prep y supervisión
```
**CAL-17** Con pocas muestras la tasa observada nunca baja la falla a 0 % (hoy 10 éxitos → 0 %).
Etiquetas de complejidad por línea (nivel Detallado): soportes pesados · pieza alta/delgada · puentes largos · flexible · ajuste de precisión.

### 3.6 Formación de precio (neto)
```
costo_total = material + máquina + energía + prep + supervisión + post + diseño + falla + empaque
precio      = costo_total / (1 − margenObjetivo)          # modo 'margen' (default); 'recargo': costo × (1 + r)
precio     ×= (1 + urgencia)
precio      = max(precio, pisoHora × H_ef, pisoGramo × G, mínimoLínea)
descuento   = tramo de volumen, con precio ≥ costo_total / (1 − margenMínimoVolumen)
precio     /= (1 − comisiónPasarela − comisiónCanal)      # tarifas sobre lo cobrado
precio      = roundPrice(precio)                          # una sola implementación, cliente y servidor
```
Nivel de pedido: `mínimoPedido` cubre atención + empaque + despacho aunque la suma de líneas sea baja; se reparte proporcional.
**CAL-18** El envío se cobra a costo y no recibe margen salvo que el perfil lo indique; el margen total del presupuesto lo reporta por separado.

### 3.7 Salida del motor
```
{ desglose{material, máquina, energía, prep, supervisión, post, diseño, falla, empaque},
  costoTotal, precioNeto{piso, recomendado, alto}, precioUnitario, margenRealNeto, markupReal,
  reglaGanadora: 'margen' | 'pisoHora' | 'pisoGramo' | 'mínimoLínea' | 'mínimoPedido' | 'volumenLimitado',
  horasEfectivas, gramosEfectivos, confianza: 'alta'|'media'|'baja', rango{min,max}?,
  avisos[], versionMotor, tarifasResueltas }
```
- **Piso**: `costo_total / (1 − margenMínimo)` con pisos de hora/pedido.
- **Recomendado**: fórmula §3.6.
- **Alto**: recomendado × (1 + recargo de complejidad/urgencia) o la mayor referencia de mercado cargada por el usuario.

### 3.8 Estimación sin laminar
Entradas posibles, de mayor a menor confianza: **laminado del sitio** (alta) → **archivo ya laminado** (alta) → **manual con historial de la máquina** (media) → **estimado desde la malla** (baja) → **estimado por medidas** (baja; largo × ancho × alto × factor de llenado × densidad, para quien no tiene archivo).
**CAL-19** Las entradas de confianza baja muestran un **rango** (`estimado ± errorHistórico`; default ±30 % *a calibrar*; el error se mide con el tiempo comparando estimado vs real).

---

## 4. Perfiles de cálculo

Un **perfil** es un conjunto nominado de ajustes que responde "¿qué tipo de trabajo es?" y se superpone a las tarifas base. Guarda **solo las diferencias**.

### 4.1 Resolución (menor → mayor prioridad)
`tarifas base → perfil → override por material → override por máquina → override por categoría → override manual de la línea`
Se resuelve a un `Rates` completo con `resolveRates(...)` y se pasa al motor.
**CAL-20** La línea puede mostrar de qué nivel viene cada valor ("margen 40 % · del perfil Mayorista").

### 4.2 Qué puede variar un perfil
Margen objetivo y modo · margen mínimo · tarifa laboral y tiempos (prep/supervisión/post/diseño/atención) · merma y falla · factor de riesgo · pisos · urgencia · tramos de volumen · redondeo · comisiones · base de costo de material · uso de `timeFactor` · empaque. **El IVA no es parte de un perfil.**

### 4.3 Perfiles de partida (sembrados, editables; números = *a calibrar*)
Estándar · Prototipo rápido · Funcional / ingeniería · Producción en serie · Mayorista / revendedor · Marketplace · Urgente · Personalizado / regalo · Resina / otra tecnología · **Heredado (v1)**.
Cada uno trae una descripción de una línea visible en el selector ("Para piezas que cargan peso: más postproceso y margen").

### 4.4 Elección en cascada
`línea > presupuesto > cliente (tipo/lista) > canal > categoría de producto > Estándar`. La calculadora rápida pregunta cliente y canal de forma opcional y precarga el perfil.
- **CAL-21** Al cambiar de perfil se muestra la diferencia de precio y de margen frente al anterior, sin recargar.
- **CAL-22** Gestión de perfiles (admin): crear, duplicar, editar, archivar, marcar por defecto, exportar/importar JSON. Editar un perfil muestra "afecta a N clientes, M canales, K presupuestos abiertos" antes de guardar.

### 4.5 Congelado
Al guardar una línea se guarda `versionMotor`, `profileId`, el **`Rates` resuelto** y la regla ganadora. Editar tarifas o perfiles nunca cambia un presupuesto guardado; "Recalcular con tarifas actuales" es una acción explícita que muestra la diferencia antes de aplicar.

---

## 5. Configuración: Estándar vs Avanzado

La configuración de tarifas tiene un interruptor **Estándar / Avanzado**. Ambos editan el mismo `settings.rates`; Estándar expone preguntas en lenguaje de negocio y **deriva** el resto desde presets; Avanzado expone cada parámetro.

### 5.1 Asistente de puesta en marcha (primer uso, re-ejecutable)
Cinco pasos, cada uno saltable ("lo configuro después", con el aviso de confianza reducida):
1. **Tu taller:** cuántas máquinas, horas al día y días al mes que imprimes.
2. **Tus costos:** costos fijos al mes (arriendo, internet, software, contabilidad…) y cuánto quieres ganar al mes.
3. **Tu tiempo:** tarifa por hora de trabajo y minutos típicos por trabajo (preparar, terminar, empacar). Si hay historial se proponen los reales.
4. **Tus máquinas y materiales:** elegir modelo de una lista de máquinas conocidas (precarga potencia, volumen y vida típica, *editables*) y costo por kg.
5. **Tu margen:** cuánto quieres ganar sobre cada venta; muestra en vivo un ejemplo "una pieza de 50 g y 4 h costaría X y la venderías en Y".
Al final: **tarifa de equilibrio** calculada, resumen y "Probar con un ejemplo".
- **CAL-30** El asistente nunca bloquea el uso: la calculadora funciona con defaults y muestra el medidor de §8.4.
- **CAL-31** Todo valor precargado se marca "sugerido" hasta que el usuario lo confirma o edita.

### 5.2 Modo Estándar (≈ 10 campos)
| Campo (lenguaje de negocio) | Detrás de escena |
|---|---|
| ¿Cuánto cuesta el kWh? | `kwh` |
| ¿Cuánto vale tu hora de trabajo? | `laborHour` |
| ¿Cuánto gastas al mes en mantener el taller? | `fixedCostsMonth` |
| ¿Cuánto quieres ganar al mes? | `targetIncomeMonth` |
| ¿Cuántas horas al día imprimes? ¿Cuántos días al mes? | `productiveHours` |
| ¿Qué margen buscas en cada venta? (slider + ejemplo en pesos) | `marginPct` (modo margen) |
| ¿Cuánto es lo mínimo que cobras por un pedido / por una pieza? | `floors.perOrder`, `floors.perLine` |
| ¿Cómo redondeas los precios? | `rounding` |
| ¿Aplicas IVA por defecto en presupuestos? | `taxDefault` |
| Tipo de taller (preset) | tiempos, merma, falla y utilización |
Presets: "Hobby/Maker", "Taller pequeño", "Producción". Cargan defaults razonables, todos editables y visibles en Avanzado.

### 5.3 Modo Avanzado
Pestañas en Configuración → Tarifas:
1. **Base:** energía, mano de obra por rol, margen y modo, pisos (hora, gramo, línea, pedido), redondeo, urgencia, tramos de volumen, comisiones (pasarela y por canal).
2. **Costos fijos y capital:** lista de costos fijos con monto y periodicidad, horas productivas por máquina, utilización, tasa de capital.
3. **Tiempos y mano de obra:** prep por placa, supervisión por hora, setup por placa, cambios de color, postproceso por categoría, atención y empaque.
4. **Material y riesgo:** base de costo (promedio/reposición), merma por material, tablas de riesgo por material y por etiqueta, k de encogimiento de falla.
5. **Perfiles de cálculo** (§4) y **overrides** por material/máquina/categoría.
6. **Referencias y calibración** (§8).
7. **Historial de cambios:** quién cambió qué y cuándo (auditoría existente), con restaurar valores anteriores.

Reglas comunes:
- **CAL-32** Cada campo tiene nombre claro, unidad, ayuda de una línea con ejemplo, valor por defecto y valor actual; "Restablecer" por campo.
- **CAL-33** Validación al guardar: rangos (0–100 %), dependencias (tramos ordenados) y **chequeos de coherencia** (§8.5) que advierten sin bloquear.
- **CAL-34** Vista previa en vivo: panel lateral con 3 casos tipo (pequeña, mediana, serie) que se recalculan al editar, mostrando precio, $/h y margen real.
- **CAL-35** Al guardar: "Los presupuestos ya enviados no cambian" y un resumen del impacto en los presupuestos abiertos si se recalcularan.
- **CAL-36** Solo roles con permiso de configuración editan tarifas; quien tenga permiso de costos las ve en solo lectura.

### 5.4 Datos que viven en Máquinas y Materiales (y la calculadora exige)
- **Máquina:** valor de compra, residual, vida útil, potencia y factor de uso, mantención/consumibles, utilización, unidades por placa típicas, `timeFactor` y su historial. Alta con "máquinas conocidas" (precarga) y verificación de completitud.
- **Material:** costo neto por kg, densidad, merma, factor de riesgo, base de costo, categoría de postproceso. Para multicolor/AMS se usa el costo de cada bobina cargada.
- **CAL-37** Crear una máquina o material con valores en 0 abre una ayuda: "Sin este dato la calculadora cotizará casi gratis. ¿Lo completas ahora?".

---

## 6. Interfaz de la calculadora rápida

Ruta `/calculadora`. Flujo **entrada → resultado → acciones**, con la misma estructura en los tres niveles.

### 6.1 Disposición (escritorio)
```
┌─ Calculadora ─────────────────────────────────  [Básico | Detallado | Experto] ─┐
│ ┌─ La pieza ──────────────────────────┐ ┌─ Precio ───────────────────────────┐ │
│ │ Descripción  [______________]       │ │ $12.900 neto        (+ IVA ☐)      │ │
│ │ Cantidad     [ 1 ]                  │ │ Rango: $11.400 – $14.800   ◔ Media │ │
│ │ Material     [PLA Negro ▾]          │ │ Margen 38 % · $3.100 por hora      │ │
│ │ ¿Cuánto pesa y demora?              │ │ ▸ ¿Por qué este precio?            │ │
│ │  (•) Subir archivo   ( ) Ya laminé  │ │                                    │ │
│ │  ( ) Lo sé           ( ) No sé →    │ │ [Copiar respuesta][Hacer presupuesto]│
│ │ ▸ Mostrar más detalle               │ │ Mi precio final: [_____] (opcional)│ │
│ └─────────────────────────────────────┘ └────────────────────────────────────┘ │
│ Historial reciente · [cálculo 1] [cálculo 2] …                                    │
└───────────────────────────────────────────────────────────────────────────────────┘
```
- **Móvil:** una columna; el precio queda en una **barra inferior fija** (precio, confianza, "Copiar respuesta"); "¿Por qué este precio?" abre una hoja desde abajo.
- **CAL-40** El precio se actualiza en vivo (sin botón "Calcular"), con anuncio a lectores de pantalla (`aria-live="polite"`) con tope de frecuencia.

### 6.2 Nivel Básico
Campos: descripción, cantidad, material, "¿cuánto pesa y demora?" (cuatro opciones con una explicación corta cada una) y cliente opcional. Resultado: **un precio**, rango si la confianza es baja, una frase ("Incluye material, uso de máquina, tu tiempo y un margen del 38 %") y las dos acciones.
- "**No sé**": mini asistente para subir archivo o indicar medidas aproximadas (largo, ancho, alto) y "¿maciza, normal o hueca?" → estimación con rango y etiqueta "Estimado".
- Sin jerga: "uso de máquina" en vez de "depreciación"; "tu tiempo" en vez de "mano de obra".
- **CAL-41** "Probar con un ejemplo" rellena una pieza de muestra; el primer uso muestra una guía de 3 pasos, descartable y reabrible desde "?".

### 6.3 Nivel Detallado (añade)
- Selector de **perfil** (con su descripción) y **máquina**; urgencia; envío; tiempos de preparación y postproceso por unidad; etiquetas de complejidad; cliente y canal.
- **Banda Piso / Recomendado / Alto** como control tipo regla con marcas; el precio final se arrastra o escribe y el margen cambia en vivo. Bajo "Piso" el control se pone rojo con "pierdes dinero" o "bajo tu margen mínimo".
- **Desglose** por concepto (tabla y barra apilada) con % de cada uno.
- Chips de origen de datos (laminador / archivo / manual / estimado) y de confianza.

### 6.4 Nivel Experto (añade)
- **Fórmula paso a paso** con valores sustituidos y la procedencia de cada parámetro (base/perfil/material/máquina/línea). Botón "Copiar como JSON" (entradas + tarifas resueltas + resultado).
- **Overrides por línea:** margen, tarifa máquina/hora, merma, falla, mano de obra, pisos, comisión; cada override marcado y con "quitar".
- **Tabla por cantidades:** precio unitario, total y margen para 1, 5, 10, 25, 50, 100 u (configurable) para ver dónde conviene cobrar por volumen.
- **Escenarios (qué pasa si…):** hasta 3 columnas comparando perfiles/máquinas/materiales/cantidad, con la diferencia de precio y margen.
- **Sensibilidad:** cuánto cambia el precio si el material sube ±10 %, el tiempo ±20 %, la falla ±5 pp.
- **Precio inverso:** "el cliente paga $X" → margen, $/hora y si es viable, y propone la cantidad mínima o el material alternativo que lo vuelve viable.
- **CAL-42** Atajos de teclado documentados (p. ej. `Ctrl+Enter` copiar respuesta, `Alt+1/2/3` cambiar nivel) y foco visible.

### 6.5 Panel "¿Por qué este precio?"
Tres capas, disponibles según nivel:
1. **Frase** (Básico): "Subió al mínimo por hora de máquina porque esta pieza tarda mucho y pesa poco."
2. **Tabla** (Detallado): desglose + regla ganadora + margen real.
3. **Fórmula** (Experto).
**CAL-43** La regla ganadora usa mensajes concretos con la acción posible: "Se aplicó el mínimo por pedido ($4.000). Puedes cambiarlo en Tarifas → Pisos."

### 6.6 Acciones
- **Copiar respuesta** (WhatsApp): descripción, cantidad, precio y "+ IVA" o "IVA incluido" según la casilla; plantilla editable en Configuración con variables.
- **Convertir en presupuesto** (permiso de crear): lleva entradas, perfil, casilla de IVA y precio final.
- **Agregar otra pieza:** admite varias líneas con un total, sin crear presupuesto.
- **Guardar el cálculo** en el historial reciente (por usuario, últimos 20); duplicar y reabrir.
- **Descargar** el detalle (PDF/CSV) en Experto.

### 6.7 IVA en la calculadora
Muestra **neto** siempre y una casilla "+ IVA 19 %" que, marcada, muestra el total con IVA y lo incluye en el texto copiado. La casilla no cambia margen ni sugerencia.

### 6.8 Estados y mensajes
- **Vacío:** qué falta ("Elige un material para ver el precio") y botón de ejemplo.
- **Datos incompletos:** banner con enlace directo a completarlos (§8.4); el precio lleva la etiqueta "poco confiable".
- **Error de laminado / archivo no válido:** mensaje claro con alternativa ("Ingresa gramos y horas a mano").
- **Sin permiso de costos:** el operador ve precio y rango, **no** costos, margen ni reglas internas.

### 6.9 Semáforos y vocabulario
Verde = sobre objetivo, ámbar = bajo objetivo pero sobre el mínimo, rojo = bajo mínimo o bajo costo; siempre con texto o ícono. Glosario único (margen, recargo, neto, piso, tarifa de equilibrio…) accesible desde cada etiqueta con tooltip de una línea.

---

## 7. Interfaz del editor de líneas y del presupuesto

### 7.1 Editor de línea
Hereda lo de §6 con estas diferencias:
- Panel derecho sticky con precio sugerido, **precio final** editable (según permiso), chips de diferencia y margen, y desglose según nivel.
- **CAL-50** Una sola implementación de redondeo en cliente y servidor (hoy distintas), con prueba de paridad.
- Campos nuevos (nivel Detallado): perfil, etiquetas de complejidad, diseño (min), empaque.
- Multicolor: tabla de colores con gramos y costo por slot.

### 7.2 Pantalla de presupuesto
- Selector de **perfil** del presupuesto (precarga el de cada línea nueva).
- Totales: Subtotal neto · Descuento · Neto · IVA (si aplica) · Total, con margen total sobre neto, costo total y envío por separado.
- Avisos: línea bajo costo / bajo margen mínimo / bajo piso de hora; pedido bajo el mínimo por pedido.
- "Recalcular con tarifas actuales" con vista previa de diferencias línea por línea.

### 7.3 Descuento y total fijado
Si el usuario fija el total, se reparte proporcional entre líneas (como hoy) y se muestra el margen resultante por línea; el descuento se aplica **antes** del IVA.

### 7.4 IVA en el presupuesto (opcional)
- `quotes.applyTax` (boolean; valor inicial = `settings.rates.taxDefault`, que parte **desactivado**) y `taxPct` desde configuración (19 %).
- Marcada: `iva = round(neto_tras_descuento × taxPct/100)`, `total = neto + iva`. Desmarcada: `total = neto`, sin línea de IVA en pantalla ni PDF.
- Se retira el modo `incluido`; `exento` equivale a desmarcada.
- PDF y WhatsApp indican "+ IVA" o el desglose según la casilla. Pedidos y ventas heredan `applyTax`.
- La comisión de pasarela se cobra sobre lo pagado (con IVA si aplica); en la línea se estima sobre el neto y se rotula como estimación.
- Migración: presupuestos con `taxMode = 'incluido'` conservan su total congelado (`legacyTaxMode`) y no se recalculan.

---

## 8. Realismo, calibración y confianza

### 8.1 Tarifa de equilibrio
```
tarifaEquilibrio = (costosFijosMes + ingresoObjetivoMes) / Σ horasProductivasMes
```
Se muestra en Configuración junto a "lo que cobra hoy el sistema por hora en un caso tipo" y es el `pisoHora` por defecto.

### 8.2 Referencias de mercado propias
Tabla `price_benchmarks` (nombre, tecnología, material, $/g, $/h o pieza con g, h y precio, fecha, fuente). La banda se compara con ellas y avisa "estás un N % bajo tu referencia". **Asistente de calibración:** el usuario ingresa 3–5 cotizaciones reales (propias o de la competencia); el sistema infiere $/g y $/h y propone ajustes de piso o perfil.

### 8.3 Calibración con el historial
Con los trabajos terminados (`estG/realG`, `estH/realH`, `result`): por máquina × material se derivan `timeFactor`, `mermaReal`, `fallaReal` (con encogimiento) y el error de estimación. Pantalla "**Tus números reales vs la calculadora**": cada parámetro con valor actual, valor medido, muestras y botón "Usar el medido". Nunca aplica cambios sin confirmación.

### 8.4 Medidor de completitud y confianza
- Lista de verificación visible en la calculadora (colapsable) y en Configuración: máquina con costos · material con costo · tarifa laboral · costos fijos · ingreso objetivo · tiempos · perfil elegido.
- Estado: **Lista / Casi lista / Incompleta**. Con "Incompleta", el precio lleva etiqueta y "Convertir en presupuesto" pide confirmación.
- Cada resultado trae `confianza` (alta/media/baja) según el origen de gramos/horas y la completitud; con baja se muestra rango.

### 8.5 Chequeos de coherencia
Al guardar tarifas se advierte (sin bloquear) si: el margen objetivo real < margen mínimo; el tramo de volumen más bajo cae bajo el margen mínimo; el precio/hora de un caso tipo queda bajo la tarifa de equilibrio; tarifa laboral o kWh = 0; costo fijo = 0 con ingreso objetivo > 0.

---

## 9. Ayuda y aprendizaje en contexto

- **CAL-60** Cada concepto tiene ayuda breve con un ejemplo numérico del propio taller ("Con tus tarifas actuales, 4 h de máquina cuestan $1.000").
- **CAL-61** Glosario enlazado y guía "Cómo se calcula el precio" en 5 pantallas, desde el "?" de la calculadora.
- **CAL-62** Valores sugeridos siempre rotulados como tales; ninguna cifra de mercado se presenta como hecho.
- **CAL-63** Mensajes y avisos en español claro, con una acción concreta.
- Integración opcional con el asesor de IA existente: "explícame este precio" y sugerencias de ajuste de perfil, siempre opcional y desactivable.

---

## 10. Datos, API y migración

### 10.1 Esquema (migración `0003_*`)
- `calc_profiles(id, workspace_id, name, description, kind, tech, params jsonb, is_default, active, …base)`.
- `customers.calc_profile_id`, `sales_channels.calc_profile_id`, `quotes.calc_profile_id`, `quote_items.calc_profile_id`.
- `quotes.apply_tax boolean not null default false`.
- `price_benchmarks(…)`.
- `materials.risk_factor`, `waste_pct`, `cost_basis`, `post_category` (nullable → defaults).
- `machines.utilization`, `power_factor`, `units_per_plate_default` (nullable).
- Preferencias de usuario: `calcLevel`, `calcUi`.
- `quick_calcs(id, user_id, input jsonb, result jsonb, created_at)` para el historial reciente.
- `settings.data.rates` crece con: `fixedCosts[]`, `fixedCostsMonth`, `targetIncomeMonth`, `productiveHours{perDay, daysPerMonth, utilization}`, `marginMode`, `floors{perHour, perGram, perLine, perOrder}`, `payFeePct`, tiempos de mano de obra, `vatRecovered`, `volumeMinMarginPct`, `failShrinkK`, `taxDefault`. `taxMode` se reemplaza por `taxDefault`; `merge()` ya aplica defaults.

### 10.2 Código afectado
| Archivo | Cambio |
|---|---|
| `src/lib/pricing.ts` | `calcLine` v2; `resolveRates`, `breakEvenRate`, `priceBand`, `explainPrice`, `estimateFromDims`; versión del motor; modo `legacy` |
| `src/lib/settings.ts` | campos nuevos y defaults; presets de taller |
| `src/lib/services/quotes.ts` | `machineCostOf` con encogimiento y fijos; `priceItem` con perfil y snapshot; totales con `applyTax` |
| `src/lib/context.ts` | exponer perfiles, referencias, tarifa de equilibrio, completitud |
| `src/lib/reports.ts` | márgenes siempre sobre neto |
| `src/components/line-editor.tsx` | redondeo único; selector de perfil; banda; regla ganadora; multicolor |
| `src/components/quick-calc.tsx` | reescritura según §6 |
| `src/components/config-forms.tsx` + `configuracion/*` | asistente, modo Estándar/Avanzado, perfiles, referencias, calibración, historial |
| `src/components/quote-editor.tsx`, `presupuestos/*`, PDF | casilla de IVA, totales, "recalcular" |
| `src/lib/seed.ts` | perfiles y presets sembrados |
| `src/i18n/*` | cadenas nuevas en es y en |

### 10.3 Migración de comportamiento
1. Presupuestos existentes: se marcan `legacy` y no cambian.
2. Cuentas existentes: perfil por defecto **Heredado (v1)** hasta que el administrador ejecute el asistente; mientras tanto, aviso "Tu calculadora usa la fórmula antigua".
3. Cuentas nuevas: Estándar desde el inicio y asistente de puesta en marcha.

### 10.4 Permisos
Ver costos/márgenes: `canSeeCosts`. Fijar precio final: `canSetFinalPrice`. Editar tarifas y perfiles: permiso de configuración. Los operadores ven precio y rango, no costos.

---

## 11. Requisitos no funcionales

- **CAL-70 Paridad cliente/servidor:** mismo código de motor en ambos, con prueba sobre casos aleatorios.
- **CAL-71 Rendimiento:** recalcular en < 16 ms por cambio; tabla por cantidades y escenarios se calculan en el cliente.
- **CAL-72 Accesibilidad:** WCAG AA, uso solo con teclado, `aria-live`, color nunca como única señal, objetivos táctiles ≥ 44 px en móvil (coherente con las pruebas e2e de accesibilidad existentes).
- **CAL-73 i18n:** todo texto vía `t()`, español de Chile e inglés; moneda y decimales según `shop.currency`.
- **CAL-74** Modo oscuro y responsive como el resto de la aplicación.
- **CAL-75 Auditoría:** todo cambio de tarifas/perfiles queda registrado (quién, cuándo, antes/después).
- **CAL-76 Privacidad de costos:** costos y márgenes no viajan al navegador de roles sin permiso (el contexto de cálculo omite costos de máquina/material y el servidor entrega solo el precio).

---

## 12. Pruebas y criterios de aceptación

**Unitarias (propiedades, no números mágicos)**
- Margen real sobre neto de la sugerencia ≈ `margenObjetivo` (± redondeo), sin depender del IVA.
- `calcLine` no recibe ni devuelve IVA; `applyTax = false` → `total = neto`; `true` → `total = neto + round(neto × taxPct)`, con el descuento antes del IVA.
- `precio / H_ef ≥ pisoHora`; idem `pisoGramo`, `mínimoLínea`, `mínimoPedido`.
- El descuento por volumen nunca baja del `margenMínimoVolumen`.
- Falla con 10 éxitos y 0 fallos > 0; converge con muchas muestras; con 0 muestras = valor por defecto.
- Multicolor: costo de material = Σ por slot.
- Modos `recargo` y `margen` coinciden en el caso equivalente.
- `resolveRates`: orden de prioridad; un perfil parcial no pisa campos no definidos; Heredado reproduce los casos del Anexo A.
- Entradas de confianza baja siempre devuelven rango; datos incompletos degradan la confianza y avisan.
- Cliente y servidor devuelven el mismo `suggestedUnit`.

**Integración:** guardar con perfil → editar el perfil → el presupuesto no cambia; "recalcular" sí. El asistente deriva los mismos `Rates` que ingresar los campos a mano. Importar/exportar perfiles ida y vuelta.

**E2E:** los tres niveles dan el mismo precio; cambio de perfil actualiza banda y regla; banner de datos incompletos; casilla de IVA; asistente completo y saltado; operador sin ver costos; móvil con barra inferior; navegación solo con teclado.

**Criterios de aceptación globales**
1. Un usuario nuevo obtiene un precio en ≤ 60 s sin abrir configuración.
2. Con tarifas de ejemplo completas, el caso "200 g / 16 h" no cobra menos que la tarifa de equilibrio por hora.
3. El margen mostrado coincide con (neto − costo) / neto en pantalla, presupuesto, PDF y reportes.
4. Ningún presupuesto guardado cambia de precio tras actualizar tarifas.

---

## 13. Fases de implementación

| Fase | Contenido | Resultado visible |
|---|---|---|
| **1. Correcciones** | Cálculo neto; IVA como casilla del presupuesto; margen sobre neto; encogimiento de falla; `timeFactor` en manual; redondeo único; avisos de datos incompletos; perfil Heredado | Los precios dejan de erosionarse por el IVA; avisos útiles |
| **2. Motor v2** | Mano de obra por placa/hora/unidad; costos fijos y tarifa de equilibrio; pisos; multicolor; costo de reposición; comisiones; confianza y rango | Sugerencias realistas |
| **3. Perfiles y configuración** | Perfiles en cascada; asistente; modo Estándar/Avanzado; presets; vista previa en vivo; historial de cambios | Configurable por principiantes y expertos |
| **4. Calculadora nueva** | Niveles Básico/Detallado/Experto; banda; "¿por qué este precio?"; historial; varias piezas; "No sé" | Experiencia completa |
| **5. Realismo guiado** | Referencias de mercado; calibración con historial; escenarios, sensibilidad, precio inverso, tabla por cantidades | Calibración y análisis experto |

Cada fase entrega sus pruebas, mantiene intactos los presupuestos congelados y se puede publicar por separado.

---

## 14. Decisiones pendientes

1. **Costos fijos** mensuales, **ingreso objetivo**, horas/día y días/mes de impresión.
2. **Mano de obra:** tarifa por hora y minutos reales de preparar, supervisar, post-procesar y empacar; ¿una tarifa o por rol?
3. **IVA de compras:** ¿lo recuperas? Define si el costo del material se carga neto o con IVA sumado.
4. **Cobros:** pasarela/POS y comisión; canales con comisión; ¿mínimo por pedido?
5. **Margen:** confirmar margen sobre venta neta como definición única (y si quieres conservar "recargo sobre costo" como opción).
6. **Perfiles de partida:** ¿sirven los 9 propuestos? ¿Qué tipos de trabajo distingues hoy?
7. **3–5 cotizaciones reales** para contrastar la banda y fijar los primeros pisos.
8. **Niveles:** ¿Básico como default de cuentas nuevas? ¿Roles que deban quedar fijos en un nivel?
9. **Calculadora rápida:** ¿una sola pieza o varias desde el inicio (§6.6)?
10. **Cuentas existentes:** ¿mantener Heredado hasta que el administrador decida (propuesto) o pasar a Estándar con aviso?

---

## Anexo A — Diagnóstico del motor v1 (evidencia)

Con los valores del seed (Bambu A1: compra $480.000, residual $100.000, 5.000 h, 130 W, mantención $150/h; PLA a $17.000/kg; IVA 19 % incluido; margen 70 %):

| Caso | Costo | Precio sugerido | $/g | $/h máquina | Margen real sobre neto |
|---|---|---|---|---|---|
| 50 g / 4 h, sin post | $3.011 | $5.100 | 102 | 1.275 | 29,7 % |
| 50 g / 4 h, 10 min de post | $4.011 | $6.800 | 136 | 1.700 | 29,8 % |
| 200 g / 16 h | $9.046 | $15.400 | 77 | 963 | 30,1 % |
| 10 u × 20 g (placa de 12 h) | $7.998 | $12.000 | 60 | 1.000 | 20,7 % |

Hallazgos, de mayor a menor impacto:
1. **El IVA se come el margen:** `precio = costo × (1 + margen)` se trata como precio con IVA; el "70 %" es en la práctica ~42 % de recargo y ~30 % de margen sobre venta. → §2.1, §3.6, §7.4.
2. **"Margen" significa dos cosas** (recargo configurado vs margen sobre venta en las alertas). → §2.3.
3. **El descuento por volumen rompe el margen mínimo** por defecto (≈21 % con ≥ 10 u). → §3.6.
4. **Mano de obra casi inexistente:** 10 min fijos por línea, postproceso 0 por defecto, sin supervisión, atención ni diseño. → §3.3.
5. **Costo de máquina ≈ $250/h** sin costos fijos, capital ni ocio. → §3.2, §8.1.
6. **Máquinas y materiales sin datos cuestan $0** y no hay aviso. → §5.4, §8.4.
7. **Falla medida puede quedar en 0 %** (10 éxitos sin fallas). → §3.5.
8. **Falla uniforme** para todos los materiales y complejidades. → §3.5.
9. **Tiempo del laminador optimista**; `timeFactor` no se aplica en manual. → §3.1.
10. **Material:** un único material por línea, costo promedio, merma plana con posible doble conteo. → §3.4.
11. **Costos ausentes:** pasarela, comisión del canal, embalaje, despacho promedio, riesgo. → §3.6.
12. **Redondeo distinto** entre cliente y servidor. → CAL-50.
13. **La calculadora rápida no conoce cliente ni canal.** → §4.4, §6.

---

## Anexo B — Estado de implementación (rama `feature/calculator-v2`)

> **Portado sobre `development` (rama `feature/calculadora-v2-port`).** La v2 original (`feature/calculator-v2`) partía de una base anterior; esta versión conserva lo que `development` ya había resuelto y suma lo propio de la v2:
> - **Sin motor heredado:** no hay `rates.engine`, ni modo «incluido» del IVA, ni migración de cuentas. El IVA es la casilla del presupuesto (`quotes.apply_tax`, `taxAmount`).
> - **Todo lo nuevo es opcional y parte neutro:** sin configurar costos fijos, pisos, comisiones, supervisión, montaje por placa ni riesgo, el precio es exactamente el del cálculo anterior (prueba de equivalencia en `tests/unit/pricing-v2.test.ts`). Los valores sugeridos (`RECOMMENDED_V2`, presets del taller) los aplica el asistente cuando el taller lo decide.
> - **Nivel por usuario:** se guarda en `users.calc_level` (`basico | detallado | experto`; el antiguo `avanzado` se lee como `detallado`) y se recuerda en el dispositivo.
> - **Migración `0031`:** solo columnas opcionales (`calc_profile_id` en clientes, presupuestos, líneas y canales; `risk_factor` y `waste_pct` en materiales; `calc_opts` en líneas; `channel_id` en presupuestos).
> - La urgencia y la lista de precios del cliente se siguen aplicando sobre el precio ya calculado, con su redondeo, como en `development`.

Implementado: motor v2 y modo legacy (§3), perfiles en cascada y congelado (§4), configuración Estándar/Avanzado con asistente (§5), calculadora rápida con tres niveles, banda, explicación y herramientas expertas (§6), editor de líneas, presupuesto y pedido con IVA opcional (§7), tarifa de equilibrio, referencias, calibración, completitud y coherencia (§8), textos es/en y pruebas (§11–12).

Diferencias respecto del diseño original, para tenerlas presentes:

| Spec | Implementación | Motivo |
|---|---|---|
| Tabla `calc_profiles` y `price_benchmarks` (§10.1) | Se guardan dentro de `settings` (`calcProfiles`, `rates.benchmarks`) | Un solo taller por instalación; se exportan e importan como JSON y entran en el historial de tarifas |
| Nivel y preferencias por usuario (CAL-03) y historial de cálculos en tabla `quick_calcs` | Se guardan en este dispositivo (`localStorage`) | Evita una migración y endpoints para una preferencia de interfaz; el precio nunca depende del nivel |
| Costos y márgenes no viajan al navegador sin permiso (CAL-76) | Diferido: la interfaz los oculta según permiso, como antes | Requiere calcular el precio en el servidor para esos roles |
| Atajos de teclado (CAL-42) | No implementado | Baja prioridad |
| Mantención desde los planes de mantención (§3.2) | La mantención por hora sigue siendo un valor manual de la máquina | Los planes no guardan el costo de los consumibles |
| «Explícame este precio» con IA (§9) | No implementado | Depende del proveedor de IA opcional |
| Mínimo por pedido (§3.6) | Es una advertencia con botón «Ajustar al mínimo», no un valor impuesto | El precio final siempre lo decide la persona |
| Tabla por cantidades (§6.4) | Escala gramos y horas de forma lineal (no modela ahorro de placas) | Conservador: no promete ahorros que no se pueden saber |
| `consumiblesPlan` y `capital` | `capital` sí (tasa anual); consumibles no | Ver mantención |

Migración: las cuentas existentes se detectan por la ausencia de `rates.engine` y quedan en `legacy`; el administrador pasa a v2 desde Configuración → Tarifas (asistente o botón). Al migrar, los pedidos anteriores conservan cómo se trataba su IVA (`orders.tax_mode`), por lo que los reportes no cambian.
