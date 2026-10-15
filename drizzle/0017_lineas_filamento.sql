CREATE TABLE "filament_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"manufacturer" text,
	"name" text NOT NULL,
	"type" text,
	"cost_per_kg" integer,
	"stock_min_g" integer,
	"filament_profile_id" uuid
);
--> statement-breakpoint
CREATE INDEX "filament_lines_ix" ON "filament_lines" USING btree ("workspace_id","manufacturer","name");--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "line_id" uuid;--> statement-breakpoint
-- migrar: cada combinación marca + línea que ya existe pasa a ser una línea, y sus materiales quedan enlazados
INSERT INTO "filament_lines" ("workspace_id", "manufacturer", "name", "type", "cost_per_kg", "stock_min_g")
SELECT "workspace_id", "manufacturer", "line", min("type"), max("cost_per_kg"), max("stock_min_g") FROM "materials"
WHERE "deleted_at" IS NULL AND "line" IS NOT NULL AND "line" <> '' GROUP BY "workspace_id", "manufacturer", "line";--> statement-breakpoint
UPDATE "materials" m SET "line_id" = l."id" FROM "filament_lines" l
WHERE l."workspace_id" = m."workspace_id" AND l."manufacturer" IS NOT DISTINCT FROM m."manufacturer" AND l."name" = m."line" AND m."deleted_at" IS NULL;