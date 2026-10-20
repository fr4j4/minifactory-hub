ALTER TABLE "orders" ADD COLUMN "tax_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "apply_tax" boolean DEFAULT false NOT NULL;