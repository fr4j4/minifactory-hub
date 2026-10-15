CREATE TABLE "quality_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"key" text NOT NULL,
	"label" text,
	"builtin" boolean DEFAULT false NOT NULL,
	"layer_factor" double precision NOT NULL,
	"wall_mm" double precision NOT NULL,
	"wall_nozzles" double precision,
	"top_mm" double precision NOT NULL,
	"bottom_mm" double precision NOT NULL,
	"infill" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "quality_presets_key_uq" ON "quality_presets" USING btree ("workspace_id","key");