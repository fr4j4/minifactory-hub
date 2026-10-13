ALTER TABLE "customers" ADD COLUMN "calc_profile_id" text;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "risk_factor" double precision;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "waste_pct" double precision;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tax_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tax_mode" text;--> statement-breakpoint
ALTER TABLE "quote_items" ADD COLUMN "calc_profile_id" text;--> statement-breakpoint
ALTER TABLE "quote_items" ADD COLUMN "calc_opts" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "apply_tax" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "calc_profile_id" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "channel_id" uuid;--> statement-breakpoint
ALTER TABLE "sales_channels" ADD COLUMN "calc_profile_id" text;