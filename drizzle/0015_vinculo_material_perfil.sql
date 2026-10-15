CREATE TABLE "material_filament_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"material_id" uuid NOT NULL,
	"filament_profile_id" uuid NOT NULL,
	"machine_profile_id" uuid
);
--> statement-breakpoint
CREATE INDEX "mfl_material_ix" ON "material_filament_links" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "mfl_profile_ix" ON "material_filament_links" USING btree ("filament_profile_id");--> statement-breakpoint
-- expandir y migrar: cada vínculo heredado pasa a la tabla nueva (sin perder ninguno)
INSERT INTO "material_filament_links" ("workspace_id", "material_id", "filament_profile_id")
SELECT "workspace_id", "id", "filament_profile_id" FROM "materials" WHERE "filament_profile_id" IS NOT NULL;