# Revisión: módulo de Máquinas y perfiles del Laminador

Fecha: 2026-10-13 · Alcance: `Máquinas` (ficha, mantenimiento, boquillas), `Laminador` (perfiles de impresora / proceso / filamento, configuración guiada, importación, comparador) y los lugares donde se eligen perfiles (Archivos 3D → Laminar, Presupuestos).

## 1. Para qué sirve cada cosa (en la práctica)

Para laminar una pieza el sitio combina **tres perfiles**. Cada uno es «un perfil de fábrica de OrcaSlicer/Bambu Studio + tus cambios».

| Perfil | Pregunta que responde | Ejemplos | ¿Cuándo lo tocas? |
|---|---|---|---|
| **Impresora** (antes «máquina») | ¿Qué *modelo* de impresora y qué *boquilla*? Tamaño de cama, aceleraciones, retracción, G-code de inicio, rango de altura de capa | Bambu Lab A1 0,4 · Bambu Lab A1 0,2 · Ender-3 V3 SE | Casi nunca. Uno por modelo + boquilla. |
| **Calidad** (antes «proceso») | ¿*Cómo* imprimo esta pieza? Altura de capa, paredes, relleno, soportes, velocidades | Borrador 0,24 · Estándar 0,20 · Fino 0,12 · Resistente | Trabajo a trabajo. Es lo que más mueve tiempo, gramos y precio. |
| **Filamento** | ¿Con *qué material*? Temperaturas, flujo, ventilador, densidad | PLA Basic · PETG HF · tu marca local | Uno por material; se asigna a cada material del inventario. |

**La confusión «máquina» vs «tipo de máquina»**: la palabra se usaba para dos cosas distintas.

- La **ficha de Máquinas** es *tu equipo real*: nombre, costos por hora, mantenimiento, estado, conexión. Hay una por impresora física.
- El **perfil de impresora** del Laminador es el *tipo de máquina* para el programa de laminado. Lo comparten todas las impresoras del mismo modelo y boquilla.
- La ficha solo **apunta** a un perfil de impresora (y a una calidad por defecto) por cada boquilla que uses.

Ejemplo: una A1 con boquillas 0,2 y 0,4 es *una* ficha en Máquinas, con *dos* perfiles de impresora («A1 0,2» y «A1 0,4») y su calidad por defecto para cada una. El filamento no cambia.

## 2. Sobre «medidas como 1,2, múltiplos de 0,4»

Lo interpreté como **medidas de pared y de línea en múltiplos de la boquilla** (con boquilla 0,4: 0,8 · 1,2 · 1,6 · 2,0 mm = 2 · 3 · 4 · 5 paredes) y además **boquillas de distintos diámetros**, incluidas las gruesas (0,6 · 0,8 · 1,0 · **1,2**). Si te referías a otra medida, dímelo y se ajusta.

Reglas que usa el sitio (salen de los perfiles de fábrica de Bambu, verificados contra OrcaSlicer 2.4.2):

- Altura de capa: 20 %–70 % del diámetro (A1: 0,04–0,14 con boquilla 0,2; 0,16–0,56 con 0,8). Borrador 60 % · Estándar 50 % · Fino 30 %.
- Ancho de línea: diámetro + 0,02 mm (0,22 · 0,42 · 0,62 · 0,82). Con 0,4 la pared interior y el relleno usan 0,45.
- Espesor de pared = paredes × ancho de línea → 1,2 mm con 0,4 son 3 paredes; con 0,6 son 2.
- Techo/piso se piden en mm y se convierten a capas (1,0 mm con capa 0,2 = 5 capas).

## 3. Hallazgos de la revisión

Gravedad: **A** alta (resultado equivocado o pérdida de datos) · **M** media · **B** baja.

### Perfiles y laminador

| # | Gravedad | Hallazgo | Estado |
|---|---|---|---|
| P1 | A | La calidad por defecto se elegía por cercanía a 0,20 mm, sin mirar la boquilla: con boquilla 0,2 salía «0.14mm Extra Draft»; con 0,6 «0.18 Fine»; con 0,8 «0.24 Fine». | Corregido: la «Standard» de cada boquilla (0,10 / 0,20 / 0,30 / 0,40). |
| P2 | A | «Configurar laminado» **reemplazaba** las boquillas de la ficha por una sola: una A1 con 0,4 y 0,6 quedaba solo con 0,4. | Corregido: se suman. |
| P3 | A | Una máquina solo podía tener **un** perfil de impresora y una calidad por defecto: no había forma de usar 0,2 y 0,4 del mismo equipo. La máquina de demostración tenía boquillas 0,4 y 0,6 y solo perfil 0,4. | Corregido: «boquilla puesta» por máquina; cada boquilla recuerda su impresora y su calidad (migración 0005). |
| P4 | M | Las listas de calidades (Laminar, Comparador, Presupuestos, ficha) mostraban **todas** mezcladas: se podía laminar una capa de 0,20 con boquilla 0,2 sin aviso y obtener tiempo y gramos irreales. | Corregido: primero las de la boquilla de la máquina, las demás aparte y con aviso. |
| P5 | M | Crear, duplicar o renombrar permitía **nombres repetidos**; «Duplicar» ponía «(copia)» sin preguntar, y la importación actualizaba el primero que coincidiera por nombre. | Corregido: nombre único por tipo; «Duplicar» abre un cuadro para nombrar la copia (con «Crear y editar»). |
| P6 | M | **Eliminar** un perfil usado por una máquina o material lo dejaba huérfano (la cola seguía laminando con él). Además el botón se mostraba a quien no tiene permiso de eliminar. | Corregido: se bloquea y dice quién lo usa; el botón solo aparece con permiso. |
| P7 | M | El editor guardaba lo escrito tal cual: «0,2» (coma) o «fina» llegaban al laminador y fallaban después; el relleno sin «%». | Corregido: coma decimal, validación de números/enteros/opciones, relleno con «%». |
| P8 | B | La lista de parámetros del editor estaba **duplicada** (servidor y navegador) y ya había divergido; `printable_area` en la versión del servidor habría colapsado los 4 puntos de la cama en uno. | Corregido: una sola lista; se quitó `printable_area`. |
| P9 | B | El perfil de fábrica base no se podía cambiar desde la pantalla (el servidor sí lo permitía). | Agregado «Cambiar base». |
| P10 | B | «Volver a una versión» no dejaba registro de auditoría. | Corregido. |
| P11 | M | Solo se podía partir de un perfil de fábrica; para marcas sin perfiles de calidad o boquillas sin perfil (1,0 · 1,2) no había punto de partida. | Agregadas **plantillas por boquilla** (Borrador, Estándar, Fino, Resistente, Funcional) para cualquier diámetro. |

### Máquinas

| # | Gravedad | Hallazgo | Estado |
|---|---|---|---|
| M1 | M | «Boquillas» era un texto separado por comas: «0,4» (coma decimal, lo normal en español) se guardaba como dos boquillas «0» y «4». | Corregido: selector 0,2 · 0,4 · 0,6 · 0,8 y «Otra…» (acepta coma o punto). |
| M2 | A | El guardado de la ficha copiaba el objeto que envía el navegador **directamente a la base** (horas, estado, borrado, etc.) y no validaba números (NaN, negativos). | Corregido: solo se guardan los campos de la ficha, validados; los perfiles deben existir y ser del tipo correcto. |
| M3 | M | Los nombres «Perfil de máquina (laminador)» y «Proceso por defecto» no se entendían. | Renombrados («Perfil de impresora (tipo de máquina)», «Calidad por defecto») con una explicación en la ficha y una guía en Laminador. |
| M4 | B | La ficha mostraba boquillas también para máquinas SLA/SLS. | Corregido (solo FDM). |
| M5 | M | No había forma de eliminar una máquina desde la pantalla. | Resuelto en `development` por otro cambio (botón «Eliminar» con archivo). |
| M6 | B | Número de serie sin validación de duplicados; «materiales compatibles» era texto libre («pla» ≠ «PLA»). | Corregido: el serie no se repite entre máquinas activas; los tipos se eligen con botones (los del inventario + habituales) y siempre se guardan con la misma grafía. |
| M7 | B | En el Comparador y en Laminar una máquina era una sola boquilla. | Corregido: cada boquilla configurada es una opción («Bambu A1 · 0,2 mm», «Bambu A1 · 0,4 mm»); con una sola boquilla se ve solo el nombre. En las líneas de presupuesto se sigue usando la boquilla puesta. |

## 4. Qué se agregó (resumen funcional)

- **Plantillas por boquilla** (Laminador → Calidad → «Nuevo perfil» → «Plantillas por boquilla»): eliges impresora y boquilla, marcas las calidades y se crean con altura de capa, paredes y capas calculadas. Se guardan como cualquier otro perfil: se pueden editar, duplicar y volver atrás. Lo que coincide con el perfil de fábrica no se guarda como «cambio».
- **Editar, agregar y hacer copias personalizadas**: crear desde fábrica o plantilla; **Duplicar** con nombre propio; editor con **cambiar base**, boquilla del perfil, ayudas de **espesor de pared** (0,8 · 1,2 · 1,6 …), alturas de capa habituales, avisos (capa fuera de rango, calidad de otra boquilla) y las versiones con «Volver» de siempre.
- **Boquilla puesta** en la ficha de la máquina: un toque cambia la impresora y la calidad por defecto. Si esa boquilla no tiene perfil de fábrica (1,0 · 1,2), se crea una copia de la impresora con ese diámetro y su calidad Estándar.
- **Configurar laminado** muestra las boquillas disponibles de cada impresora (con ✓ las ya configuradas).
- **Listado de perfiles** con columna y filtro por boquilla, «de fábrica» vs número de cambios, y una guía «¿Para qué sirve cada perfil?».

## 5. Diseño elegido y alternativas

Elegí **una boquilla puesta por máquina** porque es lo que ocurre físicamente (una boquilla a la vez), no cambia ninguna pantalla que ya elige «máquina» (Archivos, Presupuestos, Comparador) y se cambia en un toque. Los datos quedan en `machines.nozzle_setups` (boquilla → impresora + calidad) y `slicer_profiles.nozzle`; `machine_profile_id` y `default_process_profile_id` reflejan la boquilla puesta, así que nada anterior se rompe.

Después se agregó el par *(máquina, boquilla)* como opción en Laminar y Comparador (`ctx.setups`), de modo que se pueden comparar boquillas en un solo disparo. Las líneas de presupuesto siguen usando la boquilla puesta.

Otros ajustes de esta segunda vuelta: las plantillas reescalan las velocidades cuando no hay calidad de fábrica para ese diámetro (0,2 → ×0,6; 1,2 → ×0,5; referencia 0,4) y ajustan todos los anchos de línea de la base (OrcaSlicer rechazaba la 1,2 por `skin_infill_line_width` menor que la capa); y las máquinas configuradas antes de «boquilla puesta» ya no pierden su boquilla actual al cambiar.

## 6. Verificación

Textos: todo lo nuevo pasa por el sistema de idiomas (`src/i18n/es/nozzle.ts` y `src/i18n/en/nozzle.ts`, español e inglés); los errores de validación usan `LocalizedError` y los textos que se guardan en la base (notas de plantillas) salen en el idioma de quien los crea.


- Unitarias (`tests/unit/nozzle.test.ts`): normalización de boquillas, espesores de pared, plantillas en 0,2 / 0,25 / 0,4 / 0,6 / 0,8 / 1,2, validaciones, avisos.
- Integración con los perfiles reales de OrcaSlicer 2.4.2 (`tests/integration/nozzles.test.ts`): calidad por defecto por boquilla, variantes de cada impresora, boquillas que no se pisan, cambio de boquilla (de fábrica y 1,2 personalizada), plantillas, nombres únicos, guarda de uso y **laminados reales** con 0,2 y 0,4 (la 0,2 genera más capas que la 0,4; la Fina más que la Estándar).
- E2E (`tests/e2e/15-perfiles-boquillas.spec.ts`): plantillas 0,2, filtro, editor de paredes, copia con nombre, boquilla puesta, aviso al laminar, selector de boquillas.

## 7. Cómo usarlo (3 minutos)

1. **Laminador → Configurar laminado**: para cada máquina elige la impresora y marca la boquilla puesta.
2. **Laminador → Calidad → Nuevo perfil → Plantillas por boquilla**: crea las calidades de la boquilla 0,2 (y las de las otras que uses).
3. En la **ficha de la máquina**, «Boquilla puesta»: cámbiala cuando cambies la boquilla del equipo.
4. Para una variante propia: **Duplicar** una calidad → ponle nombre → ajusta paredes/relleno/velocidades.

## 8. Capturas

`docs/reporte/media/screens/`: `P01-guia-perfiles` (guía y listado), `P02-plantillas-boquilla-02` (plantillas para 0,2), `P03-filtro-boquilla`, `P04-editor-paredes-multiplos`, `P05-boquilla-puesta`, `P06-aviso-boquilla`. Video: `media/videos/perfiles-boquillas.mp4`.
