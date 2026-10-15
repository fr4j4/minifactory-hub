CREATE TABLE "folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"path" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "folders_path_uq" ON "folders" USING btree ("workspace_id","path");--> statement-breakpoint
CREATE TABLE "tag_defs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"color" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "tag_defs_name_uq" ON "tag_defs" USING btree ("workspace_id","name");--> statement-breakpoint
-- migrar: las carpetas que ya usan los archivos pasan a ser carpetas
INSERT INTO "folders" ("workspace_id", "path") SELECT DISTINCT "workspace_id", "folder" FROM "model_files" WHERE "folder" IS NOT NULL AND "folder" <> '' AND "deleted_at" IS NULL ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "tag_defs" ("workspace_id", "name") SELECT DISTINCT "workspace_id", t.value FROM "model_files", jsonb_array_elements_text(coalesce("tags", '[]'::jsonb)) AS t(value) WHERE "deleted_at" IS NULL ON CONFLICT DO NOTHING;