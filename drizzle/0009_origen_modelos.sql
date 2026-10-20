CREATE TABLE "model_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"provider" text DEFAULT 'otro' NOT NULL,
	"url" text NOT NULL,
	"external_id" text,
	"title" text,
	"description" text,
	"author_name" text,
	"author_uid" text,
	"author_url" text,
	"license_code" text DEFAULT 'desconocida' NOT NULL,
	"license_text" text,
	"commercial_use" text DEFAULT 'desconocido' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"images" jsonb DEFAULT '[]'::jsonb,
	"plates" jsonb DEFAULT '[]'::jsonb,
	"stats" jsonb DEFAULT '{}'::jsonb,
	"remote_created_at" text,
	"remote_updated_at" text,
	"raw" jsonb,
	"fetched_at" timestamp with time zone,
	"fetch_status" text DEFAULT 'error' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "model_files" ADD COLUMN "tag_meta" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "model_files" ADD COLUMN "source_id" uuid;--> statement-breakpoint
CREATE INDEX "model_sources_url_ix" ON "model_sources" USING btree ("url");