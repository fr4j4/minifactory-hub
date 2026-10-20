ALTER TABLE "filament_lines" ADD COLUMN IF NOT EXISTS "catalog_id" text;--> statement-breakpoint
ALTER TABLE "filament_lines" ADD COLUMN IF NOT EXISTS "specs" jsonb;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "variant_id" text;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "gtin" text;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "traits" jsonb;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "materials_variant_ix" ON "materials" USING btree ("workspace_id","variant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "materials_gtin_ix" ON "materials" USING btree ("workspace_id","gtin");
