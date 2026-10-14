# 05 · Propuesta: gestor de cotizaciones, detalle, layouts y generación de PDF

Resuelve: **COT-01 … COT-08**, **PDF-01 … PDF-07**, parte de **UX-03/UX-06**.

## 1. Estado actual (resumen)

- Flujo: `borrador` (editor con autoguardado) → `enviado` (congela precios, `frozen`) → `aprobado` (crea pedido y, opcionalmente, trabajos en cola) | `rechazado` | `vencido` | `reemplazado` (nueva versión).
- Pantallas: listado en tabla; editor (`quote-editor.tsx` + `line-editor.tsx`); detalle de solo lectura para estados no editables; PDF con Chromium sobre `/imprimir/presupuesto/[id]`.
- Datos disponibles pero **no mostrados**: `quote_items.cost_breakdown`, `quote_item_models` (miniaturas), `price_adjustments` (solo parcialmente), `activity_log`, `contact_log`, `slice_runs` (origen de gramos/horas).

## 2. Listado: de tabla a «tablero comercial» (COT-01)

```
┌ Presupuestos ───────────────────────────────────────── [Calculadora] [＋ Nuevo] ┐
│  Abiertos 12 · $4,2 M      Por vencer (≤3 d) 3      Conversión 30 d: 58 %      │
│  Aprobados mes $2,1 M      Sin respuesta (>7 d) 4                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│ ( Todos 41 ) ( Borrador 6 ) ( Enviado 9 ) ( Aprobado 18 ) ( Rechazado 5 ) ( Venc. 3 ) │
│ 🔎 número, cliente, título…   Cliente ▾  Rango ▾  [☰ Lista] [▥ Tablero]          │
├─────────────────────────────────────────────────────────────────────────────────┤
│ ▢▢ P-2026-0007 v2  Café Sur · Carcasas y llaveros      $45.000  Enviado · vence 3 d │
│ 🧊🧊🧊                                              margen 75 %   ⏱ hace 2 d  [PDF][WA]│
└─────────────────────────────────────────────────────────────────────────────────┘
```

- **KPIs** (calculables con `stats.ts`): abiertos y monto, por vencer, sin respuesta, conversión, aprobados del mes.
- **Segmentos por estado con conteo** (reemplaza el select «Vigentes»).
- **Fila rica:** pila de miniaturas (hasta 3 modelos), cliente, título, monto, margen (si permiso de costos), chip de **vigencia** (rojo ≤ 3 días), «enviado hace N días», acciones rápidas (PDF, WhatsApp, duplicar).
- **Vista Tablero (kanban)** opcional: arrastrar para cambiar estado solo donde es válido (borrador→enviado); aprobar/rechazar abren sus modales (se mantienen las reglas actuales).
- Estado en la URL, paginación por cursor, sin recarga completa.

## 3. Detalle del presupuesto (COT-02, COT-03)

### 3.1 Estructura

```
← Presupuestos
P-2026-0007  v2  [Enviado]      Café Sur · +56 9…        Vigencia 28-oct (en 3 d)
Stepper:  ● Borrador ─ ● Enviado (13-oct) ─ ○ Aprobado ─ ○ Pedido            [PDF][WA][⋯]
┌ Resumen │ Líneas │ Costos* │ Versiones │ Actividad │ Vista cliente ┐        * según permiso
```

| Pestaña | Contenido |
|---|---|
| **Resumen** | Tarjeta de cliente, total grande, margen, comparación sugerido vs. final, aviso de precio bajo costo, notas, enlaces, siguiente acción recomendada («Marcar enviado», «Registrar aprobación»…) |
| **Líneas** | Tarjetas por línea: miniatura(s) + enlace al modelo (abre visor en panel lateral), material con muestra de color, máquina/calidad, **tiempo y gramos con su origen** (laminador del sitio/archivo/estimado/manual), cantidad, precio unitario, total, margen; expandible con **desglose de costos** (barra apilada «capas»: material · máquina · energía · preparación · post · riesgo · margen). Opcionales diferenciadas |
| **Costos** | Totales internos: costo, margen, historial de precio final (`price_adjustments`), quién autorizó bajo costo |
| **Versiones** | Lista y **diff** entre versiones (líneas agregadas/quitadas/cambiadas, Δ total, Δ margen); «Reactivar con tarifas actuales» ya existe |
| **Actividad** | Línea de tiempo desde `activity_log` + `contact_log`: creado, enviado (por quién/canal), reenviado, aprobado/rechazado con motivo, pedido generado |
| **Vista cliente** | Previsualización **idéntica al PDF** (mismo componente, ver §5) con opciones |

- En **borrador** se mantiene el editor, con un conmutador **Editar | Vista cliente** (y, en pantallas anchas, **vista dividida** editor/preview en vivo).
- El resumen fijo inferior pasa a **panel de totales lateral sticky** en escritorio y a una hoja plegable en móvil (resuelve la superposición vista en `34-presupuesto-detalle.png`).

### 3.2 Simplificar el modelo de precio (COT-04)

Hoy coexisten «precio final por unidad», «precio final del presupuesto» y «descuento». Propuesta de presentación (sin cambiar el motor `pricing.ts` en la primera iteración):

1. **Precio por línea** (editable): el foco por defecto.
2. **Descuento** (monto o %), con motivo opcional.
3. **Ajuste al total** («Redondear a $45.000») como acción secundaria que _explica_ el reparto («se distribuye proporcionalmente entre las líneas»), mostrando la diferencia por línea antes de aplicar.
4. Un único bloque «Cómo se calculó» con sugerido → ajustes → total.

### 3.3 `LineEditor` (COT-05, COT-06)

- Dividir en subcomponentes: `LineHeader`, `LineModels`, `LineSource` (auto/semi/manual), `LineCosts`, `LinePrice`.
- Línea colapsada con **miniatura**, material (muestra), tiempo/gramos y precio.
- Selector de modelo con **búsqueda en servidor** (typeahead) en vez de enviar toda la biblioteca (`loadEditorData`); mismo criterio para clientes.
- Selectores ricos: material (muestra + stock + costo/kg), máquina (estado + «cabe»), calidad (ver doc 02).
- El modo **Automático** usa el Estudio de laminado (botón «Ajustar en el Estudio») y vuelve con la corrida.

### 3.4 Aprobación (COT-08)

Modal con **resumen previo** de lo que ocurrirá: «Se creará el pedido PE-… por $45.000 · anticipo $22.500 · 2 trabajos en cola (A1 #1 · 3 h) · se reservarán 130 g de PETG Negro», con confirmación explícita.

### 3.5 Seguimiento (COT-07)

- Registro de **envío** (canal, fecha, quién) en `contact_log` al «Marcar enviado».
- Recordatorios configurables («a los 3 y 7 días sin respuesta») → notificación interna + sugerencia de mensaje con `{seguimiento}`.
- Dashboard: tarjeta «Cotizaciones por seguir».

## 4. Layouts: principios

- **Dos columnas** en escritorio (contenido · panel sticky de totales/estado), una en móvil.
- **Tarjetas por línea** en lugar de filas planas; la información secundaria detrás de «Ver detalle».
- **Jerarquía de números:** total y margen grandes, tabular; sugerido/costos en gris.
- **Estados visibles** (stepper, chips, vigencia) en el encabezado, no solo en una insignia.
- Reutilizar componentes del sistema visual (`07-sistema-visual.md`): Segmented, Tabs sin recarga, Drawer, DataTable, Stat.

## 5. PDF v2

### 5.1 Contenido y diseño

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [LOGO]  MiniFactory 3D                         PRESUPUESTO P-2026-0007   │
│ Razón social · RUT · dirección · tel · email   Versión 2 · 13-oct-2026   │
│ ─────────────────────────────────────────────  Válido hasta 28-oct-2026  │
│ PARA: Café Sur · +56 9 …                                                  │
│ PROYECTO: Carcasas y llaveros                                             │
├──────────────────────────────────────────────────────────────────────────┤
│ DETALLE                                  Cant.   P. unit.      Total      │
│ [img] Llaveros logo                        10     $1.100     $11.000      │
│       PETG Negro · Calidad estándar · plazo aprox. 15 h                   │
│ [img] Set decorativo (varios modelos)       1     $3.300      $3.300      │
│ …                                                                         │
│ OPCIONALES (no incluidos en el total)                                     │
│ · Empaque de regalo ×10 ........................................ $4.000    │
├──────────────────────────────────────────────────────────────────────────┤
│                               Subtotal  $45.000 · IVA 19 % incl. $7.185   │
│                               TOTAL  $45.000                              │
│ Anticipo para iniciar (50 %): $22.500      Entrega estimada: 5 días háb.  │
│ Datos de transferencia: banco · tipo · N° · RUT · correo                  │
├──────────────────────────────────────────────────────────────────────────┤
│ Condiciones (secciones numeradas) …                                       │
│ MiniFactory · contacto · www                       Página 1 de 2          │
└──────────────────────────────────────────────────────────────────────────┘
```

| Elemento | Especificación |
|---|---|
| **Marca** | Logo desde `shop.logoKey`; color de marca configurable con vista previa; valor por defecto alineado al sistema visual (hoy `#1d62f0`, azul, ≠ naranja del sitio) |
| **Encabezado/pie** | Repetidos por página; número de página «Página X de Y»; datos de contacto |
| **Tabla** | `thead` repetido, `tr` sin cortes (`break-inside: avoid`), miniaturas más grandes (≈ 72–96 px) y hasta 3 por línea; respeta `showInPdf` de enlaces |
| **Opcionales** | Sección propia con precios |
| **Cierre comercial** | Anticipo requerido (`depositPct`/`minDepositPct`), plazo de entrega estimado, datos de transferencia (nuevos campos en Configuración), validez destacada, QR opcional (WhatsApp o pago) |
| **Condiciones** | Texto de plantilla en secciones; salto a página 2 si es largo |
| **Borrador** | Marca de agua «BORRADOR» cuando el estado no es `enviado/aprobado` |
| **Opciones de generación** | Mostrar miniaturas · mostrar plazo por línea · ocultar precios unitarios · idioma (es-CL por defecto) |
| **Accesibilidad/impresión** | `@page { size: A4; margin }`, fuentes incrustadas (`@font-face` locales), alto contraste, escala de grises legible |

### 5.2 Arquitectura de generación (PDF-01, PDF-02, PDF-06)

| Opción | Pros | Contras |
|---|---|---|
| **A (recomendada): HTML→PDF con Chromium, pero bien operado** | Una sola plantilla React para vista previa en pantalla y PDF; CSS de impresión completo; ya está en el proyecto | Dependencia de Chromium en producción |
| B: `@react-pdf/renderer` / `pdf-lib` | Sin navegador; más liviano en runtime | Segunda plantilla (no es HTML), menos control tipográfico/tabla, mantener dos vistas |

Con la opción A:

1. **Componente único `<QuoteDocument>`** usado por la pestaña «Vista cliente» y por la página `/imprimir/...` (hoy el HTML está inline con un `<style>` en la propia página).
2. **Navegador persistente:** un único Chromium reutilizado (pool de 1–2 páginas), cola con límite de concurrencia y _timeout_; elimina el `launch` por petición.
3. **Fallo explícito:** si Chromium no está disponible o falla, responder `503` con mensaje claro (y un botón «Abrir versión imprimible» como alternativa **visible**), nunca una redirección silenciosa.
4. **Snapshot al enviar:** al «Marcar como enviado» se genera y **almacena** el PDF (`quotes.pdf_key`, `pdf_sha256`, `pdf_generated_at`); «Descargar» sirve la copia guardada (lo entregado al cliente no cambia aunque cambien logo o condiciones) y «Regenerar» crea una nueva copia con registro en actividad.
5. **Borradores:** generación bajo demanda con caché por `(quote.updatedAt, opciones)`.
6. **Dependencias:** mover `playwright`(-core) a `dependencies`; `Dockerfile` sin `|| true` para Chromium (o _healthcheck_ que reporte capacidades: Orca, Chromium, ffmpeg).
7. **Pruebas:** snapshot visual del PDF (rasterizar con `pdftoppm` y comparar), prueba de paginación con 30+ líneas, prueba sin Chromium.

### 5.3 Compartir

- WhatsApp: el mensaje ya se genera con plantilla; se agrega el **PDF como descarga previa** (el navegador no permite adjuntar a WhatsApp Web automáticamente: se descarga y el usuario lo adjunta). Mantener simple.
- Enlace público de solo lectura: **fuera de alcance** según el README (no hay portal de clientes) — requeriría decisión explícita (D11).

## 6. Pruebas y cuidados

- E2E a actualizar: `03-presupuesto`, `06-permisos` (costos ocultos por rol), `07-movil`, `08-accesibilidad`.
- Permisos: las pestañas **Costos** y columnas de margen solo con `canSeeCosts`; la «Vista cliente» y el PDF **nunca** muestran costos ni precio sugerido (hoy ya es así en `/imprimir`; añadir prueba que lo garantice).
- Datos históricos: presupuestos ya enviados sin PDF guardado → se genera la primera copia al primer acceso y se marca «reconstruido».

## 7. Decisiones que necesito de ti

| # | Decisión | Recomendación |
|---|---|---|
| D10 | PDF: ¿mantener Chromium (A) o pasar a librería sin navegador (B)? | A, con navegador persistente y snapshot |
| D11 | ¿Enlace público de solo lectura para el cliente? | No por ahora (consistente con el alcance actual) |
| D12 | Datos de transferencia/anticipo/plazo en el PDF: ¿se muestran siempre? | Configurables en Configuración → Taller (por defecto visibles) |
| D13 | ¿Tablero kanban de cotizaciones? | Sí, como vista opcional (la lista sigue siendo la principal) |
