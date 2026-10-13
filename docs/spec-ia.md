# Spec: IA opcional y configurable en MiniFactory Hub

Estado: propuesta · Alcance: análisis general + diseño detallado del **asesor de perfiles de impresión 3D** · Idioma de producto: es-CL

---

## 0. Resumen ejecutivo

1. **La IA es opcional y viene apagada.** Sin configurar nada, el Hub se comporta exactamente como hoy: no se muestra ningún botón de IA, no hay llamadas de red nuevas y no se agregan dependencias obligatorias.
2. **Proveedor intercambiable** (Anthropic, cualquier API compatible con OpenAI —incluye Ollama/LM Studio/vLLM/OpenRouter para correr **100 % local**—, o ninguno). Cada función se activa por separado y por rol.
3. **La IA propone, el taller decide, el código valida.** Toda salida es JSON con esquema (zod), pasa por validadores deterministas (rangos, allowlist de parámetros, límites de la máquina) y se aplica solo tras confirmación humana, quedando en auditoría. Coincide con la decisión de producto vigente: sin interacción automática con clientes.
4. **Lo más valioso no siempre es un LLM.** Varias mejoras (orientación de pieza, calibración de tiempos, pronóstico de consumo) son estadística o geometría determinista; el LLM aporta lenguaje natural, razonamiento sobre datos mezclados y visión. La spec separa ambos para no pagar tokens por lo que se resuelve con código.
5. **Función estrella: asesor de perfiles.** Genera 2–3 candidatos de perfil de proceso/filamento según el objetivo (rápido, resistente, bonito, ahorrar material) o según un problema (hilos, warping, mala adhesión), **los lamina de verdad con OrcaSlicer en la cola existente**, los compara con el comparador que ya existe y, si el usuario acepta, guarda una nueva versión del perfil. Después **aprende de los resultados reales** (éxito/falla, tiempo y gramos reales vs estimados).

---

## 1. Estado actual relevante (lo que ya existe y se reutiliza)

| Pieza existente | Archivo | Cómo la usa la IA |
|---|---|---|
| Perfiles de laminador con `changes` (delta sobre perfil de fábrica de Orca), versionado y `simulated/imported` | `db/schema.ts` → `slicer_profiles`, `slicer_profile_versions` | Los candidatos de IA son **deltas** sobre el perfil actual; aceptar = nueva versión |
| Parámetros editables simples | `lib/slicer/params.ts` (`SIMPLE_PARAMS_CLIENT`) | Base de la **allowlist** de parámetros que la IA puede tocar |
| Cola de laminado con concurrencia y timeout, caché por `cacheKey`, `groupId` para comparar | `lib/slicer/queue.ts`, `slice_runs`, `components/comparator.tsx` | Evaluación empírica de candidatos sin código nuevo de laminado |
| Resultados del laminado (tiempo, g, capas) | `lib/gcode.ts` (`SliceMeta`), `slice_runs` | Métricas objetivas para ranking |
| Análisis de malla (dimensiones, volumen, `overhangPct`, `closed`, `shells`, etc.) | `lib/mesh/ops.ts` (`MeshAnalysis`) | Entrada del asesor, sin enviar la malla |
| Historial real: `print_jobs` (`estG/realG`, `estH/realH`, `result`, `failCause`, `reprintOfId`, `sliceRunId`), `machines.timeFactor` | `db/schema.ts` | Bucle de retroalimentación y "ficha de desempeño" del perfil |
| Estado en vivo de Bambu (HMS, etapa, AMS, errores) y cámara | `lib/bambu/state.ts`, `api/printers/*` | Explicación de errores y detección visual |
| Precios, márgenes, redondeo, estimación sin laminar | `lib/pricing.ts` | Motor de precios **sigue siendo determinista**; IA solo sugiere/explica |
| Reportes con columnas tipadas | `lib/reports.ts` (`reportData`) | "Herramientas" seguras para preguntas en lenguaje natural |
| Ajustes por taller (`AppSettings`), cifrado de secretos (`seal/unseal`, AES-256-GCM), auditoría y notificaciones | `lib/settings.ts`, `lib/secret.ts`, `lib/audit.ts` | Configuración de IA, almacenamiento de API key, trazabilidad |
| Permisos por rol y módulo | `lib/perm.ts` | Nuevo módulo `ia` + control por función |
| Fotos con `suggestedText`, `internalOnly`, `stage`, `tags` | `schema.ts` → `photos` | Textos para redes, etiquetado; respeta `internalOnly` |
| Enlaces de referencia con vista previa | `lib/links.ts` | Extracción de licencia/autor (contenido **no confiable**) |

---

## 2. Mapa de oportunidades (análisis general)

Leyenda: **Valor** (A/M/B) · **Esfuerzo** (S/M/L) · **Riesgo** (B/M/A) · **Tipo**: `DET` determinista, `LLM` texto/razonamiento, `VIS` visión, `EMB` embeddings.

### 2.1 Laminador y perfiles — *núcleo de esta spec* (ver §6)

| # | Mejora | Tipo | Valor | Esf. | Riesgo |
|---|---|---|---|---|---|
| L1 | **Asesor de perfil por objetivo** (rápido / resistente / estético / ahorro) con candidatos + laminado real + comparación | LLM + DET | A | M | M |
| L2 | **Diagnóstico de problema** ("hace hilos", "se despega", "capas separadas") desde texto y/o foto → cambios concretos de parámetros | LLM + VIS | A | M | M |
| L3 | **Ficha de desempeño por perfil/versión** (tasa de éxito, desvío de tiempo y gramos, causas de falla frecuentes) y sugerencias cuando se degrada | DET (+LLM para explicar) | A | S | B |
| L4 | **Sugerencia de orientación y soportes** a partir de `MeshAnalysis` (probar 6 orientaciones; elegir menor voladizo/altura) | DET | A | M | B |
| L5 | **Asistente de "Configurar laminado"**: dado el modelo de impresora y los materiales, propone perfil de fábrica base y filamentos (hoy es heurística de nombres) | LLM + DET | M | S | B |
| L6 | **Importación inteligente** de `.3mf/.bbscfg`: resumir en lenguaje natural qué cambia el perfil importado respecto al de fábrica y avisar valores peligrosos | LLM | M | S | B |
| L7 | **Calibración guiada de filamento** (torre de temperatura, flujo, retracción): interpreta fotos del test y propone el valor | VIS | M | L | M |
| L8 | **Explicación de errores de laminado** (`-50`, `-17`, timeout) con acciones concretas ("rota la pieza 90°", "usa perfil X") | LLM/DET | M | S | B |

### 2.2 Presupuestos, pedidos y clientes

| # | Mejora | Tipo | Valor | Esf. | Riesgo |
|---|---|---|---|---|---|
| Q1 | **Captura de pedidos desde mensajes** (WhatsApp/Instagram pegados o foto/captura): extrae cliente, ítems, cantidades, colores, plazo, adjuntos → **borrador** de pedido/presupuesto | LLM + VIS | A | M | M |
| Q2 | **Emparejar con catálogo y archivos** ("el soporte de audífonos de la otra vez") con búsqueda semántica | EMB | A | M | B |
| Q3 | **Sugerencia de precio/margen**: compara con presupuestos similares aprobados/rechazados; explica por qué (el cálculo sigue en `pricing.ts`) | DET + LLM | M | M | M |
| Q4 | **Redacción del mensaje** del presupuesto/seguimiento/entrega, con tono del taller (reemplaza/mejora `templates.whatsapp*`) | LLM | M | S | B |
| Q5 | **Seguimiento de presupuestos por vencer** (`expireQuotes`): lista priorizada + borrador de mensaje (lo envía una persona) | DET + LLM | M | S | B |
| Q6 | **Resumen de cliente** (historial, `contact_log`, pagos, preferencias de material) | LLM | M | S | B |
| Q7 | **Detección de riesgos en el pedido**: pieza no cabe, material no compatible con la máquina, margen bajo `minMarginPct`, plazo imposible dada la cola | DET | A | S | B |

### 2.3 Archivos 3D

| # | Mejora | Tipo | Valor | Esf. | Riesgo |
|---|---|---|---|---|---|
| F1 | **Autoetiquetado y nombre/carpeta sugeridos** desde miniatura + nombre + metadatos | VIS + LLM | M | S | B |
| F2 | **Informe de imprimibilidad** en lenguaje claro (`closed`, `openEdges`, `nonManifoldEdges`, `invertedNormals`, `overhangPct`, paredes finas) con acción sugerida | DET + LLM | A | S | B |
| F3 | **Búsqueda semántica** de archivos/fotos/productos ("soporte para auriculares azul") | EMB | M | M | B |
| F4 | **Duplicados "casi iguales"** (más allá del hash exacto) | DET (huella geométrica) / EMB | B | M | B |
| F5 | **Licencia y autoría** desde el enlace de origen (aviso, nunca decisión legal) | LLM | B | S | M |

### 2.4 Producción y máquinas

| # | Mejora | Tipo | Valor | Esf. | Riesgo |
|---|---|---|---|---|---|
| P1 | **Detección de fallo en cámara** (espagueti, despegue) con alerta; local si es posible | VIS | A | L | M |
| P2 | **Explicación de HMS/errores** de Bambu en español con pasos (hoy solo enlace a wiki) | LLM + KB | M | S | B |
| P3 | **Clasificación de `failCause`** desde notas/foto, para que el dato sea consistente y alimente L3 | LLM/VIS | A | S | B |
| P4 | **Planificación de cola**: agrupar por material/color, respetar plazos, minimizar cambios de bobina (solver determinista; LLM solo explica o recibe instrucciones en lenguaje natural) | DET | A | M | B |
| P5 | **Calibración de tiempos**: ya existe `timeFactor` (mediana). Mejorar con regresión por material/perfil/altura de capa | DET | M | S | B |
| P6 | **Mantenimiento predictivo**: horas, incidentes y tasa de fallo → aviso temprano | DET (+LLM) | M | M | B |

### 2.5 Inventario

| # | Mejora | Tipo | Valor | Esf. | Riesgo |
|---|---|---|---|---|---|
| I1 | **Lectura de etiqueta de bobina por foto** (marca, material, color, peso, lote) en `inventario/escanear` | VIS | M | S | B |
| I2 | **Lectura de boleta/factura** de compra → bobinas con costo unitario | VIS | M | M | M |
| I3 | **Pronóstico de consumo y reposición** sobre `shoppingList` (estacionalidad, pedidos en cola) | DET | A | M | B |
| I4 | **Mapeo AMS ↔ inventario** sugerido por color/material (hoy `assignTraySpool` es manual) | DET | M | S | B |

### 2.6 Galería, catálogo y marketing

| # | Mejora | Tipo | Valor | Esf. | Riesgo |
|---|---|---|---|---|---|
| G1 | **Texto para redes** (poblar `photos.suggestedText`), hashtags, texto alternativo | LLM + VIS | M | S | B |
| G2 | **Selección de mejor foto** por producto (nitidez/encuadre/fondo) | VIS/DET | B | S | B |
| G3 | **Descripción de producto** y atributos de variantes en el catálogo | LLM | M | S | B |

### 2.7 Reportes, búsqueda y ayuda

| # | Mejora | Tipo | Valor | Esf. | Riesgo |
|---|---|---|---|---|---|
| R1 | **Preguntas en lenguaje natural** ("¿qué material me dejó más margen este trimestre?") resueltas **llamando a `reportData`** con parámetros, nunca SQL libre | LLM + tools | A | M | M |
| R2 | **Resumen mensual comentado** y detección de anomalías (margen cayendo, máquina con más fallas, cliente moroso) | DET + LLM | M | S | B |
| R3 | **Búsqueda global** (`/api/search`) con intención + semántica | EMB | M | M | B |
| R4 | **Ayuda contextual** ("¿cómo cargo un filamento personalizado?") sobre README/docs | LLM + RAG | B | S | B |

### 2.8 Priorización

- **Ola 1 (cimientos + máximo valor):** Fundación (§4), **L1, L2, L3, L8**, F2, Q7, P3.
- **Ola 2:** Q1, Q2, Q4, Q5, F1, F3, G1, G3, P2, I1, L4, L6.
- **Ola 3:** P1 (visión continua), R1, R2, R3, Q3, I2, I3, P4–P6, L7.
- **Se hace sin LLM aunque la IA esté apagada:** L3, L4, Q7, P4, P5, I3, I4 (aportan valor siempre; la IA solo agrega explicación en lenguaje natural).

---

## 3. Principios de diseño (no negociables)

1. **Apagada por defecto, degradación elegante.** Todo punto de entrada comprueba `ai.enabled && ai.features[x] && can(user,'ia')`. Si falla el proveedor, la funcionalidad base sigue; el error se muestra como "IA no disponible" y nunca bloquea un flujo.
2. **Human-in-the-loop.** La IA no escribe en la base de datos de negocio por sí sola. Produce una **propuesta** (`ai_suggestions`) que el usuario revisa (diff) y aplica con un clic; cada aplicación pasa por los mismos servicios y validaciones que la UI manual (`saveQuote`, `createOrder`, etc.).
3. **Salida estructurada y validada.** Esquema zod por función; el código rechaza campos desconocidos, fuera de rango o no permitidos. Nada de ejecutar texto del modelo.
4. **Determinismo primero.** Si una regla o fórmula resuelve el problema, se usa; el LLM entra donde hay lenguaje natural, ambigüedad o conocimiento del dominio.
5. **Minimización de datos y privacidad.** Se envían **métricas y resúmenes**, no archivos 3D ni datos personales. Nombre, teléfono, correo, RUT y dirección del cliente se reemplazan por alias (`Cliente A`) antes de enviar y se restituyen al mostrar. Modo "solo local" (ver §4.3).
6. **Datos externos = no confiables.** Mensajes de clientes, títulos de enlaces, nombres de archivo, metadatos de `.3mf` y texto OCR pueden contener instrucciones ("ignora lo anterior…"). Van en bloques delimitados como *datos*, el modelo no tiene herramientas con efectos laterales, y la salida se valida igualmente (defensa en profundidad).
7. **Transparencia.** Cada propuesta muestra: qué datos se usaron, modelo/versión de prompt, confianza y motivo de cada cambio. Etiqueta visible "Sugerido por IA".
8. **Costo acotado.** Presupuesto mensual, límites por usuario, caché por hash de entrada, modelos pequeños para clasificación, y estimación del costo antes de acciones caras.
9. **Sin lock-in.** Interfaz propia de proveedor; las llamadas se hacen con `fetch` (sin SDK obligatorio) para no engordar el contenedor ni romper el modo sin IA.
10. **Todo probable sin red.** Existe un `MockProvider` determinista para tests unitarios y e2e (análogo a `scripts/bambu-sim.ts`).

---

## 4. Arquitectura de la fundación

### 4.1 Estructura de módulos

```
src/lib/ai/
  index.ts            # getAI(): devuelve cliente o null si está apagada
  config.ts           # lectura/validación de settings.ai + env
  providers/
    types.ts          # interfaz AIProvider
    anthropic.ts      # Messages API (tool use, visión, JSON schema)
    openai-compat.ts  # /v1/chat/completions (Ollama, LM Studio, vLLM, OpenRouter, OpenAI)
    mock.ts           # respuestas deterministas para pruebas
  run.ts              # runTask(): orquesta prompt → llamada → validación → registro
  redact.ts           # alias de PII + restitución
  budget.ts           # topes mensuales/por usuario, estimación de costo
  cache.ts            # caché por hash(feature, promptVersion, input)
  prompts/            # prompts versionados por función (es-CL), un archivo por función
  schemas/            # zod por función (entrada/salida)
  features/
    profile-advisor/  # §6 (candidates.ts, validate.ts, kb.ts, evaluate.ts, learn.ts)
    intake/           # Q1/Q2
    files/            # F1/F2
    production/       # P2/P3
    reports/          # R1/R2
src/actions/ai.ts     # server actions: proponer, aplicar, descartar, probar conexión
src/app/api/ai/...    # SSE para respuestas largas (opcional)
src/components/ai/    # <AiButton/>, <AiPanel/>, <DiffTable/>, <AiBadge/>
```

### 4.2 Interfaz de proveedor

```ts
export interface AIRequest<T> {
  feature: FeatureKey;                 // 'profile.advisor', 'intake.parse', …
  tier: 'fast' | 'smart';              // mapea a un modelo configurado
  system: string;
  user: string | Array<{ type: 'text'; text: string } | { type: 'image'; data: Buffer; mime: string }>;
  schema: z.ZodType<T>;                // salida estructurada
  tools?: AITool[];                    // solo lectura salvo que la función lo declare
  maxOutputTokens?: number;
  timeoutMs?: number;
  temperature?: number;                // 0–0.3 por defecto: queremos estabilidad
}
export interface AIProvider {
  id: 'anthropic' | 'openai-compat' | 'mock';
  capabilities: { vision: boolean; tools: boolean; jsonSchema: boolean; embeddings: boolean };
  complete<T>(req: AIRequest<T>): Promise<{ data: T; usage: { inTokens: number; outTokens: number }; model: string }>;
  embed?(texts: string[]): Promise<number[][]>;
  ping(): Promise<{ ok: boolean; model: string; latencyMs: number; error?: string }>;
}
```

- Si el proveedor no soporta `jsonSchema` nativo, `run.ts` pide JSON, valida con zod y **reintenta una vez** con el error de validación como retroalimentación.
- Si no soporta visión, las funciones `VIS` se ocultan (la UI consulta `capabilities`).
- Modelos por defecto sugeridos (editables): `smart` → `claude-sonnet-5-5`, `fast` → `claude-haiku-5-5`. Local: cualquier modelo de Ollama con soporte de herramientas/visión según la función.

### 4.3 Configuración

**Ajustes del taller** (`AppSettings.ai`, junto a `shop`, `rates`…; solo `config` puede editarlos):

```ts
ai: {
  enabled: boolean;                          // interruptor maestro (false)
  provider: 'none' | 'anthropic' | 'openai-compat';
  baseUrl?: string;                          // openai-compat: http://ollama:11434/v1
  apiKeySealed?: string;                     // seal() de lib/secret.ts; nunca se devuelve al cliente
  models: { fast: string; smart: string; vision?: string; embed?: string };
  localOnly: boolean;                        // bloquea cualquier host que no sea LAN/localhost (reutiliza assertLanHost)
  features: Record<FeatureKey, boolean>;     // activación por función
  roles: Record<FeatureKey, Role[]>;         // quién puede usarla (por defecto admin; ver §4.5)
  privacy: { redactPII: boolean; sendImages: boolean; sendMeshPreview: false /* nunca en v1 */ };
  budget: { monthlyUsd: number | null; perUserDailyCalls: number; hardStop: boolean };
  language: 'es-CL';
  retention: { logPromptsDays: number };     // 0 = no guardar prompts, solo métricas
}
```

**Variables de entorno** (valores por defecto, sirven para despliegues con Docker; los ajustes del taller tienen prioridad salvo `AI_FORCE_DISABLED`):

```
# AI_PROVIDER=anthropic|openai-compat
# AI_API_KEY=            # alternativa a guardarla en la base
# AI_BASE_URL=
# AI_MODEL_FAST= / AI_MODEL_SMART= / AI_MODEL_VISION= / AI_MODEL_EMBED=
# AI_LOCAL_ONLY=1
# AI_FORCE_DISABLED=1    # kill-switch del administrador de sistemas
```

**Pantalla Configuración → Inteligencia artificial** (nueva pestaña):
1. Interruptor maestro + selector de proveedor + URL/clave + modelos → botón **Probar conexión** (`ping()`, muestra latencia, modelo y capacidades detectadas).
2. Tabla de funciones: interruptor, roles permitidos, modelo (fast/smart), estimación de costo típico.
3. Privacidad: ocultar datos personales, permitir enviar imágenes, modo solo-local (con aviso si el host configurado no es LAN).
4. Presupuesto: tope mensual, consumo actual (gráfico simple), detener al llegar al tope o solo avisar.
5. Registro reciente (últimas llamadas: función, usuario, tokens, costo, resultado) y botón "Borrar historial de prompts".

### 4.4 Datos (migración Drizzle)

```ts
// Propuestas generadas por IA y su ciclo de vida
ai_suggestions: base() + {
  feature: text, subjectType: text, subjectId: uuid|null,
  inputHash: text,                        // dedupe + caché
  provider: text, model: text, promptVersion: text,
  proposal: jsonb,                        // salida validada
  rationale: jsonb,                       // motivos por cambio, confianza, datos usados
  status: 'proposed'|'applied'|'rejected'|'expired'|'superseded',
  appliedAt, appliedBy,
  outcome: jsonb,                         // resultado real posterior (ver §6.9)
}
// Telemetría de uso y costo (sin contenido salvo retención activa)
ai_calls: id, workspaceId, userId, feature, provider, model, tier,
  inTokens, outTokens, costUsd, latencyMs, ok, error, cacheHit, createdAt,
  promptLog: jsonb|null                   // solo si retention.logPromptsDays > 0
// Embeddings (Ola 2/3)
ai_embeddings: id, workspaceId, entity, entityId, model, dim, vector: real[]|jsonb, textHash, updatedAt
```

- Embeddings: el taller maneja miles de filas, no millones → coseno en memoria/SQL sobre `real[]` es suficiente y funciona en **PGlite y Postgres** sin extensión. Si crece, `pgvector` como optimización opcional.
- Soft-delete y `workspace_id` siguen el patrón `base()` del esquema.

### 4.5 Permisos y auditoría

- Nuevo módulo `ia` en `perm.ts` (V = usar funciones habilitadas, C = generar propuestas con costo, E = aplicar propuestas, X = borrar historial). Matriz inicial: `admin: VCEX`, `operador: VC` (asesor de perfiles, diagnóstico, explicación de errores), `ventas: VC` (borradores de mensajes y pedidos). Aplicar un cambio exige además el permiso del módulo destino (p. ej. `laminador:E` para guardar un perfil).
- Costos y márgenes: las funciones que reciben precios/costos (Q3, R1, R2) solo están disponibles para quienes cumplen `canSeeCosts`; el *Operador nunca* recibe datos de costos en el contexto del modelo.
- Cada `apply` escribe en `activity_log` vía `audit()` con `{ suggestionId, feature, model, diff }`. Los fallos y topes de presupuesto generan `notify()` al administrador.

### 4.6 Ejecución y robustez

- **Llamadas cortas** (clasificar, redactar): síncronas desde server actions con timeout 30 s.
- **Llamadas largas / multi-paso** (asesor de perfiles con laminado de candidatos): se registran como trabajo y siguen el patrón de `slice_runs` (estado `queued|running|done|error` + sondeo desde la UI), así sobreviven a recargas de página.
- Reintentos con backoff solo ante 429/5xx/timeouts; nunca se reintenta una validación fallida más de una vez.
- Límite de concurrencia de llamadas (p. ej. 2) y circuit breaker: tras 3 fallos seguidos, la función se marca "no disponible" 5 min.
- Caché por `inputHash` (misma entrada + versión de prompt + modelo → misma propuesta) con TTL configurable.

---

## 5. Seguridad y cumplimiento

| Riesgo | Mitigación |
|---|---|
| Fuga de la API key | Cifrada con `seal()` (AES-256-GCM, llave derivada de `SESSION_SECRET`); nunca se envía al navegador ni se loguea; entrada de formulario tipo "write-only" (muestra `••••` + últimos 4). |
| Inyección de prompt vía mensajes/enlaces/3MF | Delimitadores de datos, sin herramientas con efectos laterales, esquemas estrictos, validación determinista, revisión humana previa a aplicar. Para `intake`, el texto del cliente nunca se mezcla con instrucciones del sistema. |
| Fuga de datos personales | `redact.ts` + `privacy.redactPII` activo por defecto; modo `localOnly`; las fotos con `internalOnly` **jamás** se envían. |
| Parámetros peligrosos en el laminador (temperaturas, aceleraciones, G-code) | Allowlist + rangos + límites de máquina/material (§6.5). **Prohibido** tocar `*_gcode`, scripts post-proceso y parámetros de máquina en v1. |
| SSRF vía `baseUrl` | Validar esquema/host; con `localOnly`, exigir LAN/loopback (misma lógica que `assertLanHost`). |
| Costos desbocados | Presupuesto, límites por usuario/día, estimación previa, caché, modelos `fast`. |
| Alucinaciones | Salida con evidencia (campo `evidence` que cita datos de entrada), rangos, laminado real como prueba, bucle de resultados (§6.9). Textos de clientes siempre revisados por una persona. |
| Cumplimiento (datos personales en Chile, Ley 19.628/21.719) | Informar en la pantalla de configuración qué datos salen y a quién; opción local; retención de prompts configurable (0 por defecto). |

---

## 6. Detalle: Asesor de perfiles de impresión 3D (L1, L2, L3, L8)

### 6.1 Objetivo y casos de uso

Reducir el tiempo y el ensayo-error al ajustar perfiles, y mejorar la tasa de éxito y la calidad con evidencia propia del taller.

| Caso | Entrada del usuario | Resultado |
|---|---|---|
| **A. Por objetivo** | Pieza + máquina + material + objetivo (rápido / resistente / estético / ahorrar material / equilibrado) + restricciones ("no más de 4 h", "uso exterior") | 3 candidatos (conservador, equilibrado, agresivo) ya laminados y comparados |
| **B. Por problema** | Descripción libre y/o foto ("hace hilos", "esquinas levantadas", "capas que se separan") + perfil usado | Causa(s) probable(s) priorizadas + cambios mínimos de parámetros + prueba recomendada |
| **C. Mejora continua** | Automático/sugerido desde la ficha del perfil cuando su desempeño se degrada | "El perfil `PETG 0.2` falla 3 de 10 por *despegue*: sugiero cama +5 °C y brim" |
| **D. Explicar error** | Falló un laminado (`-50`, `-17`, timeout) | Explicación en español + acción de un clic (rotar, escalar, cambiar perfil) |

### 6.2 Dónde aparece en la UI

- **Laminador → panel de laminado (`slice-panel.tsx`):** botón secundario **“Mejorar con IA”** junto a “Laminar”. Abre un panel lateral con: objetivo (chips), restricciones (texto corto), “¿Qué problema ves?” (opcional, con adjuntar foto) y estimación de costo/tiempo ("≈ 3 laminados · ~4 min · ~US$0,03").
- **Resultado:** tabla comparativa reutilizando `comparator.tsx` (columnas: tiempo, gramos, capas, costo estimado, puntuaciones de resistencia/calidad, riesgo) + **diff** de parámetros por candidato con el motivo de cada cambio en una línea.
- **Acciones:** *Usar para este trabajo* (solo aplica al laminado actual, no toca el perfil) · *Guardar como nueva versión del perfil* · *Guardar como perfil nuevo* · *Descartar*. Todas dejan auditoría.
- **Ficha de perfil (`laminador/perfiles/[id]`):** pestaña **Desempeño** (L3) y botón “Sugerir mejoras” (caso C).
- **Cola → terminar trabajo fallido:** al elegir `failCause`, ofrece “Ver qué cambiar en el perfil” (caso B con contexto precargado).
- **Error de laminado:** tarjeta “Explicar y arreglar” (caso D).
- Si la IA está apagada o la función desactivada, ninguno de estos controles se renderiza. La pestaña **Desempeño** y las explicaciones de reglas (L3/L8 deterministas) **sí** se muestran siempre.

### 6.3 Contexto que se envía al modelo (solo resúmenes)

```jsonc
{
  "pieza": { "dim_mm": [82,45,31], "volumen_cm3": 48.2, "area_cm2": 120.4, "voladizo_pct": 14.5, "cerrada": true,
             "conchas": 1, "triangulos": 120340, "pared_minima_mm": 0.9 /* si se calcula */ },
  "uso": { "objetivo": "resistente", "restricciones": "soporta carga, uso exterior", "plazo_h": null },
  "maquina": { "modelo": "Bambu Lab P1S", "boquilla": "0.4", "cerrada": true, "multicolor": 4,
               "factor_tiempo": 1.12, "vol_mm": [256,256,256] },
  "material": { "tipo": "PETG", "temp_boquilla_rango": [230,260], "cama_rango": [70,85], "caudal_max_mm3s": 12 },
  "perfil_actual": { "base": "0.20mm Standard @BBL X1C", "cambios": { "sparse_infill_density": "15%", "wall_loops": 2 },
                     "version": 3 },
  "ultimo_laminado": { "tiempo_s": 9420, "g": 61.3, "capas": 155 },
  "historial_perfil": { "trabajos": 18, "exito": 14, "fallas": { "despegue": 3, "hilos": 1 },
                        "desvio_tiempo_pct": 11, "desvio_g_pct": -2 },
  "casos_similares": [ /* hasta 5 resultados propios del taller, ver §6.9 */ ],
  "reglas_dominio": [ /* fragmentos de la base de conocimiento relevantes al objetivo/problema */ ],
  "parametros_permitidos": [ /* subconjunto de la allowlist con rangos, §6.5 */ ]
}
```

No se envía: la malla, el G-code, nombres de archivo/cliente ni precios. En caso B con foto: la imagen (redimensionada a ≤1024 px, sin EXIF) solo si `privacy.sendImages` está activo.

### 6.4 Salida estructurada (zod)

```ts
const Candidate = z.object({
  name: z.enum(['conservador', 'equilibrado', 'agresivo']),
  summary: z.string().max(240),
  changes: z.array(z.object({
    scope: z.enum(['process', 'filament']),
    key: z.string(),                       // debe estar en la allowlist
    from: z.union([z.string(), z.number()]).nullable(),
    to: z.union([z.string(), z.number()]),
    reason: z.string().max(200),
    evidence: z.string().max(160),         // dato de entrada que lo justifica
  })).max(12),                             // pocos cambios: más fácil de entender y de probar
  expected: z.object({ time: z.enum(['-','=','+']), material: z.enum(['-','=','+']),
                       strength: z.enum(['-','=','+']), quality: z.enum(['-','=','+']) }),
  risks: z.array(z.string().max(160)).max(4),
});
const Output = z.object({
  diagnosis: z.array(z.object({ cause: z.string(), likelihood: z.number().min(0).max(1), why: z.string() })).max(4).optional(),
  candidates: z.array(Candidate).min(1).max(3),
  testPlan: z.string().max(400),           // qué probar primero (pieza pequeña, torre, etc.)
  needsMoreInfo: z.array(z.string()).max(3).optional(), // preguntas si falta contexto
  confidence: z.enum(['baja', 'media', 'alta']),
});
```

### 6.5 Validación determinista (`profile-advisor/validate.ts`) — la red de seguridad

1. **Allowlist**: solo claves de `SIMPLE_PARAMS_CLIENT.process` y `.filament` en v1, ampliable con un registro `PARAM_REGISTRY`:

```ts
{ key: 'outer_wall_speed', scope: 'process', type: 'number', min: 20, max: 300, unit: 'mm/s',
  risk: 'moderate', ties: ['inner_wall_speed','default_acceleration'],
  clampBy: ['filament_max_volumetric_speed'] }
```
   Clases de riesgo: `safe` (se aplica directo tras confirmar), `moderate` (se marca con aviso y se recomienda laminar antes), `risky` (temperaturas fuera del rango del material, aceleraciones altas): se bloquean salvo admin.
2. **Rangos por material/máquina**: temperatura de boquilla/cama dentro de `material.temp_rango` ± tolerancia; caudal volumétrico ≤ `filament_max_volumetric_speed`; altura de capa entre 25 % y 80 % del diámetro de boquilla; velocidades/aceleraciones ≤ límites del perfil de máquina; soportes e infill coherentes con el perfil base.
3. **Dependencias**: p. ej. `support_type` solo con `enable_support=1`; `brim_type` válido; patrones de relleno de la lista permitida.
4. **Consistencia**: no más de N cambios; `from` debe coincidir con el valor efectivo actual (si no, se recalcula y se advierte); sin cambios que anulen otros.
5. **Prueba de laminado**: un candidato que no lamina (`runOrca` falla) se descarta y el error se devuelve al modelo una vez para corregir.
6. Los candidatos inválidos se **corrigen por recorte** (clamp) cuando es seguro, o se descartan explicando por qué. Esto se muestra al usuario.

### 6.6 Flujo (agente acotado y auditable)

```
UI: objetivo + restricciones (+ foto)
 │
 ▼ 1. Recolectar contexto (DET): MeshAnalysis, perfil efectivo, historial, casos similares, reglas KB
 ▼ 2. Calcular baseline: laminar el perfil actual (caché por cacheKey; si ya existe, 0 costo)
 ▼ 3. LLM (tier smart): proponer ≤3 candidatos + diagnóstico  → zod → validate()
 ▼ 4. Encolar laminados de cada candidato con enqueueSlice({ groupId, label: 'IA · equilibrado' })
 ▼ 5. Puntuar (DET): tiempo, gramos, capas + puntajes heurísticos de resistencia/calidad/riesgo
 ▼ 6. (Opcional, 2.ª ronda máx. 1) LLM recibe métricas reales y afina el mejor candidato
 ▼ 7. UI: comparador + diff + razones; el usuario elige / guarda versión / descarta
 ▼ 8. Se registra ai_suggestions (status) y, más tarde, el resultado real (§6.9)
```

- Máximo **1 ronda de refinamiento** y **≤ 4 laminados** por solicitud (configurable) → acota costo y tiempo; respeta `ORCA_CONCURRENCY`/`ORCA_TIMEOUT_S`.
- El laminado real es el "juez": el modelo propone, Orca mide.
- **Puntajes heurísticos** (documentados, deterministas, para ordenar y explicar; no pretenden ser física exacta):
  - *Resistencia* ≈ f(paredes × boquilla, infill, patrón, capas superiores/inferiores, orientación vs. carga declarada).
  - *Calidad superficial* ≈ f(altura de capa, velocidad/aceleración de pared exterior, ventilador, ironing).
  - *Riesgo de falla* ≈ f(voladizo %, soportes, relación base/altura, velocidad vs. caudal máx., historial de fallas del perfil).
  - Se calibran con el historial del taller (§6.9) cuando hay datos suficientes (≥ 20 trabajos).

### 6.7 Base de conocimiento de dominio (`kb.ts`)

Archivo versionado (JSON/TS) en español: *síntoma → causas ordenadas → parámetros a mover (dirección y paso típico) → contraindicaciones*, por material (PLA, PETG, ABS/ASA, TPU, PA/CF…). Ejemplos: hilos → bajar temperatura 5 °C, subir retracción, verificar humedad; despegue → cama +5 °C, brim, reducir ventilador 1.ª capas, cerrar recinto; separación de capas → subir temperatura, bajar ventilador, mayor flujo. Se **inyecta solo el subconjunto relevante** (RAG simple por palabra clave/categoría) y sirve también para el modo sin IA (L8 y L3 muestran la regla aplicable). Es la principal defensa contra respuestas genéricas o erróneas.

### 6.8 Diagnóstico por foto (L2/P3)

- Entrada: 1–3 fotos + texto opcional + perfil usado.
- Salida: lista cerrada de causas **alineada con el catálogo de `failCause`** del taller (se normaliza el campo hoy libre en `print_jobs.fail_cause`; ver §9 preguntas abiertas), con probabilidad y qué parámetros moverían.
- Si la confianza es baja, devuelve `needsMoreInfo` ("¿la primera capa se ve despareja?") en lugar de inventar.

### 6.9 Aprendizaje con resultados reales (lo que lo vuelve mejor que una guía genérica)

1. Al aplicar una propuesta se guarda `ai_suggestions.proposal` y se enlaza la nueva **versión de perfil** (`slicer_profile_versions`).
2. Los `print_jobs` terminados vinculados a esa versión (por `sliceRunId → profileVersions`) alimentan `outcome`: éxito/falla y causa, `realH/estH`, `realG/estG`.
3. **Ficha de desempeño** (DET, sin IA): por perfil y versión, tasa de éxito, desvío de tiempo y gramos, causas frecuentes, comparación con la versión anterior.
4. **Casos similares** para el contexto: se buscan trabajos propios con mismo material/máquina y geometría parecida (volumen, altura, voladizo) y resultados conocidos → entran como *few-shot* reales del taller.
5. **Degradación**: si una versión cae por debajo de umbral (p. ej. éxito < 85 % con ≥ 8 trabajos) se crea una `notify()` "Perfil X está fallando más: ver sugerencias" (con o sin IA; con IA se agrega propuesta).
6. Tasa de aceptación y mejoras medidas alimentan las métricas de §10.

### 6.10 Criterios de aceptación

- Con IA desactivada: cero botones/llamadas de IA; las pruebas existentes pasan sin cambios.
- Ninguna propuesta puede escribir un parámetro fuera de la allowlist ni fuera de rango (prueba de propiedades con salidas del `MockProvider` maliciosas).
- Cada candidato mostrado ha sido **laminado con éxito** o está marcado como "no probado".
- Aplicar crea una versión nueva del perfil, reversible (se puede volver a la anterior), con auditoría.
- Costo estimado mostrado antes de ejecutar y registrado después; se respeta el tope mensual.
- Con foto: no se envía si `sendImages=false` o la foto es `internalOnly`.
- Tiempo de respuesta objetivo: propuesta (LLM) ≤ 20 s; comparación completa ≤ 5 min con 2 laminados en paralelo para piezas típicas.

---

## 7. Detalle breve de otras funciones de la Ola 2

| Función | Diseño clave |
|---|---|
| **Q1 Captura de pedidos** | Pegar texto/captura → `intake.parse` devuelve `{cliente_alias, items[{descripcion, cantidad, material, color, archivo_referencia?}], plazo, notas, dudas[]}`. Se muestra un **formulario precargado** (`order-form.tsx`/`quote-editor.tsx`) con campos dudosos resaltados; nada se guarda sin pulsar *Crear*. Coincidencia de cliente existente por teléfono/nombre se hace **en el servidor**, no el modelo. |
| **Q2/F3 Búsqueda semántica** | Embeddings de nombre+tags+descripción de archivos/productos/clientes (sin PII) en `ai_embeddings`; se recalculan al guardar (cola). Mezcla con el `ilike` actual de `/api/search`. |
| **F1/F2 Archivos** | Miniatura (ya se genera) + nombre → tags/carpeta sugeridos; informe de imprimibilidad desde `MeshAnalysis` con reglas deterministas y redacción por LLM (opcional). |
| **P2 HMS** | Tabla local `hms-es.json` (código → texto/acción) como primera fuente; el LLM solo cubre códigos desconocidos con aviso "traducción automática". |
| **G1/G3** | `photos.suggestedText` y descripción de catálogo, con 2–3 variantes de tono; respeta `internalOnly`; se pueden regenerar. |
| **R1 Preguntas** | Herramientas: `report(kind, from, to)`, `indicators(range)`, `top(entity, metric)`; el LLM solo elige herramienta y parámetros, el servidor ejecuta con los permisos del usuario (`canSeeCosts`), y el modelo redacta con los números devueltos (cada cifra citada con su origen). **Sin SQL libre.** |
| **I1/I2 Visión inventario** | Foto de etiqueta/boleta → campos propuestos para `createSpool`; confirmación humana; la cifra de costo se valida contra rangos. |

---

## 8. Calidad, pruebas y evaluación

- **Unitarias (vitest):** `validate.ts` (rangos, dependencias, clamp), `redact.ts`, `budget.ts`, parseo de esquemas, caché. Pruebas de propiedades con propuestas hostiles.
- **Integración:** `MockProvider` + laminado real (como `slicer-setup.test.ts`) para verificar el flujo candidatos → laminado → comparación → aplicar → nueva versión.
- **E2E (Playwright):** configuración de IA, probar conexión con proveedor simulado, flujo del asesor, que **no aparezca nada** con IA apagada, permisos por rol, accesibilidad (axe) del panel y móvil.
- **Evaluación de prompts (offline):** conjunto dorado (≈ 30 casos reales anonimizados: pieza+objetivo→cambios aceptables; foto+síntoma→causa). Métricas: validez estructural (100 %), cambios dentro de reglas (100 %), coincidencia de causa top-2 (objetivo ≥ 80 %). Se ejecuta manualmente al cambiar `promptVersion` o de modelo, nunca en CI por defecto (costo).
- **Simulador local de proveedor** `scripts/ai-sim.ts` (respuestas guionadas, latencias y errores 429/5xx) para desarrollo y e2e.

### Métricas de producto (visibles al administrador)

Tasa de aceptación por función · % de candidatos que laminan · ahorro de tiempo/material de la opción elegida vs. baseline · variación de tasa de éxito de perfiles tras aplicar sugerencias · costo por función/mes · latencia p50/p95 · tasa de fallos del proveedor.

---

## 9. Decisiones abiertas (para acordar antes de construir)

1. **Proveedor por defecto en la UI:** ¿Anthropic + opción local, o solo "compatible con OpenAI" (cubre más, menos pulido para visión/herramientas)? *Recomendación:* ambos, con Anthropic como primera opción documentada.
2. **¿Nube o local para fotos?** Fotos pueden contener personas/talleres. *Recomendación:* `sendImages` apagado por defecto.
3. **`failCause` hoy es texto libre.** Para que L3/P3 sean fiables conviene un catálogo cerrado (despegue, hilos, espagueti, atasco, falta de material, corte de energía, otro). *Recomendación:* añadir catálogo con migración que conserve el texto previo.
4. **Alcance de edición automática:** v1 solo perfiles de **proceso y filamento**. ¿Se permite en el futuro tocar perfiles de máquina? *Recomendación:* no.
5. **Retención de prompts:** 0 días por defecto (solo métricas). ¿Se necesita más para auditoría?
6. **Idioma de salida:** es-CL fijo vs. configurable por taller (`shop.lang`).
7. **Presupuesto por defecto:** sugerido US$ 10/mes con aviso al 80 % y detención opcional.

---

## 10. Plan por fases

| Fase | Entregable | Dependencias | Criterio de salida |
|---|---|---|---|
| **0 – Fundación** *(implementada)* | `lib/ai` (proveedores, `run`, `redact`, `budget`, `cache`), `settings.ai`, pantalla de configuración con *Probar conexión*, tablas `ai_calls/ai_suggestions`, módulo `ia` en permisos, `MockProvider`/simulador, kill-switch | Ninguna | Con IA apagada, build y tests actuales idénticos; con proveedor simulado se puede probar conexión y ver consumo |
| **1 – Asesor de perfiles** | L3 ficha de desempeño (DET) + L8 explicación de errores (DET/LLM) + L1/L2 asesor con candidatos, laminado real y comparación; aplicar como nueva versión | Fase 0; catálogo `failCause` | Criterios de §6.10 cumplidos; evaluación en conjunto dorado |
| **2 – Entrada de datos y archivos** | Q1 captura de pedidos, Q4 redacción de mensajes, Q7 riesgos, F1/F2, P2 HMS, G1/G3, I1 | Fase 0 | Cada función desactivable y con revisión humana |
| **3 – Búsqueda, visión y análisis** | Embeddings (Q2/F3/R3), R1/R2 preguntas y resúmenes, P1 detección en cámara (local recomendado), L4 orientación, L7 calibración | Fases 0–2 | Medición de utilidad real antes de seguir |
| **4 – Optimización de operación** | P4 planificación de cola, P5/P6, I3 pronóstico, Q3 sugerencia de precio | Datos acumulados | Mejora medible en entregas a tiempo / cambios de bobina |

Estimación gruesa: Fase 0 ≈ 1 semana · Fase 1 ≈ 2 semanas · Fase 2 ≈ 2 semanas · Fases 3–4 incrementales.

---

### Estado de la Fase 0 (implementada)

Hecho: `src/lib/ai` (proveedores Anthropic y compatible con OpenAI por `fetch`, `MockProvider`, `run.ts` con permisos → presupuesto → caché → reintentos → validación zod con un reintento → telemetría, cortacircuitos, ocultación de datos personales, validación de URL y modo solo-local), `settings.ai` con la clave cifrada (`getSettings()` nunca la expone; `getSettingsRaw()` es solo de servidor), tablas `ai_calls` y `ai_suggestions`, módulo de permisos `ia`, pestaña de configuración con *Probar conexión* y consumo, `scripts/ai-sim.ts`, pruebas unitarias, de integración y e2e. Pendiente de la fundación: `ai_embeddings` (se crea con las búsquedas semánticas, Fase 3) y el selector por función de modelo `fast`/`smart` (hoy fijo en el registro `FEATURES`).
Decisiones de implementación que difieren de lo escrito arriba: el costo estimado solo usa tarifas por defecto para Anthropic (en proveedores compatibles es 0 salvo `AI_PRICES`); el interruptor maestro solo viene de los ajustes del taller (las variables de entorno aportan proveedor, clave y modelos de respaldo).

## 11. Riesgos y alternativas

- **Calidad de las sugerencias variable según el modelo.** Mitigación: KB de dominio, validación, laminado real y bucle de resultados; opción de modelo más potente solo para el asesor.
- **Dependencia de servicios externos y costo.** Mitigación: todo opcional, caché, tope mensual, modo local.
- **Falsa sensación de certeza.** Mitigación: confianza explícita, "no probado", plan de prueba, insistir en piezas pequeñas antes de lotes.
- **Mantenimiento de la KB y de los rangos de materiales.** Mitigación: archivos versionados, tests de consistencia, y datos de `materials` del taller como fuente primaria de rangos.
- **Alternativa sin LLM para el asesor:** motor de reglas sobre la KB + ficha de desempeño (entrega ~60 % del valor de L1–L3). Se construye primero como base y el LLM se monta encima, así el producto sigue siendo útil con IA apagada.
