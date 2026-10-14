# 06 · Propuesta: calculadoras y mantenedores (filamentos, perfiles, máquinas)

Resuelve: **CAL-01 … CAL-03**, **MAT-01 … MAT-04**, **PFC-09**, **UX-07**.

## 1. Calculadora v2

### 1.1 Problemas (resumen)
La «Calculadora rápida» es el `LineEditor` completo con una sola línea (tres modos, orígenes, opciones), sin historial; el costo no se visualiza y no hay escenarios (CAL-01…03).

### 1.2 Propuesta

```
┌ Calculadora ───────────────────────────────────────────────────────────────┐
│ ENTRADA                                │ RESULTADO                          │
│ Modelo  [ Engranaje 16 dientes ▾ ] 🧊  │  Precio al cliente      $3.000     │
│   o  ( ) Manual: [  g ] [ h ] [ min ]  │  Margen 62 % · mín. cumplido ✓     │
│ Cantidad  [ 10 ]                       │                                    │
│ Material  ● PETG Negro · 12 kg · $18/kg│  Costo  ▇▇▇▇▇▇▇▇▇▇ $1.140          │
│ Máquina   Bambu A1 #1  ✓ cabe          │   material ▇▇▇▇ 38 %               │
│ Calidad   (Borr)(●Std)(Fino)(Resist.)  │   máquina  ▇▇▇ 24 %  energía ▇ 4 % │
│ ▸ Más opciones (post-proceso, envío…)  │   prep. ▇▇ 16 %  post ▇ 9 % riesgo ▇ │
│                                        │ ─ Escalera por cantidad ─────────── │
│ Precio objetivo [ $ ____ ] ⇄ Margen [__]│  1 u $4.200 │ 5 u $3.400 │ 10 u … │
│                                        │ ─ ¿Y si…? ───────────────────────── │
│                                        │  PLA en vez de PETG   −$180  (−6 %) │
│                                        │  Calidad Borrador     −$420  −0:20 h│
│ [Guardar escenario] [Copiar WhatsApp]  │  [Convertir en presupuesto]         │
└────────────────────────────────────────────────────────────────────────────┘
```

| Mejora | Detalle |
|---|---|
| **Modo único y claro** | Por defecto: modelo de la biblioteca (laminado automático) **o** manual (gramos/horas). Los modos «semi» y avanzados quedan en «Más opciones» |
| **Costo visible** | Barra apilada «capas» (brand): material · máquina · energía · preparación · post-proceso · riesgo; con permiso de costos. Sin permiso, solo precio |
| **Escalera de precios** | Tabla por cantidad (1, 5, 10, 25, 50 y los tramos de `volumeTiers`) usando `calcLine` (puro, ya existe) |
| **Cálculo inverso** | Precio objetivo ↔ margen (bidireccional); aviso de bajo costo/bajo margen mínimo |
| **«¿Y si…?»** | Chips que recalculan con un cambio (otro material, otra calidad, otra máquina) y muestran deltas de precio y tiempo. Con modelo laminado, usa la exploración del Estudio; sin él, estimación |
| **Escenarios** | Guardar/comparar hasta N escenarios (tabla nueva `calc_scenarios` ligada al usuario; o `localStorage` si se desea sin persistencia de servidor) |
| **Atajos** | Copiar respuesta WhatsApp (el parámetro `whatsappTpl` hoy llega vacío: usar `st.templates`), convertir en presupuesto (ya existe) |
| **Reutilizar el motor** | `computeItem`/`calcLine` se conservan; solo cambia la presentación |

Código: nuevo `components/calculator/*`; `quick-calc.tsx` se reemplaza; `LineEditor` deja de usarse allí.

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

- Unitarias: escalera de precios, cálculo inverso (precio↔margen), agregación de costo promedio.
- E2E a actualizar: `05-catalogo-ventas`, `12-laminado-config`, `03-presupuesto` (calculadora → presupuesto), `08-accesibilidad`.
- Migración `filament_lines`: script idempotente que agrupa por `(manufacturer, line, type, density)` y deja colores como hijos; con vista previa y reversa.

## 6. Decisiones que necesito de ti

| # | Decisión | Recomendación |
|---|---|---|
| D14 | ¿Agrupar materiales por línea (marca/línea → colores)? | Sí, en una segunda iteración (tras desacoplar el perfil) |
| D15 | ¿Escenarios de calculadora persistentes en servidor o solo locales? | Locales al inicio (sin migración); persistentes si el equipo los comparte |
