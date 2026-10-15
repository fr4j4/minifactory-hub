import {
  pgTable, uuid, text, integer, doublePrecision, boolean, timestamp, jsonb, date, primaryKey, index, uniqueIndex,
} from 'drizzle-orm/pg-core';

/* Todas las tablas llevan id (UUID), workspace_id, created_at, updated_at, created_by y deleted_at (borrado lógico).
   En la etapa 1 hay un solo taller; workspace_id queda listo para multi-taller. */
const base = () => ({
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  ...base(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull().default('operador'), // admin | operador | ventas
  passwordHash: text('password_hash').notNull(),
  active: boolean('active').notNull().default(true),
  permOverrides: jsonb('perm_overrides').$type<Record<string, string>>().default({}),
  notifPrefs: jsonb('notif_prefs').$type<Record<string, boolean>>().default({}),
}, (t) => [uniqueIndex('users_email_uq').on(t.email)]);

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const settings = pgTable('settings', {
  workspaceId: uuid('workspace_id').primaryKey(),
  data: jsonb('data').$type<Record<string, any>>().notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sequences = pgTable('sequences', {
  workspaceId: uuid('workspace_id').notNull(),
  key: text('key').notNull(),
  year: integer('year').notNull(),
  value: integer('value').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.key, t.year] })]);

/* ───────────── Comercial ───────────── */
export const priceLists = pgTable('price_lists', {
  ...base(),
  name: text('name').notNull(),
  adjustPct: doublePrecision('adjust_pct').notNull().default(0), // -10 = 10% de descuento
});

export const customers = pgTable('customers', {
  ...base(),
  type: text('type').notNull().default('particular'), // particular | empresa | revendedor
  isOccasional: boolean('is_occasional').notNull().default(false),
  name: text('name').notNull(),
  phone: text('phone'),
  taxId: text('tax_id'),
  email: text('email'),
  addresses: jsonb('addresses').$type<Array<{ label: string; text: string }>>().default([]),
  priceListId: uuid('price_list_id'),
  photoConsent: text('photo_consent').notNull().default('unknown'), // yes | no | no_brand | unknown
  tags: jsonb('tags').$type<string[]>().default([]),
  notes: text('notes'),
  depositPct: doublePrecision('deposit_pct'),
}, (t) => [index('customers_name_ix').on(t.name)]);

export const contactLog = pgTable('contact_log', {
  ...base(),
  customerId: uuid('customer_id'),
  quoteId: uuid('quote_id'),
  orderId: uuid('order_id'),
  channel: text('channel'),
  summary: text('summary').notNull(),
  attachmentKey: text('attachment_key'),
});

export const salesChannels = pgTable('sales_channels', {
  ...base(),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('directo'), // directo | marketplace | feria | redes
  commissionPct: doublePrecision('commission_pct').notNull().default(0),
  commissionFixed: integer('commission_fixed').notNull().default(0),
  avgShipping: integer('avg_shipping').notNull().default(0),
  active: boolean('active').notNull().default(true),
});

/* ───────────── Inventario de materiales ───────────── */
export const materials = pgTable('materials', {
  ...base(),
  tech: text('tech').notNull().default('fdm'), // fdm | resina
  manufacturer: text('manufacturer'),
  line: text('line'),
  type: text('type').notNull(), // PLA, PETG, ABS, ASA, TPU, PA, PC, resina...
  colorName: text('color_name').notNull(),
  hex: text('hex').notNull().default('#888888'),
  diameter: doublePrecision('diameter').default(1.75),
  density: doublePrecision('density').notNull().default(1.24),
  costPerKg: integer('cost_per_kg').notNull().default(0), // por kg o por litro
  stockMinG: integer('stock_min_g').notNull().default(1000),
  tempNozzle: text('temp_nozzle'),
  tempBed: text('temp_bed'),
  supplierText: text('supplier_text'),
  filamentProfileId: uuid('filament_profile_id'),
  notes: text('notes'),
});

export const spools = pgTable('spools', {
  ...base(),
  materialId: uuid('material_id').notNull(),
  code: text('code').notNull(),
  lot: text('lot'),
  boughtAt: date('bought_at'),
  openedAt: date('opened_at'),
  initialG: doublePrecision('initial_g').notNull().default(1000),
  tareG: doublePrecision('tare_g').notNull().default(200),
  remainingG: doublePrecision('remaining_g').notNull().default(1000),
  reservedG: doublePrecision('reserved_g').notNull().default(0),
  unitCost: integer('unit_cost'), // costo por kg de esta unidad
  location: text('location'),
  status: text('status').notNull().default('nueva'), // nueva | abierta | en_uso | agotada | descartada
  machineId: uuid('machine_id'),
  slot: text('slot'),
  lastDriedAt: date('last_dried_at'),
  supplierId: uuid('supplier_id'), // «dónde compré» (directorio liviano, N4b)
}, (t) => [uniqueIndex('spools_code_uq').on(t.workspaceId, t.code)]);

/** Directorio liviano de proveedores y tiendas (N4b): solo para elegir «dónde compré». */
export const suppliers = pgTable('suppliers', {
  ...base(),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('tienda'), // tienda_especializada | marketplace | fabricante | importacion | minorista
  country: text('country').notNull().default('CL'),
  city: text('city'),
  url: text('url'),
  channels: jsonb('channels').$type<string[]>().default([]),
  brands: jsonb('brands').$type<string[]>().default([]),
  notes: text('notes'),
  verified: boolean('verified').notNull().default(false),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  verifiedBy: uuid('verified_by'),
  active: boolean('active').notNull().default(true),
}, (t) => [uniqueIndex('suppliers_name_uq').on(t.workspaceId, t.name)]);

export const inventoryItems = pgTable('inventory_items', {
  ...base(),
  category: text('category').notNull().default('insumo'), // repuesto | insumo | embalaje
  sku: text('sku'),
  name: text('name').notNull(),
  unit: text('unit').notNull().default('un'),
  stock: doublePrecision('stock').notNull().default(0),
  minStock: doublePrecision('min_stock').notNull().default(0),
  unitCost: integer('unit_cost').notNull().default(0),
  supplierText: text('supplier_text'),
  location: text('location'),
});

export const inventoryMovements = pgTable('inventory_movements', {
  ...base(),
  kind: text('kind').notNull(), // entrada | consumo | falla | ajuste | reserva | transferencia | descarte
  spoolId: uuid('spool_id'),
  itemId: uuid('item_id'),
  qty: doublePrecision('qty').notNull(), // gramos (bobinas) o unidades (ítems); negativo = salida
  unitCost: integer('unit_cost'),
  jobId: uuid('job_id'),
  saleId: uuid('sale_id'),
  note: text('note'),
});

/* ───────────── Máquinas y mantenimiento ───────────── */
export const machines = pgTable('machines', {
  ...base(),
  name: text('name').notNull(),
  brand: text('brand'),
  model: text('model'),
  tech: text('tech').notNull().default('FDM'), // FDM | SLA | SLS
  serial: text('serial'),
  volX: doublePrecision('vol_x').notNull().default(220),
  volY: doublePrecision('vol_y').notNull().default(220),
  volZ: doublePrecision('vol_z').notNull().default(250),
  nozzles: jsonb('nozzles').$type<string[]>().default(['0.4']),
  materialsOk: jsonb('materials_ok').$type<string[]>().default(['PLA']),
  multicolorSlots: integer('multicolor_slots').notNull().default(1),
  heatedBed: boolean('heated_bed').notNull().default(true),
  enclosed: boolean('enclosed').notNull().default(false),
  purchaseValue: integer('purchase_value').notNull().default(0),
  residualValue: integer('residual_value').notNull().default(0),
  lifeHours: integer('life_hours').notNull().default(5000),
  watts: integer('watts').notNull().default(150),
  maintCostHour: integer('maint_cost_hour').notNull().default(0),
  hoursTotal: doublePrecision('hours_total').notNull().default(0),
  jobsOk: integer('jobs_ok').notNull().default(0),
  jobsFailed: integer('jobs_failed').notNull().default(0),
  status: text('status').notNull().default('disponible'), // disponible | imprimiendo | pausada | mantenimiento | fuera_de_servicio
  simulated: boolean('simulated').notNull().default(false),
  machineProfileId: uuid('machine_profile_id'),
  defaultProcessProfileId: uuid('default_process_profile_id'),
  /** Por boquilla: qué perfil de impresora y qué calidad por defecto usar cuando esa boquilla está puesta (machineProfileId/defaultProcessProfileId reflejan la boquilla activa). */
  nozzleSetups: jsonb('nozzle_setups').$type<Record<string, { machineProfileId: string; processProfileId: string | null }>>().default({}),
  feedGph: doublePrecision('feed_gph').notNull().default(25), // g/h típicos para estimar sin laminar
  timeFactor: doublePrecision('time_factor').notNull().default(1), // mediana(tiempo real ÷ estimado) de los últimos 20 trabajos
  connection: jsonb('connection').$type<Record<string, any>>().default({}),
  photoKey: text('photo_key'),
});

export const maintenancePlans = pgTable('maintenance_plans', {
  ...base(),
  machineId: uuid('machine_id').notNull(),
  task: text('task').notNull(),
  intervalHours: integer('interval_hours'),
  intervalDays: integer('interval_days'),
  lastDoneHours: doublePrecision('last_done_hours').notNull().default(0),
  lastDoneAt: date('last_done_at'),
});

export const maintenanceLogs = pgTable('maintenance_logs', {
  ...base(),
  machineId: uuid('machine_id').notNull(),
  planId: uuid('plan_id'),
  task: text('task').notNull(),
  doneAt: date('done_at').notNull(),
  atHours: doublePrecision('at_hours').notNull().default(0),
  cost: integer('cost').notNull().default(0),
  downtimeH: doublePrecision('downtime_h').notNull().default(0),
  parts: jsonb('parts').$type<Array<{ itemId: string; name: string; qty: number }>>().default([]),
  notes: text('notes'),
});

export const incidents = pgTable('incidents', {
  ...base(),
  machineId: uuid('machine_id').notNull(),
  kind: text('kind'),
  description: text('description').notNull(),
  photoKey: text('photo_key'),
});

/* ───────────── Archivos 3D ───────────── */
export const modelFiles = pgTable('model_files', {
  ...base(),
  name: text('name').notNull(),
  /** Orientación automática al laminar (--orient): se recuerda por modelo. */
  autoOrient: boolean('auto_orient').notNull().default(false),
  folder: text('folder'),
  tags: jsonb('tags').$type<string[]>().default([]),
  tagMeta: jsonb('tag_meta').$type<Record<string, { source: string; confidence?: number }>>().default({}), // procedencia de cada etiqueta (manual | ia | import | regla)
  sourceId: uuid('source_id'),
  favorite: boolean('favorite').notNull().default(false),
  license: text('license').default('propia'),
  origin: text('origin'),
  author: text('author'),
  customerId: uuid('customer_id'),
  hash: text('hash'),
  format: text('format'),
  dimX: doublePrecision('dim_x'), dimY: doublePrecision('dim_y'), dimZ: doublePrecision('dim_z'),
  volumeCm3: doublePrecision('volume_cm3'),
  areaCm2: doublePrecision('area_cm2'),
  triangles: integer('triangles'),
  closed: boolean('closed'),
  currentVersionId: uuid('current_version_id'),
}, (t) => [index('model_files_hash_ix').on(t.hash)]);

/** De dónde salió un modelo (MakerWorld, Printables…): metadatos públicos, licencia y uso comercial (N3). */
export const modelSources = pgTable('model_sources', {
  ...base(),
  provider: text('provider').notNull().default('otro'), // makerworld | printables | thingiverse | otro
  url: text('url').notNull(),
  externalId: text('external_id'),
  title: text('title'),
  description: text('description'),
  authorName: text('author_name'),
  authorUid: text('author_uid'),
  authorUrl: text('author_url'),
  licenseCode: text('license_code').notNull().default('desconocida'),
  licenseText: text('license_text'),
  commercialUse: text('commercial_use').notNull().default('desconocido'), // si | no | requiere_membresia | desconocido
  tags: jsonb('tags').$type<string[]>().default([]),
  images: jsonb('images').$type<Array<{ url: string }>>().default([]),
  plates: jsonb('plates').$type<Array<Record<string, unknown>>>().default([]),
  stats: jsonb('stats').$type<Record<string, number>>().default({}),
  remoteCreatedAt: text('remote_created_at'),
  remoteUpdatedAt: text('remote_updated_at'),
  raw: jsonb('raw').$type<unknown>(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }),
  fetchStatus: text('fetch_status').notNull().default('error'), // ok | parcial | error
}, (t) => [index('model_sources_url_ix').on(t.url)]);

export const fileVersions = pgTable('file_versions', {
  ...base(),
  modelFileId: uuid('model_file_id').notNull(),
  number: integer('number').notNull().default(1),
  storageKey: text('storage_key').notNull(),
  format: text('format').notNull(),
  size: integer('size').notNull().default(0),
  sha256: text('sha256'),
  thumbKey: text('thumb_key'),
  meta: jsonb('meta').$type<Record<string, any>>().default({}), // análisis + metadatos del laminador
  comment: text('comment'),
});

/* ───────────── Laminador ───────────── */
export const slicerProfiles = pgTable('slicer_profiles', {
  ...base(),
  type: text('type').notNull(), // machine | process | filament
  name: text('name').notNull(),
  vendor: text('vendor'),
  baseName: text('base_name').notNull(), // perfil de fábrica de OrcaSlicer
  nozzle: text('nozzle'), // boquilla (mm) para la que sirve: impresoras y calidades; se deduce de la base si está vacío
  changes: jsonb('changes').$type<Record<string, any>>().notNull().default({}),
  version: integer('version').notNull().default(1),
  simulated: boolean('simulated').notNull().default(false),
  imported: boolean('imported').notNull().default(false),
  notes: text('notes'),
});

export const slicerProfileVersions = pgTable('slicer_profile_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  profileId: uuid('profile_id').notNull(),
  version: integer('version').notNull(),
  baseName: text('base_name').notNull(),
  changes: jsonb('changes').$type<Record<string, any>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  note: text('note'),
});

export const sliceRuns = pgTable('slice_runs', {
  ...base(),
  fileVersionId: uuid('file_version_id').notNull(),
  machineProfileId: uuid('machine_profile_id'),
  processProfileId: uuid('process_profile_id'),
  filamentProfileId: uuid('filament_profile_id'),
  profileVersions: jsonb('profile_versions').$type<Record<string, any>>().default({}),
  cacheKey: text('cache_key'),
  copies: integer('copies').notNull().default(1),
  engineVersion: text('engine_version'),
  status: text('status').notNull().default('queued'), // queued | running | done | error | cancelado
  /** Ajustes de sesión del Estudio: se aplican sobre los perfiles sin crear perfiles nuevos. */
  inputs: jsonb('inputs').$type<{ overrides?: { machine?: Record<string, any>; process?: Record<string, any>; filament?: Record<string, any> } }>().default({}),
  error: text('error'),
  timeS: integer('time_s'),
  filament: jsonb('filament').$type<Array<{ g: number; mm: number; cm3: number }>>().default([]),
  layers: integer('layers'),
  plates: integer('plates'),
  durationMs: integer('duration_ms'),
  gcodeKey: text('gcode_key'),
  threemfKey: text('threemf_key'),
  label: text('label'),
  groupId: text('group_id'), // comparador
  result: jsonb('result').$type<Record<string, any>>().default({}),
}, (t) => [index('slice_runs_cache_ix').on(t.cacheKey)]);

/* ───────────── Presupuestos y pedidos ───────────── */
export const quotes = pgTable('quotes', {
  ...base(),
  number: text('number').notNull(),
  version: integer('version').notNull().default(1),
  rootId: uuid('root_id'), // primera versión del presupuesto
  status: text('status').notNull().default('borrador'), // borrador | enviado | aprobado | rechazado | vencido | reemplazado
  customerId: uuid('customer_id'),
  customerName: text('customer_name'),
  customerPhone: text('customer_phone'),
  source: text('source'),
  title: text('title'),
  validUntil: date('valid_until'),
  urgency: text('urgency').notNull().default('normal'),
  suggestedTotal: integer('suggested_total').notNull().default(0),
  finalTotal: integer('final_total'), // si el usuario fija el total
  discount: integer('discount').notNull().default(0),
  taxAmount: integer('tax_amount').notNull().default(0),
  applyTax: boolean('apply_tax').notNull().default(false), // casilla «+ IVA» (modelo de precios 'neto')
  docTemplate: jsonb('doc_template').$type<Record<string, unknown> | null>(), // plantilla de documento congelada al enviar (N7)
  pdfKey: text('pdf_key'), // copia del PDF entregada al cliente
  total: integer('total').notNull().default(0),
  costTotal: integer('cost_total').notNull().default(0),
  priceReason: text('price_reason'),
  notes: text('notes'),
  approvedBy: text('approved_by'),
  approvedChannel: text('approved_channel'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  frozen: boolean('frozen').notNull().default(false),
  calc: jsonb('calc').$type<Record<string, any>>().default({}),
}, (t) => [index('quotes_status_ix').on(t.status)]);

export const quoteItems = pgTable('quote_items', {
  ...base(),
  quoteId: uuid('quote_id').notNull(),
  position: integer('position').notNull().default(0),
  kind: text('kind').notNull().default('modelo'), // modelo | placa | manual | producto
  description: text('description').notNull().default(''),
  qty: integer('qty').notNull().default(1),
  optional: boolean('optional').notNull().default(false),
  groupName: text('group_name'),
  materialId: uuid('material_id'),
  color: text('color'),
  machineId: uuid('machine_id'),
  processProfileId: uuid('process_profile_id'),
  mode: text('mode').notNull().default('manual'), // auto | semi | manual
  gramsTotal: doublePrecision('grams_total').notNull().default(0),
  hoursTotal: doublePrecision('hours_total').notNull().default(0),
  origin: jsonb('origin').$type<Record<string, any>>().default({}), // origen de cada valor
  postMinutes: integer('post_minutes').notNull().default(0),
  postSupplies: integer('post_supplies').notNull().default(0),
  prepMinutes: integer('prep_minutes').notNull().default(10),
  shipping: integer('shipping').notNull().default(0),
  costBreakdown: jsonb('cost_breakdown').$type<Record<string, any>>().default({}),
  suggestedUnit: integer('suggested_unit').notNull().default(0),
  finalUnit: integer('final_unit'), // lo decide el usuario; null = usa el sugerido
  sliceRunId: uuid('slice_run_id'),
  variantId: uuid('variant_id'),
});

export const quoteItemModels = pgTable('quote_item_models', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  quoteItemId: uuid('quote_item_id'),
  orderItemId: uuid('order_item_id'),
  modelFileId: uuid('model_file_id').notNull(),
  fileVersionId: uuid('file_version_id'),
  qty: integer('qty').notNull().default(1),
  position: integer('position').notNull().default(0),
});

export const referenceLinks = pgTable('reference_links', {
  ...base(),
  url: text('url').notNull(),
  title: text('title'),
  kind: text('kind').notNull().default('otro'), // modelo_original | inspiracion | requerimiento | otro
  note: text('note'),
  imageUrl: text('image_url'),
  showInPdf: boolean('show_in_pdf').notNull().default(false),
  ownerType: text('owner_type').notNull(), // quote | quote_item | order | order_item | model_file | product
  ownerId: uuid('owner_id').notNull(),
}, (t) => [index('ref_links_owner_ix').on(t.ownerType, t.ownerId)]);

export const priceAdjustments = pgTable('price_adjustments', {
  ...base(),
  ownerType: text('owner_type').notNull(),
  ownerId: uuid('owner_id').notNull(),
  suggested: integer('suggested').notNull().default(0),
  previous: integer('previous'),
  next: integer('next'),
  reason: text('reason'),
  belowCost: boolean('below_cost').notNull().default(false),
  authorizedBy: uuid('authorized_by'),
});

export const orders = pgTable('orders', {
  ...base(),
  number: text('number').notNull(),
  kind: text('kind').notNull().default('a_medida'), // a_medida | mixto | solo_stock
  status: text('status').notNull().default('recibido'), // recibido | en_produccion | post_proceso | listo | entregado | cancelado
  customerId: uuid('customer_id'),
  customerName: text('customer_name'),
  customerPhone: text('customer_phone'),
  quoteId: uuid('quote_id'),
  source: text('source'), // origen: whatsapp, instagram...
  priority: text('priority').notNull().default('normal'),
  dueDate: date('due_date'),
  title: text('title'),
  total: integer('total').notNull().default(0),
  taxAmount: integer('tax_amount').notNull().default(0), // IVA cobrado dentro del total (modelo 'neto')
  costEstimated: integer('cost_estimated').notNull().default(0),
  costReal: integer('cost_real'),
  paid: integer('paid').notNull().default(0),
  shipAddress: text('ship_address'),
  shipMethod: text('ship_method'), // retiro | despacho
  tracking: text('tracking'),
  notes: text('notes'),
  approvedBy: text('approved_by'),
  approvedChannel: text('approved_channel'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  canceledReason: text('canceled_reason'),
}, (t) => [index('orders_status_ix').on(t.status)]);

export const orderItems = pgTable('order_items', {
  ...base(),
  orderId: uuid('order_id').notNull(),
  position: integer('position').notNull().default(0),
  kind: text('kind').notNull().default('modelo'), // modelo | placa | manual | producto
  description: text('description').notNull().default(''),
  qty: integer('qty').notNull().default(1),
  materialId: uuid('material_id'),
  color: text('color'),
  machineId: uuid('machine_id'),
  processProfileId: uuid('process_profile_id'),
  gramsTotal: doublePrecision('grams_total').notNull().default(0),
  hoursTotal: doublePrecision('hours_total').notNull().default(0),
  costBreakdown: jsonb('cost_breakdown').$type<Record<string, any>>().default({}),
  suggestedUnit: integer('suggested_unit').notNull().default(0),
  finalUnit: integer('final_unit').notNull().default(0),
  costUnit: integer('cost_unit').notNull().default(0),
  variantId: uuid('variant_id'),
  fromStock: integer('from_stock').notNull().default(0), // unidades que salen de stock
  status: text('status').notNull().default('pendiente'), // pendiente | en_cola | imprimiendo | post_proceso | listo | entregado
  sliceRunId: uuid('slice_run_id'),
});

/* ───────────── Producción ───────────── */
export const productionOrders = pgTable('production_orders', {
  ...base(),
  number: text('number').notNull(),
  variantId: uuid('variant_id').notNull(),
  qty: integer('qty').notNull().default(1),
  qtyGood: integer('qty_good').notNull().default(0),
  qtyFailed: integer('qty_failed').notNull().default(0),
  status: text('status').notNull().default('planificada'), // planificada | en_cola | imprimiendo | terminada | cancelada
  origin: text('origin').notNull().default('manual'), // manual | reposicion
  notes: text('notes'),
});

export const printJobs = pgTable('print_jobs', {
  ...base(),
  number: text('number').notNull(),
  kind: text('kind').notNull().default('pedido'), // pedido | stock | prueba
  title: text('title'),
  status: text('status').notNull().default('en_cola'), // en_cola | imprimiendo | pausado | terminado | fallido | cancelado
  machineId: uuid('machine_id'),
  spoolId: uuid('spool_id'),
  materialId: uuid('material_id'),
  position: integer('position').notNull().default(0),
  plannedStart: timestamp('planned_start', { withTimezone: true }),
  plannedEnd: timestamp('planned_end', { withTimezone: true }),
  realStart: timestamp('real_start', { withTimezone: true }),
  realEnd: timestamp('real_end', { withTimezone: true }),
  estG: doublePrecision('est_g').notNull().default(0),
  realG: doublePrecision('real_g'),
  estH: doublePrecision('est_h').notNull().default(0),
  realH: doublePrecision('real_h'),
  result: text('result'), // exito | falla_parcial | falla_total
  failCause: text('fail_cause'),
  failCode: text('fail_code'), // catálogo cerrado (lib/production/fail-causes.ts); fail_cause guarda el detalle libre
  failCharge: text('fail_charge'), // taller | pedido
  reprintOfId: uuid('reprint_of_id'),
  sliceRunId: uuid('slice_run_id'),
  fileVersionId: uuid('file_version_id'),
  productionOrderId: uuid('production_order_id'),
  orderId: uuid('order_id'),
  notes: text('notes'),
  qty: integer('qty').notNull().default(1),
});

export const jobItems = pgTable('job_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  jobId: uuid('job_id').notNull(),
  orderItemId: uuid('order_item_id'),
  qty: integer('qty').notNull().default(1),
});

/* ───────────── Catálogo y ventas ───────────── */
export const products = pgTable('products', {
  ...base(),
  name: text('name').notNull(),
  category: text('category'),
  description: text('description'),
  mode: text('mode').notNull().default('simple'), // simple | variantes
  status: text('status').notNull().default('activo'), // borrador | activo | descontinuado
  modelFileId: uuid('model_file_id'),
  processProfileId: uuid('process_profile_id'),
  tags: jsonb('tags').$type<string[]>().default([]),
  attributes: jsonb('attributes').$type<Array<{ name: string; values: string[] }>>().default([]),
  photoKey: text('photo_key'),
});

export const productVariants = pgTable('product_variants', {
  ...base(),
  productId: uuid('product_id').notNull(),
  sku: text('sku').notNull(),
  barcode: text('barcode'),
  attrs: jsonb('attrs').$type<Record<string, string>>().default({}),
  stock: integer('stock').notNull().default(0),
  reserved: integer('reserved').notNull().default(0),
  minStock: integer('min_stock').notNull().default(0),
  location: text('location'),
  price: integer('price').notNull().default(0),
  priceByChannel: jsonb('price_by_channel').$type<Record<string, number>>().default({}),
  avgCost: integer('avg_cost').notNull().default(0),
  weightG: doublePrecision('weight_g').notNull().default(0),
  printH: doublePrecision('print_h').notNull().default(0),
  materialId: uuid('material_id'),
  active: boolean('active').notNull().default(true),
}, (t) => [uniqueIndex('variants_sku_uq').on(t.workspaceId, t.sku)]);

export const stockMovements = pgTable('stock_movements', {
  ...base(),
  variantId: uuid('variant_id').notNull(),
  kind: text('kind').notNull(), // produccion | venta | merma | muestra | uso_interno | ajuste | devolucion | reserva
  qty: integer('qty').notNull(), // positivo entra, negativo sale
  unitCost: integer('unit_cost'),
  reason: text('reason'),
  orderId: uuid('order_id'),
  saleId: uuid('sale_id'),
  productionOrderId: uuid('production_order_id'),
});

export const sales = pgTable('sales', {
  ...base(),
  number: text('number').notNull(),
  channelId: uuid('channel_id'),
  customerId: uuid('customer_id'),
  customerName: text('customer_name'),
  date: date('date').notNull(),
  subtotal: integer('subtotal').notNull().default(0),
  commission: integer('commission').notNull().default(0),
  shipping: integer('shipping').notNull().default(0),
  total: integer('total').notNull().default(0),
  costTotal: integer('cost_total').notNull().default(0),
  netMargin: integer('net_margin').notNull().default(0),
  status: text('status').notNull().default('registrada'), // registrada | por_despachar | despachada | entregada | anulada
  externalOrder: text('external_order'),
  tracking: text('tracking'),
  shipBy: date('ship_by'),
  paid: integer('paid').notNull().default(0),
  notes: text('notes'),
});

export const saleItems = pgTable('sale_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  saleId: uuid('sale_id').notNull(),
  variantId: uuid('variant_id').notNull(),
  description: text('description'),
  qty: integer('qty').notNull().default(1),
  listPrice: integer('list_price').notNull().default(0),
  unitPrice: integer('unit_price').notNull().default(0),
  frozenCost: integer('frozen_cost').notNull().default(0),
});

export const payments = pgTable('payments', {
  ...base(),
  orderId: uuid('order_id'),
  saleId: uuid('sale_id'),
  amount: integer('amount').notNull(),
  method: text('method').notNull().default('transferencia'),
  paidAt: date('paid_at').notNull(),
  receiptKey: text('receipt_key'),
  taxDocType: text('tax_doc_type'),
  taxDocFolio: text('tax_doc_folio'),
  note: text('note'),
});

/* ───────────── Galería ───────────── */
export const photos = pgTable('photos', {
  ...base(),
  kind: text('kind').notNull().default('foto'), // foto | video
  storageKey: text('storage_key').notNull(),
  variants: jsonb('variants').$type<Record<string, string>>().default({}),
  width: integer('width'),
  height: integer('height'),
  stage: text('stage').notNull().default('producto_final'),
  featured: boolean('featured').notNull().default(false),
  tags: jsonb('tags').$type<string[]>().default([]),
  caption: text('caption'),
  orderId: uuid('order_id'),
  jobId: uuid('job_id'),
  modelFileId: uuid('model_file_id'),
  customerId: uuid('customer_id'),
  productId: uuid('product_id'),
  materialId: uuid('material_id'),
  machineId: uuid('machine_id'),
  internalOnly: boolean('internal_only').notNull().default(false),
  publish: jsonb('publish').$type<Record<string, { status: string; url?: string }>>().default({}),
  suggestedText: text('suggested_text'),
  takenAt: timestamp('taken_at', { withTimezone: true }).notNull().defaultNow(),
});

export const collections = pgTable('collections', {
  ...base(),
  name: text('name').notNull(),
  description: text('description'),
});
export const collectionPhotos = pgTable('collection_photos', {
  collectionId: uuid('collection_id').notNull(),
  photoId: uuid('photo_id').notNull(),
}, (t) => [primaryKey({ columns: [t.collectionId, t.photoId] })]);

/* ───────────── Transversal ───────────── */
export const activityLog = pgTable('activity_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  action: text('action').notNull(),
  changes: jsonb('changes').$type<Record<string, any>>().default({}),
  userId: uuid('user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('activity_entity_ix').on(t.entity, t.entityId)]);

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  userId: uuid('user_id'),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  href: text('href'),
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const uploadSessions = pgTable('upload_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  filename: text('filename').notNull(),
  size: integer('size').notNull(),
  received: integer('received').notNull().default(0),
  chunks: integer('chunks').notNull().default(0),
  tmpPath: text('tmp_path').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Impresoras conectadas por red (por ahora Bambu Lab en modo LAN). El código de acceso se guarda cifrado. */
export const printerLinks = pgTable('printer_links', {
  ...base(),
  machineId: uuid('machine_id').notNull(),
  vendor: text('vendor').notNull().default('bambu'),
  mode: text('mode').notNull().default('lan'), // lan | cloud
  cloudAccountId: uuid('cloud_account_id'),
  serial: text('serial').notNull(),
  host: text('host'), // IP en modo LAN; vacío en modo nube
  accessCodeEnc: text('access_code_enc').notNull(),
  model: text('model'), // código de modelo (C12, N1, BL-P001…)
  name: text('name'),
  mqttPort: integer('mqtt_port').notNull().default(8883),
  cameraPort: integer('camera_port'),
  ftpPort: integer('ftp_port').notNull().default(990),
  urlPrefix: text('url_prefix').notNull().default('file:///sdcard/'),
  fingerprint: text('fingerprint'), // huella SHA-256 del certificado (confianza en el primer uso)
  enabled: boolean('enabled').notNull().default(true),
  syncQueue: boolean('sync_queue').notNull().default(true),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  lastStatus: jsonb('last_status').$type<Record<string, any>>(),
  lastError: text('last_error'),
}, (t) => [uniqueIndex('printer_links_serial_uq').on(t.workspaceId, t.serial)]);

/** Cuentas de Bambu Cloud. Nunca se guarda la contraseña: solo el token de acceso, cifrado. */
export const cloudAccounts = pgTable('cloud_accounts', {
  ...base(),
  vendor: text('vendor').notNull().default('bambu'),
  region: text('region').notNull().default('global'), // global | china
  email: text('email').notNull(),
  displayName: text('display_name'),
  uid: text('uid'),
  username: text('username'), // u_<uid> para MQTT
  tokenEnc: text('token_enc'),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  status: text('status').notNull().default('activa'), // activa | expirada | cerrada
  lastError: text('last_error'),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
});

/* ───────────── IA opcional (Fase 0) ───────────── */
/** Propuestas generadas por IA y su ciclo de vida. Nada se aplica sin confirmación humana. */
export const aiSuggestions = pgTable('ai_suggestions', {
  ...base(),
  feature: text('feature').notNull(),
  subjectType: text('subject_type'),
  subjectId: uuid('subject_id'),
  inputHash: text('input_hash').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  promptVersion: text('prompt_version').notNull(),
  proposal: jsonb('proposal').$type<Record<string, any>>().notNull().default({}),
  rationale: jsonb('rationale').$type<Record<string, any>>().default({}),
  status: text('status').notNull().default('proposed'), // proposed | applied | rejected | expired | superseded
  appliedAt: timestamp('applied_at', { withTimezone: true }),
  appliedBy: uuid('applied_by'),
  outcome: jsonb('outcome').$type<Record<string, any>>().default({}),
}, (t) => [index('ai_suggestions_subject_ix').on(t.subjectType, t.subjectId), index('ai_suggestions_hash_ix').on(t.inputHash)]);

/** Telemetría de uso y costo de cada llamada al proveedor (el contenido solo se guarda si la retención lo permite). */
export const aiCalls = pgTable('ai_calls', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  userId: uuid('user_id'),
  feature: text('feature').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  tier: text('tier').notNull().default('fast'),
  inTokens: integer('in_tokens').notNull().default(0),
  outTokens: integer('out_tokens').notNull().default(0),
  costUsd: doublePrecision('cost_usd').notNull().default(0),
  latencyMs: integer('latency_ms').notNull().default(0),
  ok: boolean('ok').notNull().default(true),
  error: text('error'),
  cacheHit: boolean('cache_hit').notNull().default(false),
  promptLog: jsonb('prompt_log').$type<Record<string, any>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('ai_calls_created_ix').on(t.createdAt)]);

/** Cola persistente de trabajos en segundo plano (análisis de archivos, etc.): sobrevive a reinicios y reintenta con espera. */
export const jobs = pgTable('jobs', {
  ...base(),
  kind: text('kind').notNull(), // file.process
  payload: jsonb('payload').$type<Record<string, any>>().notNull().default({}),
  status: text('status').notNull().default('queued'), // queued | running | done | error
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  error: text('error'),
  runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
}, (t) => [index('jobs_status_ix').on(t.status, t.runAfter)]);

/** Calidades por intención (borrador, estándar, fino…): definiciones relativas a la boquilla que se materializan como perfiles de proceso. */
export const qualityPresets = pgTable('quality_presets', {
  ...base(),
  key: text('key').notNull(),
  label: text('label'), // null en las de fábrica: se usa la traducción
  builtin: boolean('builtin').notNull().default(false),
  layerFactor: doublePrecision('layer_factor').notNull(), // altura de capa = boquilla × factor
  wallMm: doublePrecision('wall_mm').notNull(),
  wallNozzles: doublePrecision('wall_nozzles'), // pared mínima en múltiplos de la boquilla
  topMm: doublePrecision('top_mm').notNull(),
  bottomMm: doublePrecision('bottom_mm').notNull(),
  infill: text('infill').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
}, (t) => [uniqueIndex('quality_presets_key_uq').on(t.workspaceId, t.key)]);
