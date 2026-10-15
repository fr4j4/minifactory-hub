CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"kind" text DEFAULT 'tienda' NOT NULL,
	"country" text DEFAULT 'CL' NOT NULL,
	"city" text,
	"url" text,
	"channels" jsonb DEFAULT '[]'::jsonb,
	"brands" jsonb DEFAULT '[]'::jsonb,
	"notes" text,
	"verified" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spools" ADD COLUMN "supplier_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_name_uq" ON "suppliers" USING btree ("workspace_id","name");