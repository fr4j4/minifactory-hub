CREATE TABLE "purchase_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"purchase_id" uuid NOT NULL,
	"kind" text DEFAULT 'filamento' NOT NULL,
	"material_id" uuid,
	"item_id" uuid,
	"qty" double precision DEFAULT 1 NOT NULL,
	"net_g" double precision,
	"tare_g" double precision,
	"unit_price" integer DEFAULT 0 NOT NULL,
	"unit_cost" integer DEFAULT 0 NOT NULL,
	"cost_per_kg" integer,
	"lot" text,
	"location" text
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"number" text NOT NULL,
	"supplier_id" uuid,
	"supplier_text" text,
	"bought_at" date NOT NULL,
	"doc_number" text,
	"shipping" integer DEFAULT 0 NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"recovers_vat" boolean DEFAULT false NOT NULL,
	"vat_pct" double precision DEFAULT 0 NOT NULL,
	"notes" text,
	"status" text DEFAULT 'recibida' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supply_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"item_id" uuid NOT NULL,
	"qty_per_order" double precision DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "purchase_id" uuid;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "pack_g" integer;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "generic" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "spools" ADD COLUMN "purchase_line_id" uuid;--> statement-breakpoint
CREATE INDEX "purchase_lines_purchase_ix" ON "purchase_lines" USING btree ("purchase_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_number_uq" ON "purchases" USING btree ("workspace_id","number");--> statement-breakpoint
CREATE INDEX "purchases_date_ix" ON "purchases" USING btree ("workspace_id","bought_at");--> statement-breakpoint
CREATE UNIQUE INDEX "supply_rules_item_uq" ON "supply_rules" USING btree ("workspace_id","item_id");
