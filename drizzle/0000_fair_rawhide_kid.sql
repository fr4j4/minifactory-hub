CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"action" text NOT NULL,
	"changes" jsonb DEFAULT '{}'::jsonb,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_photos" (
	"collection_id" uuid NOT NULL,
	"photo_id" uuid NOT NULL,
	CONSTRAINT "collection_photos_collection_id_photo_id_pk" PRIMARY KEY("collection_id","photo_id")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "contact_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"customer_id" uuid,
	"quote_id" uuid,
	"order_id" uuid,
	"channel" text,
	"summary" text NOT NULL,
	"attachment_key" text
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"type" text DEFAULT 'particular' NOT NULL,
	"is_occasional" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"tax_id" text,
	"email" text,
	"addresses" jsonb DEFAULT '[]'::jsonb,
	"price_list_id" uuid,
	"photo_consent" text DEFAULT 'unknown' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"notes" text,
	"deposit_pct" double precision
);
--> statement-breakpoint
CREATE TABLE "file_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"model_file_id" uuid NOT NULL,
	"number" integer DEFAULT 1 NOT NULL,
	"storage_key" text NOT NULL,
	"format" text NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"sha256" text,
	"thumb_key" text,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"comment" text
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"machine_id" uuid NOT NULL,
	"kind" text,
	"description" text NOT NULL,
	"photo_key" text
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"category" text DEFAULT 'insumo' NOT NULL,
	"sku" text,
	"name" text NOT NULL,
	"unit" text DEFAULT 'un' NOT NULL,
	"stock" double precision DEFAULT 0 NOT NULL,
	"min_stock" double precision DEFAULT 0 NOT NULL,
	"unit_cost" integer DEFAULT 0 NOT NULL,
	"supplier_text" text,
	"location" text
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"kind" text NOT NULL,
	"spool_id" uuid,
	"item_id" uuid,
	"qty" double precision NOT NULL,
	"unit_cost" integer,
	"job_id" uuid,
	"sale_id" uuid,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "job_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"order_item_id" uuid,
	"qty" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "machines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"brand" text,
	"model" text,
	"tech" text DEFAULT 'FDM' NOT NULL,
	"serial" text,
	"vol_x" double precision DEFAULT 220 NOT NULL,
	"vol_y" double precision DEFAULT 220 NOT NULL,
	"vol_z" double precision DEFAULT 250 NOT NULL,
	"nozzles" jsonb DEFAULT '["0.4"]'::jsonb,
	"materials_ok" jsonb DEFAULT '["PLA"]'::jsonb,
	"multicolor_slots" integer DEFAULT 1 NOT NULL,
	"heated_bed" boolean DEFAULT true NOT NULL,
	"enclosed" boolean DEFAULT false NOT NULL,
	"purchase_value" integer DEFAULT 0 NOT NULL,
	"residual_value" integer DEFAULT 0 NOT NULL,
	"life_hours" integer DEFAULT 5000 NOT NULL,
	"watts" integer DEFAULT 150 NOT NULL,
	"maint_cost_hour" integer DEFAULT 0 NOT NULL,
	"hours_total" double precision DEFAULT 0 NOT NULL,
	"jobs_ok" integer DEFAULT 0 NOT NULL,
	"jobs_failed" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'disponible' NOT NULL,
	"simulated" boolean DEFAULT false NOT NULL,
	"machine_profile_id" uuid,
	"default_process_profile_id" uuid,
	"feed_gph" double precision DEFAULT 25 NOT NULL,
	"time_factor" double precision DEFAULT 1 NOT NULL,
	"connection" jsonb DEFAULT '{}'::jsonb,
	"photo_key" text
);
--> statement-breakpoint
CREATE TABLE "maintenance_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"machine_id" uuid NOT NULL,
	"plan_id" uuid,
	"task" text NOT NULL,
	"done_at" date NOT NULL,
	"at_hours" double precision DEFAULT 0 NOT NULL,
	"cost" integer DEFAULT 0 NOT NULL,
	"downtime_h" double precision DEFAULT 0 NOT NULL,
	"parts" jsonb DEFAULT '[]'::jsonb,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "maintenance_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"machine_id" uuid NOT NULL,
	"task" text NOT NULL,
	"interval_hours" integer,
	"interval_days" integer,
	"last_done_hours" double precision DEFAULT 0 NOT NULL,
	"last_done_at" date
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"tech" text DEFAULT 'fdm' NOT NULL,
	"manufacturer" text,
	"line" text,
	"type" text NOT NULL,
	"color_name" text NOT NULL,
	"hex" text DEFAULT '#888888' NOT NULL,
	"diameter" double precision DEFAULT 1.75,
	"density" double precision DEFAULT 1.24 NOT NULL,
	"cost_per_kg" integer DEFAULT 0 NOT NULL,
	"stock_min_g" integer DEFAULT 1000 NOT NULL,
	"temp_nozzle" text,
	"temp_bed" text,
	"supplier_text" text,
	"filament_profile_id" uuid,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "model_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"folder" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"favorite" boolean DEFAULT false NOT NULL,
	"license" text DEFAULT 'propia',
	"origin" text,
	"author" text,
	"customer_id" uuid,
	"hash" text,
	"format" text,
	"dim_x" double precision,
	"dim_y" double precision,
	"dim_z" double precision,
	"volume_cm3" double precision,
	"area_cm2" double precision,
	"triangles" integer,
	"closed" boolean,
	"current_version_id" uuid
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"href" text,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"order_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"kind" text DEFAULT 'modelo' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"material_id" uuid,
	"color" text,
	"machine_id" uuid,
	"process_profile_id" uuid,
	"grams_total" double precision DEFAULT 0 NOT NULL,
	"hours_total" double precision DEFAULT 0 NOT NULL,
	"cost_breakdown" jsonb DEFAULT '{}'::jsonb,
	"suggested_unit" integer DEFAULT 0 NOT NULL,
	"final_unit" integer DEFAULT 0 NOT NULL,
	"cost_unit" integer DEFAULT 0 NOT NULL,
	"variant_id" uuid,
	"from_stock" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"slice_run_id" uuid
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"number" text NOT NULL,
	"kind" text DEFAULT 'a_medida' NOT NULL,
	"status" text DEFAULT 'recibido' NOT NULL,
	"customer_id" uuid,
	"customer_name" text,
	"customer_phone" text,
	"quote_id" uuid,
	"source" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"due_date" date,
	"title" text,
	"total" integer DEFAULT 0 NOT NULL,
	"cost_estimated" integer DEFAULT 0 NOT NULL,
	"cost_real" integer,
	"paid" integer DEFAULT 0 NOT NULL,
	"ship_address" text,
	"ship_method" text,
	"tracking" text,
	"notes" text,
	"approved_by" text,
	"approved_channel" text,
	"approved_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"canceled_reason" text
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"order_id" uuid,
	"sale_id" uuid,
	"amount" integer NOT NULL,
	"method" text DEFAULT 'transferencia' NOT NULL,
	"paid_at" date NOT NULL,
	"receipt_key" text,
	"tax_doc_type" text,
	"tax_doc_folio" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"kind" text DEFAULT 'foto' NOT NULL,
	"storage_key" text NOT NULL,
	"variants" jsonb DEFAULT '{}'::jsonb,
	"width" integer,
	"height" integer,
	"stage" text DEFAULT 'producto_final' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"caption" text,
	"order_id" uuid,
	"job_id" uuid,
	"model_file_id" uuid,
	"customer_id" uuid,
	"product_id" uuid,
	"material_id" uuid,
	"machine_id" uuid,
	"internal_only" boolean DEFAULT false NOT NULL,
	"publish" jsonb DEFAULT '{}'::jsonb,
	"suggested_text" text,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"owner_type" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"suggested" integer DEFAULT 0 NOT NULL,
	"previous" integer,
	"next" integer,
	"reason" text,
	"below_cost" boolean DEFAULT false NOT NULL,
	"authorized_by" uuid
);
--> statement-breakpoint
CREATE TABLE "price_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"adjust_pct" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "print_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"number" text NOT NULL,
	"kind" text DEFAULT 'pedido' NOT NULL,
	"title" text,
	"status" text DEFAULT 'en_cola' NOT NULL,
	"machine_id" uuid,
	"spool_id" uuid,
	"material_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"planned_start" timestamp with time zone,
	"planned_end" timestamp with time zone,
	"real_start" timestamp with time zone,
	"real_end" timestamp with time zone,
	"est_g" double precision DEFAULT 0 NOT NULL,
	"real_g" double precision,
	"est_h" double precision DEFAULT 0 NOT NULL,
	"real_h" double precision,
	"result" text,
	"fail_cause" text,
	"fail_charge" text,
	"reprint_of_id" uuid,
	"slice_run_id" uuid,
	"file_version_id" uuid,
	"production_order_id" uuid,
	"order_id" uuid,
	"notes" text,
	"qty" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"product_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"barcode" text,
	"attrs" jsonb DEFAULT '{}'::jsonb,
	"stock" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"min_stock" integer DEFAULT 0 NOT NULL,
	"location" text,
	"price" integer DEFAULT 0 NOT NULL,
	"price_by_channel" jsonb DEFAULT '{}'::jsonb,
	"avg_cost" integer DEFAULT 0 NOT NULL,
	"weight_g" double precision DEFAULT 0 NOT NULL,
	"print_h" double precision DEFAULT 0 NOT NULL,
	"material_id" uuid,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"number" text NOT NULL,
	"variant_id" uuid NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"qty_good" integer DEFAULT 0 NOT NULL,
	"qty_failed" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'planificada' NOT NULL,
	"origin" text DEFAULT 'manual' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"category" text,
	"description" text,
	"mode" text DEFAULT 'simple' NOT NULL,
	"status" text DEFAULT 'activo' NOT NULL,
	"model_file_id" uuid,
	"process_profile_id" uuid,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"attributes" jsonb DEFAULT '[]'::jsonb,
	"photo_key" text
);
--> statement-breakpoint
CREATE TABLE "quote_item_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"quote_item_id" uuid,
	"order_item_id" uuid,
	"model_file_id" uuid NOT NULL,
	"file_version_id" uuid,
	"qty" integer DEFAULT 1 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"quote_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"kind" text DEFAULT 'modelo' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"optional" boolean DEFAULT false NOT NULL,
	"group_name" text,
	"material_id" uuid,
	"color" text,
	"machine_id" uuid,
	"process_profile_id" uuid,
	"mode" text DEFAULT 'manual' NOT NULL,
	"grams_total" double precision DEFAULT 0 NOT NULL,
	"hours_total" double precision DEFAULT 0 NOT NULL,
	"origin" jsonb DEFAULT '{}'::jsonb,
	"post_minutes" integer DEFAULT 0 NOT NULL,
	"post_supplies" integer DEFAULT 0 NOT NULL,
	"prep_minutes" integer DEFAULT 10 NOT NULL,
	"shipping" integer DEFAULT 0 NOT NULL,
	"cost_breakdown" jsonb DEFAULT '{}'::jsonb,
	"suggested_unit" integer DEFAULT 0 NOT NULL,
	"final_unit" integer,
	"slice_run_id" uuid,
	"variant_id" uuid
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"number" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"root_id" uuid,
	"status" text DEFAULT 'borrador' NOT NULL,
	"customer_id" uuid,
	"customer_name" text,
	"customer_phone" text,
	"source" text,
	"title" text,
	"valid_until" date,
	"urgency" text DEFAULT 'normal' NOT NULL,
	"suggested_total" integer DEFAULT 0 NOT NULL,
	"final_total" integer,
	"discount" integer DEFAULT 0 NOT NULL,
	"tax_amount" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"cost_total" integer DEFAULT 0 NOT NULL,
	"price_reason" text,
	"notes" text,
	"approved_by" text,
	"approved_channel" text,
	"approved_at" timestamp with time zone,
	"frozen" boolean DEFAULT false NOT NULL,
	"calc" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "reference_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"url" text NOT NULL,
	"title" text,
	"kind" text DEFAULT 'otro' NOT NULL,
	"note" text,
	"image_url" text,
	"show_in_pdf" boolean DEFAULT false NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"description" text,
	"qty" integer DEFAULT 1 NOT NULL,
	"list_price" integer DEFAULT 0 NOT NULL,
	"unit_price" integer DEFAULT 0 NOT NULL,
	"frozen_cost" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"number" text NOT NULL,
	"channel_id" uuid,
	"customer_id" uuid,
	"customer_name" text,
	"date" date NOT NULL,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"commission" integer DEFAULT 0 NOT NULL,
	"shipping" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"cost_total" integer DEFAULT 0 NOT NULL,
	"net_margin" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'registrada' NOT NULL,
	"external_order" text,
	"tracking" text,
	"ship_by" date,
	"paid" integer DEFAULT 0 NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "sales_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"kind" text DEFAULT 'directo' NOT NULL,
	"commission_pct" double precision DEFAULT 0 NOT NULL,
	"commission_fixed" integer DEFAULT 0 NOT NULL,
	"avg_shipping" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequences" (
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"year" integer NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sequences_workspace_id_key_year_pk" PRIMARY KEY("workspace_id","key","year")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slice_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"file_version_id" uuid NOT NULL,
	"machine_profile_id" uuid,
	"process_profile_id" uuid,
	"filament_profile_id" uuid,
	"profile_versions" jsonb DEFAULT '{}'::jsonb,
	"cache_key" text,
	"copies" integer DEFAULT 1 NOT NULL,
	"engine_version" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"time_s" integer,
	"filament" jsonb DEFAULT '[]'::jsonb,
	"layers" integer,
	"plates" integer,
	"duration_ms" integer,
	"gcode_key" text,
	"threemf_key" text,
	"label" text,
	"group_id" text,
	"result" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "slicer_profile_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"base_name" text NOT NULL,
	"changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "slicer_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"vendor" text,
	"base_name" text NOT NULL,
	"changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"simulated" boolean DEFAULT false NOT NULL,
	"imported" boolean DEFAULT false NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "spools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"material_id" uuid NOT NULL,
	"code" text NOT NULL,
	"lot" text,
	"bought_at" date,
	"opened_at" date,
	"initial_g" double precision DEFAULT 1000 NOT NULL,
	"tare_g" double precision DEFAULT 200 NOT NULL,
	"remaining_g" double precision DEFAULT 1000 NOT NULL,
	"reserved_g" double precision DEFAULT 0 NOT NULL,
	"unit_cost" integer,
	"location" text,
	"status" text DEFAULT 'nueva' NOT NULL,
	"machine_id" uuid,
	"slot" text,
	"last_dried_at" date
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"variant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"qty" integer NOT NULL,
	"unit_cost" integer,
	"reason" text,
	"order_id" uuid,
	"sale_id" uuid,
	"production_order_id" uuid
);
--> statement-breakpoint
CREATE TABLE "upload_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"size" integer NOT NULL,
	"received" integer DEFAULT 0 NOT NULL,
	"chunks" integer DEFAULT 0 NOT NULL,
	"tmp_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'operador' NOT NULL,
	"password_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"perm_overrides" jsonb DEFAULT '{}'::jsonb,
	"notif_prefs" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "activity_entity_ix" ON "activity_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "customers_name_ix" ON "customers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "model_files_hash_ix" ON "model_files" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "orders_status_ix" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "variants_sku_uq" ON "product_variants" USING btree ("workspace_id","sku");--> statement-breakpoint
CREATE INDEX "quotes_status_ix" ON "quotes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ref_links_owner_ix" ON "reference_links" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "slice_runs_cache_ix" ON "slice_runs" USING btree ("cache_key");--> statement-breakpoint
CREATE UNIQUE INDEX "spools_code_uq" ON "spools" USING btree ("workspace_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");