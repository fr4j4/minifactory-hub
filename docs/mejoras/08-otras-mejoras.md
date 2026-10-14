# 08 · Otras mejoras detectadas

Mejoras adicionales encontradas durante el análisis, fuera de los cinco ejes pedidos. Cada una indica prioridad sugerida y vínculo con hallazgos (ver `01-diagnostico.md`).

## A. Robustez y operación

| ID | Mejora | Prioridad | Hallazgo | Esfuerzo orient. |
|---|---|---|---|---|
| **OM-01** | **Página «Salud del sistema»** en Configuración: estado de OrcaSlicer (versión), Chromium (PDF), ffmpeg (cámara RTSP), almacenamiento (espacio), base de datos, conectores Bambu. Con acciones de reparación guiada (`npm run orca:install`, etc.). Un `/api/health` equivalente para Docker | Alta | PDF-01/02, TEC-03 | 1–1,5 d |
| **OM-02** | **Cola de trabajos genérica** (`jobs`): laminado, procesamiento de archivos, miniaturas, PDF; reintentos, registro de errores, reanudación tras reinicio, vista de «Procesos en segundo plano» con indicador global en la barra superior | Alta | BIB-02, TEC-01 | 3–4 d (compartido con 2.1/5.4 del plan) |
| **OM-03** | **Bloqueo y reemplazo al eliminar perfiles/materiales en uso** (con lista de dependencias) | Alta | PFC-05 | 0,5–1 d |
| **OM-04** | **Notificaciones de laminado terminado** (notificación interna + toast global si el usuario navegó a otra pantalla) | Media | VIS-03 | 0,5–1 d |
| **OM-05** | **Respaldo verificable:** el ZIP de respaldo existe; añadir verificación (restauración de prueba en seco), programación y retención | Media | — | 2 d |
| **OM-06** | **Límites y protección del PDF/laminado:** concurrencia máxima, tiempo máximo por usuario, tamaño máximo de modelo para laminar | Media | PDF-01, VIS-03 | 0,5–1 d |

## B. Rendimiento y escalabilidad

| ID | Mejora | Prioridad | Hallazgo |
|---|---|---|---|
| **OM-07** | `getCalcContext` con **costo promedio por material en una consulta agregada** (hoy N+1 por material en cada página con precios) | Media | MAT-04 |
| **OM-08** | **Typeahead en servidor** para modelos y clientes en editores (en lugar de enviar toda la biblioteca al cliente) | Media | COT-06 |
| **OM-09** | Índices y normalización de etiquetas/carpetas (`tags`, `folders`) y paginación por cursor | Media | BIB-05 |
| **OM-10** | `content-visibility`/virtualización en listas largas (biblioteca, movimientos de inventario, corridas) | Baja | — |

## C. Flujo de trabajo

| ID | Mejora | Prioridad | Descripción |
|---|---|---|---|
| **OM-11** | **«Enviar a imprimir» desde el resultado de laminado** (Estudio y panel), cuando la máquina tiene conector Bambu | Media | Hoy solo desde `/maquinas/[id]` (`sendableRuns`) |
| **OM-12** | **Agregar a la cola desde el Estudio** con la configuración usada | Media | Reutiliza `planJobs`/`createJob` |
| **OM-13** | **Seguimiento de cotizaciones** (recordatorios, «por seguir» en inicio) | Media | COT-07 |
| **OM-14** | **Validaciones técnicas previas al laminado** (TPU con AMS, boquilla/altura de capa, temperatura de cama vs. placa, material no admitido por la máquina `materialsOk`) | Media | La ficha de máquina ya tiene `materialsOk`, `enclosed`, `heatedBed`; hoy no se usan para advertir |
| **OM-15** | **Plantillas de pedido/cotización** (kits frecuentes, p. ej. «Llaveros logo ×N») | Baja | Reutiliza líneas de presupuesto |
| **OM-16** | **Historial de precios por modelo** (qué se cobró antes por esta pieza) visible al cotizar | Baja | Consulta sobre `quote_item_models` + `quote_items` |
| **OM-17** | **Registro de reimpresiones/fallas por perfil** para retroalimentar el factor de tiempo y el riesgo de falla por combinación material/calidad | Baja | `machines.timeFactor` ya existe por máquina |

## D. Calidad de código y pruebas

| ID | Mejora | Hallazgo |
|---|---|---|
| **OM-18** | Eliminar duplicación de definiciones de parámetros/tipos (`SIMPLE_PARAMS`, `FIELDS`, `TYPES`) en una sola fuente (`lib/slicer/schema`) | PFC-07 |
| **OM-19** | Unificar importación de perfiles en una sola ruta | PFC-08 |
| **OM-20** | **Pruebas de contrato con el binario real de Orca** en CI (flags usadas, nombres de perfiles de fábrica esperados, formato de metadatos del G-code) para detectar cambios al actualizar versión | TEC / doc 04 |
| **OM-21** | **Regresión visual automática** (Playwright `toHaveScreenshot`) por pantalla/tema/viewport | doc 07 §6 |
| **OM-22** | Reorganizar e2e para que dependan menos de textos y más de roles ARIA; mantener `data-testid` solo donde no haya rol | TEC-02 |
| **OM-23** | Sustituir `any` en componentes de cliente por tipos del esquema (`$inferSelect`) donde hoy se usa `m?: any` | — |

## E. Detalles de interfaz detectados (arreglos rápidos)

- Copy confuso en el resultado de laminado («sin IVA incluido según tarifas») → «IVA incluido»/«sin IVA» según `taxMode`. _(VIS-07)_
- Tarjeta «¿Cabe en mis máquinas?» sin contenido propio. _(BIB-07)_
- Parámetro `whatsappTpl=""` huérfano en la calculadora. _(CAL-01)_
- Color de marca por defecto azul en el PDF frente al naranja del sistema. _(PDF-03)_
- Fecha en formato EE.UU. en un taller es-CL. _(UX-06)_
- Etiquetas «Etiqueta» de la tabla de corridas muestra solo el proceso. _(VIS-06)_
- Íconos emoji (⬇ 👁 📷 🏷 ⧉ ✕ ★) mezclados con SVG. _(UX-05)_
- Aviso de «orientación solo de prueba» en el visor. _(BIB-08)_

## F. Cosas que **no** recomiendo hacer (y por qué)

| Idea | Motivo |
|---|---|
| Slicer 100 % en el navegador (WASM) | Sin build mantenido de OrcaSlicer; el motor del servidor ya cubre el caso |
| Pintado de soportes/costuras y modificadores gráficos dentro del sitio | Esfuerzo muy alto; mejor «Abrir en Bambu Studio» (exportar 3MF y perfiles) |
| Portal público de cliente | Fuera de alcance declarado en el README |
| Reescribir el motor de precios | Funciona y tiene pruebas (`tests/unit/pricing.test.ts`); solo cambia la presentación |
