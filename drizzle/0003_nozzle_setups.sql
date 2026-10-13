ALTER TABLE "machines" ADD COLUMN "nozzle_setups" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "slicer_profiles" ADD COLUMN "nozzle" text;