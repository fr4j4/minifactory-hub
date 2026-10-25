CREATE TABLE "job_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"job_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"color" text,
	"position" integer DEFAULT 0 NOT NULL,
	"est_g" double precision DEFAULT 0 NOT NULL,
	"real_g" double precision,
	"spool_id" uuid
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "colors" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
CREATE INDEX "job_materials_job_ix" ON "job_materials" USING btree ("job_id");