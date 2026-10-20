ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "calc_profile_id" text;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "risk_factor" double precision;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "waste_pct" double precision;--> statement-breakpoint
ALTER TABLE "quote_items" ADD COLUMN IF NOT EXISTS "calc_profile_id" text;--> statement-breakpoint
ALTER TABLE "quote_items" ADD COLUMN IF NOT EXISTS "calc_opts" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "calc_profile_id" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "channel_id" uuid;--> statement-breakpoint
ALTER TABLE "sales_channels" ADD COLUMN IF NOT EXISTS "calc_profile_id" text;