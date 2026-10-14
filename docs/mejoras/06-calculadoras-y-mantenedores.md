# 06 · Propuesta: calculadoras y mantenedores (filamentos, perfiles, máquinas)

> **Actualización (segunda ronda):** D14 queda en **«agrupar desde el inicio»** (líneas de marca con colores como hijos) y se suma el **alta masiva** de filamentos y stock (`10` §N4).

Resuelve: **MAT-01 … MAT-04**, **PFC-09**, **UX-07** y aporta los complementos visuales de **CLC-01 … CLC-03** (la calculadora en sí ya está especificada en `docs/spec-calculadora.md`).

## 1. Calculadora v2 — alineación con `docs/spec-calculadora.md`

Ya existe una **especificación completa** de la calculadora (482 líneas, 15 secciones numeradas §0–§14 y un anexo, 5 fases, requisitos `CAL-xx`): motor v2 (cálculo neto, costos fijos, pisos, falla con encogimiento), perfiles de cálculo en cascada, configuración Estándar/Avanzado con asistente, calculadora con niveles Básico/Detallado/Experto y calibración con historial. **Esa spec es la fuente de verdad** de motor, tarifas, perfiles y comportamiento. Esta sección no la duplica: mapea mis hallazgos contra ella, agrega complementos de UX/visual y señala integraciones con el resto de este paquete.

### 1.1 Mis hallazgos frente a la spec

| Hallazgo (doc 01) | Cubierto por la spec |
|---|---|
| CLC-01 Calculadora = `LineEditor` completo con una línea | §6 reescritura de `quick-calc.tsx`, niveles, historial reciente, varias piezas |
| CLC-02 El costo no se «ve»; sin escalera por cantidad ni cálculo inverso | §6.3 desglose en tabla + barra apilada, §6.4 tabla por cantidades y precio inverso, §3.7 salida del motor |
| CLC-03 Sin «¿y si…?» | §6.4 escenarios (hasta 3 columnas) y sensibilidad |
| `whatsappTpl` huérfano | §6.6 «Copiar respuesta» con plantilla editable en Configuración |

Es decir: **no hay que diseñar una segunda calculadora**; el esfuerzo propio de este paquete se limita a los complementos de §1.2.

### 1.2 Complementos que propongo (no definidos en la spec)

| Complemento | Detalle |
|---|---|
| **`LayerBar` compartido** | La «barra apilada» del desglose (spec §6.3) se construye como componente del kit visual (`07-sistema-visual.md`): capas por concepto (material · máquina · energía · prep. · supervisión · post · falla · margen) con la identidad «capa a capa». Se reutiliza en el detalle de cotización (doc 05) y en el resultado del Estudio (doc 04) |
| **Selectores ricos** | Material (muestra, stock, costo/kg), máquina/boquilla (estado, «cabe») y perfil de precio con el `Select` del kit en lugar de `<select>` nativos |
| **Entrada «modelo» ↔ Estudio** | Nivel Básico: laminado automático con calidad Estándar sin abrir nada. Detallado/Experto: botón «Ajustar en el Estudio» que vuelve con la corrida (gramos/horas con su origen y confianza) |
| **Calidad y filamento con el resolvedor del doc 02** | Calidad como preset de intención y filamento «automático»; la calculadora nunca queda bloqueada por falta de perfil (hoy el aviso de «perfil de laminado faltante» ya existe: pasa a ser informativo) |
| **Chips «¿Y si…?»** | Atajos de un clic («PLA en vez de PETG», «Calidad Borrador», «otra máquina») que abren una columna de escenario con los deltas de precio y tiempo (la UI del §6.4 de la spec) |
| **Miniatura del modelo** | En el resultado y en «Historial reciente» |
| **Vocabulario** | La spec introduce «perfil» de cálculo (precio) y el laminador tiene «perfil» de laminado: en la UI llamarlos **«Perfil de precio»** y **«Perfil de laminado»** para no confundir a quien cotiza |

### 1.3 Integraciones y orden

- **Fase 1 de la spec** (cálculo neto + IVA opcional en el presupuesto + margen sobre neto + redondeo único) **cambia totales y PDF**: conviene hacerla **antes o junto con** el PDF v2 y el detalle de cotización (ver dependencias en `09`) para no rehacer totales dos veces.
- **Fase 3** (perfiles de precio, asistente, Estándar/Avanzado) es independiente del desacople de perfiles de laminado (doc 02) y puede avanzar en paralelo.
- Las **10 decisiones abiertas** de la spec (§14: costos fijos, mano de obra, IVA de compras, comisiones, margen, perfiles de partida, cotizaciones reales, niveles, una/varias piezas, cuentas existentes) siguen sin responder y **bloquean la Fase 2**.

### 1.4 Observaciones sobre la spec (sin cuestionar su diseño)

- **Riesgo de adopción:** agrega muchos parámetros nuevos a `settings.rates` (costos fijos, horas productivas, pisos, comisiones, tiempos de mano de obra). Si el taller no completa el asistente, todo queda en valores por defecto: el medidor de completitud (§8.4) y el perfil «Heredado (v1)» son la salvaguarda correcta y deben entrar en la primera entrega.
- **Cliente/servidor:** exige paridad de motor (`CAL-70`) y que costos no viajen al navegador sin permiso (`CAL-76`): hoy `getCalcContext` envía `cost` de máquina y `costPerKg` a todos los roles con acceso a la calculadora → es un cambio de arquitectura real (el servidor entrega solo el precio para roles sin permiso de costos) y no solo de UI.
- **Estimación:** la spec no trae esfuerzos; los estimo en `09-plan-y-estimaciones.md` (bloque aparte, ≈ 31–56 jornadas) y **no** están sumados en el total de este paquete.

## 2. Mantenedor de filamentos / materiales

### 2.1 Cambios de modelo (opcionales, por fases)

| Fase | Cambio | Beneficio |
|---|---|---|
| Mínima | Mantener `materials` (un registro por color) pero **sacar** de la ficha el perfil de laminado como campo principal y las temperaturas en texto libre (doc 02) | Quita acoplamiento y duplicación |
| Recomendada | **Agrupar por línea:** `filament_lines(brand, line, type, density, diameter, cost_per_kg_default, temps, supplier)` y `materials` como **colores** (`line_id`, `color_name`, `hex`, `cost_override?`, `stock_min_g`) | Cambiar el costo de «Sunlu PETG» una vez, no por color; menos datos repetidos (MAT-02) |

### 2.2 Interfaz

```
Inventario › Filamentos                          [＋ Línea/Material] [Entrada de compra] [Escanear QR]
🔎 buscar   Tipo ▾  Marca ▾  Color ▾  ☐ Solo bajo stock       [▦ Tarjetas] [☰ Tabla]
┌ Sunlu · PETG ─────────────────────── $18.000/kg · ρ 1,27 ─ 3 colores ┐
│  ◉ Negro   ▇▇▇▇▇▇▇░░ 820 g · 2 bobinas      ◉ Blanco  ▇▇░░ 190 g ⚠ bajo      │
│  ◉ Rojo    ▇▇▇▇▇▇▇▇▇ 1.4 kg                  [Editar línea] [＋ Color]         │
└─────────────────────────────────────────────────────────────────────────────────┘
```

- **Tarjetas por línea** con colores como _muestras_ y **anillo de carrete** (restante/inicial, color del filamento) en lugar de solo una barra.
- **Edición en Drawer** (panel lateral) con secciones: _Identidad_ (marca, línea, tipo, color) · _Comercial_ (costo/kg, proveedor, stock mínimo) · _Físico_ (densidad, diámetro) · _Laminado_ (colapsada: «Perfil recomendado: Auto — Generic PETG [Cambiar]», con las temperaturas **leídas del perfil resuelto**).
- **Filamento personalizado** (hoy modal aparte): se integra como «Crear filamento a partir de…» con el mismo formulario y plantillas por tipo; los campos de laminado se guardan como perfil personalizado (ya soportado por `createCustomFilament`).
- **Búsqueda/filtros/agrupación** y acciones masivas (ajustar costo de una línea, archivar).
- **Rendimiento:** cálculo del costo promedio por material en una sola consulta agregada (MAT-04).

## 3. Mantenedor de perfiles («Mis perfiles»)

- Un listado único con filtros (Tipo: máquina/proceso/filamento · Máquina compatible · Origen: creado/importado/personalizado) y búsqueda; **etiqueta «Basado en …»** y **número de cambios** destacados; acciones: abrir en el Estudio, duplicar, exportar a Bambu Studio, archivar.
- **Diff vs. fábrica** y entre versiones (tabla «parámetro · fábrica · este perfil»).
- **Uso accionable:** «Usado por 3 líneas y la máquina A1» → ver / reemplazar (doc 02 §4).
- **Asistente de importación unificado:** una sola ruta (3MF/bundle/JSON) con vista previa (la de `importSelectedAction`); se retira la ruta JSON legada (PFC-08).
- Eliminar los duplicados de definición de parámetros (PFC-07): una fuente de verdad en `lib/slicer/schema`.

## 4. Mantenedor de máquinas (puntos de contacto)

- El paso «¿Qué impresora es?» (hoy en `/laminador/configurar`) pasa a la ficha de la máquina (pestaña «Laminado»), con sugerencia automática por marca/modelo/boquilla.
- Estado de configuración visible en la lista de máquinas: «Lista para laminar ✓ / Falta elegir impresora».
- Conector Bambu: sin cambios funcionales; solo adopta los componentes nuevos (tarjetas, Drawer).

## 5. Pruebas

- Pruebas de la calculadora: las define la spec (§12). Aquí solo: agregación del costo promedio por material en una consulta (MAT-04) y paridad visual del `LayerBar`.
- E2E a actualizar: `05-catalogo-ventas`, `12-laminado-config`, `03-presupuesto` (calculadora → presupuesto), `08-accesibilidad`.
- Migración `filament_lines`: script idempotente que agrupa por `(manufacturer, line, type, density)` y deja colores como hijos; con vista previa y reversa.

## 6. Decisiones que necesito de ti

| # | Decisión | Recomendación |
|---|---|---|
| D14 | ¿Agrupar materiales por línea (marca/línea → colores)? | Sí, en una segunda iteración (tras desacoplar el perfil) |
| ~~D15~~ | _Retirada:_ la spec define historial reciente por usuario en servidor (`quick_calcs`, últimos 20) | — |
